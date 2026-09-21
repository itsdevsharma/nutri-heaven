import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get() list() { return this.categories.list(); }
  @Get('admin') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER) adminList() { return this.categories.adminList(); }
  @Post('admin') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER) create(@Body() input: Record<string, unknown>) { return this.categories.create(input as Partial<import('./category.schema').Category>); }
  @Patch('admin/:slug') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER) update(@Param('slug') slug: string, @Body() input: Record<string, unknown>) { return this.categories.update(slug, input as Partial<import('./category.schema').Category>); }
  @Patch('admin/:slug/deactivate') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER) deactivate(@Param('slug') slug: string) { return this.categories.deactivate(slug); }
}
