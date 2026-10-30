import { HttpException, HttpStatus, BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { compare, hash } from 'bcryptjs';
import { OrderService } from '../orders/order.service';
import { NotificationService } from '../engagement/notification.service';
import { MailService } from '../mail/mail.module';
import { AuditService } from '../audit/audit.service';
import type { AdminRequest } from '../auth/admin-auth.guard';
import { AdminUpdateCustomerDto } from './admin-customer.dto';
import { isValidObjectId, Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/order.schema';
import { Product, ProductDocument } from '../products/product.schema';
import { AddressDto, SignupDto, UpdateProfileDto } from './customer.dto';
import { Customer, CustomerAddress, CustomerDocument } from './customer.schema';

const publicCustomer = (customer: CustomerDocument | Record<string, any>) => ({ id: String(customer._id), name: customer.name, email: customer.email, phone: customer.phone ?? '', addresses: customer.addresses ?? [], wishlist: customer.wishlist ?? [] });

@Injectable()
export class CustomerService {
  constructor(@InjectModel(Customer.name) private readonly customers: Model<CustomerDocument>, @InjectModel(Product.name) private readonly products: Model<ProductDocument>, @InjectModel(Order.name) private readonly orders: Model<OrderDocument>, private readonly jwt: JwtService, private readonly audit: AuditService, private readonly mail: MailService, private readonly notifications: NotificationService, private readonly orderService: OrderService) {}
  private async token(customer: CustomerDocument) { return this.jwt.signAsync({ sub: String(customer._id), email: customer.email, type: 'customer', version: customer.authVersion ?? 0 }, { expiresIn: '7d' }); }
  async signup(dto: SignupDto) {
    try { const customer = await this.customers.create({ name: dto.name.trim(), email: dto.email.toLowerCase(), passwordHash: await hash(dto.password, 12), phone: dto.phone, addresses: [], wishlist: [] }); await this.notifications.add(customer.email, 'Welcome to Nutri Heaven', 'Your account is ready. Save favourites and manage your orders from your account.', 'welcome-' + customer.id, true, customer.id); return { accessToken: await this.token(customer), customer: publicCustomer(customer) }; }
    catch (error) { if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('An account already exists for this email'); throw error; }
  }
  async login(email: string, password: string) { const customer = await this.customers.findOne({ email: email.toLowerCase(), isActive: true }).select('+passwordHash').exec(); if (!customer || !await compare(password, customer.passwordHash)) throw new UnauthorizedException('Invalid email or password'); await this.notifications.add(customer.email, 'New sign-in', 'A successful sign-in to your account was recorded. If this was not you, reset your password.', 'signin-' + customer.id + '-' + randomBytes(12).toString('hex'), false, customer.id); return { accessToken: await this.token(customer), customer: publicCustomer(customer) }; }
  async me(id: string) { const customer = await this.customers.findById(id).lean().exec(); if (!customer || !customer.isActive) throw new UnauthorizedException('Customer account is unavailable'); return publicCustomer(customer); }
  async update(id: string, dto: UpdateProfileDto) { const customer = await this.customers.findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true }).exec(); if (!customer) throw new NotFoundException('Customer not found'); return publicCustomer(customer); }
  async addAddress(id: string, dto: AddressDto) { const customer = await this.customers.findById(id).exec(); if (!customer) throw new NotFoundException('Customer not found'); const address: CustomerAddress = { ...dto, id: randomBytes(12).toString('hex'), isDefault: customer.addresses.length === 0 } as CustomerAddress; customer.addresses.push(address); await customer.save(); return publicCustomer(customer).addresses; }
  async updateAddress(id: string, addressId: string, dto: AddressDto) { const customer = await this.customers.findById(id).exec(); const index = customer?.addresses.findIndex(address => address.id === addressId) ?? -1; if (index < 0 || !customer) throw new NotFoundException('Address not found'); const existing = customer.addresses[index]; if (!existing) throw new NotFoundException('Address not found'); customer.addresses[index] = { ...existing, ...dto, id: addressId, isDefault: existing.isDefault }; await customer.save(); return publicCustomer(customer).addresses; }
  async deleteAddress(id: string, addressId: string) { const customer = await this.customers.findById(id).exec(); if (!customer) throw new NotFoundException('Customer not found'); const old = customer.addresses.length; customer.addresses = customer.addresses.filter(address => address.id !== addressId); if (old === customer.addresses.length) throw new NotFoundException('Address not found'); const first = customer.addresses[0]; if (first && !customer.addresses.some(address => address.isDefault)) first.isDefault = true; await customer.save(); return publicCustomer(customer).addresses; }
  async addWishlist(id: string, slug: string) { const product = await this.products.findOne({ slug, isActive: true, status: 'active' }).lean().exec(); if (!product) throw new NotFoundException('Product is no longer available'); await this.customers.findByIdAndUpdate(id, { $addToSet: { wishlist: slug } }).exec(); return this.wishlist(id); }
  async removeWishlist(id: string, slug: string) { await this.customers.findByIdAndUpdate(id, { $pull: { wishlist: slug } }).exec(); return this.wishlist(id); }
  async wishlist(id: string) { const customer = await this.customers.findById(id).lean().exec(); if (!customer) throw new NotFoundException('Customer not found'); return this.products.find({ slug: { $in: customer.wishlist ?? [] }, isActive: true, status: 'active' }).lean().exec(); }
  async ownedOrder(customerId: string, id: string) {
    const order = await this.orders.findOne({ id, customerId }).lean().exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
  async requestOrderAction(customerId: string, id: string, reason: string, kind: 'cancel' | 'return') {
    const order = await this.ownedOrder(customerId, id);
    if (kind === 'cancel') return this.orderService.cancel(order.id, reason, 'customer:' + customerId);
    if (order.status !== 'delivered') throw new BadRequestException('A return can only be requested for a delivered order.');
    return this.orderService.updateStatus(order.id, 'return_requested', { actor: 'customer:' + customerId, note: reason });
  }
  async ordersFor(customerId: string) { return this.orders.find({ customerId }).sort({ createdAt: -1 }).lean().exec(); }
  private readonly resetAttempts = new Map<string, number>();
  async forgotPassword(email: string) {
    email = email.trim().toLowerCase();
    const now = Date.now();
    for (const [key, until] of this.resetAttempts) if (until <= now) this.resetAttempts.delete(key);
    if ((this.resetAttempts.get(email) ?? 0) > now) throw new HttpException('Please wait a minute before requesting another reset link.', HttpStatus.TOO_MANY_REQUESTS);
    this.resetAttempts.set(email, now + 60000);
    if (process.env.NODE_ENV === 'production' && !this.mail.configured) throw new HttpException('Password recovery is temporarily unavailable.', HttpStatus.SERVICE_UNAVAILABLE);
 const customer = await this.customers.findOne({ email: email.toLowerCase(), isActive: true }).select('+passwordResetHash +passwordResetExpiresAt').exec(); if (!customer) return { message: 'If an account exists, reset instructions have been sent.' }; const token = randomBytes(32).toString('hex'); customer.passwordResetHash = createHash('sha256').update(token).digest('hex'); customer.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000); await customer.save(); await this.mail.send(customer.email, 'Reset your Nutri Heaven password', `Open this link to reset your password within 15 minutes: ${this.mail.url('/account?reset=' + token)}\nIf you did not request this, ignore this email.`, 'reset-' + customer.passwordResetHash); const result: Record<string, string> = { message: 'If an account exists, reset instructions have been sent.' }; if (process.env.NODE_ENV !== 'production') result.resetToken = token; return result; }
  async resetPassword(token: string, password: string) {
    const passwordResetHash = createHash('sha256').update(token).digest('hex');
    const passwordHash = await hash(password, 12);
    const customer = await this.customers.findOneAndUpdate(
      { passwordResetHash, passwordResetExpiresAt: { $gt: new Date() }, isActive: true },
      { $set: { passwordHash }, $inc: { authVersion: 1 }, $unset: { passwordResetHash: 1, passwordResetExpiresAt: 1 } },
      { new: true },
    ).exec();
    if (!customer) throw new BadRequestException('Reset link is invalid or expired');
    return { accessToken: await this.token(customer), customer: publicCustomer(customer) };
  }
  async defaultAddress(id: string, addressId: string) {
    const customer = await this.customers.findById(id).exec();
    if (!customer || !customer.addresses.some(address => address.id === addressId)) throw new NotFoundException('Address not found');
    customer.addresses = customer.addresses.map(address => ({ ...address, isDefault: address.id === addressId }));
    await customer.save(); return publicCustomer(customer).addresses;
  }
  async adminList(q = '', limit = 50, offset = 0, status?: 'active' | 'inactive') { const needle = q.trim(); const search = needle ? { $or: [{ name: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { email: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { phone: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] } : {}; const query = { ...search, ...(status ? { isActive: status === 'active' } : {}) }; const [items,total] = await Promise.all([this.customers.find(query).sort({ createdAt:-1 }).skip(offset).limit(Math.min(limit,100)).lean().exec(), this.customers.countDocuments(query)]); const emails = items.map(item => item.email); const spend = await this.orders.aggregate([{ $match: { customerEmail: { $in: emails }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$customerEmail', totalSpendingPaise: { $sum: '$totalPaise' }, orders: { $sum: 1 }, lastOrder: { $max: '$createdAt' } } }]); const sums = new Map(spend.map(item => [item._id, item])); return { items: items.map(item => ({ ...this.adminProfile(item), ...(sums.get(item.email) ?? { totalSpendingPaise: 0, orders: 0, lastOrder: null }) })), total, limit: Math.min(limit,100), offset }; }
  private adminProfile(customer: CustomerDocument | Record<string, any>) {
    return { ...publicCustomer(customer), isActive: customer.isActive, createdAt: customer.createdAt, updatedAt: customer.updatedAt };
  }
  private async adminFind(id: string) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid customer ID');
    const customer = await this.customers.findById(id).exec();
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
  async adminGet(id: string) {
    const customer = await this.adminFind(id);
    return { ...this.adminProfile(customer), orders: await this.orders.find({ $or: [{ customerId: id }, { customerEmail: customer.email }] }).sort({ createdAt: -1 }).lean().exec() };
  }
  async adminUpdate(id: string, dto: AdminUpdateCustomerDto, actor: NonNullable<AdminRequest['admin']>) {
    const customer = await this.adminFind(id);
    const before = { name: customer.name, phone: customer.phone ?? '' };
    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.phone !== undefined) customer.phone = dto.phone;
    await customer.save();
    await this.audit.record({ actorId: actor.sub, actorEmail: actor.email, action: 'customer.update', entityType: 'customer', entityId: id, before, after: { name: customer.name, phone: customer.phone ?? '' } });
    return this.adminProfile(customer);
  }
  async adminStatus(id: string, isActive: boolean, actor: NonNullable<AdminRequest['admin']>) {
    const customer = await this.adminFind(id);
    const before = { isActive: customer.isActive };
    const after = await this.customers.findByIdAndUpdate(id, { $set: { isActive }, $inc: { authVersion: 1 }, $unset: { passwordResetHash: 1, passwordResetExpiresAt: 1 } }, { new: true }).exec();
    if (!after) throw new NotFoundException('Customer not found');
    await this.audit.record({ actorId: actor.sub, actorEmail: actor.email, action: isActive ? 'customer.activate' : 'customer.deactivate', entityType: 'customer', entityId: id, before, after: { isActive } });
    return this.adminProfile(after);
  }
}
