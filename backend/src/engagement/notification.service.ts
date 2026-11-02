import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CustomerNotification } from './engagement.schema';
import { MailService } from '../mail/mail.module';
import { Customer } from '../customers/customer.schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(@InjectModel(CustomerNotification.name) private readonly notifications: Model<CustomerNotification>, private readonly mail: MailService,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>, private readonly audit: AuditService) {}
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
  async failedDeliveries() {
    const items = await this.notifications.find({ emailRequested: true, sentAt: { $exists: false }, attempts: { $gte: 5 } })
      .select('_id customerId email title attempts retryAt createdAt deliveryError').sort({ createdAt: -1 }).limit(100).lean().exec();
    const ids = [...new Set(items.map(item => item.customerId).filter((id): id is string => Boolean(id && isValidObjectId(id))))];
    const accounts = await this.customers.find({ _id: { $in: ids } }).select('email isActive').lean().exec();
    return items.map(item => {
      const customer = accounts.find(account => String(account._id) === item.customerId);
      const available = !item.customerId || Boolean(customer?.isActive);
      return { ...item, recipient: customer?.email ?? item.email, canRetry: this.mail.configured && available && (!item.retryAt || item.retryAt <= new Date()) };
    });
  }
  private async recipient(email: string, customerId?: string) {
    if (!customerId) return email;
    const customer = isValidObjectId(customerId) ? await this.customers.findById(customerId).select('email isActive').lean().exec() : null;
    if (!customer?.isActive) throw new ConflictException('The linked customer account is unavailable or inactive.');
    return customer.email;
  }
  async retryDelivery(id: string, actorId: string) {
    if (!this.mail.configured) throw new ServiceUnavailableException('Configure the email sender before retrying.');
    if (!isValidObjectId(id)) throw new NotFoundException('Notification not found');
    const item = await this.notifications.findById(id).lean().exec();
    if (!item?.emailRequested) throw new NotFoundException('Notification not found');
    const email = await this.recipient(item.email, item.customerId);
    // Keep the same provider key for an unchanged recipient, including ambiguous
    // responses. A corrected recipient requires a new key for the new payload.
    const updated = await this.notifications.findOneAndUpdate({ _id: id, email: item.email, emailRequested: true, sentAt: { $exists: false }, attempts: { $gte: 5 },
      $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: new Date() } }] },
    { $set: { email, attempts: 0, retryAt: new Date() }, $unset: { deliveryError: 1 }, ...(email !== item.email ? { $inc: { deliveryVersion: 1 } } : {}) }, { new: true }).exec();
    if (!updated) throw new ConflictException('This email is already sent, queued or still being processed. Refresh the list.');
    await this.audit.record({ actorId, action: 'notification.retry', entityType: 'notification', entityId: id, before: { email: item.email, attempts: item.attempts }, after: { email, attempts: 0 } });
    return { message: 'Email queued for retry. The delivery worker runs every 30 seconds.' };
  }
  async deliver() {
    if (this.running || !this.mail.configured) return;
    this.running = true;
    try {
      for (let i = 0; i < 20; i++) {
        const item = await this.notifications.findOneAndUpdate({ emailRequested: true, sentAt: { $exists: false }, attempts: { $lt: 5 }, $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: new Date() } }] }, { $set: { retryAt: new Date(Date.now() + 300000) }, $inc: { attempts: 1 } }, { new: true }).exec();
        if (!item) break;
        try {
          const email = await this.recipient(item.email, item.customerId);
          if (email !== item.email) {
            item.email = email;
            item.deliveryVersion = (item.deliveryVersion ?? 0) + 1;
            await item.save();
          }
          const accepted = await this.mail.send(item.email, item.title, `${item.message}\n\n${this.mail.url('/account')}`, `notification-${item.id}${item.deliveryVersion ? `-v${item.deliveryVersion}` : ''}`);
          if (!accepted) throw new ServiceUnavailableException('Email was not accepted by the provider');
          await this.notifications.updateOne({ _id: item._id }, { $set: { sentAt: new Date() }, $unset: { deliveryError: 1 } });
        } catch { await this.notifications.updateOne({ _id: item._id }, { $set: { deliveryError: 'Delivery failed; check email provider configuration.' } }); }
      }
    } finally { this.running = false; }
  }
}
