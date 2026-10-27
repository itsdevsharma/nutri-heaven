import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, type ClientSession } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID, createHash } from 'crypto';
import { OrderOutbox, OrderOutboxDocument, enqueueOrderNotification } from './order-outbox.schema';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { OrderCreateDto, OrderActionDto } from './order.dto';
import { allowedOrderActions, operationsFor, type OrderAction } from './order-workflow';
import { NotificationService } from '../engagement/notification.service';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { CouponsService } from '../coupons/coupons.service';

/**
 * Phase 3 order creation.
 *
 * Every price is server-side: the client sends cart lines (slugs + pack sizes +
 * quantities), and this service re-prices them from the database. The cart's
 * own quote endpoint is the contract for what the client expects, so this
 * reuses `ProductsService.quote()` — the same function the storefront uses.
 *
 * Stock is reserved through `InventoryService.reserveForOrder`, which writes
 * an immutable movement row. If the order is cancelled or returned later,
 * `releaseForOrder` restores it. The idempotency key makes a retried checkout
 * a no-op.
 */
@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private outboxTimer?: ReturnType<typeof setInterval>;
  onModuleInit() { if (process.env.NODE_ENV !== 'test') { this.outboxTimer = setInterval(() => { void this.deliverOutbox().catch(() => {}); }, 10000); this.outboxTimer.unref(); } }
  onModuleDestroy() { if (this.outboxTimer) clearInterval(this.outboxTimer); }
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponsService,
    private readonly notifications: NotificationService,
    @InjectModel(OrderOutbox.name) private readonly outbox: Model<OrderOutboxDocument>,
  ) {}

  private async persistOrder(order: OrderDocument, session: ClientSession) {
    await order.save({ session });
    await enqueueOrderNotification(this.outbox, order, session);
  }
  async deliverOutbox() {
    for (let i = 0; i < 25; i++) {
      const record = await this.outbox.findOneAndUpdate({ status: 'pending', nextAttemptAt: { $lte: new Date() } }, { $set: { nextAttemptAt: new Date(Date.now() + 300000) }, $inc: { attempts: 1 } }, { new: true }).lean().exec();
      if (!record) break;
      try {
        await this.notifications.add(record.email, record.title, record.message, record.eventKey, true);
        await this.outbox.updateOne({ eventKey: record.eventKey, attempts: record.attempts }, { $set: { status: 'delivered' } });
      } catch {
        await this.outbox.updateOne({ eventKey: record.eventKey, attempts: record.attempts }, { $set: { status: record.attempts >= 8 ? 'dead_letter' : 'pending', nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** record.attempts)) } });
      }
    }
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.orders.findOne({ id }).lean().exec();
    if (!order) throw new NotFoundException(`No order found for "${id}"`);
    return order;
  }

  async getCustomerOrder(id: string, cartId?: string): Promise<Order> {
    const order = await this.getOrder(id);
    if (!cartId || order.cartId !== cartId) throw new ForbiddenException('This order belongs to another shopping session');
    return order;
  }

  async staleOnlineOrders(before: Date) {
    return this.orders.find({ paymentMethod: 'razorpay', status: 'pending', paymentStatus: { $in: ['pending', 'failed'] }, stockReserved: true, createdAt: { $lt: before } }).select('id cartId').limit(100).lean().exec();
  }

  async listAdmin(): Promise<Order[]> {
    return this.orders.find().sort({ createdAt: -1 }).lean().exec();
  }

  async createOrder(dto: OrderCreateDto, customerId?: string): Promise<Order> {
    const idempotencyKey = dto.idempotencyKey ?? `order:${dto.cartId}:${Date.now()}`;
    const existing = await this.orders
      .findOne({ idempotencyKey })
      .lean()
      .exec();
    if (existing) { if (existing.cartId !== dto.cartId || existing.customerId !== customerId) throw new ForbiddenException('This checkout belongs to another shopping session'); return existing; }

    // Re-price from the database — the client's totals are advisory only.
    const quote = await this.products.quote({
      lines: dto.lines.map((line) => ({
        slug: line.productSlug,
        packSize: line.packSize,
        quantity: line.quantity,
      })),
    });

    // Build the lines array with the server-side prices.
    const lines = dto.lines.map((line) => {
      // A basket may legitimately contain two packs of the same product. Match
      // both fields; matching just the slug prices the second pack as the first.
      const quoteLine = quote.lines.find(
        (l) => l.slug === line.productSlug && l.packSize === line.packSize,
      );
      return {
        productSlug: line.productSlug,
        packSize: line.packSize,
        productName: quoteLine?.title ?? line.productSlug,
        image: '',
        quantity: line.quantity,
        unitPricePaise: quoteLine?.unitPricePaise ?? 0,
        lineTotalPaise: quoteLine?.lineTotalPaise ?? 0,
      };
    });

    const subtotalPaise = quote.subtotalPaise;
    const shippingPaise = quote.shippingPaise;
    const coupon = dto.couponCode ? await this.coupons.quote(dto.couponCode, subtotalPaise, quote.lines) : null;
    const couponDiscountPaise = coupon?.discountPaise ?? 0;
    const totalPaise = Math.max(0, quote.totalPaise - couponDiscountPaise);
    const orderId = `NH${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;

    const isCod = dto.paymentMethod === 'cod';
    let redeemed: { code: string; discountPaise: number } | null = null;
    try {
      if (dto.couponCode) redeemed = await this.coupons.redeem(dto.couponCode, subtotalPaise, quote.lines, dto.customerEmail, orderId);
      const session = await this.connection.startSession();
      let order: OrderDocument | undefined;
      try {
        await session.withTransaction(async () => {
          await this.inventory.reserveForOrder(idempotencyKey, lines.map((l) => ({ productSlug: l.productSlug, packSize: l.packSize, quantity: l.quantity })), 'system', session);
          const [created] = await this.orders.create([{
      id: orderId,
      cartId: dto.cartId,
      customerId,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      deliveryAddress: dto.deliveryAddress,
      lines,
      subtotalPaise,
      shippingPaise,
      couponCode: redeemed?.code ?? '',
      couponDiscountPaise: redeemed?.discountPaise ?? 0,
      totalPaise,
      paymentMethod: dto.paymentMethod,
      paymentStatus: isCod && totalPaise === 0 ? 'paid' : 'pending',
      status: isCod ? 'confirmed' : 'pending',
      idempotencyKey,
      operations: { fulfillment: 'unaccepted', shipment: 'not_created', returnStatus: 'not_requested', codCollectedPaise: 0, codSettledPaise: 0 },
      activity: [{ action: 'created', actor: 'system', at: new Date(), reason: 'Checkout created' }],
      stockReserved: true,
      stockCommitted: isCod,
      statusHistory: [{ status: isCod ? 'confirmed' : 'pending', at: new Date(), actor: 'system', note: 'Order created' }],
          }], { session });
          if (!created) throw new Error('Order transaction produced no record');
          order = created;
          await enqueueOrderNotification(this.outbox, created, session);
          if (isCod) await this.inventory.commitForOrder(idempotencyKey, lines, 'system', session);
        });
      } finally { await session.endSession(); }
      if (!order) throw new Error('Order transaction produced no order');
      return order.toObject();
    } catch (error) {
      if (redeemed) await this.coupons.refundRedemption(orderId);
      if ((error as { code?: number })?.code === 11000) {
        const raced = await this.orders.findOne({ idempotencyKey }).lean().exec();
        if (raced) { if (raced.cartId !== dto.cartId || raced.customerId !== customerId) throw new ForbiddenException('This checkout belongs to another shopping session'); return raced; }
      }
      throw error;
    }
  }

  async updateStatus(id: string, status: OrderStatus, options: { trackingNumber?: string; trackingUrl?: string; note?: string; refundReference?: string; actor?: string } = {}): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ id }).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');
      const previousStatus = order.status;
      if (status !== order.status) {
        if (status !== 'return_requested' || order.status !== 'delivered') throw new BadRequestException('Use a validated order action; direct status changes are disabled');
        if (!options.note?.trim()) throw new BadRequestException('A return reason is required');
        const op = operationsFor(order);
        if (!['not_requested', 'rejected'].includes(op.returnStatus)) throw new BadRequestException('A return is already being handled');
        const deliveredAt = op.deliveredAt || order.statusHistory.find(item => item.status === 'delivered')?.at;
        const configuredWindow = Number(process.env.ORDER_RETURN_WINDOW_DAYS ?? 7);
        const windowDays = Number.isFinite(configuredWindow) && configuredWindow >= 0 ? configuredWindow : 7;
        if (!deliveredAt || Date.now() - new Date(deliveredAt).getTime() > windowDays * 86400000) throw new BadRequestException('The return window has expired or delivery evidence is missing');
        order.operations = { ...op, returnStatus: 'requested' };
        order.status = status;
      }
      if (options.refundReference) throw new BadRequestException('Use the refund workflow');
      if (options.trackingNumber !== undefined) order.trackingNumber = options.trackingNumber.trim();
      if (options.trackingUrl !== undefined) order.trackingUrl = options.trackingUrl.trim();
      order.activity.push({ action: status === 'return_requested' ? 'request_return' : 'update_tracking', actor: options.actor ?? 'admin', at: new Date(), reason: options.note?.trim() || 'Tracking details updated' });
      if (previousStatus !== order.status) order.statusHistory.push({ status: order.status, at: new Date(), actor: options.actor ?? 'admin', note: options.note });
      await this.persistOrder(order, session); result = order.toObject();
    }); } finally { await session.endSession(); }
    if (!result) throw new Error('Order update transaction produced no order');
    return result;
  }

  async performAction(id: string, action: OrderAction, dto: OrderActionDto, actor: string, role: string): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ id }).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');
      const fingerprint = createHash('sha256').update(JSON.stringify({ action, ...Object.fromEntries(Object.entries(dto).sort(([a], [b]) => a.localeCompare(b))) })).digest('hex');
      const prior = order.activity.find(item => item.idempotencyKey === dto.idempotencyKey);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new BadRequestException('Action key was reused with different details');
        result = order.toObject(); return;
      }
      if (!allowedOrderActions(order, role).includes(action)) throw new ForbiddenException('This action is not permitted for the current order state or role');
      if (!dto.idempotencyKey) throw new BadRequestException('An idempotency key is required');
      if (!dto.reason?.trim()) throw new BadRequestException('A reason or evidence is required');
      const previousStatus = order.status;
      const op = { ...operationsFor(order) };
      const before = { ...op };
      switch (action) {
        case 'verify': op.fulfillment = 'ready_to_dispatch'; order.status = 'packed'; break;
        case 'accept': op.fulfillment = 'accepted'; order.status = 'confirmed'; break;
        case 'pick': op.fulfillment = 'picking'; break;
        case 'pack': op.fulfillment = 'packed'; order.status = 'packed'; break;
        case 'ready': op.fulfillment = 'ready_to_dispatch'; break;
        case 'dispatch':
          if (!dto.courier?.trim() || !dto.trackingNumber?.trim()) throw new BadRequestException('Courier and tracking number are required');
          op.courier = dto.courier.trim(); order.trackingNumber = dto.trackingNumber.trim(); order.trackingUrl = dto.trackingUrl?.trim() || '';
          await this.inventory.markDispatched(order.idempotencyKey, session);
          op.dispatchedAt = new Date().toISOString(); op.fulfillment = 'dispatched'; op.shipment = 'in_transit'; order.status = 'shipped'; break;
        case 'out_for_delivery': op.shipment = 'out_for_delivery'; order.status = 'out_for_delivery'; break;
        case 'deliver':
          if (!dto.reference?.trim()) throw new BadRequestException('Delivery evidence reference is required');
          op.deliveredAt = new Date().toISOString(); op.shipment = 'delivered'; op.fulfillment = 'completed'; order.status = 'delivered'; break;
        case 'approve_return': op.returnStatus = 'approved'; break;
        case 'reject_return': op.returnStatus = 'rejected'; order.status = 'delivered'; break;
        case 'receive_return': op.returnStatus = 'received'; break;
        case 'inspect_return': {
          const inspection = dto.inspection;
          if (!inspection?.length) throw new BadRequestException('Inspect every returned line before closing the return');
          const expected = new Map<string, number>();
          for (const line of order.lines) { const key = `${line.productSlug}:${line.packSize}`; expected.set(key, (expected.get(key) ?? 0) + line.quantity); }
          const seen = new Map<string, number>();
          for (const line of inspection) {
            const key = `${line.productSlug}:${line.packSize}`;
            if (line.disposition === 'restock' && line.condition !== 'sealed') throw new BadRequestException('Opened, damaged or expired food cannot be restocked');
            seen.set(key, (seen.get(key) ?? 0) + line.quantity);
            if (!expected.has(key) || seen.get(key)! > expected.get(key)!) throw new BadRequestException('Inspection quantity exceeds the ordered quantity');
          }
          if ([...expected].some(([key, quantity]) => seen.get(key) !== quantity)) throw new BadRequestException('This workflow requires inspection of the complete order; partial returns are not enabled');
          const restock = inspection.filter(line => line.disposition === 'restock');
          const grouped = new Map<string, { productSlug: string; packSize: string; quantity: number }>();
          for (const line of restock) { const key = `${line.productSlug}:${line.packSize}`; const previous = grouped.get(key); grouped.set(key, { productSlug: line.productSlug, packSize: line.packSize, quantity: (previous?.quantity ?? 0) + line.quantity }); }
          if (grouped.size) await this.inventory.releaseForOrder(order.idempotencyKey, [...grouped.values()], 'return', actor, session);
          await this.inventory.recordWriteOff(order.idempotencyKey, inspection.filter(line => line.disposition === 'write_off'), actor, session);
          await this.inventory.closeReturnedReservation(order.idempotencyKey, session);
          op.inspection = inspection; op.returnStatus = 'inspected'; order.status = 'returned'; order.stockReserved = false;
          break;
        }
        case 'record_cod_collection':
          if (dto.amountPaise !== order.totalPaise || !dto.reference?.trim()) throw new BadRequestException('Record the full collected amount and collection evidence');
          op.codCollectedPaise = dto.amountPaise; op.codCollectionReference = dto.reference.trim(); order.paymentStatus = 'paid'; break;
        case 'record_cod_refund':
          if (dto.amountPaise !== order.totalPaise || !dto.reference?.trim()) throw new BadRequestException('Record the full refund amount and completed transfer reference');
          order.refundedPaise = dto.amountPaise; order.refundReference = dto.reference.trim();
          order.paymentStatus = 'refunded'; order.status = 'refunded';
          break;
        case 'record_cod_settlement':
          if (!dto.amountPaise || !dto.reference?.trim() || op.codSettledPaise + dto.amountPaise > op.codCollectedPaise) throw new BadRequestException('Settlement must not exceed collected cash and requires a remittance reference');
          if (order.activity.some(item => item.action === 'record_cod_settlement' && (item.after as { reference?: string })?.reference === dto.reference?.trim())) throw new BadRequestException('This remittance reference has already been recorded');
          op.codSettledPaise += dto.amountPaise; op.codSettlementReference = dto.reference.trim(); break;
      }
      order.operations = op;
      order.activity.push({ action, actor, idempotencyKey: dto.idempotencyKey, fingerprint, at: new Date(), reason: dto.reason.trim(), before, after: { ...op, reference: dto.reference?.trim(), amountPaise: dto.amountPaise } });
      if (previousStatus !== order.status) order.statusHistory.push({ status: order.status, at: new Date(), actor, note: `${action}: ${dto.reason.trim()}` });
      await this.persistOrder(order, session); result = order.toObject();
    }); } finally { await session.endSession(); }
    if (!result) throw new Error('Order action transaction produced no order');
    return result;
  }

  async cancel(id: string, reason: string, actor = 'admin', pendingOnly = false): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        const order = await this.orders.findOne({ id }).session(session).exec();
        if (!order) throw new NotFoundException(`No order found for "${id}"`);
        if (pendingOnly && (order.paymentMethod !== 'razorpay' || order.paymentStatus === 'paid' || order.status !== 'pending')) throw new BadRequestException('Only unpaid pending online orders can be cancelled');
        if (order.status === 'cancelled') { result = order.toObject(); return; }
        if (order.shiprocketBookingStarted) throw new BadRequestException('Cancel the Shiprocket shipment and refresh provider details before cancelling this order');
        if (!['pending', 'confirmed', 'packed'].includes(order.status)) throw new BadRequestException(`Cannot cancel an order in ${order.status}`);
        if (order.stockReserved) await this.inventory.releaseForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })), 'cancelled', actor, session);
        if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid') {
          order.paymentReconciliationRequired = true;
          order.paymentReconciliationNote = 'Paid order cancelled; issue or record a provider refund';
        }
        order.operations = { ...operationsFor(order), fulfillment: 'cancelled' };
        order.stockReserved = false;
        order.activity.push({ action: 'cancel', actor, at: new Date(), reason: reason.trim() });
        order.status = 'cancelled';
        order.cancellationReason = reason.trim();
        order.statusHistory.push({ status: 'cancelled', at: new Date(), actor, note: reason.trim() });
        await this.persistOrder(order, session);
        result = order.toObject();
      });
    } finally { await session.endSession(); }
    if (!result) throw new Error('Cancellation transaction produced no order');
    await this.coupons.refundRedemption(result.id);
    return result;
  }

  async attachRazorpayOrder(id: string, razorpayOrderId: string): Promise<Order> {
    // The first provider order wins; concurrent checkout requests reuse it.
    await this.orders.updateOne({ id, paymentMethod: 'razorpay', paymentStatus: 'pending', status: 'pending', razorpayOrderId: { $exists: false } }, { $set: { razorpayOrderId } }).exec();
    return this.getOrder(id);
  }

  async prepareRazorpayRetry(id: string): Promise<Order> {
    const order = await this.orders.findOneAndUpdate(
      { id, paymentMethod: 'razorpay', paymentStatus: 'failed', status: 'pending', stockReserved: true },
      { $set: { paymentStatus: 'pending' } },
      { new: true },
    ).lean().exec();
    if (!order) throw new BadRequestException('This order cannot be retried for payment');
    return order;
  }

  async captureRazorpayPayment(razorpayOrderId: string, paymentId: string, amount?: number, currency?: string): Promise<void> {
    const session = await this.connection.startSession();
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ razorpayOrderId }).session(session).exec();
      if (!order) throw new NotFoundException('Payment order is not attached yet; retry event');
      if (order.paymentStatus === 'refunded') {
        if (order.razorpayPaymentId === paymentId) return;
        order.paymentReconciliationRequired = true;
        order.activity.push({ action: 'payment_after_refund', actor: 'razorpay', at: new Date(), reason: `Unexpected capture ${paymentId}` });
        order.paymentReconciliationNote = `New payment capture ${paymentId} detected after refund ${order.refundReference ?? ''}; investigate duplicate charge`;
        await this.persistOrder(order, session); return;
      }
      if (order.paymentStatus === 'paid') {
        if (order.razorpayPaymentId !== paymentId) {
          order.paymentReconciliationRequired = true;
          order.activity.push({ action: 'duplicate_payment', actor: 'razorpay', at: new Date(), reason: `Additional capture ${paymentId}` });
          order.paymentReconciliationNote = `Multiple payment captures detected (${order.razorpayPaymentId ?? 'first payment'} and ${paymentId}); refund duplicate capture`;
          order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: order.paymentReconciliationNote });
          await this.persistOrder(order, session);
        }
        return;
      }
      if (order.status === 'cancelled' || !order.stockReserved) {
        // Persist captured money explicitly for reconciliation; never restore a cancelled order.
        order.paymentStatus = 'paid'; order.razorpayPaymentId = paymentId;
        order.paymentReconciliationRequired = true;
        order.activity.push({ action: 'late_payment', actor: 'razorpay', at: new Date(), reason: `Capture ${paymentId} after reservation release`, after: { amount, currency } });
        order.paymentReconciliationNote = 'Payment captured after the order reservation was released; refund or manual recovery required';
        order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: 'Late payment captured after reservation release; refund/reconciliation required' });
        await this.persistOrder(order, session); return;
      }
      if ((amount !== undefined && amount !== order.totalPaise) || (currency !== undefined && currency !== 'INR')) {
        order.paymentStatus = 'paid'; order.razorpayPaymentId = paymentId;
        order.paymentReconciliationRequired = true;
        order.activity.push({ action: 'payment_mismatch', actor: 'razorpay', at: new Date(), reason: `Capture ${paymentId} amount/currency mismatch`, after: { amount, currency } });
        order.paymentReconciliationNote = `Captured amount/currency mismatch (received ${amount ?? 'unknown'} ${currency ?? 'unknown'}; expected ${order.totalPaise} INR)`;
        order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: order.paymentReconciliationNote });
        await this.persistOrder(order, session); return;
      }
      order.activity.push({ action: 'payment_captured', actor: 'razorpay', at: new Date(), reason: `Verified capture ${paymentId}`, after: { amount, currency } });
      order.paymentStatus = 'paid'; order.status = 'confirmed'; order.razorpayPaymentId = paymentId; order.stockCommitted = true;
      await this.inventory.commitForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })), 'razorpay-webhook', session);
      order.statusHistory.push({ status: 'confirmed', at: new Date(), actor: 'razorpay-webhook', note: 'Payment captured' });
      await this.persistOrder(order, session);
    }); } finally { await session.endSession(); }
  }

  async failRazorpayPayment(razorpayOrderId: string): Promise<void> {
    const session = await this.connection.startSession();
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ razorpayOrderId }).session(session).exec();
      if (!order || order.paymentStatus !== 'pending') return;
      // A failed payment webhook reports one attempt. Keep the reservation so
      // checkout can retry; an explicit cancellation releases it transactionally.
      order.activity.push({ action: 'payment_failed', actor: 'razorpay', at: new Date(), reason: 'Provider reported failed payment attempt' });
      order.paymentStatus = 'failed';
      order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: 'Payment attempt failed; stock remains reserved for retry' });
      await this.persistOrder(order, session);
    }); } finally { await session.endSession(); }
  }
}
