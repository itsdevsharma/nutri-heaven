import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { StoreSettings, StoreSettingsSchema } from './store-settings.schema';
import { StoreSettingsController, StorefrontSettingsController } from './store-settings.controller';
import { StoreSettingsService } from './store-settings.service';

/**
 * `AuthModule` is imported (not just referenced) because the controller guards
 * with `AdminAuthGuard`/`RolesGuard`: `AdminAuthGuard` injects `JwtService`, and
 * `AuthModule` is what exports `JwtModule` plus both guards. Without it Nest
 * cannot resolve the guard and the whole application fails to boot — the same
 * reason `ProductsModule` and `CategoriesModule` import it.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: StoreSettings.name, schema: StoreSettingsSchema }]),
  ],
  controllers: [StoreSettingsController, StorefrontSettingsController],
  providers: [StoreSettingsService],
  exports: [StoreSettingsService],
})
export class StoreSettingsModule {}
