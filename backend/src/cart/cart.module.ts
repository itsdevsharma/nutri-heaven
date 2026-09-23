import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/product.schema';
import { Cart, CartSchema } from './cart.schema';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
@Module({ imports: [MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }, { name: Product.name, schema: ProductSchema }])], controllers: [CartController], providers: [CartService] })
export class CartModule {}
