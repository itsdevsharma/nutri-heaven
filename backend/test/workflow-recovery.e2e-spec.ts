import { Test } from '@nestjs/testing';
import { BadGatewayException, INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.schema';
import { Order } from '../src/orders/order.schema';
import { OrderService } from '../src/orders/order.service';
import { CouponsService } from '../src/coupons/coupons.service';
import { Coupon } from '../src/coupons/coupon.schema';
import { CouponRedemption } from '../src/coupons/coupon-redemption.schema';
import { ShiprocketClient } from '../src/shipping/shiprocket.client';
import { ShippingService } from '../src/shipping/shipping.service';
import { ShippingConfiguration, ShiprocketShipment } from '../src/shipping/shipping.schema';
import { StockReservation } from '../src/inventory/stock-reservation.schema';
import { Customer } from '../src/customers/customer.schema';
import { Admin } from '../src/admin/admin.schema';
import { JwtService } from '@nestjs/jwt';
import { startMemoryReplica } from './helpers/memory-replica';

describe('Checkout, courier synchronization and interruption recovery', () => {
  jest.setTimeout(120000);
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  let orders: OrderService, shipping: ShippingService, coupons: CouponsService;
  let orderModel: Model<Order>, products: Model<Product>, shipments: Model<ShiprocketShipment>;
  let couponModel: Model<Coupon>, redemptions: Model<CouponRedemption>;
  let scan = 'IN TRANSIT', loseCreateResponse = false, posts = 0;
  const remote = new Map<string, { order_id: number; shipment_id: number }>();
  const provider = { configured: true, request: jest.fn(async (path: string, _method?: string, body?: any): Promise<any> => {
    if (path === 'orders/create/adhoc') {
      posts++;
      const value = { order_id: 1000 + posts, shipment_id: 2000 + posts }; remote.set(body.order_id, value);
      if (loseCreateResponse) { loseCreateResponse = false; throw new BadGatewayException('Response lost after provider commit'); }
      return value;
    }
    if (path.startsWith('orders?filter_by=')) {
      const reference = decodeURIComponent(path.split('&filter=')[1]!); const value = remote.get(reference);
      return { data: value ? [{ id: value.order_id, channel_order_id: reference, shipments: [{ id: value.shipment_id, awb: 'RECOVERED', courier: 'Fixture' }] }] : [] };
    }
    if (path.startsWith('courier/track/')) return { tracking_data: { track_status: 1, shipment_track: [{ current_status: scan, delivered_date: '2026-01-01T10:00:00Z' }], shipment_track_activities: [] } };
    throw new Error('Unexpected provider call: ' + path);
  }) };
  beforeAll(async () => {
    mongo = await startMemoryReplica(); process.env.MONGODB_URI = mongo.uri;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ShiprocketClient).useValue(provider).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    orders = app.get(OrderService); shipping = app.get(ShippingService); coupons = app.get(CouponsService);
    orderModel = app.get(getModelToken(Order.name)); products = app.get(getModelToken(Product.name)); shipments = app.get(getModelToken(ShiprocketShipment.name));
    couponModel = app.get(getModelToken(Coupon.name)); redemptions = app.get(getModelToken(CouponRedemption.name));
    // Accelerate MongoDB's normal abandoned-transaction expiry only on this
    // disposable replica, so SIGKILL recovery does not wait the default minute.
    await orderModel.db.db!.admin().command({ setParameter: 1, transactionLifetimeLimitSeconds: 2 });
    await app.get<Model<ShippingConfiguration>>(getModelToken(ShippingConfiguration.name)).create({ key: 'shiprocket', pickupLocation: 'Fixture', weight: 1, length: 10, breadth: 10, height: 10 });
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); });
  afterEach(() => { jest.restoreAllMocks(); loseCreateResponse = false; });
  async function basket() {
    const slug = 'recovery-' + randomUUID();
    await products.create({ slug, title: 'Fixture', description: 'Fixture', category: 'Nuts', image: 'test.jpg', pricePaise: 10000, status: 'active', isActive: true, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 10, isActive: true }] });
    return { cartId: randomUUID(), idempotencyKey: randomUUID(), customerName: 'Fixture', customerEmail: 'fixture@example.com', customerPhone: '9876543210', deliveryAddress: { street: 'Test', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [{ productSlug: slug, packSize: '250g', quantity: 1 }], paymentMethod: 'cod' as const };
  }
  const stock = async (slug: string) => (await products.findOne({ slug }).lean())!.variants[0]!.stockQuantity;
  async function coupon() { const code = 'C' + randomUUID().replace(/-/g, '').toUpperCase(); await couponModel.create({ code, discountType: 'flat', discountValue: 100, usageLimit: 1 }); return code; }
  async function ready() { const order = await orders.createOrder(await basket()); return orders.performAction(order.id, 'verify', { idempotencyKey: randomUUID(), reason: 'Parcel ready' }, 'fixture', 'super_admin'); }
  async function trackingOrder(method: 'cod' | 'razorpay' = 'cod') {
    const order = await orders.createOrder({ ...await basket(), paymentMethod: method });
    await shipments.create({ orderId: order.id, shipmentId: 3000, awb: 'FIXTURE', courier: 'Fixture' });
    return order;
  }
  async function crashWorker(input: { stage: string; body?: unknown; orderId?: string }) {
    const child = fork(join(__dirname, 'helpers/workflow-crash.cjs'), [], { env: { ...process.env, NODE_ENV: 'test', MONGODB_URI: mongo.uri }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Crash worker timed out')); }, 30000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.on('message', (message: { error?: string }) => { if (message.error) { clearTimeout(timer); reject(new Error(message.error)); } });
      child.once('exit', (_code, signal) => { clearTimeout(timer); if (signal === 'SIGKILL') resolve(); else reject(new Error('Worker did not reach SIGKILL checkpoint')); });
      child.send(input);
    });
  }
  it('returns one order and one limited-coupon redemption under concurrent checkout retries', async () => {
    const body = { ...await basket(), couponCode: await coupon() };
    const result = await Promise.all([orders.createOrder(body), orders.createOrder(body)]);
    expect(result[0]!.id).toBe(result[1]!.id);
    expect(await orderModel.countDocuments({ idempotencyKey: body.idempotencyKey })).toBe(1);
    expect((await couponModel.findOne({ code: body.couponCode }).lean())!.usageCount).toBe(1);
    expect(await redemptions.countDocuments({ orderId: result[0]!.id })).toBe(1);
    expect(await stock(body.lines[0]!.productSlug)).toBe(9);
  });
  it('accepts reordered JSON keys but rejects changed payloads and other owners', async () => {
    const body = await basket(); const order = await orders.createOrder(body);
    const reordered = Object.fromEntries(Object.entries(body).reverse()) as typeof body;
    expect((await orders.createOrder(reordered)).id).toBe(order.id);
    await expect(orders.createOrder({ ...body, customerName: 'Different' })).rejects.toThrow(/reused/);
    await expect(orders.createOrder({ ...body, cartId: randomUUID() })).rejects.toThrow(/another/);
  });
  it('recovers a lost checkout response by key only for the owning shopping session', async () => {
    const body = await basket(); const order = await orders.createOrder(body);
    const path = '/orders/checkout/' + body.idempotencyKey;
    expect((await request(app.getHttpServer()).get(path).set('x-cart-id', body.cartId).expect(200)).body.id).toBe(order.id);
    await request(app.getHttpServer()).get(path).set('x-cart-id', randomUUID()).expect(404);
    await request(app.getHttpServer()).get(path).expect(400);
  });
  it('rolls back coupon, reservation and stock when order persistence fails', async () => {
    const body = { ...await basket(), couponCode: await coupon() };
    jest.spyOn(orderModel, 'create').mockRejectedValueOnce(new Error('Injected interruption before order insert') as never);
    await expect(orders.createOrder(body)).rejects.toThrow(/Injected/);
    expect((await couponModel.findOne({ code: body.couponCode }).lean())!.usageCount).toBe(0);
    expect(await redemptions.countDocuments({ couponCode: body.couponCode })).toBe(0);
    expect(await stock(body.lines[0]!.productSlug)).toBe(10);
    expect(await app.get<Model<StockReservation>>(getModelToken(StockReservation.name)).countDocuments({ referenceId: body.idempotencyKey })).toBe(0);
    expect((await orders.createOrder(body)).couponCode).toBe(body.couponCode);
  });
  it('rolls back cancelled order and stock if coupon release is interrupted; retry releases once', async () => {
    const body = { ...await basket(), couponCode: await coupon() }; const order = await orders.createOrder(body);
    const original = coupons.refundRedemption.bind(coupons);
    const spy = jest.spyOn(coupons, 'refundRedemption').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('Interrupted after redemption deletion'); });
    await expect(orders.cancel(order.id, 'Fixture cancellation')).rejects.toThrow(/Interrupted/);
    expect((await orders.getOrder(order.id)).status).toBe('confirmed'); expect(await stock(body.lines[0]!.productSlug)).toBe(9);
    expect((await couponModel.findOne({ code: body.couponCode }).lean())!.usageCount).toBe(1);
    expect(await redemptions.countDocuments({ orderId: order.id })).toBe(1); spy.mockRestore();
    await Promise.all([orders.cancel(order.id, 'Retry'), orders.cancel(order.id, 'Retry')]);
    expect(await stock(body.lines[0]!.productSlug)).toBe(10);
    expect((await couponModel.findOne({ code: body.couponCode }).lean())!.usageCount).toBe(0);
  });
  it('rolls back booking claim when shipment intent persistence fails before any provider call', async () => {
    const order = await ready(); const before = posts;
    jest.spyOn(shipments, 'create').mockRejectedValueOnce(new Error('Injected intent persistence failure') as never);
    await expect(shipping.action(order.id, 'create', {}, 'fixture')).rejects.toThrow(/Injected/);
    expect((await orders.getOrder(order.id)).shiprocketBookingStarted).toBe(false);
    expect(await shipments.countDocuments({ orderId: order.id })).toBe(0); expect(posts).toBe(before);
    await shipping.action(order.id, 'create', {}, 'fixture'); expect(posts).toBe(before + 1);
  });
  it('reconciles a provider-accepted booking after a lost response without resubmitting create', async () => {
    const order = await ready(); const before = posts; loseCreateResponse = true;
    await expect(shipping.action(order.id, 'create', {}, 'fixture')).rejects.toThrow(/Response lost/);
    const ambiguous = await shipping.get(order.id); expect(ambiguous?.submissionStartedAt).toBeDefined(); expect(ambiguous?.error).toBeTruthy();
    await shipping.action(order.id, 'create', {}, 'fixture'); expect(posts).toBe(before + 1);
    const recovered = await shipping.action(order.id, 'reconcile', {}, 'fixture');
    expect(recovered?.shipmentId).toBe(remote.get(order.id)!.shipment_id); expect(recovered?.error).toBeUndefined(); expect(posts).toBe(before + 1);
  });
  it('resumes a committed but unsubmitted intent after simulated restart', async () => {
    const order = await ready(); const before = posts;
    await orderModel.updateOne({ id: order.id }, { $set: { shiprocketBookingStarted: true } });
    await shipments.create({ orderId: order.id, providerReference: order.id, parcel: { pickupLocation: 'Fixture', weight: 1, length: 10, breadth: 10, height: 10 } });
    await shipping.action(order.id, 'create', {}, 'fixture'); await shipping.action(order.id, 'create', {}, 'fixture');
    expect(posts).toBe(before + 1); expect(await shipments.countDocuments({ orderId: order.id })).toBe(1);
  });
  it('never resubmits a started booking with no provider match', async () => {
    const order = await ready(); const before = posts;
    await orderModel.updateOne({ id: order.id }, { $set: { shiprocketBookingStarted: true } });
    await shipments.create({ orderId: order.id, providerReference: order.id, submissionStartedAt: new Date(), error: 'Ambiguous create' });
    await expect(shipping.action(order.id, 'reconcile', {}, 'fixture')).rejects.toThrow(/unconfirmed/);
    await shipping.action(order.id, 'create', {}, 'fixture'); expect(posts).toBe(before);
  });
  it('recovers a legacy booking flag without an intent through read-only provider lookup', async () => {
    const order = await ready(); const before = posts;
    await orderModel.updateOne({ id: order.id }, { $set: { shiprocketBookingStarted: true } }); remote.set(order.id, { order_id: 9000, shipment_id: 9001 });
    expect((await shipping.action(order.id, 'reconcile', {}, 'fixture'))?.shipmentId).toBe(9001); expect(posts).toBe(before);
  });
  it('commits courier scan and order progression together, recovering from a persistence interruption', async () => {
    const order = await trackingOrder(); scan = 'OUT FOR DELIVERY';
    const original = orders.applyCourierTracking.bind(orders);
    const spy = jest.spyOn(orders, 'applyCourierTracking').mockImplementationOnce(async (...args) => { await original(...args); throw new Error('Interrupted after lifecycle write'); });
    await expect(shipping.action(order.id, 'track', {}, 'fixture')).rejects.toThrow(/Interrupted/);
    expect((await orders.getOrder(order.id)).status).toBe('confirmed'); expect((await shipping.get(order.id))?.tracking).toBeUndefined(); spy.mockRestore();
    await shipping.action(order.id, 'track', {}, 'fixture');
    expect((await orders.getOrder(order.id)).status).toBe('out_for_delivery');
    expect((await app.get<Model<StockReservation>>(getModelToken(StockReservation.name)).findOne({ referenceId: order.idempotencyKey }).lean())?.status).toBe('dispatched');
  });
  it('ignores repeated and old scans, preserves delivery evidence and never records COD cash automatically', async () => {
    const order = await trackingOrder(); scan = 'DELIVERED';
    await shipping.action(order.id, 'track', {}, 'fixture'); const delivered = await orders.getOrder(order.id);
    for (const status of ['DELIVERED', 'IN TRANSIT', 'OUT FOR DELIVERY']) { scan = status; await shipping.action(order.id, 'track', {}, 'fixture'); }
    const saved = await orders.getOrder(order.id);
    expect(saved.status).toBe('delivered'); expect(saved.statusHistory).toEqual(delivered.statusHistory);
    expect(saved.operations?.deliveredAt).toBe('2026-01-01T10:00:00.000Z'); expect(saved.paymentStatus).toBe('pending'); expect(saved.operations?.codCollectedPaise).toBe(0);
    expect((await shipping.get(order.id))?.tracking?.status).toBe('DELIVERED');
  });
  it('does not fulfil unpaid, cancelled or payment-exception orders from courier scans', async () => {
    scan = 'DELIVERED'; const unpaid = await trackingOrder('razorpay');
    await shipping.action(unpaid.id, 'track', {}, 'fixture'); expect((await orders.getOrder(unpaid.id)).status).toBe('pending');
    const cancelled = await trackingOrder(); await orders.cancel(cancelled.id, 'Cancel before pickup'); await shipping.action(cancelled.id, 'track', {}, 'fixture'); expect((await orders.getOrder(cancelled.id)).status).toBe('cancelled');
    const exception = await trackingOrder(); await orderModel.updateOne({ id: exception.id }, { $set: { paymentReconciliationRequired: true } });
    await shipping.action(exception.id, 'track', {}, 'fixture'); expect((await orders.getOrder(exception.id)).status).toBe('confirmed');
  });
  it('shows the same delivered state and history in authenticated customer and admin APIs', async () => {
    const customer = await app.get<Model<Customer>>(getModelToken(Customer.name)).create({ name: 'Fixture', email: randomUUID() + '@example.com', passwordHash: 'unused' });
    const admin = await app.get<Model<Admin>>(getModelToken(Admin.name)).create({ name: 'Fixture', email: randomUUID() + '@example.com', passwordHash: 'unused', role: 'super_admin' });
    const customerToken = await app.get(JwtService).signAsync({ sub: String(customer._id), email: customer.email, type: 'customer', version: 0 });
    const adminToken = await app.get(JwtService).signAsync({ sub: String(admin._id), email: admin.email, role: 'super_admin', version: 0 });
    const order = await orders.createOrder({ ...await basket(), customerEmail: customer.email }, String(customer._id));
    await shipments.create({ orderId: order.id, shipmentId: 3010, awb: 'SYNC', courier: 'Fixture' }); scan = 'DELIVERED';
    await shipping.action(order.id, 'track', {}, 'fixture');
    const customerView = await request(app.getHttpServer()).get('/customer/me/orders/' + order.id).auth(customerToken, { type: 'bearer' }).expect(200);
    const adminView = await request(app.getHttpServer()).get('/orders/admin/' + order.id).auth(adminToken, { type: 'bearer' }).expect(200);
    expect(customerView.body.status).toBe('delivered'); expect(adminView.body.status).toBe(customerView.body.status);
    expect(adminView.body.statusHistory).toEqual(customerView.body.statusHistory);
    expect(customerView.body.deliveryTracking.status).toBe('DELIVERED');
  });
  it('ignores unknown/RTO scans and refuses delivery without a matching AWB', async () => {
    const order = await trackingOrder();
    for (const status of ['UNKNOWN', 'RTO DELIVERED']) { scan = status; await shipping.action(order.id, 'track', {}, 'fixture'); expect((await orders.getOrder(order.id)).status).toBe('confirmed'); }
    await shipments.updateOne({ orderId: order.id }, { $unset: { awb: 1 } }); scan = 'DELIVERED';
    await shipping.action(order.id, 'track', {}, 'fixture'); expect((await orders.getOrder(order.id)).status).toBe('confirmed');
    expect((await orders.getOrder(order.id)).shippingReviewReason).toContain('AWB');
  });
  it('serializes cancellation against shipment booking without a released booked order', async () => {
    const order = await ready();
    const results = await Promise.allSettled([orders.cancel(order.id, 'Concurrent cancellation'), shipping.action(order.id, 'create', {}, 'fixture')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const saved = await orders.getOrder(order.id);
    expect(await shipments.countDocuments({ orderId: order.id })).toBe(saved.status === 'cancelled' ? 0 : 1);
    expect(saved.stockReserved).toBe(saved.status !== 'cancelled');
  });
  it('survives actual worker SIGKILL after uncommitted coupon redemption', async () => {
    const body = { ...await basket(), couponCode: await coupon() };
    await crashWorker({ stage: 'coupon', body });
    expect(await orderModel.countDocuments({ idempotencyKey: body.idempotencyKey })).toBe(0);
    expect((await couponModel.findOne({ code: body.couponCode }).lean())!.usageCount).toBe(0);
    expect(await redemptions.countDocuments({ couponCode: body.couponCode })).toBe(0);
    expect(await stock(body.lines[0]!.productSlug)).toBe(10);
    expect((await orders.createOrder(body)).couponCode).toBe(body.couponCode);
  });
  it('survives actual worker SIGKILL between booking claim and intent commit', async () => {
    const order = await ready(); const before = posts;
    await crashWorker({ stage: 'intent', orderId: order.id });
    expect((await orders.getOrder(order.id)).shiprocketBookingStarted).toBe(false);
    expect(await shipments.countDocuments({ orderId: order.id })).toBe(0);
    await shipping.action(order.id, 'create', {}, 'fixture'); expect(posts).toBe(before + 1);
  });
  it('recovers actual SIGKILL after provider commit using its persisted reference, with no second create', async () => {
    const order = await ready(); const before = posts;
    await crashWorker({ stage: 'provider', orderId: order.id });
    const accepted = await orderModel.db.collection('audit_provider_bookings').findOne({ reference: order.id });
    expect(accepted).toBeTruthy(); remote.set(order.id, { order_id: accepted!.order_id, shipment_id: accepted!.shipment_id });
    expect((await shipping.get(order.id))?.error).toBeTruthy();
    // Simulate lease expiry after the killed worker; no production lease touched.
    await shipments.updateOne({ orderId: order.id }, { $set: { lockedUntil: new Date(0) } });
    await shipping.action(order.id, 'create', {}, 'fixture');
    expect((await shipping.action(order.id, 'reconcile', {}, 'fixture'))?.shipmentId).toBe(8101);
    expect(posts).toBe(before);
    expect(await orderModel.db.collection('audit_provider_bookings').countDocuments({ reference: order.id })).toBe(1);
  });
});
