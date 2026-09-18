import { Injectable, NotFoundException } from '@nestjs/common';
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
