import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { orderTotalForPaise, shippingFeeForPaise } from '../common/pricing';
import { FilterQuery, Model } from 'mongoose';
import { QuoteRequest } from './dto/quote.request';
import { Product, ProductDocument } from './product.schema';
import { Category, CategoryDocument } from '../categories/category.schema';

export interface QuoteLineResult {
  slug: string;
  packSize: string;
  title: string;
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
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categories: Model<CategoryDocument>,
  ) {}

  private async validateCommerce(input: Partial<Product>, exceptSlug?: string) {
    if (input.pricePaise !== undefined && (!Number.isInteger(input.pricePaise) || input.pricePaise <= 0)) throw new BadRequestException('Selling price must be a positive integer amount in paise');
    if (input.mrpPaise !== undefined && input.pricePaise !== undefined && input.mrpPaise < input.pricePaise) throw new BadRequestException('MRP cannot be below selling price');
    const variants = (input.variants ?? []) as Array<Record<string, unknown>>;
    const sizes = new Set<string>(); const skus = new Set<string>();
    for (const variant of variants) { const size=String(variant.size ?? '').trim(); if(!size || sizes.has(size)) throw new BadRequestException('Every variant must have a unique pack size'); sizes.add(size); const price=Number(variant.pricePaise); const mrp=variant.mrpPaise===undefined?undefined:Number(variant.mrpPaise); if(!Number.isInteger(price)||price<=0) throw new BadRequestException(`Variant ${size} needs a positive selling price`); if(mrp!==undefined && (!Number.isInteger(mrp)||mrp<price)) throw new BadRequestException(`Variant ${size} MRP cannot be below selling price`); const sku=String(variant.sku ?? '').trim().toUpperCase(); if(sku) { if(skus.has(sku)) throw new BadRequestException('Variant SKUs must be unique'); skus.add(sku); const duplicate=await this.products.exists({ slug: {$ne: exceptSlug}, 'variants.sku': sku }); if(duplicate) throw new ConflictException(`Variant SKU ${sku} already exists`); } }
    if (input.category) { const parent=await this.categories.findOne({name:input.category,isActive:true}).lean().exec(); if(!parent) throw new BadRequestException('Select an active category'); if(input.subCategory) { const child=await this.categories.findOne({name:input.subCategory,parentId:parent._id,isActive:true}).lean().exec(); if(!child) throw new BadRequestException('Select an active sub-category belonging to the selected category'); } }
  }

  findAll(limit = 50, offset = 0): Promise<Product[]> {
    return this.products
      .find({ isActive: true, status: 'active' })
      .sort({ slug: 1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec();
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.products
      .findOne({ slug, isActive: true, status: 'active' })
      .lean()
      .exec();
    if (!product) {
      throw new NotFoundException(`No product found for slug "${slug}"`);
    }
    return product;
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
      q?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<AdminProductListResult> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const query: FilterQuery<ProductDocument> = {};
    if (filters.status) query.status = filters.status;

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
    return { items, total, limit, offset };
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
    return product;
  }

  /**
   * Admin catalogue save. Authentication and role checks live on the controller
   * (`AdminAuthGuard` + `RolesGuard`); this keeps the editable catalogue
   * contract in one place.
   */
  async adminUpdate(slug: string, changes: Partial<Product>): Promise<Product> {
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
    await this.validateCommerce(changes, slug);
    const product = await this.products
      .findOneAndUpdate({ slug }, { $set: changes }, { new: true, runValidators: true })
      .lean()
      .exec();
    if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
    return product;
  }

  async adminCreate(input: Partial<Product>): Promise<Product> {
    const slug = input.slug?.trim().toLowerCase();
    if (!slug || !input.title || !input.description || !input.image || !input.category || input.pricePaise === undefined) {
      throw new ConflictException('slug, title, description, image, category and pricePaise are required');
    }
    await this.validateCommerce(input);
    try { return await this.products.create({ ...input, slug, isActive: input.isActive ?? true, status: input.status ?? 'draft' }); }
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

  async adminDeactivate(slug: string): Promise<Product> {
    const product = await this.products.findOneAndUpdate({ slug }, { $set: { isActive: false, status: 'inactive' } }, { new: true }).lean().exec();
    if (!product) throw new NotFoundException(`No product found for slug "${slug}"`);
    return product;
  }

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

    const lines: QuoteLineResult[] = dto.lines.map((line) => {
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
      return {
        slug: product.slug,
        packSize: variant?.size ?? packSize,
        title: product.title,
        quantity: line.quantity,
        unitPricePaise: variant?.pricePaise ?? product.pricePaise,
        lineTotalPaise: (variant?.pricePaise ?? product.pricePaise) * line.quantity,
      };
    });

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
