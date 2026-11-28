import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Admin } from '../src/admin/admin.schema';
import { Product } from '../src/products/product.schema';
import { Order } from '../src/orders/order.schema';
import { OrderService } from '../src/orders/order.service';
import { OrderRefund } from '../src/payments/refund.schema';
import { CheckoutService } from '../src/checkout/checkout.service';
import { startMemoryReplica } from './helpers/memory-replica';
const { auditDatabase, applyProviderIndexes } = require('../scripts/order-consistency.cjs');

describe('Order pagination, historical images, provider indexes and read-only audit', () => {
  jest.setTimeout(120000);
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>, orders: Model<Order>, service: OrderService, token: string;
  const fixture = (id: string) => ({ id, cartId: id, idempotencyKey: id, customerName: 'Buyer', customerEmail: 'private-fixture@example.com', customerPhone: '9876543210', deliveryAddress: { street: 'Fixture', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [{ productSlug: 'fixture', packSize: '250g', productName: 'Fixture', image: '', quantity: 1, unitPricePaise: 100, lineTotalPaise: 100 }], subtotalPaise: 100, shippingPaise: 0, totalPaise: 100, paymentMethod: 'cod', paymentStatus: 'pending', status: 'confirmed' });
  beforeAll(async () => {
    mongo = await startMemoryReplica(); process.env.MONGODB_URI = mongo.uri;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    orders = app.get(getModelToken(Order.name)); service = app.get(OrderService); await orders.init();
    const admin = await app.get<Model<Admin>>(getModelToken(Admin.name)).create({ name: 'Fixture', email: 'admin-fixture@example.com', passwordHash: 'unused', role: 'super_admin' });
    token = await app.get(JwtService).signAsync({ sub: String(admin._id), email: admin.email, role: admin.role, version: 0 });
    await orders.create(Array.from({ length: 45 }, (_, index) => ({ ...fixture('PAGE-' + index), customerName: index === 1 ? 'Buyer [1]' : 'Buyer ' + index, status: index < 30 ? 'confirmed' : 'delivered' })));
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); });
  const page = (query: string) => request(app.getHttpServer()).get('/orders/admin/page' + query).auth(token, { type: 'bearer' });
  it('returns bounded distinct pages, full matching counts and global summary', async () => {
    await request(app.getHttpServer()).get('/orders/admin/page').expect(401);
    const first = (await page('?limit=20&offset=0').expect(200)).body;
    const next = (await page('?limit=20&offset=20').expect(200)).body;
    expect(first.items).toHaveLength(20); expect(next.items).toHaveLength(20); expect(first.total).toBe(45);
    expect(first.summary).toEqual({ totalOrders: 45, toFulfil: 30, inTransit: 0, delivered: 15 });
    expect(new Set([...first.items, ...next.items].map(item => item.id)).size).toBe(40);
    expect((await page('?limit=20&offset=40').expect(200)).body.items).toHaveLength(5);
    expect(first.items[0]).toHaveProperty('allowedActions');
  });
  it('validates page inputs and combines server filters with literal escaped search', async () => {
    for (const query of ['?limit=0', '?limit=101', '?offset=-1', '?offset=1000001', '?queue=unknown', '?status=invalid', '?payment=invalid', '?q=' + 'x'.repeat(101)]) await page(query).expect(400);
    const filtered = (await page('?status=delivered&payment=pending&limit=5').expect(200)).body;
    expect(filtered.total).toBe(15); expect(filtered.items).toHaveLength(5); expect(filtered.summary.totalOrders).toBe(45);
    expect((await page('?q=' + encodeURIComponent('Buyer [1]')).expect(200)).body.total).toBe(1);
    expect((await page('?q=' + encodeURIComponent('.*')).expect(200)).body.total).toBe(0);
    expect((await page('?queue=inbox').expect(200)).body.total).toBe(30);
    expect((await page('?queue=cod').expect(200)).body.total).toBe(15);
  });
  it('includes open failed refunds in the returns queue independently of the page or reserved balance', async () => {
    const order = await orders.create({ ...fixture('FAILED-REFUND'), status: 'cancelled' });
    await app.get<Model<OrderRefund>>(getModelToken(OrderRefund.name)).create({ orderId: order.id, requestId: randomUUID(), paymentId: 'pay_fixture', amountPaise: 100, status: 'failed', actor: 'fixture', reason: 'Fixture' });
    const result = (await page('?queue=returns').expect(200)).body;
    expect(result.items.map((item: Order) => item.id)).toContain(order.id); expect(result.items[0]).not.toHaveProperty('_openRefunds');
    const response = await request(app.getHttpServer()).get('/payments/razorpay/admin/refunds?orderId=' + order.id).auth(token, { type: 'bearer' }).expect(200);
    expect(response.body).toHaveLength(1); expect(response.body[0].orderId).toBe(order.id);
    await request(app.getHttpServer()).get('/payments/razorpay/admin/refunds?orderId[bad]=x').auth(token, { type: 'bearer' }).expect(400);
  });
  it('bounds the legacy array endpoint without changing its response shape', async () => {
    await orders.create(Array.from({ length: 65 }, (_, index) => fixture('LEGACY-' + index)));
    const result = await request(app.getHttpServer()).get('/orders/admin').auth(token, { type: 'bearer' }).expect(200);
    expect(Array.isArray(result.body)).toBe(true); expect(result.body).toHaveLength(100);
  });
  it('snapshots selected variant images with product fallback and never rewrites historical images', async () => {
    const products = app.get<Model<Product>>(getModelToken(Product.name)); const slug = 'snapshot-' + randomUUID();
    await products.create({ slug, title: 'Fixture', description: 'Fixture', category: 'Nuts', image: 'original-product.jpg', pricePaise: 10000, status: 'active', isActive: true, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 10, isActive: true, images: ['original-pack.jpg'] }, { size: '500g', pricePaise: 20000, stockQuantity: 10, isActive: true }] });
    const checkout = app.get(CheckoutService);
    const quoteInput = { cartId: 'image-quote', paymentMethod: 'cod', deliveryAddress: fixture('image-address').deliveryAddress, lines: [{ productSlug: slug, packSize: '250g', quantity: 1 }] };
    const pricing = await checkout.calculate(quoteInput);
    const create = (packSize: string) => service.createOrder({ ...fixture(randomUUID()), paymentMethod: 'cod', lines: [{ productSlug: slug, packSize, quantity: 1 }] });
    const pack = await create('250g'), fallback = await create('500g');
    expect(pack.lines[0]!.image).toBe('original-pack.jpg'); expect(fallback.lines[0]!.image).toBe('original-product.jpg');
    await products.updateOne({ slug }, { $set: { image: 'new-product.jpg', 'variants.0.images': ['new-pack.jpg'] } });
    expect((await checkout.calculate(quoteInput)).pricingFingerprint).toBe(pricing.pricingFingerprint);
    expect((await service.getOrder(pack.id)).lines[0]!.image).toBe('original-pack.jpg');
    const legacy = await orders.create(fixture('NO-HISTORICAL-IMAGE')); const before = await orders.findOne({ id: legacy.id }).lean();
    await service.getCustomerOrder(legacy.id, legacy.cartId); expect(await orders.findOne({ id: legacy.id }).lean()).toEqual(before);
  });
  it('enforces a shared uniqueness namespace for current and superseded provider orders', async () => {
    const first = await orders.create({ ...fixture('PROVIDER-FIRST'), razorpayOrderId: 'order_unique', supersededRazorpayOrders: [{ id: 'order_replaced', amountPaise: 100, at: new Date() }] });
    expect(first.razorpayOrderReferences).toEqual(['order_unique', 'order_replaced']);
    await expect(orders.create({ ...fixture('DUP-CURRENT'), razorpayOrderId: 'order_unique' })).rejects.toMatchObject({ code: 11000 });
    await expect(orders.create({ ...fixture('DUP-OLD'), razorpayOrderId: 'order_replaced' })).rejects.toMatchObject({ code: 11000 });
    await expect(orders.create({ ...fixture('DUP-HISTORY'), supersededRazorpayOrders: [{ id: 'order_unique', amountPaise: 100, at: new Date() }] })).rejects.toMatchObject({ code: 11000 });
    const other = await orders.create({ ...fixture('ATTACH-DUP'), paymentMethod: 'razorpay', status: 'pending', stockReserved: true });
    await expect(service.attachRazorpayOrder(other.id, 'order_replaced')).rejects.toMatchObject({ code: 11000 });
    expect((await service.getOrder(other.id)).razorpayOrderId).toBeUndefined();
  });
  it('enforces unique payment references while allowing many absent/blank references', async () => {
    await orders.create({ ...fixture('PAY-FIRST'), razorpayPaymentId: 'pay_unique' });
    await expect(orders.create({ ...fixture('PAY-DUP'), razorpayPaymentId: 'pay_unique' })).rejects.toMatchObject({ code: 11000 });
    await orders.create([{ ...fixture('PAY-EMPTY-1'), razorpayPaymentId: '' }, { ...fixture('PAY-EMPTY-2'), razorpayPaymentId: '' }]);
  });
  it('audits deliberately inconsistent native records with no mutations or personal information in the report', async () => {
    const db = orders.db.getClient().db('audit_bad_' + randomUUID().replace(/-/g, ''));
    await db.collection('orders').insertMany([
      { ...fixture('BAD-1'), razorpayOrderId: 'order_duplicate', razorpayPaymentId: 'pay_duplicate', customerId: String(new Types.ObjectId()) },
      { ...fixture('BAD-2'), totalPaise: 99, status: 'shipped', paymentMethod: 'razorpay', supersededRazorpayOrders: [{ id: 'order_duplicate' }], razorpayPaymentId: 'pay_duplicate', shiprocketBookingStarted: true },
      { ...fixture('BAD-3'), razorpayOrderId: 42 },
    ]);
    await db.collection('coupons').insertOne({ code: 'FIXTURE', usageCount: 3 });
    await db.collection('coupon_redemptions').insertOne({ orderId: 'MISSING', couponCode: 'FIXTURE' });
    await db.collection('products').insertOne({ slug: 'bad', variants: [{ size: '250g', stockQuantity: -1 }] });
    const before = await db.collection('orders').find({}).toArray();
    const report = await auditDatabase(db);
    expect(report.indexPreflightReady).toBe(false);
    for (const type of ['duplicate_provider_order_reference', 'duplicate_payment_reference', 'invalid_provider_reference', 'incorrect_order_totals', 'unpaid_online_fulfilment', 'orphan_customer_reference', 'invalid_inventory_balance', 'coupon_usage_count_mismatch', 'booking_flag_without_intent']) expect(report.findings[type].count).toBeGreaterThan(0);
    expect(JSON.stringify(report)).not.toContain('private-fixture@example.com'); expect(report.mode).toBe('read_only');
    expect(await db.collection('orders').find({}).toArray()).toEqual(before);
    await expect(applyProviderIndexes(db, { allowWrites: true, expectedDatabase: db.databaseName })).rejects.toThrow(/Duplicate/);
    expect(await db.collection('orders').find({}).toArray()).toEqual(before);
    expect(await db.collection('orders').listIndexes().toArray()).toHaveLength(1);
  });
  it('backfills reference metadata and installs indexes only after explicit local opt-in and clean preflight', async () => {
    const db = orders.db.getClient().db('audit_clean_' + randomUUID().replace(/-/g, ''));
    await db.collection('orders').insertOne({ ...fixture('CLEAN'), razorpayOrderId: 'order_current', supersededRazorpayOrders: [{ id: 'order_old' }] });
    const before = await db.collection('orders').findOne({ id: 'CLEAN' });
    const audit = await auditDatabase(db); expect(audit.findings.reference_backfill_required.count).toBe(1);
    await expect(applyProviderIndexes(db)).rejects.toThrow(/opt-in/);
    await expect(applyProviderIndexes(db, { allowWrites: true, expectedDatabase: 'wrong' })).rejects.toThrow(/confirmation/);
    await expect(applyProviderIndexes(db, { allowWrites: true, expectedDatabase: db.databaseName, expectedBackfills: 2 })).rejects.toThrow(/count changed/);
    await expect(applyProviderIndexes(db, { allowWrites: true, expectedDatabase: db.databaseName, beforeBackfill: async () => { throw new Error('Backup unavailable'); } })).rejects.toThrow(/Backup unavailable/);
    expect(await db.collection('orders').findOne({ id: 'CLEAN' })).toEqual(before);
    const backupEntries: Array<{ recordId: string; hadReferenceCache: boolean }> = [];
    const result = await applyProviderIndexes(db, { allowWrites: true, expectedDatabase: db.databaseName, beforeBackfill: async (entry: { recordId: string; hadReferenceCache: boolean }) => { backupEntries.push(entry); } });
    expect(backupEntries).toHaveLength(1); expect(backupEntries[0]!.hadReferenceCache).toBe(false);
    expect(result.backfilled).toBe(1); expect(result.after.indexes.every((index: { ready: boolean }) => index.ready)).toBe(true);
    const after = await db.collection('orders').findOne({ id: 'CLEAN' });
    expect(after).toEqual({ ...before, razorpayOrderReferences: ['order_current', 'order_old'] });
    await expect(db.collection('orders').insertOne({ ...fixture('CONFLICT'), razorpayOrderReferences: ['order_old'] })).rejects.toMatchObject({ code: 11000 });
    expect((await applyProviderIndexes(db, { allowWrites: true, expectedDatabase: db.databaseName })).backfilled).toBe(0);
  });
});
