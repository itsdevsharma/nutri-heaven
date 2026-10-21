import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { startMemoryReplica } from './helpers/memory-replica';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Admin, AdminRole } from '../src/admin/admin.schema';
import { Product } from '../src/products/product.schema';
import { Order } from '../src/orders/order.schema';
import { CustomerNotification } from '../src/engagement/engagement.schema';
import { NotificationService } from '../src/engagement/notification.service';
import { MailService } from '../src/mail/mail.module';

describe('Website completion audit', () => {
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  let customerToken: string, otherToken: string, adminToken: string;
  const password = 'test-password-1234';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  jest.setTimeout(120000);
  beforeAll(async () => {
    mongo = await startMemoryReplica();
    process.env.MONGODB_URI = mongo.uri;
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const signup = async (email: string) => (await request(app.getHttpServer()).post('/customer/auth/signup').send({ name: 'Audit Customer', email, password }).expect(201)).body.accessToken;
    customerToken = await signup('buyer@example.com'); otherToken = await signup('other@example.com');
    await app.get<Model<Admin>>(getModelToken(Admin.name)).create({ name: 'Audit Admin', email: 'admin-audit@example.com', role: AdminRole.SUPER_ADMIN, passwordHash: await hash(password, 10) });
    adminToken = (await request(app.getHttpServer()).post('/admin/auth/login').send({ email: 'admin-audit@example.com', password }).expect(201)).body.accessToken;
    await app.get<Model<Product>>(getModelToken(Product.name)).insertMany(Array.from({ length: 55 }, (_, index) => ({ slug: `audit-product-${index}`, title: `Audit product ${index}`, description: 'Fresh product for the audit', category: 'Nuts', image: 'nuts.jpg', isActive: true, status: 'active', pricePaise: 10000 + index, variants: [{ size: '250g', pricePaise: 10000 + index, stockQuantity: 10, isActive: true }] })));
    const orders = app.get<Model<Order>>(getModelToken(Order.name));
    const me = await request(app.getHttpServer()).get('/customer/me').set(auth(customerToken));
    const base = { customerId: me.body.id, cartId: 'audit-cart', customerName: '<script>buyer</script>', customerEmail: 'buyer@example.com', customerPhone: '9876543210', deliveryAddress: { street: '12 Main Street', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [{ productSlug: 'audit-product-0', productName: 'Audit product', packSize: '250g', quantity: 1, unitPricePaise: 10000, lineTotalPaise: 10000 }], subtotalPaise: 10000, totalPaise: 10000, shippingPaise: 0, paymentMethod: 'cod', paymentStatus: 'paid', stockReserved: false };
    await orders.create({ ...base, id: 'AUDIT-DELIVERED', idempotencyKey: 'audit-delivered', status: 'delivered', statusHistory: [{ status: 'delivered', at: new Date(), actor: 'fixture' }] });
    await orders.create({ ...base, id: 'AUDIT-CONFIRMED', idempotencyKey: 'audit-confirmed', status: 'confirmed', paymentStatus: 'pending' });
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); });

  it('paginates beyond 50 products with global search, sorting and validation', async () => {
    const last = await request(app.getHttpServer()).get('/products/browse?limit=24&offset=48').expect(200);
    expect(last.body.total).toBe(55); expect(last.body.items).toHaveLength(7);
    const found = await request(app.getHttpServer()).get('/products/browse?q=product%2054').expect(200);
    expect(found.body.items[0].slug).toBe('audit-product-54');
    const sorted = await request(app.getHttpServer()).get('/products/browse?sort=price_desc').expect(200);
    expect(sorted.body.items[0].pricePaise).toBe(10054);
    await request(app.getHttpServer()).get('/products/browse?sort=invalid').expect(400);
    await request(app.getHttpServer()).get('/products/browse?limit=0').expect(400);
    const literal = await request(app.getHttpServer()).get('/products/browse?q=%5B').expect(200); expect(literal.body.total).toBe(0);
  });
  it('keeps notifications private and persists read state', async () => {
    const inbox = await request(app.getHttpServer()).get('/customer/me/notifications').set(auth(customerToken)).expect(200);
    expect(inbox.body[0].title).toContain('Welcome');
    const id = inbox.body[0]._id;
    await request(app.getHttpServer()).patch(`/customer/me/notifications/${id}/read`).set(auth(otherToken)).expect(404);
    await request(app.getHttpServer()).patch(`/customer/me/notifications/${id}/read`).set(auth(customerToken)).expect(200);
    const read = await request(app.getHttpServer()).get('/customer/me/notifications').set(auth(customerToken)).expect(200);
    expect(read.body[0].readAt).toBeDefined(); expect(read.body[0].email).toBeUndefined();
  });
  it('requires newsletter consent, confirmation and token ownership', async () => {
    await request(app.getHttpServer()).post('/newsletter/subscribe').send({ email: 'newsletter@example.com', consent: false }).expect(400);
    const joined = await request(app.getHttpServer()).post('/newsletter/subscribe').send({ email: 'newsletter@example.com', consent: true }).expect(201);
    const token = joined.body.confirmationToken, unsubscribe = joined.body.unsubscribeToken;
    await request(app.getHttpServer()).post('/newsletter/confirm').send({ token: 'bad' }).expect(400);
    await request(app.getHttpServer()).post('/newsletter/confirm').send({ token }).expect(201);
    await request(app.getHttpServer()).post('/newsletter/confirm').send({ token }).expect(400);
    await request(app.getHttpServer()).post('/newsletter/unsubscribe').send({ token: unsubscribe }).expect(201);
    await request(app.getHttpServer()).get('/admin/engagement/subscribers').set(auth(customerToken)).expect(401);
    const list = await request(app.getHttpServer()).get('/admin/engagement/subscribers').set(auth(adminToken)).expect(200);
    expect(list.body[0].status).toBe('unsubscribed'); expect(JSON.stringify(list.body)).not.toMatch(/Hash|Token/);
  });
  it('allows only delivered purchasers to review and exposes only approved reviews', async () => {
    const payload = { productSlug: 'audit-product-0', rating: 5, body: 'Fresh and delicious product.' };
    await request(app.getHttpServer()).post('/customer/me/reviews').set(auth(otherToken)).send(payload).expect(400);
    const review = await request(app.getHttpServer()).post('/customer/me/reviews').set(auth(customerToken)).send(payload).expect(201);
    const pending = await request(app.getHttpServer()).get('/reviews/audit-product-0').expect(200); expect(pending.body.count).toBe(0);
    await request(app.getHttpServer()).post('/customer/me/reviews').set(auth(customerToken)).send(payload).expect(409);
    await request(app.getHttpServer()).patch(`/admin/engagement/reviews/${review.body._id}`).set(auth(adminToken)).send({ status: 'approved' }).expect(200);
    const approved = await request(app.getHttpServer()).get('/reviews/audit-product-0').expect(200); expect(approved.body.count).toBe(1); expect(approved.body.average).toBe(5); expect(approved.body.items[0].customerId).toBeUndefined();
  });
  it('enforces ownership on addresses, orders, cancellation and receipts', async () => {
    const address = { label: 'Home', name: 'Customer', phone: '9876543210', street: '12 Main Street', city: 'Hisar', state: 'Haryana', pin: '125001' };
    const added = await request(app.getHttpServer()).post('/customer/me/addresses').set(auth(customerToken)).send(address).expect(201);
    const id = added.body[0].id;
    await request(app.getHttpServer()).patch(`/customer/me/addresses/${id}/default`).set(auth(otherToken)).expect(404);
    await request(app.getHttpServer()).patch(`/customer/me/addresses/${id}`).set(auth(customerToken)).send({ ...address, city: 'Delhi' }).expect(200);
    await request(app.getHttpServer()).get('/customer/me/orders/AUDIT-DELIVERED/receipt').set(auth(otherToken)).expect(404);
    const receipt = await request(app.getHttpServer()).get('/customer/me/orders/AUDIT-DELIVERED/receipt').set(auth(customerToken)).expect(200);
    expect(receipt.text).toContain('&lt;script&gt;buyer'); expect(receipt.text).not.toContain('<script>buyer');
    await request(app.getHttpServer()).post('/customer/me/orders/AUDIT-CONFIRMED/cancel').set(auth(otherToken)).send({ reason: 'Changed my mind' }).expect(404);
    await request(app.getHttpServer()).post('/customer/me/orders/AUDIT-CONFIRMED/cancel').set(auth(customerToken)).send({ reason: 'Changed my mind' }).expect(201);
    await request(app.getHttpServer()).post('/customer/me/orders/AUDIT-DELIVERED/cancel').set(auth(customerToken)).send({ reason: 'Changed my mind' }).expect(400);
    await request(app.getHttpServer()).post('/customer/me/orders/AUDIT-DELIVERED/return').set(auth(customerToken)).send({ reason: 'Package damaged' }).expect(201);
  });
  it('provides accurate reporting definitions and protects reports', async () => {
    await request(app.getHttpServer()).get('/admin/engagement/report').expect(401);
    const result = await request(app.getHttpServer()).get('/admin/engagement/report').set(auth(adminToken)).expect(200);
    expect(result.body.customers).toBe(2); expect(result.body.orders).toBe(2); expect(result.body.revenuePaise).toBe(10000); expect(result.body.topProducts[0].units).toBe(1);
  });
  it('keeps queued emails retryable when delivery fails', async () => {
    const mail = app.get(MailService);
    const configured = jest.spyOn(mail, 'configured', 'get').mockReturnValue(true);
    const send = jest.spyOn(mail, 'send').mockRejectedValue(new Error('provider unavailable'));
    await app.get(NotificationService).deliver();
    const model = app.get<Model<CustomerNotification>>(getModelToken(CustomerNotification.name));
    const pending = await model.findOne({ emailRequested: true, attempts: 1 }); expect(pending?.sentAt).toBeUndefined();
    send.mockResolvedValue(true);
    await model.updateMany({ sentAt: { $exists: false } }, { $set: { retryAt: new Date(0) } });
    await app.get(NotificationService).deliver(); expect(await model.countDocuments({ sentAt: { $exists: true } })).toBeGreaterThan(0);
    send.mockRestore(); configured.mockRestore();
  });
  it('consumes password reset links atomically and revokes previous sessions', async () => {
    const forgot = await request(app.getHttpServer()).post('/customer/auth/forgot-password').send({ email: 'buyer@example.com' }).expect(201);
    const responses = await Promise.all([1,2].map(() => request(app.getHttpServer()).post('/customer/auth/reset-password').send({ token: forgot.body.resetToken, password: 'replacement-password-123' })));
    expect(responses.map(r => r.status).sort()).toEqual([201,400]);
    await request(app.getHttpServer()).get('/customer/me').set(auth(customerToken)).expect(401);
  });
});
