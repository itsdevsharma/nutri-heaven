import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/product.schema';
import { Order } from '../src/orders/order.schema';
import { PaymentsService } from '../src/payments/payments.service';
import { ShiprocketClient } from '../src/shipping/shiprocket.client';
import { ShippingService } from '../src/shipping/shipping.service';
import { storeDeliveryRate, packWeightGrams } from '../src/checkout/delivery-policy';
import { startMemoryReplica } from './helpers/memory-replica';

describe('Store delivery charges', () => {
  jest.setTimeout(120000);
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>;
  const oldEnv = { ...process.env };
  const provider = { configured: false, request: jest.fn(async () => { throw new Error('Store checkout must not call Shiprocket'); }) };
  const remote = { orders: { create: jest.fn(async () => ({ id: `order_${randomUUID()}` })) } };
  const local = { street: '12 Main', city: 'Hisar', state: 'Haryana', pin: '125001' };
  const regional = { ...local, city: 'Panipat', pin: '132103' };
  const interstate = { ...local, city: 'Delhi', state: 'Delhi', pin: '110001' };
  beforeAll(async () => {
    mongo = await startMemoryReplica();
    process.env.MONGODB_URI = mongo.uri;
    process.env.SHIPPING_RATE_MODE = 'store'; process.env.SHIPROCKET_CHECKOUT_ENABLED = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_store'; process.env.RAZORPAY_KEY_SECRET = 'test-secret';
    for (const key of Object.keys(process.env).filter(key => key.startsWith('STORE_SHIPPING_'))) delete process.env[key];
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ShiprocketClient).useValue(provider).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jest.spyOn(app.get(PaymentsService) as any, 'client').mockReturnValue(remote);
    await app.get<Model<Product>>(getModelToken(Product.name)).create({ slug: 'nuts', title: 'Nuts', description: 'Nuts', category: 'Nuts', image: 'nuts.jpg', status: 'active', pricePaise: 10000, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 100, isActive: true }, { size: '1kg', pricePaise: 35000, stockQuantity: 100, isActive: true }] });
  });
  afterAll(async () => {
    await app?.close(); await mongo?.stop();
    for (const key of new Set([...Object.keys(process.env), ...Object.keys(oldEnv)])) {
      if (key.startsWith('STORE_SHIPPING_') || ['MONGODB_URI', 'SHIPPING_RATE_MODE', 'SHIPROCKET_CHECKOUT_ENABLED', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'].includes(key)) {
        if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
      }
    }
  });
  it.each([
    [local, 500, 5000], [local, 501, 10000], [local, 1000, 10000],
    [regional, 3000, 10000], [regional, 3001, 20000],
    [interstate, 250, 15000], [interstate, 1000, 15000], [interstate, 1001, 30000],
  ])('rounds started slabs for %j at %ig', (address, grams, expected) => {
    expect(storeDeliveryRate(address, grams).option.shippingPaise).toBe(expected);
  });
  it('uses saved shipping weights or an explicit metric pack label', () => {
    expect(packWeightGrams('250g')).toBe(250);
    expect(packWeightGrams('0.5 kg')).toBe(500);
    expect(packWeightGrams('500 gm')).toBe(500);
    expect(packWeightGrams('250g', 280)).toBe(280);
    expect(() => packWeightGrams('Gift box')).toThrow('weight');
  });
  const basket = () => ({ cartId: randomUUID(), deliveryAddress: interstate, paymentMethod: 'razorpay', lines: [{ productSlug: 'nuts', packSize: '250g', quantity: 3 }, { productSlug: 'nuts', packSize: '1kg', quantity: 1 }] });
  const quote = async (body: any) => (await request(app.getHttpServer()).post('/checkout/quotes').send(body).expect(201)).body;
  const orderPayload = (body: any, shipping: any) => ({ ...body, customerName: 'Buyer', customerEmail: 'buyer@example.com', customerPhone: '9876543210', shippingQuoteId: shipping.id, courierId: 1, idempotencyKey: randomUUID() });
  it('quotes without credentials, pickup defaults, or pack shipping metadata and charges the exact total', async () => {
    await request(app.getHttpServer()).get('/checkout/configuration').expect(200, { enabled: true, mode: 'store' });
    const body = basket(); const shipping = await quote(body);
    expect(shipping).toMatchObject({ source: 'store', subtotalPaise: 65000, taxPaise: 0, storeRate: { zone: 'interstate', weightGrams: 1750, slabs: 2 }, options: [expect.objectContaining({ shippingPaise: 30000 })] });
    expect(shipping.parcel).toBeUndefined();
    const order = (await request(app.getHttpServer()).post('/orders').send(orderPayload(body, shipping)).expect(201)).body;
    expect(order).toMatchObject({ shippingPaise: 30000, totalPaise: 95000, shippingQuote: { source: 'store', storeRate: { weightGrams: 1750 } } });
    const payment = (await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId).expect(201)).body;
    expect(payment.amount).toBe(95000);
    expect(remote.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 95000, currency: 'INR' }));
    expect(provider.request).not.toHaveBeenCalled();
    const orders = app.get<Model<Order>>(getModelToken(Order.name));
    await orders.updateOne({ id: order.id }, { $set: { status: 'confirmed', paymentStatus: 'paid' } });
    provider.configured = true;
    await app.get(ShippingService).bookPaidOrders();
    expect(provider.request).not.toHaveBeenCalled();
    await expect(app.get(ShippingService).action(order.id, 'create', {}, 'admin')).rejects.toThrow('Pack the order');
    provider.configured = false;
  });
  it('rejects an address changed to claim a cheaper zone and rejects changed rates before payment', async () => {
    await request(app.getHttpServer()).post('/checkout/quotes').send({ ...basket(), deliveryAddress: { ...interstate, city: 'Hisar', state: 'Haryana' } }).expect(400);
    const body = basket(); const shipping = await quote(body);
    const order = (await request(app.getHttpServer()).post('/orders').send(orderPayload(body, shipping)).expect(201)).body;
    process.env.STORE_SHIPPING_INTERSTATE_RATE_PAISE = '20000';
    await request(app.getHttpServer()).post(`/payments/razorpay/orders/${order.id}`).set('x-cart-id', body.cartId).expect(409);
    delete process.env.STORE_SHIPPING_INTERSTATE_RATE_PAISE;
  });
});
