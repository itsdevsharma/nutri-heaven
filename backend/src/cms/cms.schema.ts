import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'banners', timestamps: true })
export class Banner {
  @Prop({ required: true, trim: true }) heading!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) buttonText!: string;
  @Prop({ default: '' }) buttonLink!: string;
  @Prop({ required: true }) imageUrl!: string;
  @Prop({ default: 0, min: 0 }) displayOrder!: number;
  @Prop({ default: true }) isActive!: boolean;
}
export type BannerDocument = HydratedDocument<Banner>;
export const BannerSchema = SchemaFactory.createForClass(Banner);
BannerSchema.index({ isActive: 1, displayOrder: 1 });

@Schema({ collection: 'faqs', timestamps: true })
export class Faq {
  @Prop({ required: true, trim: true }) question!: string;
  @Prop({ required: true, trim: true }) answer!: string;
  @Prop({ default: 0, min: 0 }) displayOrder!: number;
  @Prop({ default: true }) isActive!: boolean;
}
export type FaqDocument = HydratedDocument<Faq>;
export const FaqSchema = SchemaFactory.createForClass(Faq);
FaqSchema.index({ isActive: 1, displayOrder: 1 });

@Schema({ collection: 'social_links', timestamps: true })
export class SocialLink {
  @Prop({ required: true, trim: true }) platform!: string;
  @Prop({ required: true, trim: true }) url!: string;
  @Prop({ default: 0, min: 0 }) displayOrder!: number;
  @Prop({ default: true }) isActive!: boolean;
}
export type SocialLinkDocument = HydratedDocument<SocialLink>;
export const SocialLinkSchema = SchemaFactory.createForClass(SocialLink);
SocialLinkSchema.index({ isActive: 1, displayOrder: 1 });
