import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [
    // Reads `.env` from the repository root (one level up from `backend`)
    // so the API shares one file with Compose. Every variable has a fallback
    // below, which is why the stack boots with no `.env` present at all.
    ConfigModule.forRoot({ isGlobal: true }),
    // `forRootAsync` (not `forRoot`) on purpose: the factory runs when NestJS
    // instantiates the module, so `MONGODB_URI` is read lazily. With `forRoot`
    // the URI would be frozen at import time — before tests set
    // `process.env.MONGODB_URI` in `beforeAll` — and the e2e suite would hit
    // the Docker database instead of the in-memory one (E11000 duplicates).
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri:
          process.env.MONGODB_URI ??
          'mongodb://localhost:27017/nutri_heaven?directConnection=true',
      }),
    }),
    ProductsModule,
    AdminModule,
    AuthModule,
    CategoriesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
