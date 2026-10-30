import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { CustomerNotification } from './engagement.schema';
import { MailService } from '../mail/mail.module';

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(@InjectModel(CustomerNotification.name) private readonly notifications: Model<CustomerNotification>, private readonly mail: MailService) {}
  onModuleInit() { if (process.env.NODE_ENV !== 'test') { this.timer = setInterval(() => { void this.deliver().catch(() => {}); }, 30000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async add(email: string, title: string, message: string, eventKey: string, emailRequested = false, customerId?: string) {
    try { return await this.notifications.findOneAndUpdate({ eventKey }, { $setOnInsert: { customerId, email: email.trim().toLowerCase(), title, message, eventKey, emailRequested, link: '/account' } }, { upsert: true, new: true }).exec(); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; return null; }
  }
  list(customerId: string) { return this.notifications.find({ customerId }).select('_id title message link readAt createdAt').sort({ createdAt: -1 }).limit(100).lean().exec(); }
  async read(customerId: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Notification not found');
    const item = await this.notifications.findOneAndUpdate({ _id: id, customerId }, { $set: { readAt: new Date() } }, { new: true }).select('_id readAt').lean().exec();
    if (!item) throw new NotFoundException('Notification not found'); return item;
  }
  async deliver() {
    if (this.running || !this.mail.configured) return;
    this.running = true;
    try {
      for (let i = 0; i < 20; i++) {
        const item = await this.notifications.findOneAndUpdate({ emailRequested: true, sentAt: { $exists: false }, attempts: { $lt: 5 }, $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: new Date() } }] }, { $set: { retryAt: new Date(Date.now() + 300000) }, $inc: { attempts: 1 } }, { new: true }).exec();
        if (!item) break;
        try {
          await this.mail.send(item.email, item.title, `${item.message}\n\n${this.mail.url('/account')}`, `notification-${item.id}`);
          await this.notifications.updateOne({ _id: item._id }, { $set: { sentAt: new Date() }, $unset: { deliveryError: 1 } });
        } catch { await this.notifications.updateOne({ _id: item._id }, { $set: { deliveryError: 'Delivery failed; check email provider configuration.' } }); }
      }
    } finally { this.running = false; }
  }
}
