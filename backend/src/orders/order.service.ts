import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { OrderCreateDto } from './order.dto';
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
export class OrderService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponsService,
  ) {}

  async getOrder(id: string): Promise<Order> {
    const order = await this.orders.findOne({ id }).lean().exec();
    if (!order) throw new NotFoundException(`No order found for "${id}"`);
    return order;
  }

  async listAdmin(): Promise<Order[]> {
    return this.orders.find().sort({ createdAt: -1 }).lean().exec();
  }

  async createOrder(dto: OrderCreateDto): Promise<Order> {
    const idempotencyKey = dto.idempotencyKey ?? `order:${dto.cartId}:${Date.now()}`;
    const existing = await this.orders
      .findOne({ idempotencyKey })
      .lean()
      .exec();
    if (existing) return existing;

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
      paymentStatus: 'pending',
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      status: isCod ? 'confirmed' : 'pending',
      idempotencyKey,
      stockReserved: true,
      stockCommitted: isCod,
      statusHistory: [{ status: isCod ? 'confirmed' : 'pending', at: new Date(), actor: 'system', note: 'Order created' }],
          }], { session });
          order = created;
          if (isCod) await this.inventory.commitForOrder(idempotencyKey, lines, 'system', session);
        });
      } finally { await session.endSession(); }
      if (!order) throw new Error('Order transaction produced no order');
      return order.toObject();
    } catch (error) {
      if (redeemed) await this.coupons.refundRedemption(orderId);
      if ((error as { code?: number })?.code === 11000) {
        const raced = await this.orders.findOne({ idempotencyKey }).lean().exec();
        if (raced) return raced;
      }
      throw error;
    }
  }

  async updateStatus(id: string, status: OrderStatus, options: { trackingNumber?: string; trackingUrl?: string; note?: string; refundReference?: string; actor?: string } = {}): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ id }).session(session).exec();
      if (!order) throw new NotFoundException(`No order found for "${id}"`);
      const allowed: Record<OrderStatus, OrderStatus[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['out_for_delivery', 'return_requested'], out_for_delivery: ['delivered'], delivered: ['return_requested'], return_requested: ['returned'], returned: ['refunded'], refunded: [], cancelled: [] };
      if (order.status !== status && !allowed[order.status].includes(status)) throw new BadRequestException(`Cannot move ${order.status} to ${status}`);
      if (status === 'refunded') throw new BadRequestException('Use the payment refund workflow to complete a refund');
      if ((status === 'cancelled' || status === 'returned') && order.stockReserved) {
        await this.inventory.releaseForOrder(order.idempotencyKey, order.lines.map((l) => ({ productSlug: l.productSlug, packSize: l.packSize, quantity: l.quantity })), status === 'returned' ? 'return' : 'cancelled', options.actor ?? 'admin', session);
      }
      if (status === 'cancelled' && order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid') {
        order.paymentReconciliationRequired = true;
        order.paymentReconciliationNote = 'Paid order cancelled; issue or record a provider refund';
      }
      order.status = status;
      if (status === 'delivered' && order.paymentMethod === 'cod') order.paymentStatus = 'paid';
      if (options.trackingNumber !== undefined) order.trackingNumber = options.trackingNumber.trim();
      if (options.trackingUrl !== undefined) order.trackingUrl = options.trackingUrl.trim();
      if (options.refundReference !== undefined) order.refundReference = options.refundReference.trim();
      order.statusHistory.push({ status, at: new Date(), actor: options.actor ?? 'admin', note: options.note?.trim() });
      await order.save({ session }); result = order.toObject();
    }); } finally { await session.endSession(); }
    if (!result) throw new Error('Order update transaction produced no order');
    if (status === 'cancelled' || status === 'returned') await this.coupons.refundRedemption(result.id);
    return result;
  }

  async markRefunded(id: string, refundReference: string, actor = 'razorpay') {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ id }).session(session).exec();
      if (!order) throw new NotFoundException(`No order found for "${id}"`);
      if (order.paymentStatus === 'refunded') { result = order.toObject(); return; }
      if (order.status !== 'returned' || order.paymentStatus !== 'paid') throw new BadRequestException('Only returned, paid orders can be refunded');
      order.status = 'refunded'; order.paymentStatus = 'refunded'; order.refundReference = refundReference;
      order.paymentReconciliationRequired = false;
      order.paymentReconciliationNote = '';
      order.statusHistory.push({ status: 'refunded', at: new Date(), actor, note: `Payment refund ${refundReference}` });
      await order.save({ session }); result = order.toObject();
    }); } finally { await session.endSession(); }
    if (!result) throw new Error('Refund update transaction produced no order');
    await this.coupons.refundRedemption(result.id);
    return result;
  }

  async cancel(id: string, reason: string, actor = 'admin'): Promise<Order> {
    const session = await this.connection.startSession();
    let result: Order | undefined;
    try {
      await session.withTransaction(async () => {
        const order = await this.orders.findOne({ id }).session(session).exec();
        if (!order) throw new NotFoundException(`No order found for "${id}"`);
        if (order.status === 'cancelled') { result = order.toObject(); return; }
        if (!['pending', 'confirmed', 'packed'].includes(order.status)) throw new BadRequestException(`Cannot cancel an order in ${order.status}`);
        if (order.stockReserved) await this.inventory.releaseForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })), 'cancelled', actor, session);
        if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'paid') {
          order.paymentReconciliationRequired = true;
          order.paymentReconciliationNote = 'Paid order cancelled; issue or record a provider refund';
        }
        order.status = 'cancelled';
        order.cancellationReason = reason.trim();
        order.statusHistory.push({ status: 'cancelled', at: new Date(), actor, note: reason.trim() });
        await order.save({ session });
        result = order.toObject();
      });
    } finally { await session.endSession(); }
    if (!result) throw new Error('Cancellation transaction produced no order');
    await this.coupons.refundRedemption(result.id);
    return result;
  }

  async attachRazorpayOrder(id: string, razorpayOrderId: string): Promise<void> {
    await this.orders.updateOne({ id, paymentMethod: 'razorpay', paymentStatus: 'pending' }, { $set: { razorpayOrderId } }).exec();
  }

  async prepareRazorpayRetry(id: string): Promise<Order> {
    const order = await this.orders.findOneAndUpdate(
      { id, paymentMethod: 'razorpay', paymentStatus: 'failed', status: 'pending', stockReserved: true },
      { $set: { paymentStatus: 'pending' }, $unset: { razorpayOrderId: 1 } },
      { new: true },
    ).lean().exec();
    if (!order) throw new BadRequestException('This order cannot be retried for payment');
    return order;
  }

  async captureRazorpayPayment(razorpayOrderId: string, paymentId: string, amount?: number, currency?: string): Promise<void> {
    const session = await this.connection.startSession();
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ razorpayOrderId }).session(session).exec();
      if (!order) return;
      if (order.paymentStatus === 'refunded') {
        order.paymentReconciliationRequired = true;
        order.paymentReconciliationNote = `New payment capture ${paymentId} detected after refund ${order.refundReference ?? ''}; investigate duplicate charge`;
        await order.save({ session }); return;
      }
      if (order.paymentStatus === 'paid') {
        if (order.razorpayPaymentId !== paymentId) {
          order.paymentReconciliationRequired = true;
          order.paymentReconciliationNote = `Multiple payment captures detected (${order.razorpayPaymentId ?? 'first payment'} and ${paymentId}); refund duplicate capture`;
          order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: order.paymentReconciliationNote });
          await order.save({ session });
        }
        return;
      }
      if (order.status === 'cancelled' || !order.stockReserved) {
        // Persist captured money explicitly for reconciliation; never restore a cancelled order.
        order.paymentStatus = 'paid'; order.razorpayPaymentId = paymentId;
        order.paymentReconciliationRequired = true;
        order.paymentReconciliationNote = 'Payment captured after the order reservation was released; refund or manual recovery required';
        order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: 'Late payment captured after reservation release; refund/reconciliation required' });
        await order.save({ session }); return;
      }
      if ((amount !== undefined && amount !== order.totalPaise) || (currency !== undefined && currency !== 'INR')) {
        order.paymentStatus = 'paid'; order.razorpayPaymentId = paymentId;
        order.paymentReconciliationRequired = true;
        order.paymentReconciliationNote = `Captured amount/currency mismatch (received ${amount ?? 'unknown'} ${currency ?? 'unknown'}; expected ${order.totalPaise} INR)`;
        order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: order.paymentReconciliationNote });
        await order.save({ session }); return;
      }
      order.paymentStatus = 'paid'; order.status = 'confirmed'; order.razorpayPaymentId = paymentId; order.stockCommitted = true;
      await this.inventory.commitForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })), 'razorpay-webhook', session);
      order.statusHistory.push({ status: 'confirmed', at: new Date(), actor: 'razorpay-webhook', note: 'Payment captured' });
      await order.save({ session });
    }); } finally { await session.endSession(); }
  }

  async failRazorpayPayment(razorpayOrderId: string): Promise<void> {
    const session = await this.connection.startSession();
    try { await session.withTransaction(async () => {
      const order = await this.orders.findOne({ razorpayOrderId }).session(session).exec();
      if (!order || order.paymentStatus !== 'pending') return;
      // A failed payment webhook reports one attempt. Keep the reservation so
      // checkout can retry; an explicit cancellation releases it transactionally.
      order.paymentStatus = 'failed';
      order.statusHistory.push({ status: order.status, at: new Date(), actor: 'razorpay-webhook', note: 'Payment attempt failed; stock remains reserved for retry' });
      await order.save({ session });
    }); } finally { await session.endSession(); }
  }
}
