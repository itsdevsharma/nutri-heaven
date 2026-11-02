import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Admin, AdminRole } from '../src/admin/admin.schema';
import { Customer } from '../src/customers/customer.schema';
import { CustomerNotification } from '../src/engagement/engagement.schema';
import { NotificationService } from '../src/engagement/notification.service';
import { MailService } from '../src/mail/mail.module';
import { startMemoryReplica } from './helpers/memory-replica';

describe('Failed notification recovery', () => {
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  let notifications: Model<CustomerNotification>, customers: Model<Customer>, root: string, support: string;
  const mail = { configured: true, url: (path: string) => `https://shop.example.com${path}`, send: jest.fn().mockResolvedValue(true) };
  const base = '/admin/engagement/emails';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const failed = (eventKey: string, extra = {}) => notifications.create({ email: 'guest@example.com', title: 'Order update', message: 'Your order is confirmed.', eventKey, emailRequested: true, attempts: 5, ...extra });
  beforeAll(async () => {
    mongo = await startMemoryReplica(); process.env.MONGODB_URI = mongo.uri;
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailService).useValue(mail).compile();
    app = fixture.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    notifications = app.get(getModelToken(CustomerNotification.name)); customers = app.get(getModelToken(Customer.name));
    const admins = app.get<Model<Admin>>(getModelToken(Admin.name));
    for (const role of [AdminRole.SUPER_ADMIN, AdminRole.SUPPORT]) {
      await admins.create({ name: role, email: `${role}@example.com`, role, passwordHash: await hash('test-password-1234', 10) });
      const login = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: `${role}@example.com`, password: 'test-password-1234' }).expect(201);
      if (role === AdminRole.SUPER_ADMIN) root = login.body.accessToken; else support = login.body.accessToken;
    }
  });
  afterAll(async () => { await app.close(); await mongo.stop(); });
  beforeEach(async () => { await notifications.deleteMany({}); mail.configured = true; mail.send.mockReset().mockResolvedValue(true); });
  it('restricts recovery to super admins and rejects invalid IDs', async () => {
    await request(app.getHttpServer()).get(`${base}/failed`).expect(401);
    await request(app.getHttpServer()).get(`${base}/failed`).set(auth(support)).expect(403);
    await request(app.getHttpServer()).post(`${base}/bad-id/retry`).set(auth(root)).expect(404);
    const item = await failed('restricted');
    await request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(support)).expect(403);
  });
  it('uses the corrected account email and changes the provider key for the corrected payload', async () => {
    const customer = await customers.create({ name: 'Buyer', email: 'corrected@example.com', passwordHash: 'unused-test-fixture', isActive: true });
    const item = await failed('corrected', { customerId: customer.id, email: 'typo@example.com', deliveryError: 'Previous failure' });
    const list = await request(app.getHttpServer()).get(`${base}/failed`).set(auth(root)).expect(200);
    expect(list.body[0]).toMatchObject({ recipient: customer.email, email: 'typo@example.com', canRetry: true });
    await request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(root)).expect(201);
    await request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(root)).expect(409);
    await app.get(NotificationService).deliver();
    expect(mail.send).toHaveBeenCalledWith(customer.email, item.title, expect.any(String), `notification-${item.id}-v1`);
    const saved = await notifications.findById(item.id).lean();
    expect(saved?.sentAt).toBeInstanceOf(Date); expect(saved?.deliveryError).toBeUndefined(); expect(saved?.attempts).toBe(1);
    await request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(root)).expect(409);
    const audit = await app.get(getModelToken('AuditEvent')).findOne({ action: 'notification.retry', entityId: item.id }).lean();
    expect(audit.after.email).toBe(customer.email);
  });
  it('queues a guest email once under concurrent retries and preserves its idempotency key', async () => {
    const item = await failed('guest');
    const results = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(root))));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    await app.get(NotificationService).deliver(); await app.get(NotificationService).deliver();
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][3]).toBe(`notification-${item.id}`);
  });
  it('sends future updates for older orders to the current linked account email', async () => {
    const customer = await customers.create({ name: 'Updated buyer', email: 'current@example.com', passwordHash: 'unused-test-fixture', isActive: true });
    const item = await failed('older-order-new-update', { customerId: customer.id, email: 'old-typo@example.com', attempts: 0 });
    await app.get(NotificationService).deliver();
    expect(mail.send).toHaveBeenCalledWith(customer.email, item.title, expect.any(String), `notification-${item.id}-v1`);
    expect((await notifications.findById(item.id).lean())?.sentAt).toBeInstanceOf(Date);
  });
  it('does not retry an inactive account or steal a live processing lease', async () => {
    const customer = await customers.create({ name: 'Disabled', email: 'disabled@example.com', passwordHash: 'unused-test-fixture', isActive: false });
    const inactive = await failed('inactive', { customerId: customer.id });
    const leased = await failed('leased', { retryAt: new Date(Date.now() + 300000) });
    for (const item of [inactive, leased]) await request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(root)).expect(409);
    const list = await request(app.getHttpServer()).get(`${base}/failed`).set(auth(root)).expect(200);
    expect(list.body.every((item: { canRetry: boolean }) => !item.canRetry)).toBe(true);
  });
  it('blocks recovery without sender configuration', async () => {
    const item = await failed('unconfigured'); mail.configured = false;
    await request(app.getHttpServer()).post(`${base}/${item.id}/retry`).set(auth(root)).expect(503);
    await app.get(NotificationService).deliver(); expect(mail.send).not.toHaveBeenCalled();
  });
  it('does not mark an unaccepted send as sent and recovers a transient provider failure', async () => {
    const item = await failed('unaccepted', { attempts: 0 });
    mail.send.mockResolvedValueOnce(false);
    await app.get(NotificationService).deliver();
    expect((await notifications.findById(item.id).lean())?.sentAt).toBeUndefined();
    expect((await notifications.findById(item.id).lean())?.deliveryError).toBeTruthy();
    await notifications.updateOne({ _id: item.id }, { $set: { retryAt: new Date(0) } });
    await app.get(NotificationService).deliver();
    expect((await notifications.findById(item.id).lean())?.sentAt).toBeInstanceOf(Date);
    expect(mail.send.mock.calls[0][3]).toBe(mail.send.mock.calls[1][3]);
  });
});
