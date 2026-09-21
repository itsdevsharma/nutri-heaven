import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'categories', timestamps: true })
export class Category {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) slug!: string;
  @Prop({ type: Types.ObjectId, ref: Category.name, default: null }) parentId!: Types.ObjectId | null;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) image!: string;
  @Prop({ default: 0 }) position!: number;
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ default: '' }) seoTitle!: string;
  @Prop({ default: '' }) seoDescription!: string;
}
export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ parentId: 1, position: 1 });
