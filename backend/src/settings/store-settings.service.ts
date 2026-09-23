import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StoreSettings, StoreSettingsDocument } from './store-settings.schema';
@Injectable()
export class StoreSettingsService {
  constructor(@InjectModel(StoreSettings.name) private readonly settings: Model<StoreSettingsDocument>) {}
  async get() { return this.settings.findOneAndUpdate({ key: 'primary' }, { $setOnInsert: { key: 'primary' } }, { upsert: true, new: true }).lean().exec(); }
  async update(value: Record<string, unknown>) { return this.settings.findOneAndUpdate({ key: 'primary' }, { $set: { value } }, { upsert: true, new: true, runValidators: true }).lean().exec(); }
}
