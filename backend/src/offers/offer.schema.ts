import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'offers', timestamps: true })
export class Offer {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, enum: ['percentage', 'flat'] }) discountType!: 'percentage' | 'flat';
  @Prop({ required: true, min: 0 }) discountValue!: number; // basis points or paise
  @Prop({ type: [String], default: [] }) productSlugs!: string[];
  @Prop({ type: [String], default: [] }) categories!: string[];
  @Prop() startsAt?: Date;
  @Prop() endsAt?: Date;
  @Prop({ default: 0 }) priority!: number;
  @Prop({ default: 0, min: 0 }) maximumSavingPaise!: number;
  @Prop({ default: false }) isStackable!: boolean;
  @Prop({ default: true }) isActive!: boolean;
}
export type OfferDocument = HydratedDocument<Offer>;
export const OfferSchema = SchemaFactory.createForClass(Offer);
