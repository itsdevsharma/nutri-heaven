import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { orderTotalForPaise, shippingFeeForPaise } from '../common/pricing';
import { Model } from 'mongoose';
import { QuoteRequest } from './dto/quote.request';
import { Product, ProductDocument } from './product.schema';

export interface QuoteLineResult {
  slug: string;
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

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
  ) {}

  findAll(limit = 50, offset = 0): Promise<Product[]> {
    return this.products
      .find({ isActive: true })
      .sort({ slug: 1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec();
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.products
      .findOne({ slug, isActive: true })
      .lean()
      .exec();
    if (!product) {
      throw new NotFoundException(`No product found for slug "${slug}"`);
    }
    return product;
  }

  /**
   * Admin catalogue save. Authentication is deliberately left to the future
   * admin module; this keeps the editable catalogue contract in one place.
   */
  async adminUpdate(slug: string, changes: Partial<Product>): Promise<Product> {
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
      .find({ slug: { $in: slugs }, isActive: true })
      .lean()
      .exec();
    const bySlug = new Map(found.map((product) => [product.slug, product]));

    const lines: QuoteLineResult[] = dto.lines.map((line) => {
      const product = bySlug.get(line.slug);
      if (!product) {
        throw new NotFoundException(`No product found for slug "${line.slug}"`);
      }
      return {
        slug: product.slug,
        title: product.title,
        quantity: line.quantity,
        unitPricePaise: product.pricePaise,
        lineTotalPaise: product.pricePaise * line.quantity,
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
