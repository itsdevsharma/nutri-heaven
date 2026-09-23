import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * Manual stock change from the admin console.
 *
 * The UI sends an absolute `balance` (the count the operator sees on the
 * shelf); the service converts it to a signed movement (`quantity =
 * balance - current`) so the ledger always records what actually changed.
 * `setLowStockLimit` rides along so the alert threshold can be fixed in the
 * same step without a second request.
 */
export class AdjustStockDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(120)
  productSlug!: string;

  @IsString()
  @MaxLength(40)
  packSize!: string;

  @IsInt()
  @Min(0)
  @Max(1000000)
  balance!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  setLowStockLimit?: number;

  @IsString()
  @MaxLength(280)
  reason!: string;

  /**
   * Client-generated UUID per adjustment click. Retries and double submits
   * reuse the key, so the second request returns the original movement
   * instead of applying the change twice.
   */
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;
}
