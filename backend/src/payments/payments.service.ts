import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay from 'razorpay';
import { OrderService } from '../orders/order.service';

@Injectable()
export class PaymentsService {
  private client(): Razorpay {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) throw new BadRequestException('Razorpay sandbox is not configured');
    return new Razorpay({ key_id, key_secret });
  }

  constructor(private readonly orders: OrderService) {}

  async createRazorpayOrder(orderId: string) {
    const order = await this.orders.getOrder(orderId);
    if (order.paymentMethod !== 'razorpay') throw new BadRequestException('This order uses cash on delivery');
    if (order.paymentStatus !== 'pending') throw new BadRequestException('This order can no longer be paid');
    const remote = await this.client().orders.create({ amount: order.totalPaise, currency: 'INR', receipt: order.id, notes: { orderId: order.id } });
    await this.orders.attachRazorpayOrder(order.id, remote.id);
    return { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, razorpayOrderId: remote.id, amount: order.totalPaise, currency: 'INR' };
  }

  async handleWebhook(rawBody: Buffer, signature?: string) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) throw new BadRequestException('Invalid Razorpay webhook');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }
    const event = JSON.parse(rawBody.toString()) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return { received: true, ignored: true };
    if (event.event === 'payment.captured') await this.orders.captureRazorpayPayment(payment.order_id, payment.id ?? '');
    if (event.event === 'payment.failed') await this.orders.failRazorpayPayment(payment.order_id);
    return { received: true };
  }
}
