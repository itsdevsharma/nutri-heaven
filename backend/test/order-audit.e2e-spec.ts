import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.schema';
import { OrderService } from '../src/orders/order.service';
import { RefundsService } from '../src/payments/refunds.service';
import { Order } from '../src/orders/order.schema';
import { ShiprocketClient } from '../src/shipping/shiprocket.client';
import { ShippingService } from '../src/shipping/shipping.service';
import { ShiprocketShipment } from '../src/shipping/shipping.schema';
import { startMemoryReplica } from './helpers/memory-replica';

describe('Order audit regressions (disposable database, no provider credentials)', () => {
  jest.setTimeout(120000);
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  let products: Model<Product>, orders: OrderService;
  beforeAll(async () => {
    mongo = await startMemoryReplica(); process.env.MONGODB_URI = mongo.uri;
    const provider = { configured: true, request: async () => ({ tracking_data: { track_status: 1, shipment_track: [{ current_status: 'DELIVERED' }], shipment_track_activities: [] } }) };
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ShiprocketClient).useValue(provider).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); products = app.get(getModelToken(Product.name)); orders = app.get(OrderService);
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); });
  async function product(stock = 10) {
    const slug = 'audit-' + randomUUID();
    await products.create({ slug, title: 'Audit product', description: 'Fixture', image: 'test.jpg', category: 'Nuts', pricePaise: 10000, isActive: true, status: 'active', variants: [{ size: '250g', pricePaise: 10000, stockQuantity: stock, isActive: true }, { size: '500g', pricePaise: 18000, stockQuantity: stock, isActive: true }] });
    return slug;
  }
  const stock = async (slug: string) => (await products.findOne({ slug }).lean())!.variants[0]!.stockQuantity;
  const payload = (slug: string) => ({ cartId: randomUUID(), idempotencyKey: randomUUID(), customerName: 'Audit Buyer', customerEmail: 'audit@example.com', customerPhone: '9876543210', deliveryAddress: { street: 'Fixture street', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [1, 2].map(quantity => ({ productSlug: slug, packSize: '250g', quantity })), paymentMethod: 'cod' as const });
  it('preserves correct historical line totals when the same pack occurs twice', async () => {
    const order = await orders.createOrder(payload(await product()));
    expect(order.lines.map(line => line.lineTotalPaise)).toEqual([10000, 20000]);
    expect(order.lines.reduce((sum, line) => sum + line.lineTotalPaise, 0)).toBe(order.subtotalPaise);
  });
  it('restores every repeated-pack unit once across concurrent cancellation retries', async () => {
    const slug = await product(); const order = await orders.createOrder(payload(slug));
    expect(await stock(slug)).toBe(7);
    await Promise.all([orders.cancel(order.id, 'Audit cancellation'), orders.cancel(order.id, 'Audit retry')]);
    expect(await stock(slug)).toBe(10);
  });
  it('rejects cart pack merging above stock without changing the cart', async () => {
    const slug = await product(3); const cart = randomUUID();
    for (const packSize of ['250g', '500g']) await request(app.getHttpServer()).post('/cart/items').set('x-cart-id', cart).send({ productId: slug, packSize, quantity: 2 }).expect(201);
    await request(app.getHttpServer()).patch('/cart/items/1').set('x-cart-id', cart).send({ packSize: '250g' }).expect(400);
    const result = await request(app.getHttpServer()).get('/cart').set('x-cart-id', cart).expect(200);
    expect(result.body.items.map((line: any) => line.quantity)).toEqual([2, 2]);
  });
  it('reports invalid shopping-session headers as validation errors', async () => {
    await request(app.getHttpServer()).get('/cart').expect(400);
    await request(app.getHttpServer()).get('/cart').set('x-cart-id', 'bad').expect(400);
  });
  it('rejects missing, blank or oversized checkout keys before creating an order', async () => {
    const { idempotencyKey, ...body } = payload(await product());
    for (const key of [undefined, '', '   ', 'a b', 'x'.repeat(129)]) {
      await request(app.getHttpServer()).post('/orders').send({ ...body, idempotencyKey: key }).expect(400);
      await expect(orders.createOrder({ ...body, idempotencyKey: key } as any)).rejects.toThrow(/idempotency key/);
    }
    expect(await stock(body.lines[0]!.productSlug)).toBe(10);
  });
  it('refreshes cart prices after a catalogue price update', async () => {
    const slug = await product(); const cart = randomUUID();
    await request(app.getHttpServer()).post('/cart/items').set('x-cart-id', cart).send({ productId: slug, packSize: '250g', quantity: 1 }).expect(201);
    await products.updateOne({ slug }, { $set: { 'variants.0.pricePaise': 12000 } });
    const result = await request(app.getHttpServer()).get('/cart').set('x-cart-id', cart).expect(200);
    expect(result.body.items[0].unitPricePaise).toBe(12000);
    const order = await orders.createOrder({ ...payload(slug), lines: [{ productSlug: slug, packSize: '250g', quantity: 1 }] });
    expect(order.lines[0]!.unitPricePaise).toBe(12000);
  });
  it('retains a duplicate-capture exception when the first payment refund completes', async () => {
    const body = payload(await product());
    const order = await orders.createOrder({ ...body, paymentMethod: 'razorpay' });
    const providerOrder = 'order_' + order.id, paymentId = 'pay_' + order.id;
    await orders.attachRazorpayOrder(order.id, providerOrder);
    await orders.captureRazorpayPayment(providerOrder, paymentId, order.totalPaise, 'INR');
    await orders.cancel(order.id, 'Customer cancellation');
    const remote = { id: 'refund_' + order.id, payment_id: paymentId, amount: order.totalPaise, currency: 'INR', status: 'pending' };
    const client = { payments: { fetch: async () => ({ status: 'captured', currency: 'INR', amount: order.totalPaise }), refund: async () => remote } };
    const refunds = app.get(RefundsService);
    const refund = await refunds.request(order.id, 'audit', 'Refund cancelled order', client as any);
    await orders.captureRazorpayPayment(providerOrder, 'duplicate_' + order.id, order.totalPaise, 'INR');
    await refunds.apply({ ...remote, status: 'failed' }, 'audit', refund!.requestId);
    expect((await orders.getOrder(order.id)).paymentReconciliationNote).toContain('Multiple payment captures');
    await refunds.apply({ ...remote, status: 'processed' }, 'audit', refund!.requestId);
    const saved = await orders.getOrder(order.id);
    expect(saved.refundedPaise).toBe(order.totalPaise);
    expect(saved.paymentReconciliationRequired).toBe(true);
    expect(saved.paymentReconciliationNote).toContain('Multiple payment captures');
  });
  it('allows only one of two simultaneous customers to buy the final unit', async () => {
    const slug = await product(1);
    const attempt = () => orders.createOrder({ ...payload(slug), lines: [{ productSlug: slug, packSize: '250g', quantity: 1 }] });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await stock(slug)).toBe(0);
  });
  it('deduplicates repeated HTTP placement using the same checkout key', async () => {
    const body = payload(await product());
    const first = await request(app.getHttpServer()).post('/orders').send(body).expect(201);
    const second = await request(app.getHttpServer()).post('/orders').send(body).expect(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await stock(body.lines[0]!.productSlug)).toBe(7);
  });
  it('rejects processing a cancelled order and reopening a delivered order', async () => {
    const order = await orders.createOrder(payload(await product()));
    await orders.cancel(order.id, 'Customer cancellation');
    await expect(orders.performAction(order.id, 'accept', { idempotencyKey: randomUUID(), reason: 'Invalid action' }, 'audit', 'super_admin')).rejects.toThrow();
    const delivered = await orders.createOrder(payload(await product()));
    for (const action of ['verify', 'dispatch', 'out_for_delivery', 'deliver'] as const) await orders.performAction(delivered.id, action, { idempotencyKey: randomUUID(), reason: 'Audit evidence', courier: 'Fixture', trackingNumber: 'TRACK', reference: 'DELIVERY' }, 'audit', 'super_admin');
    await expect(orders.updateStatus(delivered.id, 'pending')).rejects.toThrow();
    expect((await orders.getOrder(delivered.id)).status).toBe('delivered');
  });
  it('reads synthetic historical orders without migrating or repricing them', async () => {
    const slug = await product(); const order = await orders.createOrder(payload(slug));
    const model = app.get<Model<Order>>(getModelToken(Order.name));
    await model.collection.updateOne({ id: order.id }, { $unset: { operations: '' } });
    const before = await model.findOne({ id: order.id }).lean();
    await products.updateOne({ slug }, { $set: { 'variants.0.pricePaise': 99999 } });
    await orders.getCustomerOrder(order.id, order.cartId);
    expect(await model.findOne({ id: order.id }).lean()).toEqual(before);
  });
  it('advances delivered courier scans once with their history and inventory allocation', async () => {
    const order = await orders.createOrder(payload(await product()));
    await orders.performAction(order.id, 'verify', { idempotencyKey: randomUUID(), reason: 'Parcel packed' }, 'audit', 'super_admin');
    const shipments = app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name));
    await shipments.create({ orderId: order.id, shipmentId: 200, awb: 'AUDIT-AWB' });
    for (let index = 0; index < 2; index++) await app.get(ShippingService).action(order.id, 'track', {}, 'audit');
    expect((await shipments.findOne({ orderId: order.id }).lean())?.tracking?.status).toBe('DELIVERED');
    const saved = await orders.getOrder(order.id);
    expect(saved.status).toBe('delivered');
    expect(saved.statusHistory.filter(event => event.actor === 'shiprocket').map(event => event.status)).toEqual(['shipped', 'out_for_delivery', 'delivered']);
  });
});
