import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { existsSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import { Banner, BannerDocument, Faq, FaqDocument, SocialLink, SocialLinkDocument } from './cms.schema';

const clean = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const order = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const active = (value: unknown) => value !== false;

@Injectable()
export class CmsService {
  constructor(@InjectModel(Banner.name) private readonly banners: Model<BannerDocument>, @InjectModel(Faq.name) private readonly faqs: Model<FaqDocument>, @InjectModel(SocialLink.name) private readonly socials: Model<SocialLinkDocument>) {}
  private banner(input: Record<string, unknown>) { const heading=clean(input.heading,140), imageUrl=clean(input.imageUrl,500); if(!heading||!imageUrl) throw new BadRequestException('Heading and image are required'); return {heading,imageUrl,description:clean(input.description),buttonText:clean(input.buttonText,80),buttonLink:clean(input.buttonLink,500),displayOrder:order(input.displayOrder),isActive:active(input.isActive)}; }
  private faq(input: Record<string, unknown>) { const question=clean(input.question,300), answer=clean(input.answer,5000); if(!question||!answer) throw new BadRequestException('Question and answer are required'); return {question,answer,displayOrder:order(input.displayOrder),isActive:active(input.isActive)}; }
  private social(input: Record<string, unknown>) { const platform=clean(input.platform,80),url=clean(input.url,500); if(!platform || !/^https:\/\//i.test(url)) throw new BadRequestException('Platform and a valid HTTPS URL are required'); return {platform,url,displayOrder:order(input.displayOrder),isActive:active(input.isActive)}; }
  listPublic() { return Promise.all([this.banners.find({isActive:true}).sort({displayOrder:1,createdAt:1}).lean(),this.faqs.find({isActive:true}).sort({displayOrder:1,createdAt:1}).lean(),this.socials.find({isActive:true}).sort({displayOrder:1,createdAt:1}).lean()]).then(([banners,faqs,socialLinks])=>({banners,faqs,socialLinks})); }
  list(kind: 'banners'|'faqs'|'socials') { return this.model(kind).find().sort({displayOrder:1,createdAt:1}).lean(); }
  async create(kind: 'banners'|'faqs'|'socials', input: Record<string, unknown>) { return this.model(kind).create(this.payload(kind,input)); }
  async update(kind: 'banners'|'faqs'|'socials', id: string, input: Record<string, unknown>) { const item=await this.model(kind).findByIdAndUpdate(id,{$set:this.payload(kind,input)},{new:true,runValidators:true}).lean(); if(!item) throw new NotFoundException('CMS item not found'); return item; }
  async remove(kind: 'banners'|'faqs'|'socials', id: string) { const item=await this.model(kind).findByIdAndDelete(id).lean(); if(!item) throw new NotFoundException('CMS item not found'); if(kind==='banners' && typeof item.imageUrl==='string') { const filename=basename(new URL(item.imageUrl,'http://local').pathname); const path=join(process.cwd(),'uploads',filename); if(/^[a-f0-9-]+\.(jpe?g|png|webp)$/i.test(filename) && existsSync(path)) unlinkSync(path); } return {deleted:true}; }
  private model(kind: string): any { return kind==='banners'?this.banners:kind==='faqs'?this.faqs:this.socials; }
  private payload(kind: string,input: Record<string,unknown>) { return kind==='banners'?this.banner(input):kind==='faqs'?this.faq(input):this.social(input); }
}
