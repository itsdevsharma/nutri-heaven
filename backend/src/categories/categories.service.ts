import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './category.schema';

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private readonly categories: Model<CategoryDocument>) {}
  list() { return this.categories.find({ isActive: true }).sort({ position: 1, name: 1 }).lean().exec(); }
  adminList() { return this.categories.find().sort({ parentId: 1, position: 1, name: 1 }).lean().exec(); }
  async create(input: Partial<Category>) { try { return await this.categories.create(input); } catch { throw new ConflictException('Category slug already exists'); } }
  async update(slug: string, input: Partial<Category>) { const result = await this.categories.findOneAndUpdate({ slug }, { $set: input }, { new: true, runValidators: true }).lean().exec(); if (!result) throw new NotFoundException('Category not found'); return result; }
  async deactivate(slug: string) { const result = await this.categories.findOneAndUpdate({ slug }, { $set: { isActive: false } }, { new: true }).lean().exec(); if (!result) throw new NotFoundException('Category not found'); return result; }
}
