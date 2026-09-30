import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { ProductsModule } from '../products/products.module';
import { Coupon, CouponSchema } from './coupon.schema';
import { CouponRedemption, CouponRedemptionSchema } from './coupon-redemption.schema';
import { CouponsController, PublicCouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({ imports: [MongooseModule.forFeature([{ name: Coupon.name, schema: CouponSchema }, { name: CouponRedemption.name, schema: CouponRedemptionSchema }]), AuthModule, AdminModule, ProductsModule], controllers: [CouponsController, PublicCouponsController], providers: [CouponsService], exports: [CouponsService] })
export class CouponsModule {}
