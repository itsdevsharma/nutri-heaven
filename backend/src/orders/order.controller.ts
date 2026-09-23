import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { CancelOrderDto, OrderCreateDto, UpdateOrderStatusDto } from './order.dto';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';

@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  /** Create an order (idempotent). Public endpoint — the storefront only. */
  @Post()
  create(@Body() dto: OrderCreateDto) {
    return this.service.createOrder(dto);
  }

  /** Customer-facing order detail. Public endpoint — the storefront only. */
  @Get('admin')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  adminList() { return this.service.listAdmin(); }

  /** Admin read of an order. Protected by RBAC. */
  @Get('admin/:id')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  adminGet(@Param('id') id: string) {
    return this.service.getOrder(id);
  }

  /** Admin update of fulfilment state. Protected by RBAC. */
  @Patch('admin/:id/status')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  adminUpdateStatus(@Param('id') id: string, @Body() body: UpdateOrderStatusDto) {
    return this.service.updateStatus(id, body.status, body);
  }

  @Post('admin/:id/cancel')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  cancel(@Param('id') id: string, @Body() body: CancelOrderDto) {
    return this.service.cancel(id, body.reason);
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.service.getOrder(id); }
}
