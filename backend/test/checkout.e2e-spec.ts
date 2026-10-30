import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID, createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.schema';
import { ShippingConfiguration, ShiprocketShipment } from '../src/shipping/shipping.schema';
import { ShiprocketClient } from '../src/shipping/shiprocket.client';
import { ShippingService } from '../src/shipping/shipping.service';
import { CheckoutQuote } from '../src/checkout/checkout.schema';
import { Coupon } from '../src/coupons/coupon.schema';
import { Order } from '../src/orders/order.schema';
import { PaymentsService } from '../src/payments/payments.service';
import { startMemoryReplica } from './helpers/memory-replica';

describe('Authoritative Shiprocket checkout', () => {
  jest.setTimeout(120000);
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  let rate = 65.25;
  const provider = { configured: true, request: jest.fn(async (path: string) => {
    if (path === 'settings/company/pickup') return { data: { shipping_address: [{ pickup_location: 'Warehouse', pin_code: '125001' }] } };
    if (path.startsWith('courier/serviceability/')) return { data: { available_courier_companies: [{ courier_company_id: 7, courier_name: 'Courier', rate, cod: 1, estimated_delivery_days: '3' }] } };
    if (path === 'orders/create/adhoc') return { order_id: 100, shipment_id: 200 };
    if (path === 'courier/assign/awb') return { awb_assign_status: 1, response: { data: { awb_code: 'AWB100', courier_name: 'Courier' } } };
    throw new Error('Unexpected provider request');
  }) };
  const remote = { orders: { all: jest.fn(async () => ({ items: [] })), create: jest.fn(async (options: any) => ({ id: `rzp_${options.receipt}` })) } };
  const oldEnv = { ...process.env };
  beforeAll(async () => {
    mongo = await startMemoryReplica();
    process.env.MONGODB_URI = mongo.uri; process.env.SHIPROCKET_CHECKOUT_ENABLED = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder'; process.env.RAZORPAY_KEY_SECRET = 'test-secret'; process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ShiprocketClient).useValue(provider).compile();
    app = module.createNestApplication({ rawBody: true }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    jest.spyOn(app.get(PaymentsService) as any, 'client').mockReturnValue(remote);
    await app.get<Model<Product>>(getModelToken(Product.name)).create({ slug: 'nuts', title: 'Nuts', description: 'Nuts', image: 'nuts.jpg', category: 'Nuts', pricePaise: 10000, status: 'active', variants: [{ size: '250g', pricePaise: 10000, weightGrams: 280, lengthCm: 10, breadthCm: 8, heightCm: 3, stockQuantity: 100, isActive: true }] });
    await app.get<Model<ShippingConfiguration>>(getModelToken(ShippingConfiguration.name)).create({ key: 'shiprocket', pickupLocation: 'Warehouse', weight: 0.1, length: 15, breadth: 10, height: 5 });
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); for (const key of ['SHIPROCKET_CHECKOUT_ENABLED', 'SHIPROCKET_RATE_DIFFERENCE_POLICY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'MONGODB_URI']) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; } });
  const basket = () => ({ cartId: randomUUID(), deliveryAddress: { street: '12 Main', city: 'Delhi', state: 'Delhi', pin: '110001' }, lines: [{ productSlug: 'nuts', packSize: '250g', quantity: 2 }], paymentMethod: 'razorpay' });
  const quote = async (body: any) => (await request(app.getHttpServer()).post('/checkout/quotes').send(body).expect(201)).body;
  const payload = (body: any, shipping: any) => ({ ...body, customerName: 'Buyer', customerPhone: '9876543210', customerEmail: 'buyer@example.com', idempotencyKey: randomUUID(), shippingQuoteId: shipping.id, courierId: 7 });
  const sign = (body: string) => createHmac('sha256', 'webhook-secret').update(body).digest('hex');
  const webhook = (body: string, id: string, signature = sign(body)) => request(app.getHttpServer()).post('/payments/razorpay/webhook').set('Content-Type', 'application/json').set('x-razorpay-signature', signature).set('x-razorpay-event-id', id).send(body);
  it('requires a quote, calculates gross weight and dimensions, and rejects client totals', async () => {
    const body = basket(); const shipping = await quote(body);
    expect(shipping.subtotalPaise).toBe(20000); expect(shipping.options[0].shippingPaise).toBe(6525);
    expect(shipping.parcel).toMatchObject({ weight: 0.56, length: 10, breadth: 8, height: 6 });
    expect(provider.request.mock.calls.some(([path]) => path.includes('weight=0.56') && path.includes('height=6'))).toBe(true);
    await request(app.getHttpServer()).post('/orders').send({ ...payload(body, shipping), totalPaise: 1 }).expect(400);
    await request(app.getHttpServer()).post('/orders').send({ ...payload(body, shipping), shippingQuoteId: undefined }).expect(409);
    await request(app.getHttpServer()).post('/checkout/quotes').send({ ...body, lines: [...body.lines, ...body.lines] }).expect(400);
  });
  it('rejects wrong ownership, changed address, stock, rates and expired quotes', async () => {
    const body = basket(); const shipping = await quote(body);
    await request(app.getHttpServer()).post('/orders').send(payload({ ...body, cartId: randomUUID() }, shipping)).expect(409);
    await request(app.getHttpServer()).post('/orders').send(payload({ ...body, deliveryAddress: { ...body.deliveryAddress, city: 'Mumbai' } }, shipping)).expect(409);
    rate = 90;
    await request(app.getHttpServer()).post('/orders').send(payload(body, shipping)).expect(409);
    rate = 65.25;
    await app.get<Model<CheckoutQuote>>(getModelToken(CheckoutQuote.name)).updateOne({ id: shipping.id }, { $set: { expiresAt: new Date(0) } });
    await request(app.getHttpServer()).post('/orders').send(payload(body, shipping)).expect(409);
    await request(app.getHttpServer()).post('/checkout/quotes').send({ ...basket(), lines: [{ productSlug: 'nuts', packSize: '250g', quantity: 99 }] }).expect(201);
    await request(app.getHttpServer()).post('/checkout/quotes').send({ ...basket(), lines: [{ productSlug: 'nuts', packSize: 'unknown', quantity: 1 }] }).expect(409);
  });
  it('handles provider failures and unserviceable destinations clearly', async () => {
    provider.request.mockRejectedValueOnce(new Error('Unavailable'));
    await request(app.getHttpServer()).post('/checkout/quotes').send(basket()).expect(503);
    // Fail the rate lookup after the successful pickup lookup.
    provider.request.mockResolvedValueOnce({ data: { shipping_address: [{ pickup_location: 'Warehouse', pin_code: '125001' }] } }).mockRejectedValueOnce(new Error('Timeout'));
    await request(app.getHttpServer()).post('/checkout/quotes').send(basket()).expect(503);
    provider.request.mockResolvedValueOnce({ data: { shipping_address: [{ pickup_location: 'Warehouse', pin_code: '125001' }] } }).mockResolvedValueOnce({ data: { available_courier_companies: [] } });
    await request(app.getHttpServer()).post('/checkout/quotes').send(basket()).expect(400);
  });
  it('uses the exact saved amount, verifies signatures, and books a paid shipment once', async () => {
    const body = basket(); const shipping = await quote(body); const data = payload(body, shipping);
    const order = (await request(app.getHttpServer()).post('/orders').send(data).expect(201)).body;
    expect(order.totalPaise).toBe(26525);
    await app.get(ShippingService).bookPaidOrders(); expect(await app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name)).countDocuments()).toBe(0);
    const start = () => request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId);
    const results = await Promise.all([start(), start()]); expect(results.some(result => result.status === 201)).toBe(true);
    expect(remote.orders.create.mock.calls.filter(([options]) => options.receipt === order.id)).toHaveLength(1);
    expect(remote.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 26525, currency: 'INR' }));
    const saved = await app.get<Model<Order>>(getModelToken(Order.name)).findOne({ id: order.id }).lean();
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_${order.id}`, order_id: saved!.razorpayOrderId, amount: order.totalPaise, currency: 'INR' } } } });
    await webhook(event, 'event-paid', 'invalid').expect(400);
    await webhook(event, 'event-paid').expect(201); await webhook(event, 'event-paid').expect(201);
    await app.get(ShippingService).bookPaidOrders(); await app.get(ShippingService).bookPaidOrders();
    const bookings = provider.request.mock.calls.filter(([path]) => path === 'orders/create/adhoc'); expect(bookings).toHaveLength(1);
    const shipment = await app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name)).findOne({ orderId: order.id }).lean(); expect(shipment?.awb).toBe('AWB100');
    await request(app.getHttpServer()).post('/orders').send({ ...data, customerName: 'Changed' }).expect(409);
  });
  it('holds amount mismatches and refunds without creating a shipment', async () => {
    const body = basket(); const shipping = await quote(body); const order = (await request(app.getHttpServer()).post('/orders').send(payload(body, shipping)).expect(201)).body;
    const started = (await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId).expect(201)).body;
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_mismatch', order_id: started.razorpayOrderId, amount: 1, currency: 'INR' } } } });
    await webhook(event, 'event-mismatch').expect(201); await app.get(ShippingService).bookPaidOrders();
    const saved = await app.get<Model<Order>>(getModelToken(Order.name)).findOne({ id: order.id }).lean(); expect(saved?.paymentReconciliationRequired).toBe(true);
    expect(await app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name)).exists({ orderId: order.id })).toBeNull();
  });
  it('preserves coupon totals and detects price changes and expiry before payment', async () => {
    await app.get<Model<Coupon>>(getModelToken(Coupon.name)).create({ code: 'SAVE', discountType: 'flat', discountValue: 1000, isActive: true });
    const body = { ...basket(), couponCode: 'SAVE' }; const shipping = await quote(body);
    expect(shipping.discountPaise).toBe(1000);
    const order = (await request(app.getHttpServer()).post('/orders').send(payload(body, shipping)).expect(201)).body;
    expect(order.totalPaise).toBe(25525); expect(order.taxPaise).toBe(0);
    await app.get<Model<CheckoutQuote>>(getModelToken(CheckoutQuote.name)).updateOne({ id: shipping.id }, { $set: { expiresAt: new Date(0) } });
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId).expect(409);
    const next = basket(); const nextQuote = await quote(next);
    await app.get<Model<Product>>(getModelToken(Product.name)).updateOne({ slug: 'nuts' }, { $set: { 'variants.0.pricePaise': 11000 } });
    await request(app.getHttpServer()).post('/orders').send(payload(next, nextQuote)).expect(409);
    await app.get<Model<Product>>(getModelToken(Product.name)).updateOne({ slug: 'nuts' }, { $set: { 'variants.0.pricePaise': 10000, 'variants.0.stockQuantity': 0 } });
    await request(app.getHttpServer()).post('/checkout/quotes').send(basket()).expect(409);
    await app.get<Model<Product>>(getModelToken(Product.name)).updateOne({ slug: 'nuts' }, { $set: { 'variants.0.stockQuantity': 80 } });
  });
  it('holds changed post-payment rates, supports merchant absorption and never books refunds', async () => {
    const body = basket(); const shipping = await quote(body); const order = (await request(app.getHttpServer()).post('/orders').send(payload(body, shipping)).expect(201)).body;
    const started = (await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId).expect(201)).body;
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_${order.id}`, order_id: started.razorpayOrderId, amount: order.totalPaise, currency: 'INR' } } } });
    await webhook(event, `event_${order.id}`).expect(201);
    const shipments = app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name)); const orders = app.get<Model<Order>>(getModelToken(Order.name));
    rate = 80; await app.get(ShippingService).bookPaidOrders(); expect(await shipments.exists({ orderId: order.id })).toBeNull();
    expect((await orders.findOne({ id: order.id }).lean())?.shippingReviewReason).toBeTruthy();
    process.env.SHIPROCKET_RATE_DIFFERENCE_POLICY = 'absorb'; await orders.updateOne({ id: order.id }, { $unset: { nextShippingAttemptAt: 1 } });
    await app.get(ShippingService).bookPaidOrders(); expect(await shipments.exists({ orderId: order.id })).toBeTruthy();
    expect((await orders.findOne({ id: order.id }).lean())?.totalPaise).toBe(26525);
    rate = 65.25; delete process.env.SHIPROCKET_RATE_DIFFERENCE_POLICY;
    const refunded = { ...basket() }; const refundQuote = await quote(refunded); const refundOrder = (await request(app.getHttpServer()).post('/orders').send(payload(refunded, refundQuote)).expect(201)).body;
    await orders.updateOne({ id: refundOrder.id }, { $set: { paymentStatus: 'refunded', status: 'refunded' } });
    await app.get(ShippingService).bookPaidOrders(); expect(await shipments.exists({ orderId: refundOrder.id })).toBeNull();
  });
  it('recovers an ambiguous Razorpay create by receipt without issuing another order', async () => {
    const body = basket(); const shipping = await quote(body); const order = (await request(app.getHttpServer()).post('/orders').send(payload(body, shipping)).expect(201)).body;
    remote.orders.create.mockRejectedValueOnce(new Error('Connection lost'));
    const start = () => request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId);
    await start().expect(503); const count = remote.orders.create.mock.calls.length;
    remote.orders.all.mockResolvedValueOnce({ items: [{ id: 'recovered_order', receipt: order.id, amount: order.totalPaise, currency: 'INR' }] } as any);
    const recovered = (await start().expect(201)).body; expect(recovered.razorpayOrderId).toBe('recovered_order');
    expect(remote.orders.create).toHaveBeenCalledTimes(count);
  });

});
