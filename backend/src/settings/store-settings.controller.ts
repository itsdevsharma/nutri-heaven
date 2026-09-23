import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminRole } from '../admin/admin.schema';
import { StoreSettingsService } from './store-settings.service';
@Controller('admin/settings')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
export class StoreSettingsController {
  constructor(private readonly service: StoreSettingsService) {}
  @Get() get() { return this.service.get(); }
  @Patch() update(@Body() body: { value: Record<string, unknown> }) { return this.service.update(body.value); }
}
