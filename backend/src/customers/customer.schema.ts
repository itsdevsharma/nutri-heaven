import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerAddress = { id: string; label: string; name: string; phone: string; street: string; city: string; state: string; pin: string; landmark?: string; isDefault: boolean };

@Schema({ collection: 'customers', timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: [Object], default: [] })
  addresses!: CustomerAddress[];

  @Prop({ type: [String], default: [] })
  wishlist!: string[];

  @Prop({ select: false })
  passwordResetHash?: string;

  @Prop({ select: false })
  passwordResetExpiresAt?: Date;

  @Prop({ default: true })
  isActive!: boolean;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
