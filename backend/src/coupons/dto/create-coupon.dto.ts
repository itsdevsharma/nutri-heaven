import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
export class CreateCouponDto {
  @IsString() code!: string;
  @IsEnum(['percentage', 'flat']) discountType!: 'percentage' | 'flat';
  @IsInt() @Min(1) discountValue!: number;
  @IsOptional() @IsInt() @Min(0) minimumOrderPaise?: number;
  @IsOptional() @IsInt() @Min(0) maximumDiscountPaise?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) productSlugs?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsInt() @Min(0) usageLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
