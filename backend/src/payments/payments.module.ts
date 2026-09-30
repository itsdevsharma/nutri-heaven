import { Module } from '@nestjs/common';
import { OrderModule } from '../orders/order.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({ imports: [OrderModule, AuthModule, AdminModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
