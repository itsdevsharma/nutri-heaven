import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'coupons', timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true }) code!: string;
  @Prop({ required: true, enum: ['percentage', 'flat'] }) discountType!: 'percentage' | 'flat';
  @Prop({ required: true, min: 1 }) discountValue!: number;
  @Prop({ default: 0, min: 0 }) minimumOrderPaise!: number;
  @Prop({ default: 0, min: 0 }) maximumDiscountPaise!: number;
  @Prop({ type: [String], default: [] }) productSlugs!: string[];
  @Prop({ type: [String], default: [] }) categories!: string[];
  @Prop() startsAt?: Date;
  @Prop() endsAt?: Date;
  @Prop({ default: 0, min: 0 }) usageLimit!: number;
  @Prop({ default: 0, min: 0 }) usageCount!: number;
  @Prop({ default: true }) isActive!: boolean;
}
export type CouponDocument = HydratedDocument<Coupon>;
export const CouponSchema = SchemaFactory.createForClass(Coupon);
