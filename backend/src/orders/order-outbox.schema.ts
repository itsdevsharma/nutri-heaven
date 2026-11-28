import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { ClientSession, HydratedDocument, Model } from 'mongoose';
import type { Order } from './order.schema';
import { orderConfirmationEmail } from '../mail/order-confirmation.template';
@Schema({ collection: 'order_outbox', timestamps: true })
export class OrderOutbox {
  @Prop() customerId?: string;
  @Prop({ required: true, unique: true }) eventKey!: string;
  @Prop({ required: true }) orderId!: string;
  @Prop({ required: true }) email!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) message!: string;
  @Prop({ enum: ['order_confirmation'] }) emailTemplate?: string;
  @Prop() emailText?: string;
  @Prop() emailHtml?: string;
  @Prop({ enum: ['pending', 'delivered', 'dead_letter'], default: 'pending' }) status!: string;
  @Prop({ default: 0 }) attempts!: number;
  @Prop({ default: () => new Date() }) nextAttemptAt!: Date;
}
export type OrderOutboxDocument = HydratedDocument<OrderOutbox>;
export const OrderOutboxSchema = SchemaFactory.createForClass(OrderOutbox);
OrderOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
export async function enqueueOrderNotification(model: Model<OrderOutboxDocument>, order: Order, session: ClientSession, placed = false) {
  const action = order.activity?.at(-1)?.action || order.status;
  const confirmation = placed ? orderConfirmationEmail(order) : undefined;
  const eventKey = `${order.id}:${order.statusHistory.length}:${order.activity?.length || 0}:${order.paymentStatus}`;
  const message = action === 'override_amount' ? `Your order ${order.id} total has been updated to INR ${(order.totalPaise / 100).toFixed(2)}. ${order.paymentMethod === 'razorpay' ? 'Close any old payment window and open your order in your account to complete payment at the revised amount.' : 'Pay the revised total on delivery.'}` : `Your order ${order.id} is ${order.status.replaceAll('_', ' ')}. Payment: ${order.paymentStatus}. View details and tracking in your account.`;
  await model.updateOne({ eventKey }, { $setOnInsert: { eventKey, orderId: order.id, customerId: order.customerId, email: order.customerEmail, title: confirmation?.subject ?? `Order ${order.id}: ${action.replaceAll('_', ' ')}`, message, ...(confirmation ? { emailTemplate: 'order_confirmation', emailText: confirmation.text, emailHtml: confirmation.html } : {}), status: 'pending', attempts: 0, nextAttemptAt: new Date() } }, { upsert: true, session });
}
