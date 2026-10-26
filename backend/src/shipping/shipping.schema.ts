import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema({ timestamps: true, collection: 'shipping_configuration' })
export class ShippingConfiguration {
  @Prop({ unique: true, default: 'shiprocket' }) key!: string;
  @Prop({ required: true }) pickupLocation!: string;
  @Prop({ required: true }) weight!: number;
  @Prop({ required: true }) length!: number;
  @Prop({ required: true }) breadth!: number;
  @Prop({ required: true }) height!: number;
}
export const ShippingConfigurationSchema = SchemaFactory.createForClass(ShippingConfiguration);
@Schema({ timestamps: true, collection: 'shiprocket_shipments' })
export class ShiprocketShipment {
  @Prop({ required: true, unique: true }) orderId!: string;
  @Prop() providerOrderId?: number;
  @Prop() shipmentId?: number;
  @Prop() awb?: string;
  @Prop() courier?: string;
  @Prop() labelUrl?: string;
  @Prop() manifestUrl?: string;
  @Prop() providerCancelled?: boolean;
  @Prop() pickupScheduled?: boolean;
  @Prop() lastOperation?: string;
  @Prop() error?: string;
  @Prop({ default: () => new Date() }) nextTrackAt!: Date;
  @Prop() lockToken?: string;
  @Prop() lockedUntil?: Date;
  @Prop({ type: Object }) parcel?: { pickupLocation: string; weight: number; length: number; breadth: number; height: number };
  @Prop({ type: Object }) tracking?: { status: string; updatedAt: string; activities: Array<{ date: string; activity: string; location: string }> };
}
export const ShiprocketShipmentSchema = SchemaFactory.createForClass(ShiprocketShipment);

ShiprocketShipmentSchema.index({ nextTrackAt: 1 });
