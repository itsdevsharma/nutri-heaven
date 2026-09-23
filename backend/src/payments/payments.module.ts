import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [OrderModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
