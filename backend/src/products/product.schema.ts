import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Product catalogue entry.
 *
 * Money is integer paise (never floating rupees): `pricePaise: 27500` means
 * ₹275. `slug` is the stable public identifier (`almonds`, `cashews`, …) —
 * the storefront hardcodes these today, so the seed data reuses the same ids
 * and phase 3 can swap the hardcoded list for API data without remapping.
 */
@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ required: true, unique: true })
  slug!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  pricePaise!: number;

  @Prop({ required: true })
  image!: string;

  @Prop({ required: true })
  category!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);