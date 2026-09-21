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

  @Prop({ unique: true, sparse: true, uppercase: true, trim: true })
  sku?: string;

  @Prop({ trim: true })
  barcode?: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ default: '' })
  shortDescription!: string;

  @Prop({ default: '' })
  fullDescription!: string;

  @Prop({ required: true, min: 0 })
  pricePaise!: number;

  @Prop({ min: 0 })
  mrpPaise?: number;

  @Prop({ min: 0, max: 10000, default: 0 })
  discountBasisPoints!: number;

  @Prop({ required: true })
  image!: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ required: true })
  category!: string;

  @Prop() subCategory?: string;

  @Prop({ default: '' })
  brand!: string;

  /** Editable sellable packs. `pricePaise` is the price for that exact pack. */
  @Prop({
    type: [
      {
        size: { type: String, required: true },
        pricePaise: { type: Number, required: true, min: 0 },
        mrpPaise: { type: Number, min: 0 },
        sku: { type: String, trim: true, uppercase: true },
        barcode: { type: String, trim: true },
        stockQuantity: { type: Number, required: true, min: 0, default: 0 },
        lowStockLimit: { type: Number, required: true, min: 0, default: 0 },
        weightGrams: { type: Number, min: 0 },
        taxBasisPoints: { type: Number, min: 0, max: 10000, default: 0 },
        images: { type: [String], default: [] },
        isActive: { type: Boolean, default: true },
      },
    ],
    default: [],
  })
  variants!: { size: string; pricePaise: number; isActive: boolean }[];

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ enum: ['draft', 'active', 'inactive', 'archived'], default: 'draft' })
  status!: 'draft' | 'active' | 'inactive' | 'archived';

  @Prop({ default: false })
  isFeatured!: boolean;

  @Prop({ default: false })
  isBestseller!: boolean;

  @Prop({ default: false })
  isNewArrival!: boolean;

  @Prop({ default: '' })
  seoTitle!: string;

  @Prop({ default: '' })
  seoDescription!: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
