import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { AdminAuthGuard } from '../src/auth/admin-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

describe('Standard Checkout HTTP contract (isolated provider and database)', () => {
  let app: INestApplication;
  let service: PaymentsService;
  const secret = 'contract-test-secret';
  const order = {
    id: 'NHcontract', cartId: 'cart-test', paymentMethod: 'razorpay',
    status: 'pending', paymentStatus: 'pending', stockReserved: true,
    totalPaise: 100, razorpayOrderId: undefined as string | undefined,
  };
  const orders = {
    getOrder: jest.fn(async () => ({ ...order })),
    validatePaymentCheckout: jest.fn(),
    claimPaymentCreation: jest.fn(async () => true),
    attachRazorpayOrder: jest.fn(async (_id: string, remoteId: string) => {
      order.razorpayOrderId = remoteId;
      return { ...order };
    }),
    captureRazorpayPayment: jest.fn(async () => { order.paymentStatus = 'paid'; }),
  };
  const remote = {
    orders: { create: jest.fn(), all: jest.fn() },
    payments: { fetch: jest.fn() },
  };
  const originalEnv = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET };
  const path = '/payments/razorpay/orders/NHcontract';
  const signed = () => ({
    razorpay_order_id: 'order_contract', razorpay_payment_id: 'pay_contract',
    razorpay_signature: createHmac('sha256', secret).update('order_contract|pay_contract').digest('hex'),
  });

  beforeAll(async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_contract';
    process.env.RAZORPAY_KEY_SECRET = secret;
    service = new PaymentsService(orders as any, {} as any, {} as any);
    // Keep background reconciliation out of this isolated HTTP contract test.
    jest.spyOn(service, 'onModuleInit').mockImplementation(() => {});
    jest.spyOn(service as any, 'client').mockReturnValue(remote);
    const module = await Test.createTestingModule({
      controllers: [PaymentsController], providers: [{ provide: PaymentsService, useValue: service }],
    }).overrideGuard(AdminAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(order, { totalPaise: 100, razorpayOrderId: undefined, paymentStatus: 'pending' });
    remote.orders.create.mockResolvedValue({ id: 'order_contract' });
    remote.payments.fetch.mockResolvedValue({ id: 'pay_contract', order_id: 'order_contract', amount: 100, currency: 'INR', status: 'captured' });
  });
  afterAll(async () => {
    await app?.close();
    for (const [key, value] of [['RAZORPAY_KEY_ID', originalEnv.id], ['RAZORPAY_KEY_SECRET', originalEnv.secret]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('creates the minimum payment using server totals and returns only the public key', async () => {
    const { body } = await request(app.getHttpServer()).post(path).set('x-cart-id', 'cart-test').expect(201);
    expect(remote.orders.create).toHaveBeenCalledWith({ amount: 100, currency: 'INR', receipt: order.id, notes: { orderId: order.id } });
    expect(body).toMatchObject({ keyId: 'rzp_test_contract', razorpayOrderId: 'order_contract', amount: 100, currency: 'INR' });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
  it.each([0, 99, 100.5])('rejects invalid server amount %s before calling Razorpay', async total => {
    order.totalPaise = total;
    await request(app.getHttpServer()).post(path).set('x-cart-id', 'cart-test').expect(400);
    expect(remote.orders.create).not.toHaveBeenCalled();
  });
  it.each([[401, 401], [500, 500]])('maps provider status %s to HTTP %s without leaking details', async (providerStatus, status) => {
    remote.orders.create.mockRejectedValueOnce({ statusCode: providerStatus, error: { description: secret } });
    const { body } = await request(app.getHttpServer()).post(path).set('x-cart-id', 'cart-test').expect(status);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(orders.captureRazorpayPayment).not.toHaveBeenCalled();
  });
  it('rejects missing verification fields with HTTP 400', async () => {
    for (const field of Object.keys(signed())) {
      const body: Record<string, string> = signed();
      delete body[field];
      await request(app.getHttpServer()).post(`${path}/verify`).set('x-cart-id', 'cart-test').send(body).expect(400);
    }
    expect(remote.payments.fetch).not.toHaveBeenCalled();
  });
  it('rejects forged signatures without marking an order paid', async () => {
    order.razorpayOrderId = 'order_contract';
    await request(app.getHttpServer()).post(`${path}/verify`).set('x-cart-id', 'cart-test')
      .send({ ...signed(), razorpay_signature: '0'.repeat(64) }).expect(400);
    expect(orders.captureRazorpayPayment).not.toHaveBeenCalled();
    expect(remote.payments.fetch).not.toHaveBeenCalled();
  });
  it('confirms a signed captured payment after checking the provider amount and order', async () => {
    order.razorpayOrderId = 'order_contract';
    const { body } = await request(app.getHttpServer()).post(`${path}/verify`).set('x-cart-id', 'cart-test').send(signed()).expect(201);
    expect(orders.captureRazorpayPayment).toHaveBeenCalledWith('order_contract', 'pay_contract', 100, 'INR');
    expect(body.paymentStatus).toBe('paid');
  });
});
