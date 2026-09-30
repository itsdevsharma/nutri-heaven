import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
@Schema({ collection: 'coupon_redemptions', timestamps: true })
export class CouponRedemption {
  @Prop({ required: true, index: true }) couponCode!: string;
  @Prop({ required: true, lowercase: true, trim: true }) customerEmail!: string;
  @Prop({ required: true, unique: true }) orderId!: string;
  @Prop({ required: true, min: 0 }) discountPaise!: number;
}
export type CouponRedemptionDocument = HydratedDocument<CouponRedemption>;
export const CouponRedemptionSchema = SchemaFactory.createForClass(CouponRedemption);
CouponRedemptionSchema.index({ couponCode: 1, customerEmail: 1 });
