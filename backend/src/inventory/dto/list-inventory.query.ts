import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { INVENTORY_MOVEMENT_TYPES } from '../inventory-movement.schema';

export class ListInventoryQuery {
  /** `low` / `out` derive from each variant's own stock + lowStockLimit. */
  @IsOptional()
  @IsIn(['all', 'low', 'out'])
  view?: 'all' | 'low' | 'out' = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class ListMovementsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productSlug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  packSize?: string;

  @IsOptional()
  @IsIn(INVENTORY_MOVEMENT_TYPES)
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
