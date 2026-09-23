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
import { ListAdminProductsQuery } from './dto/list-admin-products.query';
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

  /**
   * Admin catalogue reads.
   *
   * Declared before `@Get(':slug')` for the same reason `POST /products/quote`
   * is: Express matches in declaration order, so `admin` would otherwise be
   * read as a slug and the console would 404 on its own list route.
   *
   * Reads are open to every staff role (support answers catalogue questions,
   * inventory needs stock, marketing needs scopes); writes stay restricted to
   * `SUPER_ADMIN`/`CATALOGUE_MANAGER` below. `RolesGuard` grants `SUPER_ADMIN`
   * implicitly.
   */
  @Get('admin')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.CATALOGUE_MANAGER,
    AdminRole.INVENTORY_MANAGER,
    AdminRole.MARKETING_MANAGER,
    AdminRole.SUPPORT,
  )
  adminList(@Query() query: ListAdminProductsQuery) {
    return this.products.adminList(query);
  }

  @Get('admin/:slug')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.CATALOGUE_MANAGER,
    AdminRole.INVENTORY_MANAGER,
    AdminRole.MARKETING_MANAGER,
    AdminRole.SUPPORT,
  )
  adminBySlug(@Param('slug') slug: string) {
    return this.products.adminFindBySlug(slug);
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
