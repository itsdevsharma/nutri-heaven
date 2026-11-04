import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, createHmac } from 'crypto';
import request from 'supertest';
import { startMemoryReplica } from './helpers/memory-replica';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.schema';
import { Admin } from '../src/admin/admin.schema';
import { OrderService } from '../src/orders/order.service';
import { StockReservation } from '../src/inventory/stock-reservation.schema';
import { NotificationService } from '../src/engagement/notification.service';
import { OrderOutbox } from '../src/orders/order-outbox.schema';
import { Order } from '../src/orders/order.schema';
import { Customer } from '../src/customers/customer.schema';
import { orderReceipt } from '../src/orders/order-receipt';
import type { OrderAction } from '../src/orders/order-workflow';
import { PaymentsService } from '../src/payments/payments.service';
import { RefundsService } from '../src/payments/refunds.service';
import { OrderRefund } from '../src/payments/refund.schema';
import { PaymentWebhookEvent } from '../src/payments/webhook-event.schema';

describe('Order workflow safety with actual MongoDB transactions', () => {
  jest.setTimeout(120000);
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  let orders: OrderService, payments: PaymentsService, refunds: RefundsService;
  let adminToken: string, supportToken: string;
  const remotePayments = new Map<string, any>(), remoteRefunds = new Map<string, any>();
  const remote = {
    orders: { create: jest.fn(async (options: any) => ({ id: 'rzp_' + options.receipt })), fetchPayments: jest.fn(async (id: string) => ({ items: [...remotePayments.values()].filter(item => item.order_id === id) })) },
    payments: {
      fetch: jest.fn(async (id: string) => remotePayments.get(id)),
      refund: jest.fn(async (id: string, options: any) => { const value = { id: 'rfnd_' + options.receipt, payment_id: id, amount: options.amount, status: 'pending', currency: 'INR', receipt: options.receipt, notes: options.notes }; remoteRefunds.set(value.id, value); return value; }),
      fetchRefund: jest.fn(async (_paymentId: string, refundId: string) => remoteRefunds.get(refundId)),
      fetchMultipleRefund: jest.fn(async (id: string) => ({ items: [...remoteRefunds.values()].filter(item => item.payment_id === id) })),
    },
  };
  const originalEnv = { ...process.env };
  beforeAll(async () => {
    mongo = await startMemoryReplica(); process.env.MONGODB_URI = mongo.uri;
    process.env.ORDER_RETURN_WINDOW_DAYS = '7';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_workflow'; process.env.RAZORPAY_KEY_SECRET = 'test-secret'; process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    orders = app.get(OrderService); payments = app.get(PaymentsService); refunds = app.get(RefundsService);
    jest.spyOn(payments as any, 'client').mockReturnValue(remote);
    await app.get<Model<Product>>(getModelToken(Product.name)).create({ slug: 'nuts', title: 'Nuts', description: 'Fresh nuts', category: 'Nuts', image: 'nuts.jpg', isActive: true, status: 'active', pricePaise: 10000, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 100, isActive: true }] });
    for (const role of ['super_admin', 'support']) {
      const admin = await app.get<Model<Admin>>(getModelToken(Admin.name)).create({ name: role, email: `${role}@example.com`, passwordHash: 'unused', role });
      const token = await app.get(JwtService).signAsync({ sub: String(admin._id), email: admin.email, role, version: 0 });
      if (role === 'super_admin') adminToken = token; else supportToken = token;
    }
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); process.env = originalEnv; });
  async function create(method: 'cod' | 'razorpay' = 'cod', quantity = 1) {
    return orders.createOrder({ cartId: randomUUID(), idempotencyKey: randomUUID(), customerName: 'Buyer', customerEmail: 'buyer@example.com', customerPhone: '9876543210', deliveryAddress: { street: 'Test', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [{ productSlug: 'nuts', packSize: '250g', quantity }], paymentMethod: method });
  }
  async function paid() {
    const order = await create('razorpay');
    await orders.attachRazorpayOrder(order.id, 'rzp_' + order.id);
    const payment = { id: 'pay_' + order.id, order_id: 'rzp_' + order.id, amount: order.totalPaise, currency: 'INR', status: 'captured' }; remotePayments.set(payment.id, payment);
    await orders.captureRazorpayPayment(payment.order_id, payment.id, payment.amount, payment.currency);
    return orders.getOrder(order.id);
  }
  const action = (id: string, next: OrderAction, details: Record<string, unknown> = {}) => orders.performAction(id, next, { idempotencyKey: randomUUID(), reason: 'Verified by operator', courier: 'Manual courier', trackingNumber: 'TRACK1', reference: randomUUID(), ...details }, 'operator@example.com', 'super_admin');
  async function deliver(order: Order) { for (const step of ['accept', 'pick', 'pack', 'ready', 'dispatch', 'out_for_delivery', 'deliver'] as const) await action(order.id, step); return orders.getOrder(order.id); }
  const stock = async () => (await app.get<Model<Product>>(getModelToken(Product.name)).findOne({ slug: 'nuts' }).lean().exec())!.variants[0]!.stockQuantity;

  it('overrides one order total, keeps its price breakdown and audits retries', async () => {
    const order = await create(); const other = await create();
    const payload = { totalPaise: order.totalPaise - 1234, expectedTotalPaise: order.totalPaise, reason: 'Agreed customer discount', idempotencyKey: randomUUID() };
    const endpoint = `/orders/admin/${order.id}/amount`;
    await request(app.getHttpServer()).patch(endpoint).send(payload).expect(401);
    await request(app.getHttpServer()).patch(endpoint).auth(supportToken, { type: 'bearer' }).send(payload).expect(403);
    for (const invalid of [0, -1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1]) {
      await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send({ ...payload, totalPaise: invalid }).expect(400);
    }
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send({ ...payload, reason: '   ' }).expect(400);
    const beforeStock = await stock();
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send(payload).expect(200);
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send(payload).expect(200);
    const updated = await orders.getOrder(order.id);
    expect(updated).toMatchObject({ totalPaise: payload.totalPaise, amountAdjustmentPaise: -1234, subtotalPaise: order.subtotalPaise, shippingPaise: order.shippingPaise });
    expect(updated.lines).toEqual(order.lines);
    expect(orderReceipt(updated)).toContain('Order adjustment: INR -12.34');
    expect(orderReceipt(updated)).toContain(`Total: INR ${(payload.totalPaise / 100).toFixed(2)}`);
    const history = updated.activity.filter(item => item.action === 'override_amount');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ actor: 'super_admin@example.com', reason: payload.reason, before: { totalPaise: order.totalPaise }, after: { totalPaise: payload.totalPaise } });
    expect((await orders.getOrder(other.id)).totalPaise).toBe(other.totalPaise);
    expect(await stock()).toBe(beforeStock);
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send({ ...payload, totalPaise: 200 }).expect(409);
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send({ ...payload, idempotencyKey: randomUUID(), totalPaise: 200 }).expect(409);
    const next = await orders.overrideAmount(order.id, { ...payload, idempotencyKey: randomUUID(), expectedTotalPaise: payload.totalPaise, totalPaise: order.totalPaise + 500 }, 'admin');
    expect(next.amountAdjustmentPaise).toBe(500);
  });
  it('allows only one concurrent amount change from the same original total', async () => {
    const order = await create();
    const results = await Promise.allSettled([1000, 2000].map(totalPaise => orders.overrideAmount(order.id, { totalPaise, expectedTotalPaise: order.totalPaise, reason: 'Concurrent amount correction', idempotencyKey: randomUUID() }, 'admin')));
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect((await orders.getOrder(order.id)).activity.filter(item => item.action === 'override_amount')).toHaveLength(1);
  });
  it('protects booked, dispatched, paid, cancelled and provider-linked order amounts', async () => {
    const model = app.get<Model<Order>>(getModelToken(Order.name));
    for (const update of [
      { shiprocketBookingStarted: true }, { trackingNumber: 'MANUAL' }, { status: 'shipped' },
      { paymentStatus: 'paid' }, { status: 'cancelled' }, { paymentReconciliationRequired: true },
      { razorpayOrderId: 'provider-order' }, { paymentCreationStartedAt: new Date() },
      { refundReservedPaise: 10 }, { refundedPaise: 10 },
    ]) {
      const order = await create(); await model.updateOne({ id: order.id }, { $set: update });
      await expect(orders.overrideAmount(order.id, { totalPaise: 1000, expectedTotalPaise: order.totalPaise, reason: 'Invalid correction', idempotencyKey: randomUUID() }, 'admin')).rejects.toThrow();
      expect((await orders.getOrder(order.id)).totalPaise).toBe(order.totalPaise);
    }
  });
  it('replaces an unpaid provider checkout and charges the revised total exactly once', async () => {
    const order = await create('razorpay');
    const original = await payments.createRazorpayOrder(order.id, order.cartId);
    const payload = { totalPaise: order.totalPaise - 1234, expectedTotalPaise: order.totalPaise, reason: 'Agreed final total', idempotencyKey: randomUUID() };
    const endpoint = `/orders/admin/${order.id}/amount`;
    const beforeStock = await stock();
    const read = await request(app.getHttpServer()).get(`/orders/admin/${order.id}`).auth(adminToken, { type: 'bearer' }).expect(200);
    expect(read.body.amountOverrideBlockedReason).toBeNull();
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send(payload).expect(200);
    await request(app.getHttpServer()).patch(endpoint).auth(adminToken, { type: 'bearer' }).send(payload).expect(200);
    let updated = await orders.getOrder(order.id);
    expect(updated.razorpayOrderId).toBeUndefined();
    expect(updated.paymentCreationStartedAt).toBeUndefined();
    expect(updated.supersededRazorpayOrders).toMatchObject([{ id: original.razorpayOrderId, amountPaise: order.totalPaise }]);
    expect(updated.paymentRevision).toBe(1);
    expect(updated.activity.filter(item => item.action === 'override_amount')).toHaveLength(1);
    const notice = await app.get<Model<OrderOutbox>>(getModelToken(OrderOutbox.name)).findOne({ orderId: order.id, title: /override amount/ }).lean().exec();
    expect(notice?.message).toContain((payload.totalPaise / 100).toFixed(2));
    const revised = await payments.createRazorpayOrder(order.id, order.cartId);
    expect(revised).toMatchObject({ amount: payload.totalPaise, razorpayOrderId: 'rzp_' + order.id + '-r1' });
    expect(revised.razorpayOrderId).not.toBe(original.razorpayOrderId);
    expect(await payments.createRazorpayOrder(order.id, order.cartId)).toEqual(revised);
    await orders.failRazorpayPayment(original.razorpayOrderId!);
    expect((await orders.getOrder(order.id)).paymentStatus).toBe('pending');
    expect(await stock()).toBe(beforeStock);
    await orders.captureRazorpayPayment(revised.razorpayOrderId!, 'pay_revised_' + order.id, revised.amount, 'INR');
    updated = await orders.getOrder(order.id);
    expect(updated).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', totalPaise: payload.totalPaise, capturedAmountPaise: payload.totalPaise, paymentReconciliationRequired: false });
    await expect(payments.overrideOrderAmount(order.id, { ...payload, idempotencyKey: randomUUID() }, 'admin')).rejects.toThrow(/already been recorded/);
  });
  it('blocks captured, in-flight and uncertain provider payments before changing the total', async () => {
    for (const status of ['created', 'authorized', 'captured']) {
      const order = await create('razorpay');
      const checkout = await payments.createRazorpayOrder(order.id, order.cartId);
      remotePayments.set('pay_guard_' + order.id, { id: 'pay_guard_' + order.id, order_id: checkout.razorpayOrderId, amount: order.totalPaise, currency: 'INR', status });
      await request(app.getHttpServer()).patch(`/orders/admin/${order.id}/amount`).auth(adminToken, { type: 'bearer' }).send({ totalPaise: 9000, expectedTotalPaise: order.totalPaise, reason: 'Price correction', idempotencyKey: randomUUID() }).expect(409);
      const updated = await orders.getOrder(order.id);
      expect(updated.totalPaise).toBe(order.totalPaise);
      expect(updated.razorpayOrderId).toBe(checkout.razorpayOrderId);
      if (status === 'captured') expect(updated.paymentStatus).toBe('paid');
    }
    const order = await create('razorpay');
    const checkout = await payments.createRazorpayOrder(order.id, order.cartId);
    remote.orders.fetchPayments.mockRejectedValueOnce(new Error('Provider offline'));
    await expect(payments.overrideOrderAmount(order.id, { totalPaise: 9000, expectedTotalPaise: order.totalPaise, reason: 'Price correction', idempotencyKey: randomUUID() }, 'admin')).rejects.toThrow();
    expect((await orders.getOrder(order.id)).razorpayOrderId).toBe(checkout.razorpayOrderId);
    expect((await orders.getOrder(order.id)).totalPaise).toBe(order.totalPaise);
  });
  it('records a delayed old-checkout capture without fulfillment and refunds its actual captured amount', async () => {
    const order = await create('razorpay');
    const original = await payments.createRazorpayOrder(order.id, order.cartId);
    await payments.overrideOrderAmount(order.id, { totalPaise: 9999, expectedTotalPaise: order.totalPaise, reason: 'Agreed revised total', idempotencyKey: randomUUID() }, 'admin');
    const payment = { id: 'pay_old_' + order.id, order_id: original.razorpayOrderId, amount: order.totalPaise, currency: 'INR', status: 'captured' };
    remotePayments.set(payment.id, payment);
    const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } }));
    const signature = createHmac('sha256', 'test-webhook').update(body).digest('hex');
    await payments.handleWebhook(body, signature, 'old_' + order.id);
    await payments.handleWebhook(body, signature, 'old_' + order.id);
    let updated = await orders.getOrder(order.id);
    expect(updated).toMatchObject({ totalPaise: 9999, capturedAmountPaise: order.totalPaise, paymentStatus: 'paid', paymentReconciliationRequired: true, status: 'pending', stockCommitted: false });
    expect(updated.activity.filter(item => item.action === 'superseded_payment_captured')).toHaveLength(1);
    await expect(payments.createRazorpayOrder(order.id, order.cartId)).rejects.toThrow();
    await expect(action(order.id, 'accept')).rejects.toThrow();
    await orders.cancel(order.id, 'Old checkout payment needs full refund', 'admin');
    const refund = await payments.refundOrder(order.id, 'admin', 'Refund old checkout payment');
    expect(refund).toMatchObject({ amountPaise: order.totalPaise, paymentId: payment.id });
    remoteRefunds.get(refund!.providerRefundId!)!.status = 'processed';
    await payments.reconcileRefund(order.id);
    updated = await orders.getOrder(order.id);
    expect(updated).toMatchObject({ paymentStatus: 'refunded', refundedPaise: order.totalPaise, totalPaise: 9999 });
  });
  it('rejects stale revision writes and retains all replaced payment references across concurrent edits', async () => {
    const order = await create('razorpay');
    const original = await payments.createRazorpayOrder(order.id, order.cartId);
    const edits = await Promise.allSettled([9000, 9500].map(totalPaise => payments.overrideOrderAmount(order.id, { totalPaise, expectedTotalPaise: order.totalPaise, reason: 'Agreed price correction', idempotencyKey: randomUUID() }, 'admin')));
    expect(edits.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const current = await orders.getOrder(order.id);
    await expect(orders.overrideAmount(order.id, { totalPaise: 8000, expectedTotalPaise: current.totalPaise, reason: 'Stale provider check', idempotencyKey: randomUUID() }, 'admin', undefined, 0)).rejects.toThrow(/order changed/);
    await orders.attachRazorpayOrder(order.id, 'stale_remote', 0);
    expect((await orders.getOrder(order.id)).razorpayOrderId).toBeUndefined();
    const revised = await payments.createRazorpayOrder(order.id, order.cartId);
    await payments.overrideOrderAmount(order.id, { totalPaise: 8000, expectedTotalPaise: current.totalPaise, reason: 'Second agreed revision', idempotencyKey: randomUUID() }, 'admin');
    const next = await payments.createRazorpayOrder(order.id, order.cartId);
    expect(next.razorpayOrderId).toBe('rzp_' + order.id + '-r2');
    expect((await orders.getOrder(order.id)).supersededRazorpayOrders.map(item => item.id)).toEqual([original.razorpayOrderId, revised.razorpayOrderId]);
  });
  it('never captures an authorized replaced checkout and can recover a failed saved response', async () => {
    const order = await create('razorpay');
    const original = await payments.createRazorpayOrder(order.id, order.cartId);
    await payments.overrideOrderAmount(order.id, { totalPaise: 9999, expectedTotalPaise: order.totalPaise, reason: 'Agreed final total', idempotencyKey: randomUUID() }, 'admin');
    const payment = { id: 'old_response_' + order.id, order_id: original.razorpayOrderId, amount: order.totalPaise, currency: 'INR', status: 'authorized' };
    remotePayments.set(payment.id, payment);
    const response = { razorpay_order_id: original.razorpayOrderId!, razorpay_payment_id: payment.id, razorpay_signature: createHmac('sha256', 'test-secret').update(`${original.razorpayOrderId}|${payment.id}`).digest('hex') };
    await expect(payments.verifyPayment(order.id, response, order.cartId)).rejects.toThrow(/checkout was replaced/);
    expect((await orders.getOrder(order.id)).paymentStatus).toBe('pending');
    payment.status = 'failed';
    expect(await payments.verifyPayment(order.id, response, order.cartId)).toMatchObject({ totalPaise: 9999, paymentStatus: 'pending' });
    expect(await payments.createRazorpayOrder(order.id, order.cartId)).toMatchObject({ amount: 9999 });
  });
  it('keeps revision receipts recoverable and does not expire a newly revised order', async () => {
    const order = await create('razorpay');
    await payments.createRazorpayOrder(order.id, order.cartId);
    await payments.overrideOrderAmount(order.id, { totalPaise: 9999, expectedTotalPaise: order.totalPaise, reason: 'Agreed revised total', idempotencyKey: randomUUID() }, 'admin');
    const cutoff = new Date(Date.now() - 30 * 60_000);
    await app.get<Model<Order>>(getModelToken(Order.name)).updateOne({ id: order.id }, { $set: { createdAt: new Date(0) } }, { timestamps: false });
    expect((await orders.staleOnlineOrders(cutoff)).some(item => item.id === order.id)).toBe(false);
    await orders.cancel(order.id, 'Stale expiry job', 'system', true, cutoff);
    expect((await orders.getOrder(order.id)).status).toBe('pending');
    expect(await orders.claimPaymentCreation(order.id, 9999, 1)).toBe(true);
    const all = jest.fn().mockResolvedValue({ items: [{ id: 'recovered_' + order.id, receipt: order.id + '-r1', amount: 9999, currency: 'INR' }] });
    (remote.orders as any).all = all;
    const recovered = await payments.createRazorpayOrder(order.id, order.cartId);
    expect(all).toHaveBeenCalledWith({ receipt: order.id + '-r1', count: 2 });
    expect(recovered).toMatchObject({ amount: 9999, razorpayOrderId: 'recovered_' + order.id });
  });
  it('uses the overridden total for online payment and COD collection', async () => {
    const online = await create('razorpay');
    await orders.overrideAmount(online.id, { totalPaise: 12345, expectedTotalPaise: online.totalPaise, reason: 'Agreed final price', idempotencyKey: randomUUID() }, 'admin');
    expect(await orders.claimPaymentCreation(online.id, online.totalPaise)).toBe(false);
    expect(await payments.createRazorpayOrder(online.id, online.cartId)).toMatchObject({ amount: 12345 });
    expect(remote.orders.create).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 12345 }));
    const cod = await create();
    await orders.overrideAmount(cod.id, { totalPaise: 4321, expectedTotalPaise: cod.totalPaise, reason: 'Agreed COD price', idempotencyKey: randomUUID() }, 'admin');
    await deliver(cod);
    await expect(action(cod.id, 'record_cod_collection', { amountPaise: cod.totalPaise })).rejects.toThrow(/full collected/);
    await action(cod.id, 'record_cod_collection', { amountPaise: 4321 });
    expect((await orders.getOrder(cod.id)).paymentStatus).toBe('paid');
  });

  it('resumes customer-owned payments across devices and protects other customers orders', async () => {
    const customers = app.get<Model<Customer>>(getModelToken(Customer.name));
    const owner = await customers.create({ name: 'Order Owner', email: 'owner@example.com', passwordHash: 'unused' });
    const other = await customers.create({ name: 'Other Customer', email: 'other@example.com', passwordHash: 'unused' });
    const customerToken = (id: string, email: string) => app.get(JwtService).signAsync({ sub: id, email, type: 'customer', version: 0 });
    const ownerToken = await customerToken(String(owner._id), owner.email);
    const otherToken = await customerToken(String(other._id), other.email);
    const order = await create('razorpay');
    await app.get<Model<Order>>(getModelToken(Order.name)).updateOne({ id: order.id }, { $set: { customerId: String(owner._id) } });
    const endpoint = `/customer/me/orders/${order.id}/payment`;
    await request(app.getHttpServer()).post(endpoint).expect(401);
    for (const [method, path] of [['get', endpoint], ['post', endpoint], ['post', endpoint + '/cancel'], ['post', endpoint + '/verify']]) {
      await (request(app.getHttpServer()) as any)[method](path).auth(otherToken, { type: 'bearer' }).send(method === 'post' && path.endsWith('/verify') ? { razorpay_order_id: 'order_account123', razorpay_payment_id: 'pay_account123', razorpay_signature: 'a'.repeat(64) } : undefined).expect(404);
    }
    remote.orders.create.mockResolvedValueOnce({ id: 'order_account123' });
    const started = await request(app.getHttpServer()).post(endpoint).auth(ownerToken, { type: 'bearer' }).set('x-cart-id', 'different-device-cart').expect(201);
    expect(started.body.amount).toBe(order.totalPaise);
    await request(app.getHttpServer()).get(endpoint).auth(ownerToken, { type: 'bearer' }).expect(200);
    remotePayments.set('pay_account123', { id: 'pay_account123', order_id: 'order_account123', amount: order.totalPaise, currency: 'INR', status: 'captured' });
    const signature = createHmac('sha256', 'test-secret').update('order_account123|pay_account123').digest('hex');
    const verified = await request(app.getHttpServer()).post(endpoint + '/verify').auth(ownerToken, { type: 'bearer' }).send({ razorpay_order_id: 'order_account123', razorpay_payment_id: 'pay_account123', razorpay_signature: signature }).expect(201);
    expect(verified.body).toMatchObject({ id: order.id, paymentStatus: 'paid', status: 'confirmed' });
    await request(app.getHttpServer()).post(endpoint).auth(ownerToken, { type: 'bearer' }).expect(400);
    const cancelled = await create('razorpay');
    await app.get<Model<Order>>(getModelToken(Order.name)).updateOne({ id: cancelled.id }, { $set: { customerId: String(owner._id) } });
    await request(app.getHttpServer()).post(`/customer/me/orders/${cancelled.id}/payment/cancel`).auth(ownerToken, { type: 'bearer' }).expect(201);
    expect((await orders.getOrder(cancelled.id)).status).toBe('cancelled');
    await request(app.getHttpServer()).post(`/customer/me/orders/${cancelled.id}/payment`).auth(ownerToken, { type: 'bearer' }).expect(400);
  });

  it('blocks unpaid online fulfilment through legacy and explicit endpoints', async () => {
    const order = await create('razorpay');
    await request(app.getHttpServer()).patch(`/orders/admin/${order.id}/status`).auth(adminToken, { type: 'bearer' }).send({ status: 'confirmed' }).expect(400);
    await request(app.getHttpServer()).post(`/orders/admin/${order.id}/actions/accept`).auth(adminToken, { type: 'bearer' }).send({ idempotencyKey: randomUUID(), reason: 'Attempt to bypass' }).expect(403);
    await expect(action(order.id, 'pack')).rejects.toThrow();
  });
  it('requires ordered actions, shipment details and delivery evidence', async () => {
    const order = await create(); await action(order.id, 'accept');
    await expect(action(order.id, 'dispatch')).rejects.toThrow();
    for (const step of ['pick', 'pack', 'ready'] as const) await action(order.id, step);
    await expect(action(order.id, 'dispatch', { trackingNumber: '' })).rejects.toThrow(/Courier/);
    await action(order.id, 'dispatch'); await action(order.id, 'out_for_delivery');
    await expect(action(order.id, 'deliver', { reference: '' })).rejects.toThrow(/evidence/);
  });
  it('separates COD delivery, cash collection and partial remittance, and deduplicates actions', async () => {
    const order = await create(); const delivered = await deliver(order);
    expect(delivered.paymentStatus).toBe('pending'); expect(delivered.operations).toMatchObject({ codCollectedPaise: 0, codSettledPaise: 0 });
    const key = randomUUID(); const details = { idempotencyKey: key, amountPaise: order.totalPaise, reference: 'COLLECT-' + order.id, reason: 'Courier collection evidence' };
    await orders.performAction(order.id, 'record_cod_collection', details, 'admin', 'super_admin');
    await orders.performAction(order.id, 'record_cod_collection', details, 'admin', 'super_admin');
    expect((await orders.getOrder(order.id)).activity.filter(item => item.action === 'record_cod_collection')).toHaveLength(1);
    const settlement = { idempotencyKey: randomUUID(), amountPaise: 100, reference: 'REMIT-' + order.id, reason: 'Bank transfer evidence' };
    await orders.performAction(order.id, 'record_cod_settlement', settlement, 'admin', 'super_admin');
    await expect(orders.performAction(order.id, 'record_cod_settlement', { ...settlement, idempotencyKey: randomUUID() }, 'admin', 'super_admin')).rejects.toThrow(/already/);
    await expect(action(order.id, 'record_cod_settlement', { amountPaise: order.totalPaise })).rejects.toThrow(/exceed/);
    expect((await orders.getOrder(order.id)).operations?.codSettledPaise).toBe(100);
  });
  it('enforces operational versus financial permissions on the server', async () => {
    const order = await create();
    await request(app.getHttpServer()).post(`/orders/admin/${order.id}/actions/accept`).auth(supportToken, { type: 'bearer' }).send({ idempotencyKey: randomUUID(), reason: 'Accepted by support' }).expect(201);
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}/refund`).auth(supportToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).post(`/orders/admin/${order.id}/actions/record_cod_collection`).auth(supportToken, { type: 'bearer' }).send({ idempotencyKey: randomUUID(), reason: 'Unauthorized finance action', amountPaise: order.totalPaise, reference: 'fake' }).expect(403);
  });
  it('releases inventory once when cancellation requests run concurrently', async () => {
    const before = await stock(); const order = await create(); expect(await stock()).toBe(before - 1);
    await Promise.all([orders.cancel(order.id, 'Customer request', 'admin'), orders.cancel(order.id, 'Expiry request', 'system')]);
    expect(await stock()).toBe(before); expect((await orders.getOrder(order.id)).stockReserved).toBe(false);
  });
  it('requires return approval and inspection, and never restocks opened food', async () => {
    const before = await stock(); const order = await paid(); await deliver(order);
    await orders.updateStatus(order.id, 'return_requested', { actor: 'customer', note: 'Opened package' });
    await expect(orders.updateStatus(order.id, 'returned')).rejects.toThrow();
    await expect(action(order.id, 'inspect_return')).rejects.toThrow();
    await action(order.id, 'approve_return'); await action(order.id, 'receive_return');
    const inspection = [{ productSlug: 'nuts', packSize: '250g', quantity: 1, disposition: 'restock', condition: 'opened' }];
    await expect(action(order.id, 'inspect_return', { inspection })).rejects.toThrow(/cannot be restocked/);
    await action(order.id, 'inspect_return', { inspection: [{ ...inspection[0], disposition: 'write_off' }] });
    expect(await stock()).toBe(before - 1); expect((await orders.getOrder(order.id)).operations?.returnStatus).toBe('inspected');
  });
  it('reserves a refund once across concurrent submissions and waits for final provider status', async () => {
    const order = await paid(); await orders.cancel(order.id, 'Customer cancellation', 'admin');
    const before = remote.payments.refund.mock.calls.length;
    const results = await Promise.all([payments.refundOrder(order.id, 'finance'), payments.refundOrder(order.id, 'finance')]);
    expect(remote.payments.refund.mock.calls.length).toBe(before + 1);
    expect(results.every(item => item?.amountPaise === order.totalPaise)).toBe(true);
    expect(await orders.getOrder(order.id)).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', refundReservedPaise: order.totalPaise });
    const refund = (await refunds.list(order.id))[0]!;
    const beforePoll = (await orders.getOrder(order.id)).activity.length;
    await payments.reconcileRefund(order.id); await payments.reconcileRefund(order.id);
    expect((await orders.getOrder(order.id)).activity.length).toBe(beforePoll);
    const provider = remoteRefunds.get(refund.providerRefundId!); provider.status = 'processed';
    await payments.reconcileRefund(order.id);
    expect(await orders.getOrder(order.id)).toMatchObject({ status: 'refunded', paymentStatus: 'refunded', refundReservedPaise: 0, refundedPaise: order.totalPaise });
    await refunds.apply({ ...provider, status: 'pending' }, 'delayed-webhook');
    expect((await refunds.list(order.id))[0]?.status).toBe('completed');
  });
  it('recovers a provider-accepted refund after a lost response without resubmitting', async () => {
    const order = await paid(); await orders.cancel(order.id, 'Cancellation request', 'admin');
    const realRefund = remote.payments.refund.getMockImplementation()!;
    remote.payments.refund.mockImplementationOnce(async (id: string, options: any) => { await realRefund(id, options); throw new Error('Connection dropped after provider acceptance'); });
    const before = remote.payments.refund.mock.calls.length;
    const attempt = await payments.refundOrder(order.id, 'finance'); expect(attempt?.status).toBe('reconciliation_required');
    await payments.refundOrder(order.id, 'finance'); expect(remote.payments.refund.mock.calls.length).toBe(before + 1);
    // A new service instance reads the durable record after a simulated process restart.
    const restarted = new RefundsService(app.get<any>('DatabaseConnection'), app.get(getModelToken(OrderRefund.name)), app.get(getModelToken(Order.name)), app.get(getModelToken(OrderOutbox.name)));
    const recovered = await restarted.reconcile(order.id, remote as any); expect(recovered?.providerRefundId).toBeDefined();
    expect(remote.payments.refund.mock.calls.length).toBe(before + 1);
  });
  it('rejects mismatched refund values and leaves the reserved balance protected', async () => {
    const order = await paid(); await orders.cancel(order.id, 'Cancel before packing', 'admin'); await payments.refundOrder(order.id, 'finance');
    const refund = (await refunds.list(order.id))[0]!;
    await expect(refunds.apply({ id: refund.providerRefundId!, payment_id: refund.paymentId, amount: 1, currency: 'INR', status: 'processed' }, 'provider', refund.requestId)).rejects.toThrow(/does not match/);
    expect((await orders.getOrder(order.id)).refundReservedPaise).toBe(order.totalPaise);
  });
  it('recovers a provider-accepted refund after the local outcome write fails', async () => {
    const order = await paid(); await orders.cancel(order.id, 'Cancellation request', 'admin');
    const apply = jest.spyOn(refunds, 'apply').mockRejectedValueOnce(new Error('Database unavailable after provider accepted refund'));
    const before = remote.payments.refund.mock.calls.length;
    expect((await payments.refundOrder(order.id, 'finance'))?.status).toBe('reconciliation_required');
    apply.mockRestore();
    await payments.refundOrder(order.id, 'finance');
    expect(remote.payments.refund.mock.calls.length).toBe(before + 1);
    expect((await payments.reconcileRefund(order.id))?.providerRefundId).toBeDefined();
    expect((await orders.getOrder(order.id)).refundReservedPaise).toBe(order.totalPaise);
  });
  it('does not extend the original return window when tracking is edited', async () => {
    const order = await create(); await deliver(order);
    const originalDelivery = new Date(Date.now() - 10 * 86400000).toISOString();
    await app.get<Model<Order>>(getModelToken(Order.name)).updateOne({ id: order.id }, { $set: { 'operations.deliveredAt': originalDelivery } });
    await orders.updateStatus(order.id, 'delivered', { trackingNumber: 'UPDATED-TRACKING' });
    await expect(orders.updateStatus(order.id, 'return_requested', { actor: 'customer', note: 'Late return' })).rejects.toThrow(/expired/);
    expect((await orders.getOrder(order.id)).operations?.deliveredAt).toBe(originalDelivery);
  });
  it('retries only a definitively failed refund, keeping prior attempt history', async () => {
    const order = await paid(); await orders.cancel(order.id, 'Cancelled order', 'admin');
    await payments.refundOrder(order.id, 'finance');
    const original = (await refunds.list(order.id))[0]!; const remoteRefund = remoteRefunds.get(original.providerRefundId!);
    await expect(payments.retryRefund(order.id, 'finance')).rejects.toThrow(/confirmed failed/);
    remoteRefund.status = 'failed'; await payments.reconcileRefund(order.id);
    expect((await orders.getOrder(order.id)).refundReservedPaise).toBe(0);
    const before = remote.payments.refund.mock.calls.length;
    await payments.retryRefund(order.id, 'finance');
    const retried = (await refunds.list(order.id))[0]!;
    expect(retried.requestId).not.toBe(original.requestId);
    expect(retried.history.some(item => item.providerRefundId === original.providerRefundId)).toBe(true);
    expect(remote.payments.refund.mock.calls.length).toBe(before + 1);
    expect((await orders.getOrder(order.id)).refundReservedPaise).toBe(order.totalPaise);
  });
  it('records durable reservations through allocation and dispatch', async () => {
    const order = await create('razorpay'); const model = app.get<Model<StockReservation>>(getModelToken(StockReservation.name));
    expect((await model.findOne({ referenceId: order.idempotencyKey }).lean().exec())?.status).toBe('reserved');
    await orders.attachRazorpayOrder(order.id, 'rzp_reservation_' + order.id);
    await orders.captureRazorpayPayment('rzp_reservation_' + order.id, 'pay_reservation_' + order.id, order.totalPaise, 'INR');
    expect((await model.findOne({ referenceId: order.idempotencyKey }).lean().exec())?.status).toBe('allocated');
    for (const step of ['accept', 'pick', 'pack', 'ready', 'dispatch'] as const) await action(order.id, step);
    expect((await model.findOne({ referenceId: order.idempotencyKey }).lean().exec())?.status).toBe('dispatched');
  });
  it('commits notification intent with the order and recovers delivery after failure', async () => {
    const outbox = app.get<Model<OrderOutbox>>(getModelToken(OrderOutbox.name));
    await outbox.updateMany({}, { $set: { nextAttemptAt: new Date(Date.now() + 86400000) } });
    const order = await create();
    const entry = await outbox.findOne({ orderId: order.id }).lean().exec(); expect(entry?.status).toBe('pending');
    const add = jest.spyOn(app.get(NotificationService), 'add').mockRejectedValueOnce(new Error('Notification persistence unavailable'));
    await orders.deliverOutbox();
    expect((await outbox.findOne({ eventKey: entry!.eventKey }).lean().exec())?.status).toBe('pending');
    expect((await orders.getOrder(order.id)).status).toBe('confirmed');
    await outbox.updateOne({ eventKey: entry!.eventKey }, { $set: { nextAttemptAt: new Date(0) } });
    await orders.deliverOutbox();
    expect((await outbox.findOne({ eventKey: entry!.eventKey }).lean().exec())?.status).toBe('delivered'); add.mockRestore();
  });
  it('does not oversell stock under concurrent checkouts', async () => {
    const available = await stock();
    const attempts = await Promise.allSettled([create('cod', available), create('cod', available)]);
    const successful = attempts.filter((item): item is PromiseFulfilledResult<Order> => item.status === 'fulfilled');
    expect(successful).toHaveLength(1); expect(await stock()).toBe(0);
    await orders.cancel(successful[0]!.value.id, 'Release concurrency test order', 'test');
    expect(await stock()).toBe(available);
  });
  it('deduplicates signed webhook delivery and persists failed work for replay', async () => {
    const order = await create('razorpay'); const providerOrder = 'rzp_' + order.id;
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_' + order.id, order_id: providerOrder, amount: order.totalPaise, currency: 'INR' } } } });
    const signature = createHmac('sha256', 'test-webhook').update(body).digest('hex'); const key = randomUUID();
    await request(app.getHttpServer()).post('/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', key).send(body).expect(404);
    const events = app.get<Model<PaymentWebhookEvent>>(getModelToken(PaymentWebhookEvent.name));
    expect((await events.findOne({ eventKey: key }).lean().exec())?.status).toBe('pending');
    await orders.attachRazorpayOrder(order.id, providerOrder);
    await events.updateOne({ eventKey: key }, { $set: { nextAttemptAt: new Date(0) } }); await payments.replayWebhooks();
    const replay = await request(app.getHttpServer()).post('/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', key).send(body).expect(201);
    expect(replay.body.duplicate).toBe(true); expect((await orders.getOrder(order.id)).paymentStatus).toBe('paid');
  });
});
