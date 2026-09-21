import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  CATALOGUE_MANAGER = 'catalogue_manager',
  INVENTORY_MANAGER = 'inventory_manager',
  MARKETING_MANAGER = 'marketing_manager',
  SUPPORT = 'support',
}

@Schema({ collection: 'admins', timestamps: true })
export class Admin {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ enum: AdminRole, type: String, default: AdminRole.SUPER_ADMIN })
  role!: AdminRole;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop() refreshTokenHash?: string;
}

export type AdminDocument = HydratedDocument<Admin>;
export const AdminSchema = SchemaFactory.createForClass(Admin);
