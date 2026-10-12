import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema({ timestamps: true, collection: 'customer_notifications' })
export class CustomerNotification {
  @Prop({ required: true, index: true }) email!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) message!: string;
  @Prop({ default: '/account' }) link!: string;
  @Prop() readAt?: Date;
  @Prop({ required: true, unique: true }) eventKey!: string;
  @Prop({ default: false }) emailRequested!: boolean;
  @Prop() sentAt?: Date;
  @Prop() retryAt?: Date;
  @Prop({ default: 0 }) attempts!: number;
  @Prop() deliveryError?: string;
}
export const CustomerNotificationSchema = SchemaFactory.createForClass(CustomerNotification);
@Schema({ timestamps: true, collection: 'newsletter_subscribers' })
export class Subscriber {
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email!: string;
  @Prop({ default: 'pending', enum: ['pending', 'subscribed', 'unsubscribed'] }) status!: string;
  @Prop() consentAt?: Date;
  @Prop() confirmedAt?: Date;
  @Prop({ select: false }) confirmHash?: string;
  @Prop({ select: false }) expiresAt?: Date;
  @Prop({ select: false }) unsubscribeHash?: string;
}
export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);
@Schema({ timestamps: true, collection: 'product_reviews' })
export class Review {
  @Prop({ required: true }) customerId!: string;
  @Prop({ required: true }) customerName!: string;
  @Prop({ required: true, index: true }) productSlug!: string;
  @Prop({ required: true, min: 1, max: 5 }) rating!: number;
  @Prop({ required: true }) body!: string;
  @Prop({ default: 'pending', enum: ['pending', 'approved', 'rejected'] }) status!: string;
  @Prop({ default: true }) verifiedPurchase!: boolean;
}
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ customerId: 1, productSlug: 1 }, { unique: true });
