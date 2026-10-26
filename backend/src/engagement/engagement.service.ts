import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { Subscriber, Review, CustomerNotification } from './engagement.schema';
import { MailService } from '../mail/mail.module';
import { Customer } from '../customers/customer.schema';
import { Order } from '../orders/order.schema';
import { Product } from '../products/product.schema';
import { EngagementListQuery, SalesReportQuery, CreateReviewDto } from './engagement.dto';
import { AuditService } from '../audit/audit.service';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class EngagementService {
  private readonly attempts = new Map<string, number>();
  constructor(@InjectModel(Subscriber.name) private readonly subscribers: Model<Subscriber>, @InjectModel(Review.name) private readonly reviews: Model<Review>, @InjectModel(Customer.name) private readonly customers: Model<Customer>, @InjectModel(Order.name) private readonly orders: Model<Order>, @InjectModel(Product.name) private readonly products: Model<Product>, @InjectModel(CustomerNotification.name) private readonly notifications: Model<CustomerNotification>, private readonly mail: MailService, private readonly audit: AuditService) {}
  async subscribe(email: string) {
    const now = Date.now(); for (const [key, until] of this.attempts) if (until < now) this.attempts.delete(key);
    if (this.attempts.has(email)) throw new HttpException('Please wait before requesting another confirmation.', 429);
    this.attempts.set(email, now + 60000);
    if (process.env.NODE_ENV === 'production' && !this.mail.configured) throw new ServiceUnavailableException('Newsletter signup is temporarily unavailable.');
    const existing = await this.subscribers.findOne({ email });
    const message = 'Check your email to confirm your subscription. If already subscribed, no action is needed.';
    if (existing?.status === 'subscribed') return { message };
    const token = randomBytes(32).toString('hex'), unsubscribe = randomBytes(32).toString('hex');
    await this.subscribers.findOneAndUpdate({ email }, { $set: { status: 'pending', consentAt: new Date(), confirmHash: digest(token), expiresAt: new Date(now + 86400000), unsubscribeHash: digest(unsubscribe) } }, { upsert: true });
    await this.mail.send(email, 'Confirm your Nutri Heaven newsletter subscription', `Confirm within 24 hours: ${this.mail.url('/account?newsletter=confirm&token=' + token)}\nUnsubscribe at any time: ${this.mail.url('/account?newsletter=unsubscribe&token=' + unsubscribe)}`, 'newsletter-' + digest(token));
    return { message, ...(process.env.NODE_ENV !== 'production' ? { confirmationToken: token, unsubscribeToken: unsubscribe } : {}) };
  }
  async newsletterAction(token: string, unsubscribe: boolean) {
    const query = unsubscribe ? { unsubscribeHash: digest(token) } : { confirmHash: digest(token), expiresAt: { $gt: new Date() }, status: 'pending' };
    const item = await this.subscribers.findOneAndUpdate(query, { $set: { status: unsubscribe ? 'unsubscribed' : 'subscribed', ...(!unsubscribe ? { confirmedAt: new Date() } : {}) }, $unset: { confirmHash: 1, expiresAt: 1 } });
    if (!item) throw new BadRequestException('This link is invalid or expired.');
    return { message: unsubscribe ? 'You have been unsubscribed.' : 'Your subscription is confirmed.' };
  }
  listSubscribers() { return this.subscribers.find().select('email status consentAt confirmedAt createdAt').sort({ createdAt: -1 }).limit(1000).lean(); }
  async createReview(id: string, dto: CreateReviewDto) {
    if (!await this.products.exists({ slug: dto.productSlug, isActive: true, status: 'active' })) throw new NotFoundException('Product not found');
    if (!await this.orders.exists({ customerId: id, status: 'delivered', 'lines.productSlug': dto.productSlug })) throw new BadRequestException('Reviews are available after your order is delivered.');
    const customer = await this.customers.findById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    try { return await this.reviews.create({ ...dto, customerId: id, customerName: customer.name.split(' ')[0], status: 'pending', verifiedPurchase: true }); }
    catch (error) { if ((error as { code?: number }).code === 11000) throw new ConflictException('You have already reviewed this product.'); throw error; }
  }
  async publicReviews(slug: string) {
    if (!await this.products.exists({ slug, isActive: true, status: 'active' })) throw new NotFoundException('Product not found');
    const [items, summary] = await Promise.all([this.reviews.find({ productSlug: slug, status: 'approved' }).select('customerName rating body verifiedPurchase createdAt').sort({ createdAt: -1 }).limit(50).lean(), this.reviews.aggregate([{ $match: { productSlug: slug, status: 'approved' } }, { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }])]);
    return { items, average: summary[0]?.average ?? 0, count: summary[0]?.count ?? 0 };
  }
  listReviews() { return this.reviews.find().sort({ createdAt: -1 }).limit(500).lean(); }
  async moderate(id: string, status: string, actorId: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Review not found');
    const review = await this.reviews.findByIdAndUpdate(id, { $set: { status } }, { new: true });
    if (!review) throw new NotFoundException('Review not found');
    await this.audit.record({ actorId, entityType: 'review', entityId: id, action: 'review.moderate', after: { status } });
    return review;
  }
  async paginated(kind: 'reviews' | 'subscribers', query: EngagementListQuery) {
    const statuses = kind === 'reviews' ? ['pending', 'approved', 'rejected'] : ['pending', 'subscribed', 'unsubscribed'];
    if (query.status && !statuses.includes(query.status)) throw new BadRequestException('Invalid status for this list');
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = (kind === 'reviews' ? ['productSlug', 'customerName', 'body'] : ['email']).map(field => ({ [field]: { $regex: escaped, $options: 'i' } }));
    }
    const model = (kind === 'reviews' ? this.reviews : this.subscribers) as Model<any>;
    const projection = kind === 'reviews' ? 'productSlug customerName rating body status createdAt' : 'email status consentAt confirmedAt createdAt';
    const [items, total] = await Promise.all([model.find(filter).select(projection).sort({ createdAt: -1, _id: -1 }).skip(query.offset).limit(query.limit).lean(), model.countDocuments(filter)]);
    return { items, total, offset: query.offset, limit: query.limit };
  }
  async report(query: SalesReportQuery = {}) {
    const indiaDate = (date: Date) => new Date(date.getTime() + 19800000).toISOString().slice(0, 10);
    const to = query.to ?? indiaDate(new Date());
    const from = query.from ?? indiaDate(new Date(Date.now() - 29 * 86400000));
    const start = new Date(from + 'T00:00:00+05:30'), end = new Date(to + 'T00:00:00+05:30');
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || indiaDate(start) !== from || indiaDate(end) !== to || end < start) throw new BadRequestException('Choose a valid date range');
    const until = new Date(+end + 86400000), duration = +until - +start;
    if (duration > 366 * 86400000) throw new BadRequestException('Reports support up to 366 days');
    const dates = { $gte: start, $lt: until };
    const paid = { createdAt: dates, paymentStatus: 'paid', status: { $nin: ['cancelled', 'returned', 'refunded'] } };
    const totals = { $group: { _id: null, revenuePaise: { $sum: '$totalPaise' }, paidOrders: { $sum: 1 } } };
    const [summary, previous, dailyRows, topProducts, customers, orders, issues, deliveries] = await Promise.all([
      this.orders.aggregate([{ $match: paid }, totals]),
      this.orders.aggregate([{ $match: { ...paid, createdAt: { $gte: new Date(+start - duration), $lt: start } } }, totals]),
      this.orders.aggregate([{ $match: paid }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, revenuePaise: { $sum: '$totalPaise' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      this.orders.aggregate([{ $match: paid }, { $unwind: '$lines' }, { $group: { _id: '$lines.productSlug', units: { $sum: '$lines.quantity' }, grossPaise: { $sum: '$lines.lineTotalPaise' } } }, { $sort: { units: -1 } }, { $limit: 10 }]),
      this.customers.countDocuments({ createdAt: dates }), this.orders.countDocuments({ createdAt: dates }), this.catalogueAudit(),
      this.notifications.countDocuments({ emailRequested: true, sentAt: { $exists: false } }),
    ]);
    const daily = [];
    for (let day = +start; day < +until; day += 86400000) {
      const key = indiaDate(new Date(day));
      daily.push(dailyRows.find(row => row._id === key) ?? { _id: key, revenuePaise: 0, orders: 0 });
    }
    return { from, to, previous: { from: indiaDate(new Date(+start - duration)), to: indiaDate(new Date(+start - 86400000)), revenuePaise: previous[0]?.revenuePaise ?? 0, paidOrders: previous[0]?.paidOrders ?? 0 }, revenuePaise: summary[0]?.revenuePaise ?? 0, paidOrders: summary[0]?.paidOrders ?? 0, customers, orders, daily, topProducts, catalogueIssues: issues, pendingEmails: deliveries, emailConfigured: this.mail.configured };
  }
  async catalogueAudit() {
    const products = await this.products.find({ status: 'active', isActive: true }).select('slug title image description variants').lean();
    return products.map(p => ({ slug: p.slug, title: p.title, issues: [!p.image || /placeholder/i.test(p.image) ? 'Missing or placeholder image' : '', /^(title|test|sample|product)$/i.test(p.title.trim()) ? 'Placeholder title' : '', /^(short description|description|test)$/i.test(p.description?.trim() ?? '') || !p.description ? 'Placeholder description' : '', !p.variants?.some(v => v.isActive && v.pricePaise > 0) ? 'No purchasable variant' : ''].filter(Boolean) })).filter(p => p.issues.length);
  }
}
