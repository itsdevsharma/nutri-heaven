import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { Product, ProductDocument } from '../src/products/product.schema';
import { Admin, AdminDocument, AdminRole } from '../src/admin/admin.schema';
import { InventoryService } from '../src/inventory/inventory.service';
import { InventoryMovement } from '../src/inventory/inventory-movement.schema';
import { OrderService } from '../src/orders/order.service';
import { Order, OrderDocument } from '../src/orders/order.schema';
import { Cart, CartDocument } from '../src/cart/cart.schema';

/**
 * Inventory (e2e): the console's stock screens against the real HTTP stack.
 *
 * What matters at this boundary:
 * - every inventory read/write requires a token and an inventory-capable role;
 * - `PATCH /inventory/admin/adjust` writes an immutable ledger row with the
 *   resulting balance and never lets a balance go negative;
 * - the idempotency key makes a retried submit a no-op;
 * - `reserveForOrder` is exercised through `InventoryService` directly (the
 *   orders module that will call it is step 7) to prove automatic deduction
 *   and its compensating release;
 * - the low-stock and out-of-stock views derive server-side from each
 *   variant's own low-stock limit.
 */
describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let inventory: InventoryService;

  const password = 'test-password-1234';
  let managerToken = '';
  let supportToken = '';

  jest.setTimeout(120_000);

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    // Transactions require a replica set. The development compose stack runs
    // Mongo as rs0; use a dedicated disposable test database on that instance.
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI
      ?? 'mongodb://127.0.0.1:27017/nutri_heaven_inventory_test?directConnection=true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const products = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    await products.deleteMany({});
    await app.get<Model<OrderDocument>>(getModelToken(Order.name)).deleteMany({});
    await app.get<Model<CartDocument>>(getModelToken(Cart.name)).deleteMany({});
    await products.insertMany([
      {
        slug: 'almonds',
        title: 'California Almonds',
        description: 'Crisp, buttery and naturally wholesome',
        pricePaise: 27500,
        image: 'almonds_ze0A.jpg',
        category: 'Premium Nuts',
        isActive: true,
        status: 'active',
        variants: [
          { size: '250g', pricePaise: 27500, stockQuantity: 50, lowStockLimit: 10, isActive: true },
          { size: '1kg', pricePaise: 99900, stockQuantity: 0, lowStockLimit: 5, isActive: true },
        ],
      },
      {
        slug: 'cashews',
        title: 'Roasted Cashews',
        description: 'Jumbo, golden and full of flavour',
        pricePaise: 29900,
        image: 'cashews_ze0A.jpg',
        category: 'Premium Nuts',
        isActive: true,
        status: 'active',
        variants: [{ size: '250g', pricePaise: 29900, stockQuantity: 8, lowStockLimit: 10, isActive: true }],
      },
    ]);

    const admins = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    await admins.deleteMany({});
    await app.get<Model<any>>(getModelToken(InventoryMovement.name)).deleteMany({});
    const passwordHash = await hash(password, 10);
    await admins.insertMany([
      {
        name: 'Inventory manager',
        email: 'inventory@example.com',
        passwordHash,
        role: AdminRole.INVENTORY_MANAGER,
        isActive: true,
      },
      {
        name: 'Support tester',
        email: 'support@example.com',
        passwordHash,
        role: AdminRole.SUPPORT,
        isActive: true,
      },
    ]);

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({ email, password })
        .expect(201);
      return res.body.accessToken as string;
    };
    managerToken = await login('inventory@example.com');
    supportToken = await login('support@example.com');

    inventory = app.get(InventoryService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a token and an inventory-capable role', async () => {
    await request(app.getHttpServer()).get('/inventory/admin').expect(401);
    await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .send({ productSlug: 'almonds', packSize: '250g', balance: 10, reason: 'x', idempotencyKey: 'k1' })
      .expect(401);
    // Support may look, but may not move stock.
    await request(app.getHttpServer()).get('/inventory/admin').set(auth(supportToken)).expect(200);
    await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .set(auth(supportToken))
      .send({ productSlug: 'almonds', packSize: '250g', balance: 10, reason: 'x', idempotencyKey: 'k2' })
      .expect(403);
  });

  it('lists variant-level stock with a summary and rejects bad views', async () => {
    const res = await request(app.getHttpServer())
      .get('/inventory/admin')
      .set(auth(managerToken))
      .expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.summary).toMatchObject({ skus: 3, units: 58, low: 1, out: 1 });

    const low = await request(app.getHttpServer())
      .get('/inventory/admin?view=low')
      .set(auth(managerToken))
      .expect(200);
    expect(low.body.items).toHaveLength(1);
    expect(low.body.items[0].productSlug).toBe('cashews');

    const out = await request(app.getHttpServer())
      .get('/inventory/admin?view=out')
      .set(auth(managerToken))
      .expect(200);
    expect(out.body.items.map((item: any) => item.packSize)).toEqual(['1kg']);

    await request(app.getHttpServer())
      .get('/inventory/admin?view=broken')
      .set(auth(managerToken))
      .expect(400);
  });

  it('adjusts stock and writes a ledger row with the resulting balance', async () => {
    const res = await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .set(auth(managerToken))
      .send({
        productSlug: 'cashews',
        packSize: '250g',
        balance: 20,
        reason: 'Weekly stock count',
        idempotencyKey: 'adj-1',
      })
      .expect(200);
    expect(res.body).toMatchObject({ productSlug: 'cashews', packSize: '250g', quantity: 12, balance: 20 });

    const products = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    const cashews = await products.findOne({ slug: 'cashews' }).lean().exec();
    expect(cashews?.variants?.[0]).toMatchObject({ stockQuantity: 20 });

    const movements = await request(app.getHttpServer())
      .get('/inventory/admin/movements?productSlug=cashews')
      .set(auth(managerToken))
      .expect(200);
    expect(movements.body.total).toBe(1);
    expect(movements.body.items[0]).toMatchObject({ type: 'adjustment', quantity: 12, balance: 20 });
  });

  it('accepts a counted balance from zero and blocks invalid adjustments', async () => {
    // A stock count sets an absolute balance; it is not a reservation and may
    // legitimately restore an out-of-stock SKU to a positive counted value.
    const counted = await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .set(auth(managerToken))
      .send({ productSlug: 'almonds', packSize: '1kg', balance: 5, reason: 'nope', idempotencyKey: 'adj-neg' })
      .expect(200);
    expect(counted.body).toMatchObject({ quantity: 5, balance: 5, type: 'adjustment' });

    await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .set(auth(managerToken))
      .send({ productSlug: 'almonds', packSize: '1kg', balance: 0, reason: '', idempotencyKey: 'adj-no-reason' })
      .expect(400);
  });

  it('is idempotent: a retried submit does not apply twice', async () => {
    await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .set(auth(managerToken))
      .send({ productSlug: 'almonds', packSize: '250g', balance: 45, reason: 'Count', idempotencyKey: 'adj-retry' })
      .expect(200);

    const second = await request(app.getHttpServer())
      .patch('/inventory/admin/adjust')
      .set(auth(managerToken))
      .send({ productSlug: 'almonds', packSize: '250g', balance: 45, reason: 'Count', idempotencyKey: 'adj-retry' })
      .expect(200);

    const movements = await request(app.getHttpServer())
      .get('/inventory/admin/movements?productSlug=almonds&packSize=250g')
      .set(auth(managerToken))
      .expect(200);
    expect(movements.body.total).toBe(1);

    const products = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    const almonds = await products.findOne({ slug: 'almonds' }).lean().exec();
    const pack = almonds?.variants?.find((variant: any) => variant.size === '250g');
    expect(pack?.stockQuantity).toBe(45);
    expect(second.body.quantity).toBe(-5);
  });

  it('deducts stock automatically through the order hook and restores it on cancel', async () => {
    // Isolate the unavailable-pack check from the preceding counted-balance test.
    await request(app.getHttpServer()).patch('/inventory/admin/adjust').set(auth(managerToken))
      .send({ productSlug: 'almonds', packSize: '1kg', balance: 0, reason: 'Test reset', idempotencyKey: 'reset-1kg-before-reservation' }).expect(200);
    await inventory.reserveForOrder('NH1001', [{ productSlug: 'almonds', packSize: '250g', quantity: 5 }]);

    const products = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    const readStock = async (): Promise<number | undefined> => {
      const doc = await products.findOne({ slug: 'almonds' }).lean().exec();
      return doc?.variants?.find((variant: any) => variant.size === '250g')?.stockQuantity;
    };

    expect(await readStock()).toBe(40);

    // Retrying the same order must not deduct twice.
    await inventory.reserveForOrder('NH1001', [{ productSlug: 'almonds', packSize: '250g', quantity: 5 }]);
    expect(await readStock()).toBe(40);

    // An order that cannot be fulfilled aborts without moving anything.
    await expect(
      inventory.reserveForOrder('NH1002', [{ productSlug: 'almonds', packSize: '1kg', quantity: 3 }]),
    ).rejects.toThrow();
    expect(await readStock()).toBe(40);

    await inventory.releaseForOrder('NH1001', [{ productSlug: 'almonds', packSize: '250g', quantity: 5 }]);
    expect(await readStock()).toBe(45);

    const ledger = await request(app.getHttpServer())
      .get('/inventory/admin/movements?productSlug=almonds&packSize=250g')
      .set(auth(managerToken))
      .expect(200);
    const types = ledger.body.items.map((movement: any) => movement.type).sort();
    expect(types).toEqual(['adjustment', 'cancelled', 'order-reserved']);
  });

  it('prevents overselling under competing orders and rolls back a multi-line reservation', async () => {
    await inventory.adjust({ productSlug: 'almonds', packSize: '250g', balance: 10, reason: 'Concurrency fixture', idempotencyKey: 'concurrency-reset', actor: 'test' });
    const competing = await Promise.allSettled([
      inventory.reserveForOrder('NH-CONCURRENT-A', [{ productSlug: 'almonds', packSize: '250g', quantity: 7 }]),
      inventory.reserveForOrder('NH-CONCURRENT-B', [{ productSlug: 'almonds', packSize: '250g', quantity: 7 }]),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const products = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    const almondsAfterRace = await products.findOne({ slug: 'almonds' }).lean().exec();
    expect(almondsAfterRace?.variants?.find((variant) => variant.size === '250g')?.stockQuantity).toBe(3);
    await inventory.adjust({ productSlug: 'cashews', packSize: '250g', balance: 1, reason: 'Atomic basket fixture', idempotencyKey: 'basket-reset', actor: 'test' });
    await expect(inventory.reserveForOrder('NH-MULTI-LINE', [
      { productSlug: 'almonds', packSize: '250g', quantity: 1 },
      { productSlug: 'cashews', packSize: '250g', quantity: 2 },
    ])).rejects.toThrow();
    const almondsAfterAbort = await products.findOne({ slug: 'almonds' }).lean().exec();
    expect(almondsAfterAbort?.variants?.find((variant) => variant.size === '250g')?.stockQuantity).toBe(3);
    const movements = await app.get<Model<any>>(getModelToken(InventoryMovement.name)).find({ referenceId: 'NH-MULTI-LINE' }).lean().exec();
    expect(movements).toHaveLength(0);
  });

  it('commits captured payment once, releases failed payment once, and flags late capture for reconciliation', async () => {
    const orders = app.get<OrderService>(OrderService);
    const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
    const create = (key: string) => orders.createOrder({
      cartId: key, idempotencyKey: key, customerName: 'Test Customer', customerEmail: `${key}@example.com`, customerPhone: '1234567890',
      deliveryAddress: { street: 'Test Road', city: 'Bengaluru', state: 'Karnataka', pin: '560001' },
      lines: [{ productSlug: 'almonds', packSize: '250g', quantity: 1 }], paymentMethod: 'razorpay',
    });
    const paymentOrder = await create('payment-capture-test');
    await orders.attachRazorpayOrder(paymentOrder.id, 'rzp-capture-test');
    await orders.captureRazorpayPayment('rzp-capture-test', 'pay-capture-test', paymentOrder.totalPaise, 'INR');
    await orders.captureRazorpayPayment('rzp-capture-test', 'pay-capture-test', paymentOrder.totalPaise, 'INR');
    const captured = await orderModel.findOne({ id: paymentOrder.id }).lean().exec();
    expect(captured).toMatchObject({ paymentStatus: 'paid', status: 'confirmed', stockCommitted: true });
    expect(await app.get<Model<any>>(getModelToken(InventoryMovement.name)).countDocuments({ idempotencyKey: `commit:${paymentOrder.idempotencyKey}:almonds:250g` })).toBe(1);

    const failedOrder = await create('payment-failure-test');
    await orders.attachRazorpayOrder(failedOrder.id, 'rzp-failure-test');
    await orders.failRazorpayPayment('rzp-failure-test');
    await orders.failRazorpayPayment('rzp-failure-test');
    const failed = await orderModel.findOne({ id: failedOrder.id }).lean().exec();
    expect(failed).toMatchObject({ paymentStatus: 'failed', status: 'pending', stockReserved: true });
    await orders.cancel(failedOrder.id, 'Customer abandoned checkout', 'test-admin');
    await orders.captureRazorpayPayment('rzp-failure-test', 'pay-late-test', failedOrder.totalPaise, 'INR');
    const late = await orderModel.findOne({ id: failedOrder.id }).lean().exec();
    expect(late).toMatchObject({ paymentStatus: 'paid', status: 'cancelled', paymentReconciliationRequired: true });
    expect(late?.paymentReconciliationNote).toMatch(/refund or manual recovery required/i);
  });

  it('restores returned stock and only marks refunded after a provider refund reference exists', async () => {
    const orders = app.get<OrderService>(OrderService);
    const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
    const before = await app.get<Model<ProductDocument>>(getModelToken(Product.name)).findOne({ slug: 'almonds' }).lean().exec();
    const startingStock = before?.variants?.find((variant) => variant.size === '250g')?.stockQuantity ?? 0;
    const order = await orders.createOrder({
      cartId: 'return-refund-test', idempotencyKey: 'return-refund-test', customerName: 'Test Customer', customerEmail: 'return@example.com', customerPhone: '1234567890',
      deliveryAddress: { street: 'Test Road', city: 'Bengaluru', state: 'Karnataka', pin: '560001' },
      lines: [{ productSlug: 'almonds', packSize: '250g', quantity: 1 }], paymentMethod: 'razorpay',
    });
    await orders.attachRazorpayOrder(order.id, 'rzp-return-test');
    await orders.captureRazorpayPayment('rzp-return-test', 'pay-return-test', order.totalPaise, 'INR');
    for (const status of ['packed', 'shipped', 'out_for_delivery', 'delivered', 'return_requested', 'returned'] as const) {
      await orders.updateStatus(order.id, status);
    }
    const afterReturn = await app.get<Model<ProductDocument>>(getModelToken(Product.name)).findOne({ slug: 'almonds' }).lean().exec();
    expect(afterReturn?.variants?.find((variant) => variant.size === '250g')?.stockQuantity).toBe(startingStock);
    await expect(orders.updateStatus(order.id, 'refunded', { refundReference: 'forged-ref' })).rejects.toThrow(/refund workflow/i);
    const refunded = await orders.markRefunded(order.id, 'rfnd_test_provider_id', 'test-admin');
    expect(refunded).toMatchObject({ status: 'refunded', paymentStatus: 'refunded', refundReference: 'rfnd_test_provider_id' });
    expect((await orderModel.findOne({ id: order.id }).lean().exec())?.statusHistory.at(-1)?.actor).toBe('test-admin');
  });

  it('carries independently priced selected packs through the public order API into their stock ledgers', async () => {
    await inventory.adjust({ productSlug: 'almonds', packSize: '250g', balance: 5, reason: 'Variant flow fixture', idempotencyKey: 'variant-flow-reset-small', actor: 'test' });
    await inventory.adjust({ productSlug: 'almonds', packSize: '1kg', balance: 6, reason: 'Variant flow fixture', idempotencyKey: 'variant-flow-reset', actor: 'test' });
    const cart = await request(app.getHttpServer()).post('/cart/items').set('x-cart-id', 'variant-flow-cart')
      .send({ productId: 'almonds', packSize: '250g', quantity: 1 }).expect(201);
    const multiPackCart = await request(app.getHttpServer()).post('/cart/items').set('x-cart-id', 'variant-flow-cart')
      .send({ productId: 'almonds', packSize: '1kg', quantity: 2 }).expect(201);
    expect(cart.body.items[0]).toMatchObject({ productId: 'almonds', packSize: '250g', unitPricePaise: 27500 });
    expect(multiPackCart.body.items.map((line: any) => [line.packSize, line.unitPricePaise])).toEqual([['250g', 27500], ['1kg', 99900]]);
    const response = await request(app.getHttpServer()).post('/orders').send({
      cartId: 'variant-flow-cart', idempotencyKey: 'variant-flow-order', customerName: 'Pack Buyer', customerEmail: 'packs@example.com', customerPhone: '1234567890',
      deliveryAddress: { street: 'Test Road', city: 'Bengaluru', state: 'Karnataka', pin: '560001' },
      lines: multiPackCart.body.items.map((line: any) => ({ productSlug: line.productId, packSize: line.packSize, quantity: line.quantity })),
      paymentMethod: 'cod',
    }).expect(201);
    expect(response.body.lines.map((line: any) => [line.packSize, line.unitPricePaise])).toEqual([['250g', 27500], ['1kg', 99900]]);
    const product = await app.get<Model<ProductDocument>>(getModelToken(Product.name)).findOne({ slug: 'almonds' }).lean().exec();
    expect(product?.variants?.find((variant) => variant.size === '1kg')?.stockQuantity).toBe(4);
    const movements = await app.get<Model<any>>(getModelToken(InventoryMovement.name)).find({ referenceId: 'variant-flow-order', type: 'order-reserved' }).lean().exec();
    expect(movements.map((movement) => [movement.packSize, movement.quantity]).sort()).toEqual([['1kg', -2], ['250g', -1]]);
  });
});
