import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { ProductsService } from '../src/products/products.service';
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
        variants: [{ size: '250g', pricePaise: 27500, stockQuantity: 12, lowStockLimit: 3, isActive: true }],
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
      {
        slug: 'active-flag-draft', title: 'Draft with active flag', description: 'Must remain private', pricePaise: 10000,
        image: 'walnuts_ze0A.jpg', category: 'Premium Nuts', status: 'draft', isActive: true,
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
    expect(res.body.total).toBe(3);
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
    expect(drafts.body.items).toHaveLength(2);
    expect(drafts.body.items.map((product: Product) => product.slug)).toEqual(expect.arrayContaining(['walnuts-draft', 'active-flag-draft']));

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

  it('does not let catalogue updates bypass the inventory ledger', async () => {
    await request(app.getHttpServer())
      .patch('/products/admin/almonds')
      .set(auth('catalogue_manager'))
      .send({ variants: [{ size: '250g', pricePaise: 27500, stockQuantity: 999, lowStockLimit: 3, isActive: true }] })
      .expect(400);

    const product = await request(app.getHttpServer()).get('/products/admin/almonds').set(auth('catalogue_manager')).expect(200);
    expect(product.body.variants[0].stockQuantity).toBe(12);
  });
  it.each([
    { 'variants.0.stockQuantity': 999 },
    { 'variants.$[].stockQuantity': 999 },
    { $set: { 'variants.0.stockQuantity': 999 } },
    { variants: { '0': { stockQuantity: 999 } } },
    { variants: [{ size: '250g', pricePaise: 27500, stockQuantity: 12, 'stockQuantity.value': 999 }] },
  ])('rejects alternate stock update representations: %j', async payload => {
    await request(app.getHttpServer()).patch('/products/admin/almonds').set(auth('catalogue_manager')).send(payload).expect(400);
    const model = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    expect((await model.findOne({ slug: 'almonds' }))?.variants[0].stockQuantity).toBe(12);
  });

  it('keeps inventory product identifiers stable while allowing unchanged slugs', async () => {
    await request(app.getHttpServer()).patch('/products/admin/almonds').set(auth('catalogue_manager')).send({ slug: 'renamed-almonds' }).expect(400);
    await request(app.getHttpServer()).patch('/products/admin/almonds').set(auth('catalogue_manager')).send({ slug: 'almonds', seoTitle: 'Almonds' }).expect(200);
  });

  it('rejects opening stock and creates zero-stock drafts', async () => {
    const categories = app.get<Model<any>>(getModelToken('Category'));
    await categories.create({ name: 'Security test category', slug: 'security-test', isActive: true });
    const input = { slug: 'zero-stock', title: 'Zero stock', description: 'New catalogue item', image: 'nuts.jpg', category: 'Security test category', pricePaise: 10000, variants: [{ size: '250g', pricePaise: 10000, stockQuantity: 5 }] };
    await request(app.getHttpServer()).post('/products/admin').set(auth('catalogue_manager')).send(input).expect(400);
    const created = await request(app.getHttpServer()).post('/products/admin').set(auth('catalogue_manager')).send({ ...input, variants: [{ size: '250g', pricePaise: 10000 }] }).expect(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.variants[0].stockQuantity).toBe(0);
  });

  it('duplicates catalogue information with zero stock', async () => {
    const copy = await request(app.getHttpServer()).post('/products/admin/almonds/duplicate').set(auth('catalogue_manager')).expect(201);
    expect(copy.body.variants[0]).toMatchObject({ size: '250g', pricePaise: 27500, stockQuantity: 0 });
    expect(copy.body.status).toBe('draft');
  });

  it('allows ordinary pack edits while preserving the balance', async () => {
    const saved = await request(app.getHttpServer()).patch('/products/admin/almonds').set(auth('catalogue_manager')).send({ variants: [{ size: '250g', pricePaise: 28000, stockQuantity: 12, isActive: true }] }).expect(200);
    expect(saved.body.variants[0]).toMatchObject({ pricePaise: 28000, stockQuantity: 12 });
  });

  it('does not overwrite an inventory change that races a catalogue save', async () => {
    const model = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    const service = app.get(ProductsService);
    const validate = jest.spyOn(service as any, 'validateCommerce').mockImplementationOnce(async () => {
      await model.updateOne({ slug: 'almonds' }, { $inc: { 'variants.0.stockQuantity': 1 } });
    });
    try {
      await request(app.getHttpServer()).patch('/products/admin/almonds').set(auth('catalogue_manager')).send({ variants: [{ size: '250g', pricePaise: 28000, stockQuantity: 12, isActive: true }] }).expect(409);
      expect((await model.findOne({ slug: 'almonds' }))?.variants[0].stockQuantity).toBe(13);
    } finally { validate.mockRestore(); }
  });

  it('exports spreadsheet formulas as literal cells and retains CSV escaping', async () => {
    const model = app.get<Model<ProductDocument>>(getModelToken(Product.name));
    for (const prefix of ['=', '+', '-', '@', ' \t=', '\u0000=']) {
      await model.updateOne({ slug: 'almonds' }, { $set: { title: prefix + '1+1', description: 'Nuts, "fresh" — भारत\nSecond line' } });
      const csv = await request(app.getHttpServer()).get('/products/admin/export?q=almonds').set(auth('catalogue_manager')).expect(200);
      expect(csv.text).toContain(`"'${prefix}1+1"`);
      expect(csv.text).toContain('"Nuts, ""fresh"" — भारत\nSecond line"');
    }
  });

});
