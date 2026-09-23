import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Immutable inventory ledger, per ADMIN_COMMERCE_PLAN.md step 3.
 *
 * Stock lives on `Product.variants[].stockQuantity`, but it may ONLY move
 * through one of these rows: every change records the signed `quantity`
 * delta, the resulting `balance` afterwards, the `type` of change, who made
 * it (`actor`), why (`reason`), and an `idempotencyKey` so a retried request
 * (order placement, double-clicked adjustment) can never apply twice.
 *
 * Rows are append-only: the service creates them and reads them, and no
 * controller exposes an update/delete route for them.
 */
export const INVENTORY_MOVEMENT_TYPES = [
  'opening',
  'adjustment',
  'order-reserved',
  'order-committed',
  'return',
  'cancelled',
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

@Schema({ collection: 'inventory_movements', timestamps: true })
export class InventoryMovement {
  /** Product slug — the catalogue's stable id, shared with the storefront. */
  @Prop({ required: true, trim: true, lowercase: true })
  productSlug!: string;

  /** Pack label exactly as stored on the variant (`250g`, `1kg`, …). */
  @Prop({ required: true, trim: true })
  packSize!: string;

  /**
   * Signed delta: `+50` restocks, `-2` sells/reserves. The variant balance is
   * adjusted by this exact amount inside the same atomic update.
   */
  @Prop({ required: true })
  quantity!: number;

  /** Variant balance AFTER this movement applied. Never negative. */
  @Prop({ required: true, min: 0 })
  balance!: number;

  @Prop({ enum: INVENTORY_MOVEMENT_TYPES, type: String, required: true })
  type!: InventoryMovementType;

  /** Human reason shown in the history timeline, e.g. "Damaged in warehouse". */
  @Prop({ default: '' })
  reason!: string;

  /** Admin id/email that caused the movement, or `system` for order flows. */
  @Prop({ required: true, default: 'system' })
  actor!: string;

  /** Order/cart reference for `order-reserved`, `order-committed`, `cancelled`. */
  @Prop({ default: '' })
  referenceId!: string;

  /**
   * Dedupe key: order lines use `order:<id>:<slug>:<size>`, adjustments use a
   * client-generated UUID. Unique + sparse so legacy rows without a key stay valid.
   */
  @Prop({ unique: true, sparse: true })
  idempotencyKey?: string;
}

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;
export const InventoryMovementSchema = SchemaFactory.createForClass(InventoryMovement);
InventoryMovementSchema.index({ productSlug: 1, packSize: 1, createdAt: -1 });
InventoryMovementSchema.index({ productSlug: 1, createdAt: -1 });
InventoryMovementSchema.index({ type: 1, createdAt: -1 });
InventoryMovementSchema.index({ referenceId: 1 }, { sparse: true });
