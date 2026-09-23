import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Singleton, admin-owned storefront configuration. */
@Schema({ collection: 'store_settings', timestamps: true })
export class StoreSettings {
  @Prop({ required: true, unique: true, default: 'primary' }) key!: string;
  @Prop({ type: Object, default: { legalName: 'NUTRI HEAVEN', supportEmail: 'hello@nutriheaven.in', supportPhone: '', address: '', gstin: '', invoicePrefix: 'NH', invoiceFooter: '', freeShippingThresholdPaise: 99900, standardShippingFeePaise: 7900, serviceablePins: [], homepage: {}, footer: {} } })
  value!: Record<string, unknown>;
}
export type StoreSettingsDocument = HydratedDocument<StoreSettings>;
export const StoreSettingsSchema = SchemaFactory.createForClass(StoreSettings);
