import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { orderTotalForPaise, shippingFeeForPaise } from '../common/pricing';
import { FilterQuery, Model } from 'mongoose';
import { QuoteRequest } from './dto/quote.request';
import { Product, ProductDocument } from './product.schema';
import { Category, CategoryDocument } from '../categories/category.schema';
import { BulkProductAction, BulkProductActionDto } from './dto/bulk-product-action.dto';
import { AuditService } from '../audit/audit.service';
import { OffersService } from '../offers/offers.service';
type AuditActor = { sub: string; email: string } | undefined;

export interface QuoteLineResult {
  slug: string;
  packSize: string;
  title: string;
  category: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export interface QuoteResult {
  lines: QuoteLineResult[];
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
}

/** One page of the admin catalogue, together with the total for the pager. */
export interface AdminProductListResult {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class ProductsService {
  private readonly csvPreviews = new Map<string, { csv: string; expiresAt: number; revisions: Record<string, string | null> }>();
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categories: Model<CategoryDocument>,
    private readonly audit: AuditService,
    private readonly offers: OffersService,
  ) {}

  private async validateCommerce(input: Partial<Product>, exceptSlug?: string) {
    if (input.pricePaise !== undefined && (!Number.isInteger(input.pricePaise) || input.pricePaise <= 0)) throw new BadRequestException('Selling price must be a positive integer amount in paise');
    if (input.mrpPaise !== undefined && input.pricePaise !== undefined && input.mrpPaise < input.pricePaise) throw new BadRequestException('MRP cannot be below selling price');
    const variants = (input.variants ?? []) as Array<Record<string, unknown>>;
    const sizes = new Set<string>(); const skus = new Set<string>();
    for (const variant of variants) { const size=String(variant.size ?? '').trim(); if(!size || sizes.has(size)) throw new BadRequestException('Every variant must have a unique pack size'); sizes.add(size); const price=Number(variant.pricePaise); const mrp=variant.mrpPaise===undefined?undefined:Number(variant.mrpPaise); if(!Number.isInteger(price)||price<=0) throw new BadRequestException(`Variant ${size} needs a positive selling price`); if(mrp!==undefined && (!Number.isInteger(mrp)||mrp<price)) throw new BadRequestException(`Variant ${size} MRP cannot be below selling price`); const sku=String(variant.sku ?? '').trim().toUpperCase(); if(sku) { if(skus.has(sku)) throw new BadRequestException('Variant SKUs must be unique'); skus.add(sku); const duplicate=await this.products.exists({ slug: {$ne: exceptSlug}, 'variants.sku': sku }); if(duplicate) throw new ConflictException(`Variant SKU ${sku} already exists`); } }
    if (input.category) { const parent=await this.categories.findOne({name:input.category,isActive:true}).lean().exec(); if(!parent) throw new BadRequestException('Select an active category'); if(input.subCategory) { const child=await this.categories.findOne({name:input.subCategory,parentId:parent._id,isActive:true}).lean().exec(); if(!child) throw new BadRequestException('Select an active sub-category belonging to the selected category'); } }
  }

  private normalizeImages(product: Product): Product {
    const images = (product.images ?? []).map((image: unknown, position: number) =>
      typeof image === 'string' ? { url: image, alt: product.title, position } : image,
    );
    return { ...product, images } as Product;
  }

  private assertPublishable(product: Partial<Product>) {
    if (!product.image) throw new BadRequestException('A primary image is required before publishing');
    const active = ((product.variants ?? []) as Array<Record<string, unknown>>).filter((v) => v.isActive !== false);
    if (!active.some((v) => Number(v.pricePaise) > 0)) throw new BadRequestException('At least one active variant with a price is required before publishing');
    if (!active.some((v) => Number(v.stockQuantity) > 0)) throw new BadRequestException('At least one active variant must be in stock before publishing');
  }

