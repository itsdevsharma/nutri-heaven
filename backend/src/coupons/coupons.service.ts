import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coupon, CouponDocument } from './coupon.schema';
import { CouponRedemption, CouponRedemptionDocument } from './coupon-redemption.schema';
import { CreateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(@InjectModel(Coupon.name) private coupons: Model<CouponDocument>, @InjectModel(CouponRedemption.name) private redemptions: Model<CouponRedemptionDocument>) {}
  list() { return this.coupons.find().sort({ createdAt: -1 }).lean().exec(); }
  async create(dto: CreateCouponDto) { this.validateDates(dto); return this.coupons.create({ ...dto, code: dto.code.trim().toUpperCase() }); }
  async update(id: string, dto: Partial<CreateCouponDto>) { const current = await this.coupons.findById(id).lean().exec(); if (!current) throw new NotFoundException('Coupon not found'); this.validateDates({ discountType: dto.discountType ?? current.discountType, discountValue: dto.discountValue ?? current.discountValue, startsAt: dto.startsAt ?? current.startsAt?.toISOString(), endsAt: dto.endsAt ?? current.endsAt?.toISOString() }); const coupon = await this.coupons.findByIdAndUpdate(id, { $set: { ...dto, ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}) } }, { new: true, runValidators: true }).lean().exec(); return coupon!; }
  deactivate(id: string) { return this.update(id, { isActive: false }); }
  redemptionsFor(code: string) { return this.redemptions.find({ couponCode: code.toUpperCase() }).sort({ createdAt: -1 }).lean().exec(); }
  async quote(code: string, subtotalPaise: number, products: Array<{ slug: string; category: string; lineTotalPaise: number }>) {
    const coupon = await this.activeCoupon(code, subtotalPaise, products);
    if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) throw new BadRequestException('This coupon has reached its usage limit');
    return { code: coupon.code, discountPaise: this.discount(coupon, subtotalPaise, products) };
  }
  async redeem(code: string, subtotalPaise: number, products: Array<{ slug: string; category: string; lineTotalPaise: number }>, email: string, orderId: string) {
    const coupon = await this.activeCoupon(code, subtotalPaise, products);
    const discountPaise = this.discount(coupon, subtotalPaise, products);
    const filter: Record<string, unknown> = { _id: coupon._id, isActive: true, ...(coupon.usageLimit > 0 ? { usageCount: { $lt: coupon.usageLimit } } : {}) };
    const updated = await this.coupons.findOneAndUpdate(filter, { $inc: { usageCount: 1 } }, { new: true }).lean().exec();
    if (!updated) throw new BadRequestException('This coupon is no longer available');
    try { await this.redemptions.create({ couponCode: coupon.code, customerEmail: email.toLowerCase(), orderId, discountPaise }); }
    catch (error) { await this.coupons.updateOne({ _id: coupon._id }, { $inc: { usageCount: -1 } }).exec(); throw error; }
    return { code: coupon.code, discountPaise };
  }
  async refundRedemption(orderId: string) { const redemption = await this.redemptions.findOneAndDelete({ orderId }).lean().exec(); if (redemption) await this.coupons.updateOne({ code: redemption.couponCode, usageCount: { $gt: 0 } }, { $inc: { usageCount: -1 } }).exec(); }
  private async activeCoupon(code: string, subtotal: number, products: Array<{ slug: string; category: string }>) {
    const coupon = await this.coupons.findOne({ code: code.trim().toUpperCase(), isActive: true }).lean().exec();
    const now = Date.now();
    if (!coupon || (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) || (coupon.endsAt && new Date(coupon.endsAt).getTime() < now)) throw new BadRequestException('Coupon is invalid, inactive, or expired');
    if (subtotal < coupon.minimumOrderPaise) throw new BadRequestException(`Minimum order for this coupon is ₹${(coupon.minimumOrderPaise / 100).toFixed(2)}`);
    if (coupon.productSlugs.length || coupon.categories.length) {
      const matches = products.some((product) => coupon.productSlugs.includes(product.slug) || coupon.categories.includes(product.category));
      if (!matches) throw new BadRequestException('This coupon does not apply to the items in your cart');
    }
    return coupon;
  }
  private discount(coupon: Coupon, subtotal: number, products: Array<{ slug: string; category: string; lineTotalPaise: number }>) {
    const eligibleSubtotal = coupon.productSlugs.length || coupon.categories.length
      ? products.filter((product) => coupon.productSlugs.includes(product.slug) || coupon.categories.includes(product.category)).reduce((sum, product) => sum + product.lineTotalPaise, 0)
      : subtotal;
    const amount = coupon.discountType === 'percentage' ? Math.floor(eligibleSubtotal * coupon.discountValue / 10000) : coupon.discountValue;
    return Math.min(eligibleSubtotal, coupon.maximumDiscountPaise > 0 ? Math.min(amount, coupon.maximumDiscountPaise) : amount);
  }
  private validateDates(dto: Partial<CreateCouponDto>) { if (dto.discountType === 'percentage' && dto.discountValue !== undefined && dto.discountValue > 10000) throw new BadRequestException('Percentage coupon cannot exceed 100%'); if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) throw new BadRequestException('Coupon end date must follow its start date'); }
}
