import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from './order.schema';
import { OrderCreateDto } from './order.dto';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';

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
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
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
    const totalPaise = quote.totalPaise;

    // Reserve stock BEFORE creating the order, so a failed reservation
    // never leaves a phantom order behind.
    await this.inventory.reserveForOrder(
      idempotencyKey,
      lines.map((l) => ({
        productSlug: l.productSlug,
        packSize: l.packSize,
        quantity: l.quantity,
      })),
    );

    const isCod = dto.paymentMethod === 'cod';
    const order = await this.orders.create({
      id: `NH${Date.now().toString(36)}`,
      cartId: dto.cartId,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      deliveryAddress: dto.deliveryAddress,
      lines,
      subtotalPaise,
      shippingPaise,
      totalPaise,
      paymentMethod: dto.paymentMethod,
      paymentStatus: isCod ? 'paid' : 'pending',
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      status: isCod ? 'confirmed' : 'pending',
      idempotencyKey,
      stockReserved: true,
      stockCommitted: isCod,
      statusHistory: [{ status: isCod ? 'confirmed' : 'pending', at: new Date(), actor: 'system', note: 'Order created' }],
    });

    if (isCod) await this.inventory.commitForOrder(idempotencyKey, lines);

    return order;
  }

  async updateStatus(id: string, status: OrderStatus, options: { trackingNumber?: string; trackingUrl?: string; note?: string; refundReference?: string; actor?: string } = {}): Promise<Order> {
    const order = await this.orders.findOne({ id }).exec();
    if (!order) throw new NotFoundException(`No order found for "${id}"`);
    const allowed: Record<OrderStatus, OrderStatus[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['out_for_delivery', 'return_requested'], out_for_delivery: ['delivered'], delivered: ['return_requested'], return_requested: ['returned'], returned: ['refunded'], refunded: [], cancelled: [] };
    if (order.status !== status && !allowed[order.status].includes(status)) throw new BadRequestException(`Cannot move ${order.status} to ${status}`);
    order.status = status;
    if (options.trackingNumber !== undefined) order.trackingNumber = options.trackingNumber.trim();
    if (options.trackingUrl !== undefined) order.trackingUrl = options.trackingUrl.trim();
    if (options.refundReference !== undefined) order.refundReference = options.refundReference.trim();
    order.statusHistory.push({ status, at: new Date(), actor: options.actor ?? 'admin', note: options.note?.trim() });
    await order.save();
    const result = order.toObject();

    // When an order is cancelled, restore the stock.
    if ((status === 'cancelled' || status === 'returned') && order.stockReserved) {
      await this.inventory.releaseForOrder(
        order.idempotencyKey,
        order.lines.map((l) => ({
          productSlug: l.productSlug,
          packSize: l.packSize,
          quantity: l.quantity,
        })),
        status === 'returned' ? 'return' : 'cancelled',
      );
    }
    return result;
  }

  async cancel(id: string, reason: string): Promise<Order> {
    const order = await this.orders.findOne({ id }).exec();
    if (!order) throw new NotFoundException(`No order found for "${id}"`);
    if (order.status === 'cancelled') return order.toObject();
    if (!['pending', 'confirmed', 'packed'].includes(order.status)) throw new BadRequestException(`Cannot cancel an order in ${order.status}`);
    order.status = 'cancelled';
    order.cancellationReason = reason.trim();
    order.statusHistory.push({ status: 'cancelled', at: new Date(), actor: 'admin', note: reason.trim() });
    await order.save();
    if (order.stockReserved) {
      await this.inventory.releaseForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })));
    }
    return order.toObject();
  }

  async attachRazorpayOrder(id: string, razorpayOrderId: string): Promise<void> {
    await this.orders.updateOne({ id, paymentMethod: 'razorpay', paymentStatus: 'pending' }, { $set: { razorpayOrderId } }).exec();
  }

  async captureRazorpayPayment(razorpayOrderId: string, paymentId: string): Promise<void> {
    const order = await this.orders.findOne({ razorpayOrderId }).exec();
    if (!order || order.paymentStatus === 'paid') return;
    order.paymentStatus = 'paid'; order.status = 'confirmed'; order.razorpayPaymentId = paymentId; order.stockCommitted = true;
    await order.save();
    await this.inventory.commitForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })));
  }

  async failRazorpayPayment(razorpayOrderId: string): Promise<void> {
    const order = await this.orders.findOne({ razorpayOrderId }).exec();
    if (!order || order.paymentStatus !== 'pending') return;
    order.paymentStatus = 'failed'; await order.save();
    if (order.stockReserved && !order.stockCommitted) await this.inventory.releaseForOrder(order.idempotencyKey, order.lines.map((line) => ({ productSlug: line.productSlug, packSize: line.packSize, quantity: line.quantity })));
  }
}
