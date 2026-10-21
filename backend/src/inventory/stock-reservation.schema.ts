import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
@Schema({ collection: 'inventory_reservations', timestamps: true })
export class StockReservation {
  @Prop({ required: true, unique: true }) referenceId!: string;
  @Prop({ type: [Object], required: true }) lines!: Array<{ productSlug: string; packSize: string; quantity: number }>;
  @Prop({ enum: ['reserved', 'allocated', 'dispatched', 'released', 'closed'], required: true }) status!: string;
  @Prop() expiresAt?: Date;
  @Prop() releasedAt?: Date;
}
export type StockReservationDocument = HydratedDocument<StockReservation>;
export const StockReservationSchema = SchemaFactory.createForClass(StockReservation);
StockReservationSchema.index({ status: 1, expiresAt: 1 });
