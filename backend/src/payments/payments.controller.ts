import { Body, Controller, Get, Headers, Param, Post, Req, Request, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { VerifyRazorpayPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';
import { AdminAuthGuard, AdminRequest } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';

@Controller('payments/razorpay')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('config')
  config() { return this.payments.configuration(); }

  @Post('orders/:id')
  create(@Param('id') id: string, @Headers('x-cart-id') cartId?: string) { return this.payments.createRazorpayOrder(id, cartId); }

  @Post('orders/:id/verify')
  verify(@Param('id') id: string, @Body() body: VerifyRazorpayPaymentDto, @Headers('x-cart-id') cartId?: string) { return this.payments.verifyPayment(id, body, cartId); }

  @Get('orders/:id')
  status(@Param('id') id: string, @Headers('x-cart-id') cartId?: string) { return this.payments.paymentStatus(id, cartId); }

  @Post('orders/:id/cancel')
  cancelPending(@Param('id') id: string, @Headers('x-cart-id') cartId?: string) { return this.payments.cancelPending(id, cartId); }

  @Post('orders/:id/refund')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  refund(@Param('id') id: string, @Request() request: AdminRequest) {
    return this.payments.refundOrder(id, request.admin?.email ?? 'unknown-admin');
  }

  @Post('webhook')
  webhook(@Req() request: ExpressRequest & { rawBody?: Buffer }, @Headers('x-razorpay-signature') signature?: string) {
    return this.payments.handleWebhook(request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), signature);
  }
}
