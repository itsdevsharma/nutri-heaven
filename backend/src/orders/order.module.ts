import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { EngagementModule } from '../engagement/engagement.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order, OrderSchema } from './order.schema';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [
    EngagementModule,
    AuthModule,
    AdminModule,
    ProductsModule,
    InventoryModule,
    CouponsModule,
    MongooseModule.forFeature([{ name: Customer.name, schema: CustomerSchema }, { name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [OrderController],
  providers: [OrderService, OptionalCustomerAuthGuard],
  exports: [OrderService, MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])],
})
export class OrderModule {}
