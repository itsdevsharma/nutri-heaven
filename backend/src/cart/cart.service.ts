import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { shippingFeeForPaise } from '../common/pricing';
import { Product, ProductDocument } from '../products/product.schema';
import { Cart, CartDocument } from './cart.schema';
import { AddCartItemDto, UpdateCartItemDto } from './cart.dto';

@Injectable()
export class CartService {
  constructor(@InjectModel(Cart.name) private carts: Model<CartDocument>, @InjectModel(Product.name) private products: Model<ProductDocument>) {}
  private key(productId: string, packSize: string) { return `${productId}:${packSize}`; }
  private async cart(cartId: string) { return this.carts.findOneAndUpdate({ cartId }, { $setOnInsert: { cartId } }, { upsert: true, new: true }).exec(); }
  private async variant(productId: string, packSize: string) {
    const product = await this.products.findOne({ slug: productId, isActive: true }).lean().exec();
    const variant = product?.variants?.find(item => item.size === packSize && item.isActive);
    if (!product || !variant) throw new NotFoundException('This product pack is no longer available');
    const stock = (variant as any).stockQuantity ?? 0;
    if (stock < 1) throw new BadRequestException('This product pack is out of stock');
    return { product, variant: variant as any, stock };
  }
  async get(cartId: string) { const cart = await this.cart(cartId); return this.summary(cart); }
  async add(cartId: string, dto: AddCartItemDto) {
    const cart = await this.cart(cartId); const { product, variant, stock } = await this.variant(dto.productId, dto.packSize);
    const index = cart.items.findIndex(item => !item.savedForLater && this.key(item.productId, item.packSize) === this.key(dto.productId, dto.packSize));
    const next = (index < 0 ? 0 : cart.items[index]!.quantity) + dto.quantity;
    if (next > Math.min(stock, 20)) throw new BadRequestException(`Only ${Math.min(stock, 20)} available for this pack`);
    const line = { productId: product.slug, packSize: dto.packSize, quantity: next, unitPricePaise: variant.pricePaise, productName: product.title, image: product.image, stock, savedForLater: false };
    if (index < 0) cart.items.push(line as any); else cart.items[index] = line as any;
    await cart.save(); return this.summary(cart);
  }
  async update(cartId: string, index: number, dto: UpdateCartItemDto) {
    const cart = await this.cart(cartId); const item = cart.items[index]; if (!item) throw new NotFoundException('Cart line not found');
    const packSize = dto.packSize ?? item.packSize; const { product, variant, stock } = await this.variant(item.productId, packSize); const quantity = dto.quantity ?? item.quantity;
    if (quantity > Math.min(stock, 20)) throw new BadRequestException(`Only ${Math.min(stock, 20)} available for this pack`);
    const duplicate = cart.items.findIndex((line, i) => i !== index && !line.savedForLater && line.productId === item.productId && line.packSize === packSize);
    if (duplicate >= 0) { cart.items[duplicate]!.quantity += quantity; cart.items.splice(index, 1); } else Object.assign(item, { packSize, quantity, unitPricePaise: variant.pricePaise, productName: product.title, image: product.image, stock });
    await cart.save(); return this.summary(cart);
  }
  async remove(cartId: string, index: number) { const cart = await this.cart(cartId); if (!cart.items[index]) throw new NotFoundException('Cart line not found'); cart.items.splice(index, 1); await cart.save(); return this.summary(cart); }
  /** Idempotently clear the guest cart after a confirmed checkout. */
  async clear(cartId: string) { const cart = await this.cart(cartId); cart.items = []; cart.note = ''; await cart.save(); return this.summary(cart); }
  async saveForLater(cartId: string, index: number, savedForLater = true) { const cart = await this.cart(cartId); if (!cart.items[index]) throw new NotFoundException('Cart line not found'); cart.items[index].savedForLater = savedForLater; await cart.save(); return this.summary(cart); }
  async note(cartId: string, note: string) { const cart = await this.cart(cartId); cart.note = note.trim(); await cart.save(); return this.summary(cart); }
  private summary(cart: CartDocument) { const active = cart.items.filter(item => !item.savedForLater); const subtotalPaise = active.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0); const shippingPaise = shippingFeeForPaise(subtotalPaise); const gstPaise = Math.round(subtotalPaise * .05 / 1.05); return { cartId: cart.cartId, items: active, savedItems: cart.items.filter(item => item.savedForLater), note: cart.note, subtotalPaise, couponDiscountPaise: 0, gstPaise, cgstPaise: Math.floor(gstPaise / 2), sgstPaise: Math.ceil(gstPaise / 2), shippingPaise, totalPaise: subtotalPaise + shippingPaise }; }
}
