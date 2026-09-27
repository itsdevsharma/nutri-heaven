import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './category.schema';

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private readonly categories: Model<CategoryDocument>) {}
  list() { return this.categories.find({ isActive: true }).sort({ position: 1, name: 1 }).lean().exec(); }
  adminList() { return this.categories.find().sort({ parentId: 1, position: 1, name: 1 }).lean().exec(); }
  private async validateParent(parentId: unknown, ownId?: string) { if(!parentId) return; const parent=await this.categories.findById(parentId).lean().exec(); if(!parent) throw new NotFoundException('Parent category not found'); if(ownId && String(parent._id)===ownId) throw new ConflictException('A category cannot be its own parent'); let cursor=parent; while(cursor.parentId) { if(ownId && String(cursor.parentId)===ownId) throw new ConflictException('A category cannot be moved below one of its descendants'); const next=await this.categories.findById(cursor.parentId).lean().exec(); if(!next) throw new ConflictException('Category hierarchy contains an invalid parent'); cursor=next; } }
  async create(input: Partial<Category>) { await this.validateParent(input.parentId); try { return await this.categories.create(input); } catch { throw new ConflictException('Category slug already exists'); } }
  async update(slug: string, input: Partial<Category>) { const current=await this.categories.findOne({slug}).lean().exec(); if(!current) throw new NotFoundException('Category not found'); await this.validateParent(input.parentId,current._id.toString()); const result = await this.categories.findOneAndUpdate({ slug }, { $set: input }, { new: true, runValidators: true }).lean().exec(); return result!; }
  async deactivate(slug: string) { const result = await this.categories.findOneAndUpdate({ slug }, { $set: { isActive: false } }, { new: true }).lean().exec(); if (!result) throw new NotFoundException('Category not found'); return result; }
}
