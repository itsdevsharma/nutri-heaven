import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
export type RefundState = 'processing' | 'completed' | 'failed' | 'reconciliation_required';
@Schema({ collection: 'order_refunds', timestamps: true })
export class OrderRefund {
  @Prop({ required: true, unique: true }) orderId!: string;
  @Prop({ required: true, unique: true }) requestId!: string;
  @Prop({ required: true }) paymentId!: string;
  @Prop({ required: true, min: 1 }) amountPaise!: number;
  @Prop({ required: true, enum: ['processing', 'completed', 'failed', 'reconciliation_required'] }) status!: RefundState;
  @Prop() providerRefundId?: string;
  @Prop({ required: true }) actor!: string;
  @Prop({ required: true }) reason!: string;
  @Prop({ default: 0 }) attempts!: number;
  @Prop() nextCheckAt?: Date;
  @Prop({ default: '' }) error!: string;
  @Prop({ type: [Object], default: [] }) history!: Array<{ at: Date; status: string; actor: string; note: string; providerRefundId?: string }>;
}
export type OrderRefundDocument = HydratedDocument<OrderRefund>;
export const OrderRefundSchema = SchemaFactory.createForClass(OrderRefund);
OrderRefundSchema.index({ status: 1, nextCheckAt: 1 });
OrderRefundSchema.index({ providerRefundId: 1 }, { unique: true, sparse: true });
