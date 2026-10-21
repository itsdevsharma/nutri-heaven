import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
@Schema({ collection: 'payment_webhook_events', timestamps: true })
export class PaymentWebhookEvent {
  @Prop({ required: true, unique: true }) eventKey!: string;
  @Prop({ required: true }) payloadHash!: string;
  @Prop({ type: Object, required: true }) payload!: Record<string, unknown>;
  @Prop({ enum: ['pending', 'processing', 'completed', 'dead_letter'], default: 'pending' }) status!: string;
  @Prop({ default: 0 }) attempts!: number;
  @Prop({ default: () => new Date() }) nextAttemptAt!: Date;
  @Prop({ default: '' }) error!: string;
}
export type PaymentWebhookEventDocument = HydratedDocument<PaymentWebhookEvent>;
export const PaymentWebhookEventSchema = SchemaFactory.createForClass(PaymentWebhookEvent);
PaymentWebhookEventSchema.index({ status: 1, nextAttemptAt: 1 });
