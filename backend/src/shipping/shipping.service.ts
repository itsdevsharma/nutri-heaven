import { randomUUID } from 'crypto';
import { Injectable, BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderService } from '../orders/order.service';
import { Order } from '../orders/order.schema';
import { operationsFor } from '../orders/order-workflow';
import { AuditService } from '../audit/audit.service';
import { ShiprocketClient, ShiprocketRejectedException } from './shiprocket.client';
import { ShippingConfiguration, ShiprocketShipment } from './shipping.schema';
import { ShippingConfigurationDto, ShiprocketActionDto } from './shipping.dto';
const safeUrl = (value: unknown) => { try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };
const positiveId = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
@Injectable()
export class ShippingService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') { this.timer = setInterval(() => { void this.pollTracking(); }, 60000); this.timer.unref(); }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async pollTracking() {
    if (this.polling || !this.client.configured) return;
    this.polling = true;
    try {
      for (let i = 0; i < 10; i++) {
        const shipment = await this.shipments.findOneAndUpdate({ shipmentId: { $exists: true }, providerCancelled: { $ne: true }, 'tracking.status': { $nin: ['DELIVERED', 'Delivered', 'CANCELED', 'CANCELLED', 'RTO DELIVERED'] }, nextTrackAt: { $lte: new Date() } }, { $set: { nextTrackAt: new Date(Date.now() + 300000) } }, { sort: { nextTrackAt: 1 }, new: true }).lean();
        if (!shipment) break;
        await this.action(shipment.orderId, 'track', {}, 'system').catch(() => {});
      }
    } catch { /* Next poll retries after provider or database recovery. */ }
    finally { this.polling = false; }
  }

  constructor(@InjectModel(ShippingConfiguration.name) private readonly config: Model<ShippingConfiguration>, @InjectModel(ShiprocketShipment.name) private readonly shipments: Model<ShiprocketShipment>, @InjectModel(Order.name) private readonly orders: Model<Order>, private readonly client: ShiprocketClient, private readonly audit: AuditService, private readonly orderService: OrderService) {}
  async verifyAndShip(id: string, dto: ShiprocketActionDto, actor: string, role: string) {
    if (!this.client.configured || !await this.config.exists({ key: 'shiprocket' })) throw new BadRequestException('Configure Shiprocket credentials and shipping defaults first');
    const order = await this.orders.findOne({ id }).lean();
    if (!order) throw new NotFoundException('Order not found');
    if (['unaccepted', 'accepted', 'picking', 'packed'].includes(operationsFor(order).fulfillment)) {
      await this.orderService.performAction(id, 'verify', { idempotencyKey: `shiprocket-verify-${id}`, reason: 'Admin verified the order, packed items and parcel details for Shiprocket pickup' }, actor, role);
    }
    let shipment = await this.action(id, 'create', dto, actor);
    if (shipment?.error || !shipment?.shipmentId) throw new ConflictException('Refresh provider details before continuing this shipment');
    if (!shipment.awb) shipment = await this.action(id, 'awb', dto, actor);
    if (!shipment?.pickupScheduled) shipment = await this.action(id, 'pickup', {}, actor);
    if (!shipment?.labelUrl) shipment = await this.action(id, 'label', {}, actor);
    if (!shipment?.manifestUrl) shipment = await this.action(id, 'manifest', {}, actor);
    return shipment;
  }
  async configuration() { return { configured: this.client.configured, defaults: await this.config.findOne({ key: 'shiprocket' }).lean() }; }
  async configure(dto: ShippingConfigurationDto, actorId: string) {
    if (!dto.pickupLocation.trim()) throw new BadRequestException('Choose a Shiprocket pickup location');
    const pickupLocation = dto.pickupLocation.trim();
    if (!(await this.pickups()).some(location => location.name === pickupLocation)) throw new BadRequestException('Choose an existing Shiprocket pickup location. Load pickup locations and try again.');
    const value = await this.config.findOneAndUpdate({ key: 'shiprocket' }, { $set: { ...dto, pickupLocation: dto.pickupLocation.trim() } }, { upsert: true, new: true });
    await this.audit.record({ actorId, action: 'shipping.configure', entityType: 'shipping', entityId: 'shiprocket', after: { ...dto } });
    return value;
  }
  async pickups() {
    const data = await this.client.request('settings/company/pickup');
    const locations = data.data?.shipping_address;
    if (!Array.isArray(locations)) throw new BadRequestException('Shiprocket did not return pickup locations');
    return locations.map((item: any) => ({ name: item.pickup_location, address: item.address, city: item.city, pin: item.pin_code }));
  }
  async get(id: string) {
    if (!await this.orders.exists({ id })) throw new NotFoundException('Order not found');
    return this.shipments.findOne({ orderId: id }).lean();
  }
  private async providerDetails(record: ShiprocketShipment, providerOrderId?: number) {
    const providerId = record.providerOrderId ?? providerOrderId;
    let data: any;
    if (providerId) data = (await this.client.request(`orders/show/${providerId}`)).data;
    else {
      const response = await this.client.request(`orders?filter_by=channel_order_id&filter=${encodeURIComponent(record.providerReference ?? record.orderId)}`);
      const matching = (response.data ?? []).filter((item: any) => String(item.channel_order_id) === (record.providerReference ?? record.orderId));
      if (matching.length !== 1) throw new ConflictException('Booking is unconfirmed. Check the Shiprocket dashboard and link its order ID; do not create another shipment.');
      data = matching[0];
    }
    if (String(data?.channel_order_id) !== (record.providerReference ?? record.orderId)) throw new BadRequestException('The Shiprocket order does not match this store order');
    const shipment = Array.isArray(data.shipments) ? data.shipments[0] : undefined;
    const shipmentId = positiveId(shipment?.id);
    if (!shipmentId || !positiveId(data.id)) throw new BadRequestException('Shiprocket has not returned a shipment ID');
    return { providerCancelled: Number(data.status_code) === 5 || ['CANCELED', 'CANCELLED'].includes(String(data.status).toUpperCase()), providerOrderId: Number(data.id), shipmentId, ...(shipment.awb ? { awb: String(shipment.awb) } : {}), ...(shipment.courier ? { courier: String(shipment.courier) } : {}), ...(safeUrl(shipment.label_url) ? { labelUrl: safeUrl(shipment.label_url) } : {}), ...(shipment.pickup_scheduled_date ? { pickupScheduled: true } : {}) };
  }
  async action(id: string, action: string, dto: ShiprocketActionDto, actorId: string) {
    if (!['create', 'reconcile', 'awb', 'pickup', 'label', 'manifest', 'track', 'cancel'].includes(action)) throw new BadRequestException('Unknown shipment action');
    const order = await this.orders.findOne({ id }).lean();
    if (!order) throw new NotFoundException('Order not found');
    const existing = await this.shipments.findOne({ orderId: id }).lean();
    if (!existing && action !== 'create') throw new BadRequestException('Create a shipment first');
    if (action === 'create' && existing && !existing.providerCancelled) return existing;
    if (!['track', 'reconcile'].includes(action) && (['cancelled', 'returned', 'refunded', 'return_requested', 'delivered'].includes(order.status) || order.paymentReconciliationRequired || (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid'))) throw new BadRequestException('Order is not eligible for shipment operations');
    if (action === 'create' && (operationsFor(order).fulfillment !== 'ready_to_dispatch' || !order.stockReserved)) throw new BadRequestException('Pack the order and mark it ready to dispatch first');
    let parcel: ShiprocketShipment['parcel'];
    if (action === 'create') {
      if (!this.client.configured) throw new BadRequestException('Configure Shiprocket API credentials first');
      const defaults = await this.config.findOne({ key: 'shiprocket' }).lean();
      if (!defaults) throw new BadRequestException('Save the pickup location and parcel defaults in Shipping settings first');
      parcel = { pickupLocation: defaults.pickupLocation, weight: dto.weight ?? defaults.weight, length: dto.length ?? defaults.length, breadth: dto.breadth ?? defaults.breadth, height: dto.height ?? defaults.height };
      if (existing?.providerCancelled) {
        const archived = await this.shipments.findOneAndUpdate({ _id: existing._id, orderId: id, providerCancelled: true, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: new Date() } }] }, { $set: { orderId: `${id}:cancelled:${randomUUID()}`, originalOrderId: id } }, { new: true }).lean();
        if (!archived) throw new ConflictException('Another shipment operation is in progress. Refresh the order.');
        await this.audit.record({ actorId, action: 'shiprocket.rebook', entityType: 'order', entityId: id, before: { providerOrderId: existing.providerOrderId, shipmentId: existing.shipmentId } });
        await this.orders.updateOne({ id }, { $unset: { trackingNumber: 1, trackingUrl: 1 } });
      }
      const providerReference = await this.shipments.exists({ originalOrderId: id }) ? `${id}-${randomUUID()}` : id;
      const claimed = await this.orders.findOneAndUpdate({ id, status: order.status, paymentStatus: order.paymentStatus, paymentReconciliationRequired: { $ne: true }, stockReserved: true, 'operations.fulfillment': 'ready_to_dispatch', shiprocketBookingStarted: { $ne: true } }, { $set: { shiprocketBookingStarted: true } });
      if (!claimed) throw new ConflictException('Order changed or another booking has started. Refresh the order.');
      try { await this.shipments.create({ orderId: id, providerReference, parcel }); } catch (error) { if ((error as { code?: number }).code === 11000) throw new ConflictException('Another booking is already in progress'); throw error; }
    }
    const lockToken = randomUUID();
    const lock = await this.shipments.findOneAndUpdate({ orderId: id, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: new Date() } }] }, { $set: { lockedUntil: new Date(Date.now() + 120000), lockToken } }, { new: true }).lean();
    if (!lock) throw new ConflictException('A shipment operation is in progress. Wait before refreshing.');
    try {
      if (lock.providerCancelled && !['track', 'reconcile'].includes(action)) throw new BadRequestException('This Shiprocket shipment was cancelled');
      if (lock.error && !['reconcile', 'track'].includes(action)) throw new ConflictException('Refresh provider details before retrying this operation.');
      const update: Record<string, unknown> = {};
      switch (action) {
        case 'create': {
          const names = order.customerName.trim().split(/\s+/);
          const data = await this.client.request('orders/create/adhoc', 'POST', {
            order_id: lock.providerReference ?? order.id, order_date: new Date((order as any).createdAt ?? Date.now()).toISOString().slice(0, 10), pickup_location: parcel!.pickupLocation,
            billing_customer_name: names[0], billing_last_name: names.slice(1).join(' '), billing_address: order.deliveryAddress.street, billing_address_2: order.deliveryAddress.landmark ?? '', billing_city: order.deliveryAddress.city, billing_pincode: order.deliveryAddress.pin, billing_state: order.deliveryAddress.state, billing_country: 'India', billing_email: order.customerEmail, billing_phone: order.customerPhone, shipping_is_billing: true,
            order_items: order.lines.map(line => ({ name: `${line.productName} (${line.packSize})`, sku: `${line.productSlug}-${line.packSize}`, units: line.quantity, selling_price: line.unitPricePaise / 100 })),
            payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid', sub_total: order.totalPaise / 100,
            shipping_charges: order.shippingPaise / 100, total_discount: (order.couponDiscountPaise ?? 0) / 100,
            weight: parcel!.weight, length: parcel!.length, breadth: parcel!.breadth, height: parcel!.height,
          });
          if (!positiveId(data.order_id) || !positiveId(data.shipment_id)) throw new BadRequestException('Shiprocket did not confirm booking. Refresh provider details.');
          Object.assign(update, { providerOrderId: Number(data.order_id), shipmentId: Number(data.shipment_id) }); break;
        }
        case 'reconcile': Object.assign(update, await this.providerDetails(lock, dto.providerOrderId)); break;
        case 'awb': {
          if (!lock.shipmentId) throw new BadRequestException('Refresh provider details first');
          if (lock.awb) break;
          const data = await this.client.request('courier/assign/awb', 'POST', { shipment_id: lock.shipmentId, ...(dto.courierId ? { courier_id: dto.courierId } : {}) });
          const details = data.response?.data;
          if (Number(data.awb_assign_status) !== 1 || !details?.awb_code) throw new BadRequestException('Shiprocket did not assign an AWB. Refresh provider details.');
          Object.assign(update, { awb: String(details.awb_code), courier: String(details.courier_name ?? 'Shiprocket') }); break;
        }
        case 'pickup': {
          if (!lock.awb) throw new BadRequestException('Assign an AWB first');
          if (lock.pickupScheduled) break;
          const data = await this.client.request('courier/generate/pickup', 'POST', { shipment_id: [lock.shipmentId] });
          if (Number(data.pickup_status) !== 1) throw new BadRequestException('Shiprocket did not confirm pickup. Refresh provider details.');
          update.pickupScheduled = true; break;
        }
        case 'label': {
          if (!lock.awb) throw new BadRequestException('Assign an AWB first');
          const data = await this.client.request('courier/generate/label', 'POST', { shipment_id: [lock.shipmentId] });
          if (!safeUrl(data.label_url)) throw new BadRequestException('Shiprocket did not return a secure label link');
          update.labelUrl = safeUrl(data.label_url); break;
        }
        case 'manifest': {
          if (!lock.pickupScheduled) throw new BadRequestException('Schedule pickup first');
          await this.client.request('manifests/generate', 'POST', { shipment_id: [lock.shipmentId] });
          const data = await this.client.request('manifests/print', 'POST', { order_ids: [lock.providerOrderId] });
          if (!safeUrl(data.manifest_url)) throw new BadRequestException('Shiprocket did not return a secure manifest link');
          update.manifestUrl = safeUrl(data.manifest_url); break;
        }
        case 'cancel': {
          if (!lock.providerOrderId) throw new BadRequestException('Refresh provider details first');
          await this.client.request('orders/cancel', 'POST', { ids: [lock.providerOrderId] });
          Object.assign(update, await this.providerDetails(lock));
          if (!update.providerCancelled) throw new BadRequestException('Shiprocket cancellation is pending. Refresh provider details until confirmed.');
          break;
        }
        case 'track': {
          if (!lock.shipmentId) throw new BadRequestException('Refresh provider details first');
          const response = await this.client.request(`courier/track/shipment/${lock.shipmentId}`);
          const data = response.tracking_data;
          if (!data || Number(data.track_status) !== 1) throw new BadRequestException('Tracking is not available yet. Try again after the first courier scan.');
          update.tracking = { status: String(data.shipment_track?.[0]?.current_status ?? data.shipment_status ?? 'Awaiting scan'), updatedAt: new Date().toISOString(), activities: (data.shipment_track_activities ?? []).slice(0, 100).map((item: any) => ({ date: String(item.date ?? ''), activity: String(item.activity ?? ''), location: String(item.location ?? '') })) };
          break;
        }
      }
      const saved = await this.shipments.findOneAndUpdate({ orderId: id, lockToken }, { $set: { ...update, lastOperation: action }, ...(action === 'track' ? {} : { $unset: { error: 1 } }) }, { new: true }).lean();
      if (saved?.providerCancelled) await this.orders.updateOne({ id }, { $set: { shiprocketBookingStarted: false } });
      if (saved?.awb) await this.orders.updateOne({ id }, { $set: { trackingNumber: saved.awb, trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(saved.awb)}` } });
      await this.audit.record({ actorId, action: `shiprocket.${action}`, entityType: 'order', entityId: id, after: { shipmentId: saved?.shipmentId, providerOrderId: saved?.providerOrderId } });
      return saved;
    } catch (error) {
      if (action === 'create' && (error instanceof ShiprocketRejectedException || error instanceof ServiceUnavailableException)) {
        await this.shipments.deleteOne({ orderId: id, lockToken });
        await this.orders.updateOne({ id }, { $set: { shiprocketBookingStarted: false } });
        await this.audit.record({ actorId, action: 'shiprocket.create_rejected', entityType: 'order', entityId: id });
      } else if (!['track', 'reconcile'].includes(action)) await this.shipments.updateOne({ orderId: id, lockToken }, { $set: { error: 'Provider operation needs reconciliation before retrying.' } });
      throw error;
    } finally { await this.shipments.updateOne({ orderId: id, lockToken }, { $unset: { lockedUntil: 1, lockToken: 1 } }); }
  }
}
