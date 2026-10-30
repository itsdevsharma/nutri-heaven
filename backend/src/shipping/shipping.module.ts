import { CheckoutModule } from '../checkout/checkout.module';
import { Module, Controller, Get, Put, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AdminAuthGuard, type AdminRequest } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';
import { OrderModule } from '../orders/order.module';
import { Order, OrderSchema } from '../orders/order.schema';
import { ShippingService } from './shipping.service';
import { ShippingConfiguration, ShippingConfigurationSchema, ShiprocketShipment, ShiprocketShipmentSchema } from './shipping.schema';
import { ShippingConfigurationDto, ShiprocketActionDto } from './shipping.dto';
@Controller('admin/shipping')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT)
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}
  @Get('configuration') configuration() { return this.shipping.configuration(); }
  @Put('configuration') @Roles(AdminRole.SUPER_ADMIN)
  configure(@Body() dto: ShippingConfigurationDto, @Req() req: AdminRequest) { return this.shipping.configure(dto, req.admin!.sub); }
  @Get('pickup-locations') pickups() { return this.shipping.pickups(); }
  @Get('orders/:id') get(@Param('id') id: string) { return this.shipping.get(id); }
  @Post('orders/:id/:action') action(@Param('id') id: string, @Param('action') action: string, @Body() dto: ShiprocketActionDto, @Req() req: AdminRequest) { return action === 'verify-and-ship' ? this.shipping.verifyAndShip(id, dto, req.admin!.email, req.admin!.role) : this.shipping.action(id, action, dto, req.admin!.sub); }
}
@Module({ imports: [CheckoutModule, OrderModule, AuthModule, AdminModule, AuditModule, MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }, { name: ShippingConfiguration.name, schema: ShippingConfigurationSchema }, { name: ShiprocketShipment.name, schema: ShiprocketShipmentSchema }])], controllers: [ShippingController], providers: [ShippingService] })
export class ShippingModule {}
