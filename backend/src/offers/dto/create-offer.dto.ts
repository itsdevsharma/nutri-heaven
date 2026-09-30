import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
export class CreateOfferDto {
  @IsString() name!: string;
  @IsEnum(['percentage', 'flat']) discountType!: 'percentage' | 'flat';
  @IsInt() @Min(0) @Max(1000000000) discountValue!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) productSlugs?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsInt() @Min(0) maximumSavingPaise?: number;
  @IsOptional() @IsBoolean() isStackable?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
