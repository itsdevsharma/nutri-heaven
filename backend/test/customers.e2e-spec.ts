import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Customer accounts (e2e)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let token = '';
  const customer = { name: 'Asha Sharma', email: 'asha@example.com', password: 'safe-password-123' };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('nutri_customer_test');
    const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); await mongo.stop(); });
  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('registers, rejects a duplicate account, and authenticates the customer', async () => {
    const created = await request(app.getHttpServer()).post('/customer/auth/signup').send(customer).expect(201);
    token = created.body.accessToken;
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
});
