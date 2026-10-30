import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
export interface Parcel { pickupLocation: string; pickupPostcode: string; weight: number; length: number; breadth: number; height: number }
export interface DeliveryOption { courierId: number; name: string; shippingPaise: number; estimatedDays: string }
@Schema({ collection: 'checkout_quotes', timestamps: true })
export class CheckoutQuote {
  @Prop({ unique: true, required: true }) id!: string;
  @Prop({ required: true }) cartId!: string;
  @Prop({ required: true }) fingerprint!: string;
  @Prop({ required: true }) pricingFingerprint!: string;
  @Prop({ type: Object, required: true }) parcel!: Parcel;
  @Prop({ type: [Object], required: true }) options!: DeliveryOption[];
  @Prop({ type: [Object], default: [] }) lines!: Array<{ slug: string; packSize: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }>;
  @Prop({ default: () => new Date() }) quotedAt!: Date;
  @Prop({ default: 'INR' }) currency!: string;
  @Prop({ required: true }) subtotalPaise!: number;
  @Prop({ required: true }) discountPaise!: number;
  @Prop({ default: 0 }) taxPaise!: number;
  @Prop({ required: true }) expiresAt!: Date;
}
export const CheckoutQuoteSchema = SchemaFactory.createForClass(CheckoutQuote);
CheckoutQuoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export interface ShippingSnapshot { quoteId: string; courierId: number; name: string; quotedAt: Date; expiresAt: Date; parcel: Parcel; pricingFingerprint: string }
