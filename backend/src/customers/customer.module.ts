import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { Order, OrderSchema } from '../orders/order.schema';
import { Product, ProductSchema } from '../products/product.schema';
import { CustomerController } from './customer.controller';
import { CustomerAuthGuard } from './customer-auth.guard';
import { Customer, CustomerSchema } from './customer.schema';
import { CustomerService } from './customer.service';

@Module({ imports: [AuthModule, AdminModule, MongooseModule.forFeature([{ name: Customer.name, schema: CustomerSchema }, { name: Product.name, schema: ProductSchema }, { name: Order.name, schema: OrderSchema }])], controllers: [CustomerController], providers: [CustomerService, CustomerAuthGuard] })
export class CustomerModule {}
