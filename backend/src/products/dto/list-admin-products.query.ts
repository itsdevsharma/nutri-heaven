import { Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Product lifecycle states, mirrored from `Product['status']`. */
export const ADMIN_PRODUCT_STATUSES = ['draft', 'active', 'inactive', 'archived'] as const;
export type AdminProductStatus = (typeof ADMIN_PRODUCT_STATUSES)[number];

/**
 * Query string for `GET /products/admin` — the catalogue view that includes
 * drafts, inactive and archived products.
 *
 * Same contract as `ListProductsQuery`: `?limit=25` arrives as a string, the
 * global `ValidationPipe({ transform: true })` coerces it through
 * `@Type(() => Number)`, and `forbidNonWhitelisted` rejects unknown parameters
 * instead of silently ignoring them. The admin console pages through the
 * catalogue with `limit`/`offset` and passes the `total` back for its pager.
 */
export class ListAdminProductsQuery {
  @IsOptional()
  @IsIn(ADMIN_PRODUCT_STATUSES)
  status?: AdminProductStatus;

  /** Case-insensitive partial match on title, slug, SKU or category. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional() @IsString() @MaxLength(10000) slugs?: string;

  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsIn(['healthy', 'low', 'out']) stock?: 'healthy' | 'low' | 'out';
  @IsOptional() @IsBooleanString() featured?: string;
  @IsOptional() @IsBooleanString() bestseller?: string;
  @IsOptional() @IsBooleanString() newArrival?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPricePaise?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPricePaise?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
