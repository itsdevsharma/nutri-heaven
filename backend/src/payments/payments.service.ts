import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import { VerifyRazorpayPaymentDto } from './payments.dto';
import { OrderService } from '../orders/order.service';

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private expiryTimer?: ReturnType<typeof setInterval>;
  private expiring = false;
  onModuleInit() {
    this.expiryTimer = setInterval(() => { void this.expirePendingOrders(); }, 60_000);
    this.expiryTimer.unref();
  }
  onModuleDestroy() { if (this.expiryTimer) clearInterval(this.expiryTimer); }

  async expirePendingOrders() {
    if (this.expiring) return;
    this.expiring = true;
    try {
      const stale = await this.orders.staleOnlineOrders(new Date(Date.now() - 30 * 60_000));
      for (const record of stale) {
        try {
          const order = await this.paymentStatus(record.id, record.cartId);
          if (order.status === 'pending' && !['paid', 'refunded'].includes(order.paymentStatus)) {
            await this.orders.cancel(order.id, 'Online payment reservation expired after 30 minutes', 'system', true);
          }
        } catch { this.logger.warn(`Could not reconcile expiring online order ${record.id}; will retry`); }
      }
    } catch { this.logger.warn('Could not check expiring payment reservations; will retry'); }
    finally { this.expiring = false; }
  }

  private client(): Razorpay {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) throw new ServiceUnavailableException('Online payments are not configured. Please choose cash on delivery.');
    return new Razorpay({ key_id, key_secret });
  }

  constructor(private readonly orders: OrderService) {}

  configuration() {
    return { enabled: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET), testMode: process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') === true };
  }

  private async ownedOrder(orderId: string, cartId?: string) {
    const order = await this.orders.getOrder(orderId);
    if (!cartId || order.cartId !== cartId) throw new ForbiddenException('This payment belongs to another shopping session');
    if (order.paymentMethod !== 'razorpay') throw new BadRequestException('This order uses cash on delivery');
    return order;
  }

  async createRazorpayOrder(orderId: string, cartId?: string) {
    const client = this.client();
    let order = await this.ownedOrder(orderId, cartId);
    if (order.status !== 'pending' || !order.stockReserved) throw new BadRequestException('This order can no longer be paid');
    if (order.paymentStatus === 'failed') order = await this.orders.prepareRazorpayRetry(orderId);
    if (order.paymentStatus !== 'pending') throw new BadRequestException('This order can no longer be paid');
    if (!Number.isInteger(order.totalPaise) || order.totalPaise < 100) throw new BadRequestException('Online payments require an order total of at least ₹1. Choose cash on delivery for this order.');
    if (!order.razorpayOrderId) {
      let remote;
      try { remote = await client.orders.create({ amount: order.totalPaise, currency: 'INR', receipt: order.id, notes: { orderId: order.id } }); }
      catch { throw new ServiceUnavailableException('Could not start online payment. Retry your saved checkout or cancel the unpaid order.'); }
      order = await this.orders.attachRazorpayOrder(order.id, remote.id);
    }
    if (!order.razorpayOrderId || order.status !== 'pending' || order.paymentStatus !== 'pending') throw new BadRequestException('This order can no longer be paid');
    return { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, razorpayOrderId: order.razorpayOrderId, amount: order.totalPaise, currency: 'INR' };
  }

  async verifyPayment(orderId: string, body: VerifyRazorpayPaymentDto, cartId?: string) {
    const order = await this.ownedOrder(orderId, cartId);
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new ServiceUnavailableException('Online payments are not configured');
    if (!order.razorpayOrderId || body.razorpay_order_id !== order.razorpayOrderId) throw new BadRequestException('Payment order does not match your order');
    const expected = createHmac('sha256', secret).update(`${order.razorpayOrderId}|${body.razorpay_payment_id}`).digest('hex');
    const signature = Buffer.from(body.razorpay_signature, 'hex');
    if (signature.length !== 32 || !timingSafeEqual(Buffer.from(expected, 'hex'), signature)) throw new BadRequestException('Invalid payment signature');
    const client = this.client();
    let payment = await client.payments.fetch(body.razorpay_payment_id);
    if (payment.order_id !== order.razorpayOrderId || Number(payment.amount) !== order.totalPaise || payment.currency !== 'INR') throw new BadRequestException('Payment amount or order does not match');
    if (payment.status === 'authorized') {
      if (order.status !== 'pending' || !order.stockReserved) throw new BadRequestException('This order is no longer payable. Contact support about your payment.');
      try { payment = await client.payments.capture(payment.id, order.totalPaise, 'INR'); }
      catch { payment = await client.payments.fetch(payment.id); } // Automatic capture can win the race.
    }
    if (payment.status !== 'captured') throw new BadRequestException('Payment has not been captured yet. Check payment status before retrying.');
    await this.orders.captureRazorpayPayment(order.razorpayOrderId, payment.id, Number(payment.amount), payment.currency);
    return this.orders.getOrder(order.id);
  }

  async paymentStatus(orderId: string, cartId?: string) {
    const order = await this.ownedOrder(orderId, cartId);
    // Recover captured payments if the browser closed before verification or a webhook was delayed.
    if (order.razorpayOrderId && !['paid', 'refunded'].includes(order.paymentStatus)) {
      const payments = await this.client().orders.fetchPayments(order.razorpayOrderId);
      for (const payment of payments.items.filter(payment => payment.status === 'captured')) {
        await this.orders.captureRazorpayPayment(order.razorpayOrderId, payment.id, Number(payment.amount), payment.currency);
      }
    }
    return this.orders.getOrder(order.id);
  }

  async cancelPending(orderId: string, cartId?: string) {
    const order = await this.paymentStatus(orderId, cartId);
    return this.orders.cancel(order.id, 'Customer cancelled online checkout', 'customer', true);
  }

  async refundOrder(orderId: string, actor = 'razorpay') {
    const order = await this.orders.getOrder(orderId);
    if (order.paymentStatus === 'refunded') return order;
    if (order.paymentMethod !== 'razorpay' || order.paymentStatus !== 'paid' || !['returned', 'cancelled'].includes(order.status) || !order.razorpayPaymentId) {
      throw new BadRequestException('Only captured Razorpay payments on returned or cancelled orders can be refunded');
    }
    const refund = await this.client().payments.refund(order.razorpayPaymentId, {
      amount: order.totalPaise,
      notes: { orderId: order.id },
    });
    return this.orders.markRefunded(order.id, refund.id, actor);
  }

  async handleWebhook(rawBody: Buffer, signature?: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) throw new BadRequestException('Invalid Razorpay webhook');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }
    let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string } } } };
    try { event = JSON.parse(rawBody.toString()); }
    catch { throw new BadRequestException('Malformed Razorpay webhook payload'); }
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return { received: true, ignored: true };
    if (event.event === 'payment.captured') {
      if (!payment.id || !Number.isInteger(payment.amount) || payment.currency !== 'INR') throw new BadRequestException('Captured payment is missing valid payment details');
      await this.orders.captureRazorpayPayment(payment.order_id, payment.id, payment.amount, payment.currency);
    }
    if (event.event === 'payment.failed') await this.orders.failRazorpayPayment(payment.order_id);
    return { received: true };
  }
}
