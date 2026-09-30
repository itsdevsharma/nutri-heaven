import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CouponsService } from './coupons.service';
import { ProductsService } from '../products/products.service';
import { QuoteRequest } from '../products/dto/quote.request';

class CouponQuoteRequest extends QuoteRequest { @IsString() code!: string; }

@Controller('admin/coupons') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.MARKETING_MANAGER)
export class CouponsController {
  constructor(private coupons: CouponsService) {}
  @Get() list() { return this.coupons.list(); }
  @Post() create(@Body() dto: CreateCouponDto) { return this.coupons.create(dto); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<CreateCouponDto>) { return this.coupons.update(id, dto); }
  @Patch(':id/deactivate') deactivate(@Param('id') id: string) { return this.coupons.deactivate(id); }
  @Get(':code/redemptions') redemptions(@Param('code') code: string) { return this.coupons.redemptionsFor(code); }
}

@Controller('coupons')
export class PublicCouponsController {
  constructor(private coupons: CouponsService, private products: ProductsService) {}
  @Post('quote') async quote(@Body() body: CouponQuoteRequest) { const quote = await this.products.quote({ lines: body.lines }); return this.coupons.quote(body.code, quote.subtotalPaise, quote.lines); }
}
