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
  Res,
  Req,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { ListProductsQuery } from './dto/list-products.query';
import { ListAdminProductsQuery } from './dto/list-admin-products.query';
import { QuoteRequest } from './dto/quote.request';
import { ProductsService } from './products.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';
import { AdminRequest } from '../auth/admin-auth.guard';
import { BulkProductActionDto } from './dto/bulk-product-action.dto';

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

  @Get('admin/export')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  async exportCsv(@Query() query: ListAdminProductsQuery, @Res() response: Response) {
    const csv = await this.products.exportCsv(query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    response.send(csv);
  }

  @Post('admin/import')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  importCsv(@UploadedFile() file?: Express.Multer.File, @Query('dryRun') dryRun?: string) {
    if (!file) throw new Error('CSV file is required');
    return this.products.importCsv(file.buffer.toString('utf8'), dryRun === 'true');
  }

  @Post('admin/import/confirm')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  confirmCsv(@Body('token') token: string) { return this.products.confirmCsvImport(token); }

  @Patch('admin/bulk')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  bulk(@Body() dto: BulkProductActionDto, @Req() req: AdminRequest) { return this.products.bulkAction(dto, req.admin); }

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
  adminCreate(@Body() input: Record<string, unknown>, @Req() req: AdminRequest) {
    return this.products.adminCreate(input as Partial<import('./product.schema').Product>, req.admin);
  }

  @Patch('admin/:slug')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminUpdate(@Param('slug') slug: string, @Body() changes: Record<string, unknown>, @Req() req: AdminRequest) {
    return this.products.adminUpdate(slug, changes as Partial<import('./product.schema').Product>, req.admin);
  }

  @Post('admin/:slug/duplicate')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminDuplicate(@Param('slug') slug: string) { return this.products.adminDuplicate(slug); }

  @Patch('admin/:slug/deactivate')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  adminDeactivate(@Param('slug') slug: string, @Req() req: AdminRequest) { return this.products.adminDeactivate(slug, req.admin); }

  @Patch('admin/:slug/archive')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  archive(@Param('slug') slug: string, @Req() req: AdminRequest) { return this.products.adminSetStatus(slug, 'archived', req.admin); }

  @Patch('admin/:slug/recover')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
  recover(@Param('slug') slug: string, @Body() body: { targetStatus: 'draft' | 'inactive' }, @Req() req: AdminRequest) { return this.products.adminRecover(slug, body.targetStatus, req.admin); }
}
