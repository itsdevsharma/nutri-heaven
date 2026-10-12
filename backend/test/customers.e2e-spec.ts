import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { Admin, AdminDocument, AdminRole } from '../src/admin/admin.schema';
import { AuditEvent, AuditEventDocument } from '../src/audit/audit-event.schema';
import { AppModule } from '../src/app.module';

describe('Customer accounts (e2e)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let token = '';
  let rootToken = '';
  let supportToken = '';
  let catalogueToken = '';
  let customerId = '';
  const customer = { name: 'Asha Sharma', email: 'asha@example.com', password: 'safe-password-123' };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('nutri_customer_test');
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const admins = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    const passwordHash = await hash('admin-password-1234', 10);
    for (const role of [AdminRole.SUPER_ADMIN, AdminRole.SUPPORT, AdminRole.CATALOGUE_MANAGER]) {
      await admins.create({ name: role, email: `${role}@example.com`, role, passwordHash });
      const result = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: `${role}@example.com`, password: 'admin-password-1234' }).expect(201);
      if (role === AdminRole.SUPER_ADMIN) rootToken = result.body.accessToken;
      if (role === AdminRole.SUPPORT) supportToken = result.body.accessToken;
      if (role === AdminRole.CATALOGUE_MANAGER) catalogueToken = result.body.accessToken;
    }
  });
  afterAll(async () => { await app.close(); await mongo.stop(); });
  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('registers, rejects a duplicate account, and authenticates the customer', async () => {
    const created = await request(app.getHttpServer()).post('/customer/auth/signup').send(customer).expect(201);
    token = created.body.accessToken;
    customerId = created.body.customer.id;
    expect(created.body.customer).toMatchObject({ name: customer.name, email: customer.email });
    expect(created.body.customer.passwordHash).toBeUndefined();
    await request(app.getHttpServer()).post('/customer/auth/signup').send(customer).expect(409);
    await request(app.getHttpServer()).post('/customer/auth/login').send({ email: customer.email, password: 'incorrect-password' }).expect(401);
    await request(app.getHttpServer()).post('/customer/auth/login').send({ email: customer.email, password: customer.password }).expect(201);
  });

  it('protects profile data and persists an address', async () => {
    await request(app.getHttpServer()).get('/customer/me').expect(401);
    await request(app.getHttpServer()).patch('/customer/me').set(auth()).send({ phone: '9876543210' }).expect(200);
    const addresses = await request(app.getHttpServer()).post('/customer/me/addresses').set(auth()).send({ label: 'Home', name: customer.name, phone: '9876543210', street: '12 Market Road', city: 'Hisar', state: 'Haryana', pin: '125001' }).expect(201);
    expect(addresses.body[0]).toMatchObject({ label: 'Home', isDefault: true });
    const me = await request(app.getHttpServer()).get('/customer/me').set(auth()).expect(200);
    expect(me.body).toMatchObject({ phone: '9876543210' });
    expect(me.body.addresses).toHaveLength(1);
  });

  it('uses an expiring, one-time password reset token', async () => {
    const response = await request(app.getHttpServer()).post('/customer/auth/forgot-password').send({ email: customer.email }).expect(201);
    expect(response.body.message).toContain('If an account exists');
    const resetToken = response.body.resetToken;
    expect(resetToken).toBeDefined();
    const reset = await request(app.getHttpServer()).post('/customer/auth/reset-password').send({ token: resetToken, password: 'new-safe-password-123' }).expect(201);
    expect(reset.body.accessToken).toBeDefined();
    await request(app.getHttpServer()).post('/customer/auth/reset-password').send({ token: resetToken, password: 'another-safe-password' }).expect(400);
    await request(app.getHttpServer()).post('/customer/auth/login').send({ email: customer.email, password: 'new-safe-password-123' }).expect(201);
  });
  it('lists and edits customers with permission checks and validated filters', async () => {
    const root = { Authorization: `Bearer ${rootToken}` };
    const support = { Authorization: `Bearer ${supportToken}` };
    await request(app.getHttpServer()).get('/customer/admin').expect(401);
    await request(app.getHttpServer()).get('/customer/admin').set({ Authorization: `Bearer ${catalogueToken}` }).expect(403);
    const list = await request(app.getHttpServer()).get('/customer/admin?q=asha&status=active&limit=1').set(support).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ id: customerId, isActive: true, orders: 0, totalSpendingPaise: 0 });
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|passwordResetHash|authVersion/);
    for (const query of ['limit=0', 'offset=-1', 'limit=101', 'status=invalid']) {
      await request(app.getHttpServer()).get(`/customer/admin?${query}`).set(root).expect(400);
    }
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}`).set(support).send({ name: 'Asha Updated', phone: '9123456780' }).expect(200);
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}`).set(support).send({ phone: '123' }).expect(400);
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}`).set(support).send({ email: 'changed@example.com' }).expect(400);
    const detail = await request(app.getHttpServer()).get(`/customer/admin/${customerId}`).set(root).expect(200);
    expect(detail.body.name).toBe('Asha Updated');
    expect(detail.body.addresses).toHaveLength(1);
    expect(detail.body.orders).toEqual([]);
    await request(app.getHttpServer()).get('/customer/admin/bad-id').set(root).expect(400);
    await request(app.getHttpServer()).get('/customer/admin/000000000000000000000000').set(root).expect(404);
  });

  it('blocks disabled customer sessions and keeps them revoked after reactivation', async () => {
    const root = { Authorization: `Bearer ${rootToken}` };
    const login = await request(app.getHttpServer()).post('/customer/auth/login').send({ email: customer.email, password: 'new-safe-password-123' }).expect(201);
    const oldSession = { Authorization: `Bearer ${login.body.accessToken}` };
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}/status`).set({ Authorization: `Bearer ${supportToken}` }).send({ isActive: false }).expect(403);
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}/status`).set(root).send({ isActive: 'false' }).expect(400);
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}/status`).set(root).send({ isActive: false }).expect(200);
    for (const path of ['/customer/me', '/customer/me/addresses', '/customer/me/orders', '/customer/me/wishlist']) {
      await request(app.getHttpServer()).get(path).set(oldSession).expect(401);
    }
    await request(app.getHttpServer()).post('/customer/auth/login').send({ email: customer.email, password: 'new-safe-password-123' }).expect(401);
    const inactive = await request(app.getHttpServer()).get(`/customer/admin/${customerId}`).set(root).expect(200);
    expect(inactive.body.isActive).toBe(false);
    expect(inactive.body.addresses).toHaveLength(1);
    const list = await request(app.getHttpServer()).get('/customer/admin?status=inactive').set(root).expect(200);
    expect(list.body.total).toBe(1);
    await request(app.getHttpServer()).patch(`/customer/admin/${customerId}/status`).set(root).send({ isActive: true }).expect(200);
    await request(app.getHttpServer()).get('/customer/me').set(oldSession).expect(401);
    const fresh = await request(app.getHttpServer()).post('/customer/auth/login').send({ email: customer.email, password: 'new-safe-password-123' }).expect(201);
    await request(app.getHttpServer()).get('/customer/me').set({ Authorization: `Bearer ${fresh.body.accessToken}` }).expect(200);
    const events = await app.get<Model<AuditEventDocument>>(getModelToken(AuditEvent.name)).find({ entityType: 'customer', entityId: customerId }).lean();
    expect(events.map(event => event.action)).toEqual(expect.arrayContaining(['customer.update', 'customer.deactivate', 'customer.activate']));
    expect(JSON.stringify(events)).not.toMatch(/passwordHash|passwordResetHash/);
  });

});
