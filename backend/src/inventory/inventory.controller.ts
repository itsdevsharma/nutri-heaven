import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListInventoryQuery, ListMovementsQuery } from './dto/list-inventory.query';
import { AdminAuthGuard, AdminRequest } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from '../admin/admin.schema';

/**
 * Inventory endpoints under `/inventory/admin` (the plan's `/admin/inventory/*`
 * family; products live under `/products`, so nesting inventory there too would
 * make route order fragile for no benefit).
 *
 * Reads are open to inventory staff; writes are `SUPER_ADMIN` +
 * `INVENTORY_MANAGER` only. `AdjustStockDto` carries the idempotency key, so a
 * retried submit can never apply twice.
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** Full overview incl. `summary`; `?view=low` / `?view=out` for the alert lists. */
  @Get('admin')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.CATALOGUE_MANAGER,
    AdminRole.INVENTORY_MANAGER,
    AdminRole.SUPPORT,
  )
  overview(@Query() query: ListInventoryQuery) {
    return this.inventory.overview(query);
  }

  /** Immutable movement history for the audit timeline. */
  @Get('admin/movements')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(
    AdminRole.SUPER_ADMIN,
    AdminRole.CATALOGUE_MANAGER,
    AdminRole.INVENTORY_MANAGER,
  )
  movements(@Query() query: ListMovementsQuery) {
    return this.inventory.history(query);
  }

  /** Manual adjustment: the UI sends the counted shelf balance + a reason. */
  @Patch('admin/adjust')
  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.INVENTORY_MANAGER)
  adjust(@Body() dto: AdjustStockDto, @Request() request: AdminRequest) {
    return this.inventory.adjust({
      ...dto,
      actor: request.admin?.email ?? 'unknown-admin',
    });
  }
}
