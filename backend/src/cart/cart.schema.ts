import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class CartItem {
  @Prop({ required: true }) productId!: string;
  @Prop({ required: true }) packSize!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ required: true, min: 0 }) unitPricePaise!: number;
  @Prop({ required: true }) productName!: string;
  @Prop() image?: string;
  @Prop({ min: 0 }) stock?: number;
  @Prop({ default: false }) savedForLater!: boolean;
}
export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ collection: 'carts', timestamps: true })
export class Cart {
  @Prop({ required: true, unique: true, index: true }) cartId!: string;
  @Prop({ type: [CartItemSchema], default: [] }) items!: CartItem[];
  @Prop({ default: '' }) note!: string;
  @Prop() couponCode?: string;
}
export type CartDocument = HydratedDocument<Cart>;
export const CartSchema = SchemaFactory.createForClass(Cart);
