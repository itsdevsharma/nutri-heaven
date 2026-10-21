import { PaymentWebhookEvent, PaymentWebhookEventSchema } from './webhook-event.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderRefund, OrderRefundSchema } from './refund.schema';
import { RefundsService } from './refunds.service';
import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({ imports: [MongooseModule.forFeature([{ name: OrderRefund.name, schema: OrderRefundSchema }, { name: PaymentWebhookEvent.name, schema: PaymentWebhookEventSchema }]), OrderModule, AuthModule, AdminModule], controllers: [PaymentsController], providers: [PaymentsService, RefundsService] })
export class PaymentsModule {}
