import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ListProductsQuery } from './dto/list-products.query';
import { QuoteRequest } from './dto/quote.request';
import { ProductsService } from './products.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.findAll(query.limit, query.offset);
  }

  /**
   * Prices before the `:slug` route on purpose — otherwise Express would read
   * `quote` as a slug and return 404. Route order inside a controller matters.
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@Body() dto: QuoteRequest) {
    return this.products.quote(dto);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }

  @Post('admin')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminCreate(@Body() input: Record<string, unknown>) {
    return this.products.adminCreate(input as Partial<import('./product.schema').Product>);
  }

  @Patch('admin/:slug')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminUpdate(@Param('slug') slug: string, @Body() changes: Record<string, unknown>) {
    return this.products.adminUpdate(slug, changes as Partial<import('./product.schema').Product>);
  }

  @Post('admin/:slug/duplicate')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminDuplicate(@Param('slug') slug: string) { return this.products.adminDuplicate(slug); }

  @Patch('admin/:slug/deactivate')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminDeactivate(@Param('slug') slug: string) { return this.products.adminDeactivate(slug); }
}
