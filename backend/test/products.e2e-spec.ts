import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument } from '../src/products/product.schema';

/**
 * Full-stack catalogue tests: real HTTP through supertest, real Mongoose
 * queries against an in-memory MongoDB — no Docker required.
 *
 * A single-node `MongoMemoryServer` (not a replica set) is deliberate: the
 * memory-server's own replica-set setup handshake fails against current
 * MongoDB binaries (`ClientMetadataMissingField: driver` on 8.x, and 7.0.x
 * already comes from the pre-downloaded cache and fails the same way), while
 * Docker's `mongo:7.0` replica set works fine. Transactions are what need a
 * replica set, and nothing under test opens one — when phase 3 adds order
 * transactions, revisit to a replica set (or Docker-backed tests).
 */
describe('Products (e2e)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;

  // First run downloads the MongoDB binary (~100 MB); allow two minutes.
  jest.setTimeout(120_000);

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('nutri_heaven_test');

    // AppModule opens its own connection from MONGODB_URI, so only it is
    // imported — a second MongooseModule.forRoot would open a duplicate
    // connection to the same in-memory server.
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

    const products = app.get<Model<ProductDocument>>(
      getModelToken(Product.name),
    );
    await products.insertMany([
      {
        slug: 'almonds',
        title: 'California Almonds',
        description: 'Crisp, buttery and naturally wholesome',
        pricePaise: 27500,
        image: 'almonds_ze0A.jpg',
        category: 'Premium Nuts',
        isActive: true,
      },
      {
        slug: 'cashews',
        title: 'Roasted Cashews',
        description: 'Jumbo, golden and full of flavour',
        pricePaise: 29900,
        image: 'cashews_ze0A.jpg',
        category: 'Premium Nuts',
        isActive: true,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('GET /health reports ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
    });
  });

  it('GET /products lists active products', async () => {
    const res = await request(app.getHttpServer())
      .get('/products')
      .expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].slug).toBe('almonds');
  });

  it('GET /products/:slug returns one product', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/cashews')
      .expect(200);
    expect(res.body.pricePaise).toBe(29900);
  });

  it('GET /products/:slug 404s unknown slugs', async () => {
    await request(app.getHttpServer()).get('/products/nope').expect(404);
  });

  it('POST /products/quote prices from the database, not the client', async () => {
    const res = await request(app.getHttpServer())
      .post('/products/quote')
      .send({ lines: [{ slug: 'almonds', quantity: 2 }] })
      .expect(200);
    // 2 × ₹275 = ₹550 subtotal, below ₹999 so + ₹79 shipping.
    expect(res.body).toMatchObject({
      subtotalPaise: 55000,
      shippingPaise: 7900,
      totalPaise: 62900,
    });
  });

  it('POST /products/quote ships free at ₹999', async () => {
    const res = await request(app.getHttpServer())
      .post('/products/quote')
      .send({
        lines: [
          { slug: 'almonds', quantity: 2 },
          { slug: 'cashews', quantity: 2 },
        ],
      })
      .expect(200);
    // 2 × ₹275 + 2 × ₹299 = ₹1148 — over the threshold.
    expect(res.body).toMatchObject({
      subtotalPaise: 114800,
      shippingPaise: 0,
      totalPaise: 114800,
    });
  });

  it('POST /products/quote rejects empty carts and unknown slugs', async () => {
    await request(app.getHttpServer())
      .post('/products/quote')
      .send({ lines: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/products/quote')
      .send({ lines: [{ slug: 'nope', quantity: 1 }] })
      .expect(404);
  });
});