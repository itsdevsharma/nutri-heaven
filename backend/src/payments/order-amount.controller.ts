import { Body, Controller, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { AdminAuthGuard, type AdminRequest } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';
import { OverrideOrderAmountDto } from '../orders/order.dto';
import { PaymentsService } from './payments.service';

@Controller('orders/admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
export class OrderAmountController {
  constructor(private readonly payments: PaymentsService) {}
  @Patch(':id/amount')
  override(@Param('id') id: string, @Body() dto: OverrideOrderAmountDto, @Request() request: AdminRequest) {
    return this.payments.overrideOrderAmount(id, dto, request.admin?.email ?? 'unknown-admin');
  }
}
