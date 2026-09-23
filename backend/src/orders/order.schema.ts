import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrderStatus = 'pending' | 'confirmed' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'return_requested' | 'returned' | 'refunded';
export type PaymentMethod = 'cod' | 'razorpay';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/**
 * A customer order placed through the storefront.
 *
 * Stock lives on `Product.variants[].stockQuantity` and is changed through
 * `InventoryMovement` rows: every order placement reserves, every payment
 * commits, every cancellation restores. This schema is the customer-facing
 * record — amounts are integer paise.
 */
@Schema({ collection: 'orders', timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, trim: true })
  id!: string; // `NHxxxxxx` for display / `order:<id>` for idempotency

  @Prop({ required: true, lowercase: true, trim: true })
  cartId!: string;

  @Prop({ required: true, trim: true })
  customerName!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  customerEmail!: string;

  @Prop({ required: true, trim: true })
  customerPhone!: string;

  @Prop({ required: true, type: Object })
  deliveryAddress!: {
    street: string;
    city: string;
    pin: string;
  };

  @Prop({ required: true, type: [Object] })
  lines!: Array<{
    productSlug: string;
    packSize: string;
    productName: string;
    image: string;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }>;

  @Prop({ required: true, min: 0 })
  subtotalPaise!: number;

  @Prop({ required: true, min: 0 })
  shippingPaise!: number;

  @Prop({ required: true, min: 0 })
  totalPaise!: number;

  @Prop({ required: true, enum: ['cod', 'razorpay'] })
  paymentMethod!: PaymentMethod;

  @Prop({ required: true, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' })
  paymentStatus!: PaymentStatus;

  @Prop({ trim: true })
  razorpayOrderId?: string;

  @Prop({ trim: true })
  razorpayPaymentId?: string;

  @Prop({ required: true, enum: ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned', 'refunded'], default: 'pending' })
  status!: OrderStatus;

  @Prop({ trim: true, default: '' })
  trackingNumber?: string;

  @Prop({ trim: true, default: '' })
  trackingUrl?: string;

  @Prop({ type: [Object], default: [] })
  statusHistory!: Array<{ status: OrderStatus; at: Date; actor: string; note?: string }>;

  @Prop({ trim: true, default: '' })
  refundReference?: string;

  @Prop({ trim: true, default: '' })
  cancellationReason?: string;

  @Prop({ trim: true, default: '' })
  idempotencyKey!: string;

  @Prop({ default: false })
  stockReserved!: boolean;

  @Prop({ default: false })
  stockCommitted!: boolean;
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ cartId: 1, createdAt: -1 });
OrderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
OrderSchema.index({ customerEmail: 1, createdAt: -1 });
