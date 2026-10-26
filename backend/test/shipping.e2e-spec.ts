import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadGatewayException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Admin, AdminRole } from '../src/admin/admin.schema';
import { Order } from '../src/orders/order.schema';
import { ShiprocketClient, ShiprocketRejectedException } from '../src/shipping/shiprocket.client';
import { ShiprocketShipment } from '../src/shipping/shipping.schema';
import { startMemoryReplica } from './helpers/memory-replica';

describe('Shiprocket admin shipping', () => {
  let app: INestApplication, mongo: Awaited<ReturnType<typeof startMemoryReplica>>, admin: string, support: string;
  const provider = { configured: true, request: jest.fn() };
  const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
  const base = '/admin/shipping';
  jest.setTimeout(120000);
  beforeAll(async () => {
    mongo = await startMemoryReplica(); process.env.MONGODB_URI = mongo.uri;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ShiprocketClient).useValue(provider).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
    for (const role of [AdminRole.SUPER_ADMIN, AdminRole.SUPPORT]) {
      await app.get<Model<Admin>>(getModelToken(Admin.name)).create({ name: role, email: `${role}@example.com`, role, passwordHash: await hash('test-password-1234', 10) });
      const response = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: `${role}@example.com`, password: 'test-password-1234' }).expect(201);
      if (role === AdminRole.SUPER_ADMIN) admin = response.body.accessToken; else support = response.body.accessToken;
    }
    const defaults = { customerName: 'Test Buyer', customerEmail: 'buyer@example.com', customerPhone: '9876543210', deliveryAddress: { street: '12 Street', city: 'Hisar', state: 'Haryana', pin: '125001' }, lines: [{ productSlug: 'almonds', productName: 'Almonds', packSize: '250g', quantity: 2, unitPricePaise: 12550, lineTotalPaise: 25100 }], subtotalPaise: 25100, couponDiscountPaise: 1000, shippingPaise: 5000, totalPaise: 29100, paymentMethod: 'cod', paymentStatus: 'pending', status: 'packed', stockReserved: true, operations: { fulfillment: 'ready_to_dispatch', shipment: 'not_created', returnStatus: 'not_requested', codCollectedPaise: 0, codSettledPaise: 0 } };
    await app.get<Model<Order>>(getModelToken(Order.name)).create(['SHIP-1', 'SHIP-2', 'SHIP-3', 'SHIP-4'].map(id => ({ ...defaults, id, cartId: id, idempotencyKey: id })));
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); });
  it('protects configuration, validates parcel units and projects pickup details', async () => {
    await request(app.getHttpServer()).get(`${base}/configuration`).expect(401);
    const dto = { pickupLocation: 'Warehouse', weight: 0.6, length: 20, breadth: 15, height: 8 };
    await request(app.getHttpServer()).put(`${base}/configuration`).set(headers(support)).send(dto).expect(403);
    await request(app.getHttpServer()).put(`${base}/configuration`).set(headers(admin)).send({ ...dto, weight: 0 }).expect(400);
    await request(app.getHttpServer()).put(`${base}/configuration`).set(headers(admin)).send(dto).expect(200);
    provider.request.mockResolvedValueOnce({ data: { shipping_address: [{ pickup_location: 'Warehouse', address: '12 Main', city: 'Hisar', pin_code: '125001', secret: 'hidden' }] } });
    const locations = await request(app.getHttpServer()).get(`${base}/pickup-locations`).set(headers(support)).expect(200);
    expect(locations.body[0].name).toBe('Warehouse'); expect(locations.body[0].secret).toBeUndefined();
  });
  it('books from authoritative prices once and supports AWB, pickup, label, manifest and tracking', async () => {
    provider.request.mockResolvedValueOnce({ order_id: 100, shipment_id: 200 });
    const book = await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/create`).set(headers(support)).send({ weight: 0.7 }).expect(201);
    expect(book.body.shipmentId).toBe(200);
    const payload = provider.request.mock.calls.at(-1)?.[2];
    expect(payload.payment_method).toBe('COD'); expect(payload.sub_total).toBe(291); expect(payload.order_items[0].selling_price).toBe(125.5); expect(payload.weight).toBe(0.7);
    const count = provider.request.mock.calls.length;
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/create`).set(headers(support)).send({}).expect(201);
    expect(provider.request).toHaveBeenCalledTimes(count);
    await request(app.getHttpServer()).post('/orders/admin/SHIP-1/cancel').set(headers(admin)).send({ reason: 'Customer request' }).expect(400);
    provider.request.mockResolvedValueOnce({ awb_assign_status: 1, response: { data: { awb_code: 'AWB123', courier_name: 'Courier' } } });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/awb`).set(headers(support)).send({ courierId: 42 }).expect(201);
    provider.request.mockResolvedValueOnce({ pickup_status: 1 });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/pickup`).set(headers(support)).send({}).expect(201);
    provider.request.mockResolvedValueOnce({ label_url: 'https://example.com/label.pdf' });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/label`).set(headers(support)).send({}).expect(201);
    provider.request.mockResolvedValueOnce({ status: 1 }).mockResolvedValueOnce({ manifest_url: 'https://example.com/manifest.pdf' });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/manifest`).set(headers(support)).send({}).expect(201);
    provider.request.mockResolvedValueOnce({ tracking_data: { track_status: 1, shipment_track: [{ current_status: 'IN TRANSIT' }], shipment_track_activities: [{ date: '2026-10-25', activity: 'Picked up', location: 'Hisar' }] } });
    const tracked = await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/track`).set(headers(support)).send({}).expect(201);
    expect(tracked.body.tracking.status).toBe('IN TRANSIT');
    const order = await app.get<Model<Order>>(getModelToken(Order.name)).findOne({ id: 'SHIP-1' });
    expect(order?.trackingNumber).toBe('AWB123'); expect(order?.status).toBe('packed'); expect(order?.paymentStatus).toBe('pending');
  });
  it('keeps ambiguous bookings recoverable without allowing another provider create', async () => {
    provider.request.mockRejectedValueOnce(new BadGatewayException('Shiprocket timeout'));
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-2/create`).set(headers(admin)).send({}).expect(502);
    const count = provider.request.mock.calls.length;
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-2/create`).set(headers(admin)).send({}).expect(201);
    expect(provider.request).toHaveBeenCalledTimes(count);
    provider.request.mockResolvedValueOnce({ data: { id: 101, channel_order_id: 'OTHER', shipments: [{ id: 201 }] } });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-2/reconcile`).set(headers(admin)).send({ providerOrderId: 101 }).expect(400);
    provider.request.mockResolvedValueOnce({ data: { id: 101, channel_order_id: 'SHIP-2', shipments: [{ id: 201, awb: 'AWB456', courier: 'Courier' }] } });
    const recovered = await request(app.getHttpServer()).post(`${base}/orders/SHIP-2/reconcile`).set(headers(admin)).send({ providerOrderId: 101 }).expect(201);
    expect(recovered.body.error).toBeUndefined(); expect(recovered.body.shipmentId).toBe(201);
    provider.request.mockResolvedValueOnce({ status: 200 }).mockResolvedValueOnce({ data: { id: 101, channel_order_id: 'SHIP-2', status_code: 5, shipments: [{ id: 201 }] } });
    const cancelled = await request(app.getHttpServer()).post(`${base}/orders/SHIP-2/cancel`).set(headers(admin)).send({}).expect(201);
    expect(cancelled.body.providerCancelled).toBe(true);
    expect((await app.get<Model<Order>>(getModelToken(Order.name)).findOne({ id: 'SHIP-2' }))?.shiprocketBookingStarted).toBe(false);
  });
  it('rejects invalid input, unpaid prepaid orders and concurrent actions', async () => {
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-3/create`).set(headers(admin)).send({ weight: -1 }).expect(400);
    const orders = app.get<Model<Order>>(getModelToken(Order.name));
    await orders.updateOne({ id: 'SHIP-3' }, { $set: { paymentMethod: 'razorpay', paymentStatus: 'pending' } });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-3/create`).set(headers(admin)).send({}).expect(400);
    await app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name)).updateOne({ orderId: 'SHIP-1' }, { $set: { lockedUntil: new Date(Date.now() + 60000) } });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-1/track`).set(headers(admin)).send({}).expect(409);
  });
  it('allows a corrected booking after a definitive provider rejection', async () => {
    provider.request.mockRejectedValueOnce(new ShiprocketRejectedException());
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-4/create`).set(headers(admin)).send({}).expect(400);
    expect(await app.get<Model<ShiprocketShipment>>(getModelToken(ShiprocketShipment.name)).findOne({ orderId: 'SHIP-4' })).toBeNull();
    expect((await app.get<Model<Order>>(getModelToken(Order.name)).findOne({ id: 'SHIP-4' }))?.shiprocketBookingStarted).toBe(false);
    provider.request.mockResolvedValueOnce({ order_id: 104, shipment_id: 204 });
    await request(app.getHttpServer()).post(`${base}/orders/SHIP-4/create`).set(headers(admin)).send({}).expect(201);
  });

});
