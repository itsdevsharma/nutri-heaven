import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminRole } from '../admin/admin.schema';
import { StoreSettingsService } from './store-settings.service';
import { UpdateStoreSettingsDto } from './store-settings.dto';

@Controller('storefront/settings')
export class StorefrontSettingsController {
  constructor(private readonly service: StoreSettingsService) {}
  @Get() get() { return this.service.get().then(record => { const value = record?.value ?? {}; return { content: value.content ?? {}, legalName: value.legalName ?? 'NUTRI HEAVEN', supportEmail: value.supportEmail ?? 'nutriheavenhsr@gmail.com', supportPhone: value.supportPhone ?? '90172-25722', whatsappNumber: value.whatsappNumber ?? '90172-25722', address: value.address ?? '258, Siwach complex Bishnoi colony near HAU gate no. 4 (sec-15) Hisar', businessHours: value.businessHours ?? '' }; }); }
}

@Controller('admin/settings')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
export class StoreSettingsController {
  constructor(private readonly service: StoreSettingsService) {}
  @Get() get() { return this.service.get(); }
  @Patch() update(@Body() body: UpdateStoreSettingsDto) { return this.service.update(body.value as Record<string, unknown>); }
}
