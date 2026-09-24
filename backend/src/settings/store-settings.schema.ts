import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Singleton, admin-owned storefront configuration. */
@Schema({ collection: 'store_settings', timestamps: true })
export class StoreSettings {
  @Prop({ required: true, unique: true, default: 'primary' }) key!: string;
  @Prop({ type: {
    legalName: { type: String, default: 'NUTRI HEAVEN', trim: true },
    supportEmail: { type: String, default: 'nutriheavenhsr@gmail.com', trim: true, lowercase: true },
    supportPhone: { type: String, default: '90172-25722', trim: true },
    whatsappNumber: { type: String, default: '90172-25722', trim: true },
    address: { type: String, default: '', trim: true },
    businessHours: { type: String, default: '', trim: true },
    content: { type: {
      shippingPolicy: { type: String, default: '' }, returnPolicy: { type: String, default: '' }, privacyPolicy: { type: String, default: '' }, terms: { type: String, default: '' }, about: { type: String, default: '' }, contact: { type: String, default: '' }, faq: { type: String, default: '' },
    }, default: {} },
  }, default: {} })
  value!: { legalName?: string; supportEmail?: string; supportPhone?: string; whatsappNumber?: string; address?: string; businessHours?: string; content?: Record<string, string> };
}
export type StoreSettingsDocument = HydratedDocument<StoreSettings>;
export const StoreSettingsSchema = SchemaFactory.createForClass(StoreSettings);
