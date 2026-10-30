import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CheckoutService } from './checkout.service';
import { CheckoutQuote, CheckoutQuoteSchema } from './checkout.schema';
import { CheckoutQuoteDto } from './checkout.dto';
import { Product, ProductSchema } from '../products/product.schema';
import { ProductsModule } from '../products/products.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ShiprocketClient } from '../shipping/shiprocket.client';
import { ShippingConfiguration, ShippingConfigurationSchema } from '../shipping/shipping.schema';
@Controller('checkout')
class CheckoutController {
  constructor(private service: CheckoutService) {}
  @Get('configuration') configuration() { return { enabled: this.service.enabled }; }
  @Post('quotes') quote(@Body() dto: CheckoutQuoteDto) { return this.service.quote(dto); }
}
@Module({ imports: [ProductsModule, CouponsModule, MongooseModule.forFeature([{ name: CheckoutQuote.name, schema: CheckoutQuoteSchema }, { name: Product.name, schema: ProductSchema }, { name: ShippingConfiguration.name, schema: ShippingConfigurationSchema }])], controllers: [CheckoutController], providers: [CheckoutService, ShiprocketClient], exports: [CheckoutService, ShiprocketClient] })
export class CheckoutModule {}
