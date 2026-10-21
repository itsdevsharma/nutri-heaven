import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHmac, randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PaymentsService } from '../src/payments/payments.service';
import { Order, OrderDocument } from '../src/orders/order.schema';
import { OrderService } from '../src/orders/order.service';
import { Product, ProductDocument } from '../src/products/product.schema';
import { OrderRefund } from '../src/payments/refund.schema';
import { PaymentWebhookEvent } from '../src/payments/webhook-event.schema';
import { StockReservation } from '../src/inventory/stock-reservation.schema';
import { OrderOutbox } from '../src/orders/order-outbox.schema';
import { InventoryMovement } from '../src/inventory/inventory-movement.schema';

describe('Razorpay checkout (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let products: Model<ProductDocument>;
  const secret = 'test-api-secret';
  const webhookSecret = 'test-webhook-secret';
  const payments = new Map<string, any>();
  const remote = {
    orders: {
      create: jest.fn(async (options: any) => ({ id: 'order_' + options.receipt })),
      fetchPayments: jest.fn(async (id: string) => ({ items: [...payments.values()].filter(payment => payment.order_id === id) })),
    },
    payments: {
      refund: jest.fn(async (id: string, options: any) => ({ id: 'rfnd_' + id, payment_id: id, amount: options.amount, currency: 'INR', status: 'processed', receipt: options.receipt })),
      fetch: jest.fn(async (id: string) => payments.get(id)),
      capture: jest.fn(async (id: string) => { const captured = { ...payments.get(id), status: 'captured' }; payments.set(id, captured); return captured; }),
    },
  };
  const oldEnv = { id: process.env.RAZORPAY_KEY_ID, secret: process.env.RAZORPAY_KEY_SECRET, webhook: process.env.RAZORPAY_WEBHOOK_SECRET };
  beforeAll(async () => {
    // Match the inventory suite: transactions run against the local replica set,
    // using a separate disposable database for payment tests.
    process.env.MONGODB_URI = process.env.PAYMENTS_TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/nutri_heaven_payments_test?directConnection=true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_example';
    process.env.RAZORPAY_KEY_SECRET = secret;
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jest.spyOn(app.get(PaymentsService) as any, 'client').mockReturnValue(remote);
    products = app.get(getModelToken(Product.name));
    await products.deleteMany({});
    for (const model of [OrderRefund.name, PaymentWebhookEvent.name, StockReservation.name, OrderOutbox.name]) await app.get<Model<any>>(getModelToken(model)).deleteMany({});
    await app.get<Model<OrderDocument>>(getModelToken(Order.name)).deleteMany({});
    await app.get<Model<any>>(getModelToken(InventoryMovement.name)).deleteMany({});
    await products.create({ slug: 'almonds', title: 'Almonds', description: 'Fresh nuts', image: 'almonds.jpg', category: 'Nuts', pricePaise: 27500, status: 'active', isActive: true, variants: [{ size: '250g', pricePaise: 27500, stockQuantity: 100, isActive: true }] });
  });
  afterAll(async () => {
    await app?.close();
    for (const [key, value] of [['RAZORPAY_KEY_ID', oldEnv.id], ['RAZORPAY_KEY_SECRET', oldEnv.secret], ['RAZORPAY_WEBHOOK_SECRET', oldEnv.webhook]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  async function create() {
    const cartId = randomUUID();
    const payload = { cartId, idempotencyKey: randomUUID(), customerName: 'Test Customer', customerEmail: 'pay@example.com', customerPhone: '9876543210', deliveryAddress: { street: 'Test Street', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [{ productSlug: 'almonds', packSize: '250g', quantity: 1 }], paymentMethod: 'razorpay' };
    const order = (await request(app.getHttpServer()).post('/orders').send(payload).expect(201)).body;
    const payment = (await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', cartId).expect(201)).body;
    return { order, payment, cartId, payload };
  }
  function receipt(orderId: string, paymentId: string) {
    return { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex') };
  }
  async function webhook(payment: any) {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } });
    return request(app.getHttpServer()).post('/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', createHmac('sha256', webhookSecret).update(body).digest('hex')).send(body);
  }
  it('exposes availability without credentials and uses server totals with idempotent orders', async () => {
    const config = (await request(app.getHttpServer()).get('/payments/razorpay/config').expect(200)).body;
    expect(config).toEqual({ enabled: true, testMode: true });
    const { order, payment, cartId, payload } = await create();
    expect(payment.amount).toBe(35400); // ₹275 product + ₹79 shipping
    expect(payment).not.toHaveProperty('keySecret');
    expect((await request(app.getHttpServer()).post('/orders').send(payload).expect(201)).body.id).toBe(order.id);
    const callCount = remote.orders.create.mock.calls.length;
    expect((await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', cartId).expect(201)).body.razorpayOrderId).toBe(payment.razorpayOrderId);
    expect(remote.orders.create).toHaveBeenCalledTimes(callCount);
    await request(app.getHttpServer()).post('/orders').send({ ...payload, razorpayOrderId: 'order_forged' }).expect(400);
    await request(app.getHttpServer()).post('/orders').send({ ...payload, cartId: 'other' }).expect(403);
  });
  it('rejects another cart, forged signatures and mismatched payment amounts', async () => {
    const { order, payment, cartId } = await create();
    await request(app.getHttpServer()).get(`/orders/${order.id}`).set('x-cart-id', 'wrong').expect(403);
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', 'wrong').expect(403);
    const body = receipt(payment.razorpayOrderId, 'pay_invalid');
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}/verify`).set('x-cart-id', cartId).send({ ...body, razorpay_signature: '0'.repeat(64) }).expect(400);
    payments.set('pay_invalid', { id: 'pay_invalid', order_id: payment.razorpayOrderId, status: 'captured', amount: 1, currency: 'INR' });
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}/verify`).set('x-cart-id', cartId).send(body).expect(400);
    expect((await app.get(OrderService).getOrder(order.id)).paymentStatus).toBe('pending');
  });
  it('captures authorized payments and commits stock once across verification and webhook replays', async () => {
    const { order, payment, cartId } = await create();
    payments.set('pay_success', { id: 'pay_success', order_id: payment.razorpayOrderId, status: 'authorized', amount: order.totalPaise, currency: 'INR' });
    const body = receipt(payment.razorpayOrderId, 'pay_success');
    const path = `/payments/razorpay/orders/${order.id}/verify`;
    const verified = (await request(app.getHttpServer()).post(path).set('x-cart-id', cartId).send(body).expect(201)).body;
    expect(verified).toMatchObject({ paymentStatus: 'paid', status: 'confirmed', stockCommitted: true });
    await request(app.getHttpServer()).post(path).set('x-cart-id', cartId).send(body).expect(201);
    expect((await webhook(payments.get('pay_success'))).status).toBe(201);
    expect(await app.get<Model<any>>(getModelToken(InventoryMovement.name)).countDocuments({ idempotencyKey: `commit:${order.idempotencyKey}:almonds:250g` })).toBe(1);
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}/cancel`).set('x-cart-id', cartId).expect(400);
  });
  it('retains the provider order on retries and recovers captured payments without a browser callback', async () => {
    const { order, payment, cartId } = await create();
    await app.get(OrderService).failRazorpayPayment(payment.razorpayOrderId);
    const retry = (await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', cartId).expect(201)).body;
    expect(retry.razorpayOrderId).toBe(payment.razorpayOrderId);
    payments.set('pay_recover', { id: 'pay_recover', order_id: payment.razorpayOrderId, status: 'captured', amount: order.totalPaise, currency: 'INR' });
    const recovered = (await request(app.getHttpServer()).get(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', cartId).expect(200)).body;
    expect(recovered).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });
  it('releases unpaid stock on cancellation and flags late captured payments for review', async () => {
    const before = (await products.findOne({ slug: 'almonds' }).lean().exec())!.variants[0].stockQuantity;
    const { order, payment, cartId } = await create();
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}/cancel`).set('x-cart-id', 'wrong').expect(403);
    const cancelled = (await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}/cancel`).set('x-cart-id', cartId).expect(201)).body;
    expect(cancelled.status).toBe('cancelled');
    expect((await products.findOne({ slug: 'almonds' }).lean().exec())!.variants[0].stockQuantity).toBe(before);
    expect((await webhook({ id: 'pay_late', order_id: payment.razorpayOrderId, status: 'captured', amount: order.totalPaise, currency: 'INR' })).status).toBe(201);
    expect(await app.get(OrderService).getOrder(order.id)).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', paymentReconciliationRequired: true });
    await request(app.getHttpServer()).post('/payments/razorpay/webhook').set('x-razorpay-signature', 'invalid').send({}).expect(400);
  });
  it('expires abandoned reservations after reconciling provider captures', async () => {
    const abandoned = await create();
    const paid = await create();
    payments.set('pay_expiry', { id: 'pay_expiry', order_id: paid.payment.razorpayOrderId, status: 'captured', amount: paid.order.totalPaise, currency: 'INR' });
    const orders = app.get<Model<OrderDocument>>(getModelToken(Order.name));
    await orders.collection.updateMany({ id: { $in: [abandoned.order.id, paid.order.id] } }, { $set: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    await app.get(PaymentsService).expirePendingOrders();
    expect(await app.get(OrderService).getOrder(abandoned.order.id)).toMatchObject({ status: 'cancelled' });
    expect(await app.get(OrderService).getOrder(paid.order.id)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
  });

  it('refunds a captured cancelled order without charging or releasing stock twice', async () => {
    const { order, payment } = await create();
    payments.set('pay_cancel_refund', { id: 'pay_cancel_refund', order_id: payment.razorpayOrderId, status: 'captured', amount: order.totalPaise, currency: 'INR' });
    await webhook({ id: 'pay_cancel_refund', order_id: payment.razorpayOrderId, status: 'captured', amount: order.totalPaise, currency: 'INR' });
    await app.get(OrderService).cancel(order.id, 'Customer requested cancellation', 'audit');
    const before = remote.payments.refund.mock.calls.length;
    const refunded = await app.get(PaymentsService).refundOrder(order.id, 'audit');
    expect(refunded).toMatchObject({ status: 'completed', amountPaise: order.totalPaise });
    expect(await app.get(OrderService).getOrder(order.id)).toMatchObject({ paymentStatus: 'refunded', status: 'refunded', paymentReconciliationRequired: false });
    await app.get(PaymentsService).refundOrder(order.id, 'audit');
    expect(remote.payments.refund.mock.calls.length).toBe(before + 1);
  });

});
