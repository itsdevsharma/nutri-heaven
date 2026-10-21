import { OptionalCustomerAuthGuard } from '../customers/optional-customer-auth.guard';
import { Body, Controller, Get, Headers, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { CancelOrderDto, OrderCreateDto, UpdateOrderStatusDto, OrderActionDto } from './order.dto';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';
import { allowedOrderActions, operationsFor, type OrderAction } from './order-workflow';
import type { AdminRequest } from '../auth/admin-auth.guard';

@Controller('orders')
export class OrderController {
  constructor(private readonly service: OrderService) {}

  /** Create an order (idempotent). Public endpoint — the storefront only. */
  @Post()
  @UseGuards(OptionalCustomerAuthGuard)
  create(@Body() dto: OrderCreateDto, @Request() request: { customer?: { id: string; email: string } }) {
    return this.service.createOrder({ ...dto, ...(request.customer ? { customerEmail: request.customer.email } : {}) }, request.customer?.id);
  }

  /** Customer-facing order detail. Public endpoint — the storefront only. */
  @Get('admin')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  async adminList(@Request() request: AdminRequest) {
    const orders = await this.service.listAdmin();
    return orders.map(order => ({ ...order, operations: operationsFor(order), allowedActions: allowedOrderActions(order, request.admin?.role ?? '') }));
  }

  /** Admin read of an order. Protected by RBAC. */
  @Get('admin/:id')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  async adminGet(@Param('id') id: string, @Request() request: AdminRequest) {
    const order = await this.service.getOrder(id);
    return { ...order, operations: operationsFor(order), allowedActions: allowedOrderActions(order, request.admin?.role ?? '') };
  }

  /** Admin update of fulfilment state. Protected by RBAC. */
  @Patch('admin/:id/status')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  adminUpdateStatus(@Param('id') id: string, @Body() body: UpdateOrderStatusDto, @Request() request: AdminRequest) {
    return this.service.updateStatus(id, body.status, { ...body, actor: request.admin?.email ?? 'unknown-admin' });
  }

  @Post('admin/:id/actions/:action')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
  action(@Param('id') id: string, @Param('action') action: OrderAction, @Body() dto: OrderActionDto, @Request() request: AdminRequest) {
    return this.service.performAction(id, action, dto, request.admin?.email ?? 'unknown-admin', request.admin?.role ?? '');
  }

  @Post('admin/:id/cancel')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  cancel(@Param('id') id: string, @Body() body: CancelOrderDto, @Request() request: AdminRequest) {
    return this.service.cancel(id, body.reason, request.admin?.email ?? 'unknown-admin');
  }

  @Get(':id')
  get(@Param('id') id: string, @Headers('x-cart-id') cartId?: string) { return this.service.getCustomerOrder(id, cartId); }
}
