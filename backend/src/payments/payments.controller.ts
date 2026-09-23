import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('payments/razorpay')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:id')
  create(@Param('id') id: string) { return this.payments.createRazorpayOrder(id); }

  @Post('webhook')
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-razorpay-signature') signature?: string) {
    return this.payments.handleWebhook(request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {})), signature);
  }
}
