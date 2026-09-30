import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Offer, OfferDocument } from './offer.schema';
import { CreateOfferDto } from './dto/create-offer.dto';
@Injectable()
export class OffersService {
  constructor(@InjectModel(Offer.name) private readonly offers: Model<OfferDocument>) {}
  list() { return this.offers.find().sort({ priority: -1, createdAt: -1 }).lean().exec(); }
  async create(dto: CreateOfferDto) { this.validateDates(dto); return this.offers.create(dto); }
  async update(id: string, dto: Partial<CreateOfferDto>) { const existing = await this.offers.findById(id).lean().exec(); if (!existing) throw new NotFoundException('Offer not found'); const merged = { ...existing, ...dto }; this.validateDates({ startsAt: merged.startsAt?.toString(), endsAt: merged.endsAt?.toString() }); this.validateValue({ discountType: merged.discountType, discountValue: merged.discountValue }); const offer = await this.offers.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true }).lean().exec(); return offer!; }
  async deactivate(id: string) { return this.update(id, { isActive: false }); }
  async priceFor(product: { slug: string; category: string }, pricePaise: number) {
    const now = new Date(); const offers = await this.offers.find({ isActive: true, $and: [{ $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] }] }).sort({ priority: -1 }).lean().exec();
    let price = pricePaise; let applied = false;
    for (const offer of offers) {
      const scoped = !offer.productSlugs.length && !offer.categories.length || offer.productSlugs.includes(product.slug) || offer.categories.includes(product.category);
      if (!scoped) continue;
      const rawSaving = offer.discountType === 'percentage' ? Math.floor(price * offer.discountValue / 10000) : offer.discountValue;
      const saving = Math.min(price, offer.maximumSavingPaise > 0 ? Math.min(rawSaving, offer.maximumSavingPaise) : rawSaving);
      price -= saving; applied = true;
      if (!offer.isStackable || price <= 0) break;
    }
    return applied ? price : pricePaise;
  }
  private validateDates(dto: Partial<CreateOfferDto>) { if (dto.startsAt && dto.endsAt && new Date(dto.endsAt) <= new Date(dto.startsAt)) throw new BadRequestException('Offer end date must be after its start date'); this.validateValue(dto); }
  private validateValue(dto: Partial<CreateOfferDto>) { if (dto.discountType === 'percentage' && dto.discountValue !== undefined && dto.discountValue > 10000) throw new BadRequestException('Percentage offer cannot exceed 100%'); }
}
