import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { Product, ProductDocument } from '../src/products/product.schema';
import { Admin, AdminDocument, AdminRole } from '../src/admin/admin.schema';

/**
 * Admin catalogue reads: `GET /products/admin` and `GET /products/admin/:slug`.
 *
 * The public `GET /products` deliberately hides drafts, so these routes are the
 * console's only way to manage the full lifecycle. What matters here is the
 * boundary: no token is a 401, a staff role may read, and only
 * `SUPER_ADMIN`/`CATALOGUE_MANAGER` may write.
 */
describe('Admin catalogue reads (e2e)', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;

  /** 12+ characters: `LoginRequest` enforces the same minimum the console does. */
  const password = 'test-password-1234';
  const tokens: Record<string, string> = {};

  jest.setTimeout(120_000);

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email, password })
      .expect(201);
    return res.body.accessToken as string;
  };

  const auth = (role: keyof typeof tokens) => ({
    Authorization: `Bearer ${tokens[role]}`,
  });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('nutri_heaven_admin_test');

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
        status: 'active',
        isActive: true,
      },
      {
        slug: 'walnuts-draft',
        title: 'Kashmiri Walnuts',
        description: 'Tender kernels with a mellow finish',
        pricePaise: 38900,
        image: 'walnuts_ze0A.jpg',
        category: 'Premium Nuts',
        status: 'draft',
        isActive: false,
      },
    ]);

    const admins = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    const passwordHash = await hash(password, 10);
    await admins.insertMany([
      {
        name: 'Catalogue tester',
        email: 'catalogue@example.com',
        passwordHash,
        role: AdminRole.CATALOGUE_MANAGER,
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

    tokens.catalogue_manager = await login('catalogue@example.com');
    tokens.support = await login('support@example.com');
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it('requires a token', async () => {
    await request(app.getHttpServer()).get('/products/admin').expect(401);
    await request(app.getHttpServer())
      .get('/products/admin/almonds')
      .expect(401);
  });

  it('rejects a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email: 'catalogue@example.com', password: 'not-the-password' })
      .expect(401);
  });

  it('lists every lifecycle state, drafts included', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/admin')
      .set(auth('catalogue_manager'))
      .expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(50);
    expect(res.body.offset).toBe(0);
    expect(res.body.items.map((item: Product) => item.slug)).toEqual(
      expect.arrayContaining(['almonds', 'walnuts-draft']),
    );
  });

  it('filters by status and by search needle', async () => {
    const drafts = await request(app.getHttpServer())
      .get('/products/admin?status=draft')
      .set(auth('catalogue_manager'))
      .expect(200);
    expect(drafts.body.items).toHaveLength(1);
    expect(drafts.body.items[0].slug).toBe('walnuts-draft');

    const search = await request(app.getHttpServer())
      .get('/products/admin?q=cashew')
      .set(auth('catalogue_manager'))
      .expect(200);
    expect(search.body.total).toBe(0);

    const titleSearch = await request(app.getHttpServer())
      .get('/products/admin?q=walnut')
      .set(auth('catalogue_manager'))
      .expect(200);
    expect(titleSearch.body.items[0].slug).toBe('walnuts-draft');
  });

  it('rejects an invalid status or limit instead of ignoring it', async () => {
    await request(app.getHttpServer())
      .get('/products/admin?status=published')
      .set(auth('catalogue_manager'))
      .expect(400);
    await request(app.getHttpServer())
      .get('/products/admin?limit=0')
      .set(auth('catalogue_manager'))
      .expect(400);
  });

  it('reads a draft by slug and 404s unknown slugs', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/admin/walnuts-draft')
      .set(auth('catalogue_manager'))
      .expect(200);
    expect(res.body.status).toBe('draft');

    await request(app.getHttpServer())
      .get('/products/admin/nope')
      .set(auth('catalogue_manager'))
      .expect(404);
  });

  it('keeps the public catalogue free of drafts', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe('almonds');
    // `admin` must not be read as a slug by the public `:slug` route.
    await request(app.getHttpServer()).get('/products/admin').expect(401);
  });

  it('lets a read-only role read but not write', async () => {
    await request(app.getHttpServer())
      .get('/products/admin')
      .set(auth('support'))
      .expect(200);

    await request(app.getHttpServer())
      .post('/products/admin')
      .set(auth('support'))
      .send({ slug: 'blocked', title: 'Blocked' })
      .expect(403);
  });
});
