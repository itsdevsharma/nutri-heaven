import { CheckoutService } from '../checkout/checkout.service';
import { ConflictException, BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, type ClientSession } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID, createHash } from 'crypto';
import { OrderOutbox, OrderOutboxDocument, enqueueOrderNotification } from './order-outbox.schema';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { OrderCreateDto, OrderActionDto, OverrideOrderAmountDto } from './order.dto';
import { allowedOrderActions, amountOverrideBlockedReason, operationsFor, type OrderAction } from './order-workflow';
import { NotificationService } from '../engagement/notification.service';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { CouponsService } from '../coupons/coupons.service';
import { deliveryRank } from '../shipping/tracking-status';
import { OrderListQuery } from './order-list.dto';
import type { FilterQuery, PipelineStage } from 'mongoose';

function canonicalCheckout(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalCheckout);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalCheckout(item)]));
  return value;
}

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
    private readonly checkout: CheckoutService,
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
        await this.notifications.add(record.email, record.title, record.message, record.eventKey, true, record.customerId);
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
    return this.orders.find({ paymentMethod: 'razorpay', status: 'pending', paymentStatus: { $in: ['pending', 'failed'] }, stockReserved: true, $or: [{ paymentWindowStartedAt: { $lt: before } }, { paymentWindowStartedAt: { $exists: false }, createdAt: { $lt: before } }] }).select('id cartId').limit(100).lean().exec();
  }

  async listAdmin(): Promise<Order[]> {
    // Compatibility endpoint retains its array shape, with a bounded result.
    return this.orders.find().sort({ createdAt: -1, _id: -1 }).limit(100).lean().exec();
  }

  async listAdminPage(query: OrderListQuery) {
    const limit = query.limit ?? 20, offset = query.offset ?? 0;
    const clauses: FilterQuery<OrderDocument>[] = [];
    if (query.status) clauses.push({ status: query.status });
    if (query.payment) clauses.push({ paymentStatus: query.payment });
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      clauses.push({ $or: ['id', 'customerName', 'customerEmail', 'customerPhone'].map(field => ({ [field]: new RegExp(escaped, 'i') })) });
    }
    if (query.queue === 'inbox') clauses.push({ status: { $in: ['pending', 'confirmed', 'packed'] }, $or: [{ 'operations.fulfillment': 'unaccepted' }, { operations: { $exists: false }, status: { $in: ['pending', 'confirmed'] } }] });
    if (query.queue === 'fulfilment') clauses.push({ status: { $in: ['confirmed', 'packed'] }, $or: [{ 'operations.fulfillment': { $in: ['accepted', 'picking', 'packed', 'ready_to_dispatch'] } }, { operations: { $exists: false }, status: 'packed' }] });
    if (query.queue === 'exceptions') clauses.push({ paymentReconciliationRequired: true });
    if (query.queue === 'cod') clauses.push({ paymentMethod: 'cod', $or: [{ 'operations.shipment': 'delivered' }, { operations: { $exists: false }, status: 'delivered' }], $expr: { $lt: [{ $ifNull: ['$operations.codSettledPaise', 0] }, '$totalPaise'] } });
    const filter: FilterQuery<OrderDocument> = clauses.length ? { $and: clauses } : {};
    const summaryPromise = this.orders.aggregate([{ $group: {
      _id: null, totalOrders: { $sum: 1 },
      toFulfil: { $sum: { $cond: [{ $in: ['$status', ['pending', 'confirmed', 'packed']] }, 1, 0] } },
      inTransit: { $sum: { $cond: [{ $in: ['$status', ['shipped', 'out_for_delivery']] }, 1, 0] } },
      delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
    } }, { $project: { _id: 0 } }]).exec();
    let items: Order[], total: number;
    if (query.queue === 'returns') {
      const pipeline: PipelineStage[] = [
        { $match: filter },
        { $lookup: { from: 'order_refunds', localField: 'id', foreignField: 'orderId', pipeline: [{ $match: { status: { $ne: 'completed' } } }, { $project: { _id: 1 } }, { $limit: 1 }], as: '_openRefunds' } },
        { $match: { $or: [{ status: { $in: ['return_requested', 'returned'] } }, { '_openRefunds.0': { $exists: true } }] } },
        { $unset: '_openRefunds' },
        { $facet: { items: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: offset }, { $limit: limit }], counts: [{ $count: 'total' }] } },
      ];
      const [result] = await this.orders.aggregate(pipeline).exec();
      items = result?.items ?? []; total = result?.counts?.[0]?.total ?? 0;
    } else {
      [items, total] = await Promise.all([
        this.orders.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean().exec(),
        this.orders.countDocuments(filter).exec(),
      ]);
    }
    const [summary] = await summaryPromise;
    return { items, total, limit, offset, summary: summary ?? { totalOrders: 0, toFulfil: 0, inTransit: 0, delivered: 0 } };
  }

  async createOrder(dto: OrderCreateDto, customerId?: string): Promise<Order> {
    if (typeof dto.idempotencyKey !== 'string' || !/^\S{1,128}$/.test(dto.idempotencyKey)) throw new BadRequestException('A stable checkout idempotency key of 1–128 non-whitespace characters is required');
    const idempotencyKey = dto.idempotencyKey;
    const legacyFingerprint = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const checkoutFingerprint = createHash('sha256').update(JSON.stringify(canonicalCheckout(dto))).digest('hex');
    const existing = await this.orders
      .findOne({ idempotencyKey })
      .lean()
      .exec();
    if (existing) { if (existing.cartId !== dto.cartId || existing.customerId !== customerId) throw new ForbiddenException('This checkout belongs to another shopping session'); if (existing.checkoutFingerprint && ![checkoutFingerprint, legacyFingerprint].includes(existing.checkoutFingerprint)) throw new ConflictException('Checkout key was reused with different details'); return existing; }

    try {
      const delivery = this.checkout.enabled || dto.shippingQuoteId ? await this.checkout.validate(dto, dto.shippingQuoteId, dto.courierId) : null;

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
        image: quoteLine?.image ?? '',
          quantity: line.quantity,
          unitPricePaise: quoteLine?.unitPricePaise ?? 0,
          lineTotalPaise: (quoteLine?.unitPricePaise ?? 0) * line.quantity,
        };
      });

      const subtotalPaise = quote.subtotalPaise;
      const shippingPaise = delivery?.selected.shippingPaise ?? quote.shippingPaise;
      const coupon = dto.couponCode ? await this.coupons.quote(dto.couponCode, subtotalPaise, quote.lines) : null;
      const couponDiscountPaise = coupon?.discountPaise ?? 0;
      const totalPaise = Math.max(0, subtotalPaise - couponDiscountPaise) + shippingPaise;
      if (delivery && (delivery.quote.subtotalPaise !== subtotalPaise || delivery.quote.discountPaise !== couponDiscountPaise)) throw new ConflictException('Prices changed. Calculate delivery again.');
      const orderId = `NH${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;

      const isCod = dto.paymentMethod === 'cod';
      const session = await this.connection.startSession();
      let order: OrderDocument | undefined;
      try {
        await session.withTransaction(async () => {
          const prior = await this.orders.findOne({ idempotencyKey }).session(session).exec();
          if (prior) {
            if (prior.cartId !== dto.cartId || prior.customerId !== customerId) throw new ForbiddenException('This checkout belongs to another shopping session');
            if (prior.checkoutFingerprint && ![checkoutFingerprint, legacyFingerprint].includes(prior.checkoutFingerprint)) throw new ConflictException('Checkout key was reused with different details');
            order = prior; return;
          }
          // Coupon usage and redemption must commit with stock and the order.
          const redeemed = dto.couponCode ? await this.coupons.redeem(dto.couponCode, subtotalPaise, quote.lines, dto.customerEmail, orderId, session) : null;
          if (redeemed && redeemed.discountPaise !== couponDiscountPaise) throw new ConflictException('Coupon changed. Confirm checkout again.');
          if (delivery && new Date(delivery.quote.expiresAt).getTime() <= Date.now()) throw new ConflictException('Delivery quote expired. Calculate delivery again.');
          await this.inventory.reserveForOrder(idempotencyKey, lines.map((l) => ({ productSlug: l.productSlug, packSize: l.packSize, quantity: l.quantity })), 'system', session);
          const [created] = await this.orders.create([{
      id: orderId,
      checkoutFingerprint,
      currency: 'INR', taxPaise: 0,
      ...(delivery ? { shippingQuote: { quoteId: delivery.quote.id, courierId: delivery.selected.courierId, name: delivery.selected.name, quotedAt: delivery.quote.quotedAt, expiresAt: delivery.quote.expiresAt, source: delivery.quote.source, parcel: delivery.quote.parcel, storeRate: delivery.quote.storeRate, pricingFingerprint: delivery.quote.pricingFingerprint } } : {}),
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
      // A competing request can consume the last coupon/stock/quote while this
      // request validates. Return its committed order for the same attempt.
      const raced = await this.orders.findOne({ idempotencyKey }).lean().exec();
      if (raced) { if (raced.cartId !== dto.cartId || raced.customerId !== customerId) throw new ForbiddenException('This checkout belongs to another shopping session'); if (raced.checkoutFingerprint && ![checkoutFingerprint, legacyFingerprint].includes(raced.checkoutFingerprint)) throw new ConflictException('Checkout key was reused with different details'); return raced; }
      throw error;
    }
  }

  async getCheckout(key: string, cartId?: string): Promise<Order> {
    if (!cartId || !/^\S{1,128}$/.test(key)) throw new BadRequestException('A checkout key and shopping session are required');
    const order = await this.orders.findOne({ idempotencyKey: key, cartId }).lean().exec();
    if (!order) throw new NotFoundException('Saved checkout is not available yet. Check again shortly. If it remains unavailable, contact support before placing another order.');
    return order;
  }

  /** Called only for authenticated provider reads, in the shipment transaction. */
  async applyCourierTracking(id: string, scan: { status: string; eventAt?: string }, evidence: { shipmentId: number; awb: string; courier: string }, session: ClientSession) {
    const target = deliveryRank(scan.status);
    if (!target) return;
    const order = await this.orders.findOne({ id }).session(session).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (['cancelled', 'return_requested', 'returned', 'refunded', 'delivered'].includes(order.status)) return;
    const reviewReason = 'Courier scan requires review: payment, inventory, order state or AWB is not eligible for automatic fulfilment.';
    if (order.paymentReconciliationRequired || !order.stockReserved || (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') || !['confirmed', 'packed', 'shipped', 'out_for_delivery'].includes(order.status) || !evidence.awb?.trim()) {
      if (order.shippingReviewReason !== reviewReason) { order.shippingReviewReason = reviewReason; await order.save({ session }); }
      return;
    }
    const op = { ...operationsFor(order) };
    const current = deliveryRank(order.status === 'shipped' ? 'SHIPPED' : order.status === 'out_for_delivery' ? 'OUT FOR DELIVERY' : '');
    if (target <= current) return;
    const eventTime = scan.eventAt ? new Date(scan.eventAt) : new Date();
    const at = Number.isFinite(eventTime.getTime()) && eventTime.getTime() <= Date.now() ? eventTime : new Date();
    const reference = `Shiprocket shipment ${evidence.shipmentId}, AWB ${evidence.awb}, verified scan ${scan.status}`;
    order.trackingNumber = evidence.awb; order.trackingUrl = `https://shiprocket.co/tracking/${encodeURIComponent(evidence.awb)}`;
    op.courier = evidence.courier;
    // A later authoritative scan also proves dispatch. Record inferred stages
    // explicitly rather than inventing packing or cash-collection actions.
    for (let rank = current + 1; rank <= target; rank++) {
      const status = (['shipped', 'out_for_delivery', 'delivered'] as const)[rank - 1]!;
      if (rank === 1) { await this.inventory.markDispatched(order.idempotencyKey, session); op.dispatchedAt ??= at.toISOString(); op.fulfillment = 'dispatched'; op.shipment = 'in_transit'; }
      if (rank === 2) op.shipment = 'out_for_delivery';
      if (rank === 3) { op.shipment = 'delivered'; op.fulfillment = 'completed'; op.deliveredAt ??= at.toISOString(); }
      order.status = status;
      const reason = `${reference}${rank < target ? '; intermediate stage inferred from later provider scan' : ''}`;
      order.statusHistory.push({ status, at, actor: 'shiprocket', note: reason });
      order.activity.push({ action: `courier_${status}`, actor: 'shiprocket', at, reason, after: { ...evidence, providerStatus: scan.status } });
    }
    order.operations = op;
    if (order.shippingReviewReason === reviewReason) order.shippingReviewReason = undefined;
    await this.persistOrder(order, session);
  }

  async overrideAmount(id: string, dto: OverrideOrderAmountDto, actor: string, checkedProviderOrderId?: string, checkedRevision?: number): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ id }).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');
      const fingerprint = createHash('sha256').update(JSON.stringify({ action: 'override_amount', totalPaise: dto.totalPaise, expectedTotalPaise: dto.expectedTotalPaise, reason: dto.reason.trim(), idempotencyKey: dto.idempotencyKey })).digest('hex');
      const prior = order.activity.find(item => item.idempotencyKey === dto.idempotencyKey);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ConflictException('Action key was reused with different details');
        result = order.toObject(); return;
      }
      const blocked = amountOverrideBlockedReason(order);
      if (blocked) throw new BadRequestException(blocked);
      if (checkedRevision !== undefined && (order.paymentRevision ?? 0) !== checkedRevision) throw new ConflictException('The order changed while payment was being checked. Refresh and try again.');
      if (order.razorpayOrderId && checkedProviderOrderId !== order.razorpayOrderId) throw new ConflictException('Check the existing online payment before replacing its checkout.');
      if (!Number.isSafeInteger(dto.totalPaise) || dto.totalPaise < (order.paymentMethod === 'razorpay' ? 100 : 1)) throw new BadRequestException('Enter a valid amount of at least ₹' + (order.paymentMethod === 'razorpay' ? '1' : '0.01'));
      if (!dto.idempotencyKey || !dto.reason?.trim() || dto.reason.trim().length < 3) throw new BadRequestException('An action key and a reason of at least 3 characters are required');
      if (order.totalPaise !== dto.expectedTotalPaise) throw new ConflictException('The order amount changed. Refresh the order and try again.');
      if (order.totalPaise === dto.totalPaise) throw new BadRequestException('Enter an amount different from the current total');
      const before = { totalPaise: order.totalPaise, amountAdjustmentPaise: order.amountAdjustmentPaise ?? 0 };
      const baseTotal = Math.max(0, order.subtotalPaise - (order.couponDiscountPaise ?? 0)) + order.shippingPaise;
      if (order.paymentMethod === 'razorpay') {
        if (order.razorpayOrderId) {
          order.supersededRazorpayOrders.push({ id: order.razorpayOrderId, amountPaise: order.totalPaise, at: new Date() });
          order.razorpayOrderId = undefined;
          order.paymentCreationStartedAt = undefined;
        }
        order.paymentRevision = (order.paymentRevision ?? 0) + 1;
        order.paymentWindowStartedAt = new Date();
        order.paymentStatus = 'pending';
      }
      order.totalPaise = dto.totalPaise;
      order.amountAdjustmentPaise = dto.totalPaise - baseTotal;
      order.activity.push({ action: 'override_amount', actor, at: new Date(), reason: dto.reason.trim(), idempotencyKey: dto.idempotencyKey, fingerprint, before, after: { totalPaise: order.totalPaise, amountAdjustmentPaise: order.amountAdjustmentPaise } });
      await this.persistOrder(order, session);
      result = order.toObject();
    }); } finally { await session.endSession(); }
    if (!result) throw new Error('Amount override transaction produced no order');
    return result;
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

  async cancel(id: string, reason: string, actor = 'admin', pendingOnly = false, expireBefore?: Date): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        const order = await this.orders.findOne({ id }).session(session).exec();
        if (!order) throw new NotFoundException(`No order found for "${id}"`);
        if (expireBefore && new Date(order.paymentWindowStartedAt ?? order.get('createdAt')).getTime() >= expireBefore.getTime()) { result = order.toObject(); return; }
        if (pendingOnly && (order.paymentMethod !== 'razorpay' || order.paymentStatus === 'paid' || order.status !== 'pending')) throw new BadRequestException('Only unpaid pending online orders can be cancelled');
        if (order.status === 'cancelled') { await this.coupons.refundRedemption(order.id, session); result = order.toObject(); return; }
        if (order.shiprocketBookingStarted) throw new BadRequestException('Cancel the Shiprocket shipment and refresh provider details before cancelling this order');
        if (!['pending', 'confirmed', 'packed'].includes(order.status)) throw new BadRequestException(`Cannot cancel an order in ${order.status}`);
        if (order.stockReserved) await this.inventory.releaseForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })), 'cancelled', actor, session);
        if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid') {
          if (!order.paymentReconciliationRequired) order.paymentReconciliationNote = 'Paid order cancelled; issue or record a provider refund';
          order.paymentReconciliationRequired = true;
        }
        order.operations = { ...operationsFor(order), fulfillment: 'cancelled' };
        order.stockReserved = false;
        order.activity.push({ action: 'cancel', actor, at: new Date(), reason: reason.trim() });
        order.status = 'cancelled';
        order.cancellationReason = reason.trim();
        order.statusHistory.push({ status: 'cancelled', at: new Date(), actor, note: reason.trim() });
        await this.persistOrder(order, session);
        await this.coupons.refundRedemption(order.id, session);
        result = order.toObject();
      });
    } finally { await session.endSession(); }
    if (!result) throw new Error('Cancellation transaction produced no order');
    return result;
  }

  async validatePaymentCheckout(order: Order) {
    if (!order.shippingQuote) return;
    const result = await this.checkout.validate({ cartId: order.cartId, lines: order.lines, deliveryAddress: order.deliveryAddress, paymentMethod: order.paymentMethod, couponCode: order.couponCode }, order.shippingQuote.quoteId, order.shippingQuote.courierId, true);
    if (result.quote.subtotalPaise - result.quote.discountPaise + result.selected.shippingPaise !== order.totalPaise - (order.amountAdjustmentPaise ?? 0)) throw new ConflictException('Order total changed. Return to checkout.');
  }

  async claimPaymentCreation(id: string, expectedTotalPaise?: number, expectedRevision = 0) {
    return Boolean(await this.orders.findOneAndUpdate({ id, $or: [{ paymentRevision: expectedRevision }, ...(expectedRevision === 0 ? [{ paymentRevision: { $exists: false } }] : [])], ...(expectedTotalPaise === undefined ? {} : { totalPaise: expectedTotalPaise }), status: 'pending', paymentStatus: 'pending', razorpayOrderId: { $exists: false }, paymentCreationStartedAt: { $exists: false } }, { $set: { paymentCreationStartedAt: new Date() } }));
  }

  async attachRazorpayOrder(id: string, razorpayOrderId: string, expectedRevision = 0): Promise<Order> {
    // The first provider order wins; concurrent checkout requests reuse it.
    await this.orders.updateOne({ id, $or: [{ paymentRevision: expectedRevision }, ...(expectedRevision === 0 ? [{ paymentRevision: { $exists: false } }] : [])], paymentMethod: 'razorpay', paymentStatus: 'pending', status: 'pending', razorpayOrderId: { $exists: false } }, { $set: { razorpayOrderId }, $addToSet: { razorpayOrderReferences: razorpayOrderId } }).exec();
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

  async captureRazorpayPayment(razorpayOrderId: string, paymentId: string, amount: number, currency: string): Promise<void> {
    const session = await this.connection.startSession();
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ $or: [{ razorpayOrderId }, { 'supersededRazorpayOrders.id': razorpayOrderId }] }).session(session).exec();
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
      const superseded = order.supersededRazorpayOrders?.find(item => item.id === razorpayOrderId);
      if (superseded) {
        order.paymentStatus = 'paid'; order.razorpayPaymentId = paymentId;
        if (Number.isSafeInteger(amount) && amount === superseded.amountPaise && currency === 'INR') order.capturedAmountPaise = amount;
        order.paymentReconciliationRequired = true;
        order.paymentReconciliationNote = 'Payment captured on a replaced checkout; cancel and refund the captured payment before placing a new order';
        order.activity.push({ action: 'superseded_payment_captured', actor: 'razorpay', at: new Date(), reason: `Capture ${paymentId} on replaced checkout ${razorpayOrderId}`, after: { amount, currency } });
        await this.persistOrder(order, session); return;
      }
      if (Number.isSafeInteger(amount) && amount > 0 && currency === 'INR') order.capturedAmountPaise = amount;
      if (order.status === 'cancelled' || !order.stockReserved) {
        // Persist captured money explicitly for reconciliation; never restore a cancelled order.
        order.paymentStatus = 'paid'; order.razorpayPaymentId = paymentId;
        order.paymentReconciliationRequired = true;
        order.activity.push({ action: 'late_payment', actor: 'razorpay', at: new Date(), reason: `Capture ${paymentId} after reservation release`, after: { amount, currency } });
        order.paymentReconciliationNote = 'Payment captured after the order reservation was released; refund or manual recovery required';
        order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: 'Late payment captured after reservation release; refund/reconciliation required' });
        await this.persistOrder(order, session); return;
      }
      if (!Number.isSafeInteger(amount) || amount !== order.totalPaise || currency !== 'INR') {
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
