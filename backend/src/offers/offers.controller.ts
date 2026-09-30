import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard'; import { RolesGuard } from '../auth/roles.guard'; import { Roles } from '../auth/roles.decorator'; import { AdminRole } from '../admin/admin.schema';
import { OffersService } from './offers.service'; import { CreateOfferDto } from './dto/create-offer.dto';
@Controller('admin/offers') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.MARKETING_MANAGER)
export class OffersController { constructor(private readonly offers: OffersService) {} @Get() list() { return this.offers.list(); } @Post() create(@Body() dto: CreateOfferDto) { return this.offers.create(dto); } @Patch(':id') update(@Param('id') id: string, @Body() dto: Partial<CreateOfferDto>) { return this.offers.update(id, dto); } @Patch(':id/deactivate') deactivate(@Param('id') id: string) { return this.offers.deactivate(id); } }
