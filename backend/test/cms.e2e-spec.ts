import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Admin, AdminDocument, AdminRole } from '../src/admin/admin.schema';

describe('CMS publishing (e2e)', () => {
  let app: INestApplication; let mongo: MongoMemoryServer; let token = '';
  beforeAll(async () => { mongo=await MongoMemoryServer.create(); process.env.MONGODB_URI=mongo.getUri('cms'); const module=await Test.createTestingModule({imports:[AppModule]}).compile(); app=module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true})); await app.init(); const admins=app.get<Model<AdminDocument>>(getModelToken(Admin.name)); await admins.create({name:'CMS admin',email:'cms@example.com',passwordHash:await hash('test-password-1234',10),role:AdminRole.SUPER_ADMIN,isActive:true}); token=(await request(app.getHttpServer()).post('/admin/auth/login').send({email:'cms@example.com',password:'test-password-1234'}).expect(201)).body.accessToken; });
  afterAll(async()=>{await app.close();await mongo.stop();});
  it('blocks anonymous writes and publishes only active ordered records', async()=>{ const server=app.getHttpServer(); await request(server).post('/admin/cms/banners').send({heading:'Nope'}).expect(401); const headers={Authorization:`Bearer ${token}`}; const active=await request(server).post('/admin/cms/banners').set(headers).send({heading:'Live',imageUrl:'https://example.com/live.jpg',displayOrder:2,isActive:true}).expect(201); await request(server).post('/admin/cms/banners').set(headers).send({heading:'Hidden',imageUrl:'https://example.com/hidden.jpg',displayOrder:1,isActive:false}).expect(201); await request(server).post('/admin/cms/faqs').set(headers).send({question:'Question?',answer:'Answer',displayOrder:0,isActive:true}).expect(201); await request(server).post('/admin/cms/socials').set(headers).send({platform:'Instagram',url:'https://instagram.com/nutri',isActive:true}).expect(201); const published=await request(server).get('/storefront/cms').expect(200); expect(published.body.banners).toHaveLength(1); expect(published.body.banners[0].heading).toBe('Live'); expect(published.body.faqs[0].answer).toBe('Answer'); expect(published.body.socialLinks[0].platform).toBe('Instagram'); await request(server).patch(`/admin/cms/banners/${active.body._id}`).set(headers).send({heading:'Live',imageUrl:'https://example.com/live.jpg',isActive:false}).expect(200); expect((await request(server).get('/storefront/cms')).body.banners).toHaveLength(0); });
});
