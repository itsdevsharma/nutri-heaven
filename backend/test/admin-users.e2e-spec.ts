import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AdminUsersModule } from '../src/admin/admin-users.module';
import { Admin, AdminDocument, AdminRole } from '../src/admin/admin.schema';

describe('Admin user management', () => {
  let app: INestApplication;
  let mongo: MongoMemoryServer;
  let rootId: string;
  let token: string;
  let supportToken: string;
  let userId: string;
  const password = 'test-password-1234';
  jest.setTimeout(120000);
  const login = async (email: string, secret = password) => (await request(app.getHttpServer()).post('/admin/auth/login').send({ email, password: secret }).expect(201)).body.accessToken;
  const root = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({ imports: [MongooseModule.forRoot(mongo.getUri()), AdminUsersModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const admins = app.get<Model<AdminDocument>>(getModelToken(Admin.name));
    await admins.init();
    const passwordHash = await hash(password, 10);
    const admin = await admins.create({ name: 'Root', email: 'root@example.com', passwordHash, role: AdminRole.SUPER_ADMIN });
    rootId = admin.id;
    await admins.create({ name: 'Support', email: 'support@example.com', passwordHash, role: AdminRole.SUPPORT });
    token = await login('root@example.com'); supportToken = await login('support@example.com');
  });
  afterAll(async () => { await app?.close(); await mongo?.stop(); });
  it('restricts all operations to super admins', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(401);
    for (const method of ['get', 'post', 'patch'] as const) {
      await request(app.getHttpServer())[method](method === 'patch' ? `/admin/users/${rootId}` : '/admin/users').set({ Authorization: `Bearer ${supportToken}` }).send({}).expect(403);
    }
  });
  it('creates normalized accounts, validates input, and excludes credentials', async () => {
    await request(app.getHttpServer()).post('/admin/users').set(root()).send({ name: 'Bad', email: 'bad@example.com', password: 'short', role: 'support' }).expect(400);
    await request(app.getHttpServer()).post('/admin/users').set(root()).send({ name: 'Bad', email: 'bad@example.com', password, role: 'invalid' }).expect(400);
    const created = await request(app.getHttpServer()).post('/admin/users').set(root()).send({ name: ' New user ', email: ' NEW@example.com ', password, role: 'catalogue_manager' }).expect(201);
    userId = created.body._id;
    expect(created.body.name).toBe('New user'); expect(created.body.email).toBe('new@example.com');
    expect(created.body.passwordHash).toBeUndefined(); expect(created.body.refreshTokenHash).toBeUndefined();
    await login('new@example.com');
    await request(app.getHttpServer()).post('/admin/users').set(root()).send({ name: 'Duplicate', email: 'NEW@example.com', password, role: 'support' }).expect(409);
    const list = await request(app.getHttpServer()).get('/admin/users').set(root()).expect(200);
    expect(list.body).toHaveLength(3);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
  });
  it('prevents self lockout and handles missing IDs', async () => {
    await request(app.getHttpServer()).patch(`/admin/users/${rootId}`).set(root()).send({ isActive: false }).expect(400);
    await request(app.getHttpServer()).patch(`/admin/users/${rootId}`).set(root()).send({ role: 'support' }).expect(400);
    await request(app.getHttpServer()).patch('/admin/users/invalid').set(root()).send({ name: 'Test' }).expect(400);
    await request(app.getHttpServer()).patch('/admin/users/000000000000000000000000').set(root()).send({ name: 'Test' }).expect(404);
    await request(app.getHttpServer()).patch(`/admin/users/${userId}`).set(root()).send({ email: 'root@example.com' }).expect(409);
  });
  it('revokes sessions on role changes, deactivation, and password reset', async () => {
    let oldToken = await login('new@example.com');
    await request(app.getHttpServer()).patch(`/admin/users/${userId}`).set(root()).send({ role: 'super_admin' }).expect(200);
    await request(app.getHttpServer()).get('/admin/users').set({ Authorization: `Bearer ${oldToken}` }).expect(401);
    oldToken = await login('new@example.com');
    await request(app.getHttpServer()).patch(`/admin/users/${userId}`).set(root()).send({ isActive: false }).expect(200);
    await request(app.getHttpServer()).get('/admin/users').set({ Authorization: `Bearer ${oldToken}` }).expect(401);
    await request(app.getHttpServer()).post('/admin/auth/login').send({ email: 'new@example.com', password }).expect(401);
    await request(app.getHttpServer()).patch(`/admin/users/${userId}`).set(root()).send({ isActive: true }).expect(200);
    oldToken = await login('new@example.com');
    await request(app.getHttpServer()).patch(`/admin/users/${userId}`).set(root()).send({ password: 'replacement-password-1234' }).expect(200);
    await request(app.getHttpServer()).get('/admin/users').set({ Authorization: `Bearer ${oldToken}` }).expect(401);
    await request(app.getHttpServer()).post('/admin/auth/login').send({ email: 'new@example.com', password }).expect(401);
    await login('new@example.com', 'replacement-password-1234');
    const audit = await request(app.getHttpServer()).get('/admin/users').set(root()).expect(200);
    expect(JSON.stringify(audit.body)).not.toContain('replacement-password');
  });
});
