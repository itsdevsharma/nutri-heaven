import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../products/product.schema';
import {
  InventoryMovement,
  InventoryMovementDocument,
  InventoryMovementType,
} from './inventory-movement.schema';

/** One flattened pack row in the inventory overview. */
export interface InventoryRow {
  key: string;
  productSlug: string;
  title: string;
  category: string;
  image: string;
  packSize: string;
  stockQuantity: number;
  lowStockLimit: number;
  pricePaise: number;
  state: 'healthy' | 'low' | 'out';
}

export interface InventoryOverview {
  items: InventoryRow[];
  total: number;
  limit: number;
  offset: number;
  summary: { skus: number; units: number; valuePaise: number; low: number; out: number };
}

export interface ProductInventoryRow {
  productSlug: string;
  title: string;
  category: string;
  image: string;
  packs: number;
  totalStock: number;
  lowCount: number;
  outCount: number;
  healthyCount: number;
  valuePaise: number;
  state: 'healthy' | 'low' | 'out';
}

export interface ProductInventoryOverview {
  items: ProductInventoryRow[];
  total: number;
  limit: number;
  offset: number;
  summary: InventoryOverview['summary'];
}

const stateFor = (stock: number, limit: number): InventoryRow['state'] =>
  stock <= 0 ? 'out' : stock <= limit ? 'low' : 'healthy';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(InventoryMovement.name)
    private readonly movements: Model<InventoryMovementDocument>,
  ) {}

  /**
   * Variant-level stock overview.
   *
   * `low` / `out` derive from each variant's own `stockQuantity` vs its
   * `lowStockLimit` — the same rule the storefront cart uses, so the console's
   * "Low Stock Products" list can never disagree with what customers see.
   * Rows arrive as `InventoryRow[]`, so the UI never re-derives the states.
   */
  async overview(filters: {
    view?: 'all' | 'low' | 'out';
    q?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<InventoryOverview> {
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const needle = filters.q?.trim().toLowerCase();

    const escaped = needle ? needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const match = escaped
      ? {
          $or: [
            { title: new RegExp(escaped, 'i') },
            { slug: new RegExp(escaped, 'i') },
            { category: new RegExp(escaped, 'i') },
          ],
        }
      : {};
    const docs = await this.products.find(match).sort({ title: 1, slug: 1 }).lean().exec();

    const rows: InventoryRow[] = [];
    for (const product of docs) {
      for (const variant of (product.variants ?? []) as Array<Record<string, unknown>>) {
        const stock = Number(variant.stockQuantity) || 0;
        const limitFor = Number(variant.lowStockLimit) || 0;
        const state = stateFor(stock, limitFor);
        if (filters.view === 'low' && state !== 'low') continue;
        if (filters.view === 'out' && state !== 'out') continue;
        rows.push({
          key: `${product.slug}:${String(variant.size ?? '')}`,
          productSlug: product.slug,
          title: product.title,
          category: product.category,
          image: product.image,
          packSize: String(variant.size ?? ''),
          stockQuantity: stock,
          lowStockLimit: limitFor,
          pricePaise: Number(variant.pricePaise) || 0,
          state,
        });
      }
    }

    const summary = rows.reduce(
      (acc, row) => {
        acc.skus += 1;
        acc.units += row.stockQuantity;
        acc.valuePaise += row.stockQuantity * row.pricePaise;
        if (row.state === 'low') acc.low += 1;
        if (row.state === 'out') acc.out += 1;
        return acc;
      },
      { skus: 0, units: 0, valuePaise: 0, low: 0, out: 0 },
    );

    return {
      items: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
      summary,
    };
  }

  /** Ledger history, newest first, filterable by product, pack and type. */
  async history(filters: {
    productSlug?: string;
    packSize?: string;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.productSlug) query.productSlug = filters.productSlug.trim().toLowerCase();
    if (filters.packSize) query.packSize = filters.packSize;
    if (filters.type) query.type = filters.type as InventoryMovementType;
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const [items, total] = await Promise.all([
      this.movements.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean().exec(),
      this.movements.countDocuments(query).exec(),
    ]);
    return { items, total, limit, offset };
  }

  /**
   * The only door to a stock change.
   *
   * Applies the variant's `stockQuantity` update and appends the ledger row in
   * one flow; if the ledger write fails, the balance is rolled back so the two
   * stores can never disagree. A unique `idempotencyKey` makes a retried or
   * double-submitted request a no-op that returns the original movement.
   */
  private async apply(input: {
    productSlug: string;
    packSize: string;
    delta: number;
    type: InventoryMovementType;
    reason: string;
    actor: string;
    referenceId?: string;
    idempotencyKey?: string;
    setLowStockLimit?: number;
  }) {
    const slug = input.productSlug.trim().toLowerCase();
    if (!input.reason.trim()) {
      throw new BadRequestException('A reason is required for every stock movement');
    }

    if (input.idempotencyKey) {
      const existing = await this.movements
        .findOne({ idempotencyKey: input.idempotencyKey })
        .lean()
        .exec();
      if (existing) return existing;
    }

    const product = await this.products.findOne({ slug }).exec();
    if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
    const variants = (product.variants ?? []) as Array<Record<string, unknown>>;
    const index = variants.findIndex((item) => item.size === input.packSize);
    if (index < 0) throw new NotFoundException(`Pack "${input.packSize}" not found on "${slug}"`);

    const current = Number(variants[index]?.stockQuantity) || 0;
    const balance = current + input.delta;
    if (balance < 0) {
      throw new BadRequestException(`Only ${current} available for ${slug} (${input.packSize})`);
    }
    if (variants[index]) {
      if (input.setLowStockLimit !== undefined) variants[index].lowStockLimit = input.setLowStockLimit;
      variants[index].stockQuantity = balance;
    }
    product.markModified('variants');
    await product.save();

    try {
      const created = await this.movements.create({
        productSlug: slug,
        packSize: input.packSize,
        quantity: input.delta,
        balance,
        type: input.type,
        reason: input.reason.trim(),
        actor: input.actor,
        referenceId: input.referenceId ?? '',
        idempotencyKey: input.idempotencyKey,
      });
      return created.toObject();
    } catch (error) {
      // Ledger write failed after the balance moved: compensate so the two
      // stores can never disagree, then surface the failure.
      if (variants[index]) variants[index].stockQuantity = current;
      product.markModified('variants');
      await product.save();
      throw error;
    }
  }

  /** Console adjustment: the UI sends the counted shelf balance, not a delta. */
  async adjust(dto: {
    productSlug: string;
    packSize: string;
    balance: number;
    setLowStockLimit?: number;
    reason: string;
    idempotencyKey: string;
    actor: string;
  }) {
    const slug = dto.productSlug.trim().toLowerCase();
    const product = await this.products.findOne({ slug }).lean().exec();
    if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
    const variant = (product.variants ?? []).find((item) => item.size === dto.packSize) as
      | { stockQuantity?: number }
      | undefined;
    if (!variant) throw new NotFoundException(`Pack "${dto.packSize}" not found on "${slug}"`);
    const current = Number(variant.stockQuantity) || 0;

    return this.apply({
      productSlug: slug,
      packSize: dto.packSize,
      delta: dto.balance - current,
      type: 'adjustment',
      reason: dto.reason,
      actor: dto.actor,
      idempotencyKey: dto.idempotencyKey,
      setLowStockLimit: dto.setLowStockLimit,
    });
  }

  /**
   * Order hook for step 7: validates every line BEFORE moving any stock, so a
   * line that cannot be fulfilled aborts the whole order. Idempotency keys are
   * derived from the order id, so a retried checkout never deducts twice.
   */
  async reserveForOrder(
    referenceId: string,
    lines: Array<{ productSlug: string; packSize: string; quantity: number }>,
    actor = 'system',
  ) {
    const grouped = new Map<string, { productSlug: string; packSize: string; quantity: number }>();
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new BadRequestException('Quantity must be a positive whole number');
      }
      const productSlug = line.productSlug.trim().toLowerCase();
      const key = `${productSlug}:${line.packSize}`;
      const current = grouped.get(key);
      grouped.set(key, current ? { ...current, quantity: current.quantity + line.quantity } : { productSlug, packSize: line.packSize, quantity: line.quantity });
    }
    const uniqueLines = [...grouped.values()];

    // Validate the aggregated request first. Without aggregation, two lines
    // for the same pack can each pass validation but the latter can fail after
    // the former has already decremented stock.
    for (const line of uniqueLines) {
      const slug = line.productSlug;
      const product = await this.products.findOne({ slug }).lean().exec();
      const variant = (product?.variants ?? []).find((item) => item.size === line.packSize) as
        | { stockQuantity?: number }
        | undefined;
      const available = Number(variant?.stockQuantity) || 0;
      if (!product || !variant) {
        throw new NotFoundException(`Pack "${line.packSize}" not found on "${slug}"`);
      }
      if (available < line.quantity) {
        throw new BadRequestException(`Only ${available} available for ${slug} (${line.packSize})`);
      }
    }

    const applied = [];
    for (const line of uniqueLines) {
      const slug = line.productSlug;
      applied.push(
        await this.apply({
          productSlug: slug,
          packSize: line.packSize,
          delta: -line.quantity,
          type: 'order-reserved',
          reason: `Reserved for order ${referenceId}`,
          actor,
          referenceId,
          idempotencyKey: `order:${referenceId}:${slug}:${line.packSize}`,
        }),
      );
    }
    return applied;
  }

  /** Compensating hook: cancellation or return restores exactly what moved out. */
  async releaseForOrder(
    referenceId: string,
    lines: Array<{ productSlug: string; packSize: string; quantity: number }>,
    kind: 'cancelled' | 'return' = 'cancelled',
    actor = 'system',
  ) {
    const applied = [];
    for (const line of lines) {
      const slug = line.productSlug.trim().toLowerCase();
      applied.push(
        await this.apply({
          productSlug: slug,
          packSize: line.packSize,
          delta: Math.abs(line.quantity),
          type: kind,
          reason:
            kind === 'return'
              ? `Returned from order ${referenceId}`
              : `Restored from cancelled order ${referenceId}`,
          actor,
          referenceId,
          idempotencyKey: `${kind}:${referenceId}:${slug}:${line.packSize}`,
        }),
      );
    }
    return applied;
  }

  /** Records that a prior reservation has become a completed sale. Stock was
   * already removed at reservation time, so this is a zero-delta ledger event. */
  async commitForOrder(
    referenceId: string,
    lines: Array<{ productSlug: string; packSize: string; quantity: number }>,
    actor = 'system',
  ) {
    const applied = [];
    for (const line of lines) {
      const product = await this.products.findOne({ slug: line.productSlug.trim().toLowerCase() }).lean().exec();
      const variant = (product?.variants ?? []).find((item) => item.size === line.packSize) as { stockQuantity?: number } | undefined;
      if (!product || !variant) throw new NotFoundException(`Pack "${line.packSize}" not found on "${line.productSlug}"`);
      applied.push(await this.apply({
        productSlug: line.productSlug,
        packSize: line.packSize,
        delta: 0,
        type: 'order-committed',
        reason: `Committed order ${referenceId}`,
        actor,
        referenceId,
        idempotencyKey: `commit:${referenceId}:${line.productSlug}:${line.packSize}`,
      }));
    }
    return applied;
  }
}