  findAll(limit = 50, offset = 0): Promise<Product[]> {
    return this.products
      .find({ isActive: true, status: 'active' })
      .sort({ slug: 1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec().then((items) => items.map((item) => this.normalizeImages(item)));
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.products
      .findOne({ slug, isActive: true, status: 'active' })
      .lean()
      .exec();
    if (!product) {
      throw new NotFoundException(`No product found for slug "${slug}"`);
    }
    return this.normalizeImages(product);
  }

  /**
   * Admin catalogue read: unlike `findAll` this is the unfiltered view —
   * drafts, inactive and archived products included — so the admin console can
   * manage the whole lifecycle instead of only what the storefront sells.
   *
   * The search needle is escaped before it reaches `RegExp`, so a user typing
   * `.*` searches for a literal `.*` rather than turning the query into a scan.
   * `sku` is sparse; a missing SKU simply does not match.
   */
  async adminList(
    filters: {
      status?: Product['status'];
      q?: string; slugs?: string; category?: string; stock?: 'healthy' | 'low' | 'out'; featured?: string; bestseller?: string; newArrival?: string; minPricePaise?: number; maxPricePaise?: number;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AdminProductListResult> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const query: FilterQuery<ProductDocument> = {};
    if (filters.status) query.status = filters.status;
    if (filters.slugs) query.slug = { $in: filters.slugs.split(',').map((slug) => slug.trim().toLowerCase()).filter(Boolean) };
    if (filters.category) query.category = filters.category;
    if (filters.featured !== undefined) query.isFeatured = filters.featured === 'true';
    if (filters.bestseller !== undefined) query.isBestseller = filters.bestseller === 'true';
    if (filters.newArrival !== undefined) query.isNewArrival = filters.newArrival === 'true';
    if (filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined) query.pricePaise = { ...(filters.minPricePaise !== undefined ? { $gte: filters.minPricePaise } : {}), ...(filters.maxPricePaise !== undefined ? { $lte: filters.maxPricePaise } : {}) };
    if (filters.stock === 'out') query['variants.stockQuantity'] = 0;
    if (filters.stock === 'low') query.$expr = { $gt: [{ $size: { $filter: { input: '$variants', as: 'variant', cond: { $and: [{ $gt: ['$$variant.stockQuantity', 0] }, { $lte: ['$$variant.stockQuantity', '$$variant.lowStockLimit'] }] } } } }, 0] };

    const needle = filters.q?.trim();
    if (needle) {
      const pattern = new RegExp(
        needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      query.$or = [
        { title: pattern },
        { slug: pattern },
        { sku: pattern },
        { category: pattern },
      ];
    }

    const [items, total] = await Promise.all([
      this.products
        .find(query)
        .sort({ updatedAt: -1, slug: 1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.products.countDocuments(query).exec(),
    ]);
    return { items: items.map((item) => this.normalizeImages(item)), total, limit, offset };
  }

  /**
   * Admin single read: resolves drafts and inactive products too, which is why
   * `findBySlug` (public, `isActive: true` only) cannot be reused here.
   */
  async adminFindBySlug(slug: string): Promise<Product> {
    const product = await this.products
      .findOne({ slug: slug.trim().toLowerCase() })
      .lean()
      .exec();
    if (!product) {
      throw new NotFoundException(`No product found for slug "${slug}"`);
    }
    return this.normalizeImages(product);
  }

  /**
   * Admin catalogue save. Authentication and role checks live on the controller
   * (`AdminAuthGuard` + `RolesGuard`); this keeps the editable catalogue
   * contract in one place.
   */
  async adminUpdate(slug: string, changes: Partial<Product>, actor?: AuditActor): Promise<Product> {
    if (changes.variants) {
      const current = await this.products.findOne({ slug }).lean().exec();
      if (!current) throw new NotFoundException(`No product found for slug "${slug}"`);
      const existing = new Map(((current.variants ?? []) as Array<{ size: string; stockQuantity?: number }>).map((variant) => [variant.size, variant.stockQuantity]));
      const submittedSizes = new Set((changes.variants as Array<Record<string, unknown>>).map((variant) => String(variant.size ?? '')));
      for (const size of existing.keys()) {
        if (!submittedSizes.has(size)) throw new BadRequestException('Existing pack sizes cannot be removed through product editing; deactivate the pack after its stock is adjusted to zero');
      }
      for (const variant of changes.variants as Array<Record<string, unknown>>) {
        const stored = existing.get(String(variant.size ?? ''));
        if (stored !== undefined && Number(variant.stockQuantity) !== Number(stored)) {
          throw new BadRequestException('Variant stock can only be changed through the inventory adjustment API');
        }
        if (stored === undefined && Number(variant.stockQuantity) !== 0) {
          throw new BadRequestException('New pack sizes must start at zero stock and be filled through the inventory adjustment API');
        }
      }
    }
    // Lifecycle state is authoritative. Callers cannot create a contradictory
    // `active` product that carries `isActive: false` (or vice versa).
    const normalizedChanges: Partial<Product> = changes.status ? { ...changes, isActive: changes.status === 'active' } : changes;
    const current = await this.products.findOne({ slug }).lean().exec();
    if (!current) throw new NotFoundException(`No product found for slug "${slug}"`);
    const merged = { ...current, ...normalizedChanges } as Partial<Product>;
    if (merged.status === 'active') this.assertPublishable(merged);
    await this.validateCommerce(changes, slug);
    const product = await this.products
      .findOneAndUpdate({ slug }, { $set: normalizedChanges }, { new: true, runValidators: true })
      .lean()
      .exec();
    if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
    await this.audit.record({ action: 'product.updated', entityType: 'product', entityId: String(product._id), actorId: actor?.sub, actorEmail: actor?.email, correlationId: crypto.randomUUID(), before: current as unknown as Record<string, unknown>, after: product as unknown as Record<string, unknown> });
    return this.normalizeImages(product);
  }

  async adminCreate(input: Partial<Product>, actor?: AuditActor): Promise<Product> {
    const slug = input.slug?.trim().toLowerCase();
    if (!slug || !input.title || !input.description || !input.image || !input.category || input.pricePaise === undefined) {
      throw new ConflictException('slug, title, description, image, category and pricePaise are required');
    }
    if (input.status === 'active') this.assertPublishable(input);
    await this.validateCommerce(input);
    try { const status = input.status ?? 'draft'; const created = await this.products.create({ ...input, slug, status, isActive: status === 'active' }); await this.audit.record({ action: 'product.created', entityType: 'product', entityId: String(created._id), actorId: actor?.sub, actorEmail: actor?.email, correlationId: crypto.randomUUID(), after: created.toObject() as unknown as Record<string, unknown> }); return created; }
    catch (error) { if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('Product slug or SKU already exists'); throw error; }
  }

  async adminDuplicate(slug: string): Promise<Product> {
    const original = await this.products.findOne({ slug }).lean().exec();
    if (!original) throw new NotFoundException(`No product found for slug "${slug}"`);
    const copySlug = `${original.slug}-copy-${Date.now().toString(36)}`;
    return this.products.create({
      slug: copySlug, title: `${original.title} (copy)`, description: original.description,
      shortDescription: original.shortDescription, fullDescription: original.fullDescription,
      pricePaise: original.pricePaise, mrpPaise: original.mrpPaise, image: original.image,
      images: original.images, category: original.category, subCategory: original.subCategory,
      brand: original.brand, tags: original.tags, discountBasisPoints: original.discountBasisPoints,
      seoTitle: original.seoTitle, seoDescription: original.seoDescription, status: 'draft', isActive: false,
      variants: original.variants.map(variant => ({ ...variant, sku: undefined })),
    });
  }

  async adminDeactivate(slug: string, actor?: AuditActor): Promise<Product> {
    const product = await this.products.findOneAndUpdate({ slug }, { $set: { isActive: false, status: 'inactive' } }, { new: true }).lean().exec();
    if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
    await this.audit.record({ action: 'product.deactivated', entityType: 'product', entityId: String(product._id), actorId: actor?.sub, actorEmail: actor?.email, correlationId: crypto.randomUUID(), after: product as unknown as Record<string, unknown> });
    return product;
  }

  async adminSetStatus(slug: string, status: Product['status'], actor?: AuditActor): Promise<Product> {
    const current = await this.products.findOne({ slug }).lean().exec();
    if (!current) throw new NotFoundException(`No product found for slug "${slug}"`);
    if (status === 'active') this.assertPublishable(current);
    const product = await this.products.findOneAndUpdate({ slug }, { $set: { status, isActive: status === 'active' } }, { new: true }).lean().exec();
    await this.audit.record({ action: `product.${status}`, entityType: 'product', entityId: String(product!._id), actorId: actor?.sub, actorEmail: actor?.email, correlationId: crypto.randomUUID(), before: current as unknown as Record<string, unknown>, after: product as unknown as Record<string, unknown> });
    return this.normalizeImages(product!);
  }

  async adminRecover(slug: string, targetStatus: 'draft' | 'inactive', actor?: AuditActor): Promise<Product> {
    if (!['draft', 'inactive'].includes(targetStatus)) throw new BadRequestException('Recovery target must be draft or inactive');
    const product = await this.products.findOneAndUpdate({ slug, status: 'archived' }, { $set: { status: targetStatus, isActive: false } }, { new: true }).lean().exec();
    if (!product) throw new NotFoundException('Product not found or not archived');
    await this.audit.record({ action: 'product.recovered', entityType: 'product', entityId: String(product._id), actorId: actor?.sub, actorEmail: actor?.email, correlationId: crypto.randomUUID(), after: product as unknown as Record<string, unknown> });
    return this.normalizeImages(product);
  }

  async bulkAction(dto: BulkProductActionDto, actor?: AuditActor) {
    const slugs = [...new Set(dto.slugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))];
    if (dto.action === BulkProductAction.changeCategory) {
      const category = dto.categoryId ? await this.categories.findById(dto.categoryId).lean().exec() : null;
      if (!category?.isActive) throw new BadRequestException('Select an active category');
      return this.products.updateMany({ slug: { $in: slugs } }, { $set: { category: category.name, subCategory: undefined } }).exec();
    }
    if (dto.action === BulkProductAction.addTags) return this.products.updateMany({ slug: { $in: slugs } }, { $addToSet: { tags: { $each: (dto.tags ?? []).map((tag) => tag.trim()).filter(Boolean) } } }).exec();
    const status = dto.action === BulkProductAction.activate ? 'active' : dto.action === BulkProductAction.deactivate ? 'inactive' : 'archived';
    if (status === 'active') {
      const candidates = await this.products.find({ slug: { $in: slugs } }).lean().exec(); candidates.forEach((product) => this.assertPublishable(product));
    }
    const result = await this.products.updateMany({ slug: { $in: slugs } }, { $set: { status, isActive: status === 'active' } }).exec();
    await this.audit.record({ action: `product.bulk.${dto.action}`, entityType: 'product', entityId: slugs.join(','), actorId: actor?.sub, actorEmail: actor?.email, correlationId: crypto.randomUUID(), after: { slugs, action: dto.action } });
    return result;
  }

  async exportCsv(filters: Parameters<ProductsService['adminList']>[0]) {
    const { items } = await this.adminList({ ...filters, limit: 500 });
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return ['slug,title,description,category,subCategory,pricePaise,mrpPaise,status,tags,image', ...items.map((p) => [p.slug,p.title,p.description,p.category,p.subCategory,p.pricePaise,p.mrpPaise,p.status,(p.tags ?? []).join('|'),p.image].map(quote).join(','))].join('\n');
  }

  async importCsv(csv: string, dryRun = false) {
    const rows = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (rows.length < 2) throw new BadRequestException('CSV must include a header and at least one data row');
    const parse = (line: string) => { const values: string[] = []; let value = '', quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { value += char; index += 1; } else quoted = !quoted; } else if (char === ',' && !quoted) { values.push(value); value = ''; } else value += char; } values.push(value); return values; };
    const header = parse(rows[0] ?? ''); const result = { created: 0, updated: 0, errors: [] as Array<{ row: number; message: string }> }; const revisions: Record<string, string | null> = {};
    for (let index = 1; index < rows.length; index += 1) { try { const fields = Object.fromEntries(header.map((key, position) => [key, parse(rows[index] ?? '')[position] ?? ''])) as Record<string, string>; const slug = fields.slug?.trim().toLowerCase(); if (!slug || !fields.title || !fields.description || !fields.category || !Number(fields.pricePaise)) throw new Error('slug, title, description, category and pricePaise are required'); const existing = await this.products.findOne({ slug }).select('updatedAt variants').lean().exec(); const revision = (existing as unknown as { updatedAt?: Date } | null)?.updatedAt; revisions[slug] = revision ? new Date(revision).toISOString() : null; if (existing) result.updated += 1; else result.created += 1; if (existing && (existing.variants?.length ?? 0) > 1) throw new Error('Variant products must be updated individually; CSV cannot safely replace inventory-controlled packs'); if (!dryRun) { const input: Partial<Product> = { slug, title: fields.title, description: fields.description, category: fields.category, subCategory: fields.subCategory || undefined, image: fields.image || 'placeholder.jpg', pricePaise: Number(fields.pricePaise), mrpPaise: fields.mrpPaise ? Number(fields.mrpPaise) : undefined, status: (fields.status || 'draft') as Product['status'], tags: (fields.tags || '').split('|').filter(Boolean), variants: [{ size: 'Default', pricePaise: Number(fields.pricePaise), stockQuantity: 0, lowStockLimit: 0, isActive: true }] as unknown as Product['variants'] }; if (existing) await this.adminUpdate(slug, input); else await this.adminCreate(input); } } catch (error) { result.errors.push({ row: index + 1, message: error instanceof Error ? error.message : 'Invalid row' }); } }
    if (!dryRun) return result;
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36); this.csvPreviews.set(token, { csv, revisions, expiresAt: Date.now() + 10 * 60_000 });
    return { ...result, token };
  }

  async confirmCsvImport(token: string) { const preview = this.csvPreviews.get(token); if (!preview || preview.expiresAt < Date.now()) throw new BadRequestException('Import preview expired. Upload the CSV again.'); for (const [slug, revision] of Object.entries(preview.revisions)) { const current = await this.products.findOne({ slug }).select('updatedAt').lean().exec(); const updatedAt = (current as unknown as { updatedAt?: Date } | null)?.updatedAt; const currentRevision = updatedAt ? new Date(updatedAt).toISOString() : null; if (currentRevision !== revision) throw new BadRequestException(`Product "${slug}" changed after the preview. Upload the CSV again.`); } this.csvPreviews.delete(token); return this.importCsv(preview.csv); }

  /**
   * Price a cart from database prices. The client sends slugs + quantities;
   * the shipping rule comes from `src/common/pricing`, the backend's single
   * authoritative definition.
   */
  async quote(dto: QuoteRequest): Promise<QuoteResult> {
    const slugs = [...new Set(dto.lines.map((line) => line.slug))];
    const found = await this.products
      .find({ slug: { $in: slugs }, isActive: true, status: 'active' })
      .lean()
      .exec();
    const bySlug = new Map(found.map((product) => [product.slug, product]));

    const lines: QuoteLineResult[] = await Promise.all(dto.lines.map(async (line) => {
      const product = bySlug.get(line.slug);
      if (!product) {
        throw new NotFoundException(`No product found for slug "${line.slug}"`);
      }
      const packSize = line.packSize ?? '250g';
      const variant = product.variants.find((item) => item.size === packSize && item.isActive);
      // Legacy catalogue rows created before variants existed remain quoteable
      // at their base price while all new cart/order lines require a variant.
      if (!variant && product.variants.length) {
        throw new NotFoundException(`No active pack "${packSize}" for "${line.slug}"`);
      }
      const unitPricePaise = await this.offers.priceFor(product, variant?.pricePaise ?? product.pricePaise);
      return {
        slug: product.slug,
        packSize: variant?.size ?? packSize,
        title: product.title,
        category: product.category,
        quantity: line.quantity,
        unitPricePaise,
        lineTotalPaise: unitPricePaise * line.quantity,
      };
    }));

    const subtotalPaise = lines.reduce(
      (sum, line) => sum + line.lineTotalPaise,
      0,
    );
    const shippingPaise = shippingFeeForPaise(subtotalPaise);
    return {
      lines,
      subtotalPaise,
      shippingPaise,
      totalPaise: orderTotalForPaise(subtotalPaise),
    };
  }
}
