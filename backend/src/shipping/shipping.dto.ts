import { IsNumber, IsString, IsOptional, IsInt, Min, Max, MaxLength, MinLength } from 'class-validator';
export class ShippingConfigurationDto {
  @IsString() @MinLength(1) @MaxLength(100) pickupLocation!: string;
  @IsNumber() @Min(0.001) @Max(1000) weight!: number;
  @IsNumber() @Min(0.51) @Max(1000) length!: number;
  @IsNumber() @Min(0.51) @Max(1000) breadth!: number;
  @IsNumber() @Min(0.51) @Max(1000) height!: number;
}
export class ShiprocketActionDto {
  @IsOptional() @IsInt() @Min(1) courierId?: number;
  @IsOptional() @IsInt() @Min(1) providerOrderId?: number;
  @IsOptional() @IsNumber() @Min(0.001) @Max(1000) weight?: number;
  @IsOptional() @IsNumber() @Min(0.51) @Max(1000) length?: number;
  @IsOptional() @IsNumber() @Min(0.51) @Max(1000) breadth?: number;
  @IsOptional() @IsNumber() @Min(0.51) @Max(1000) height?: number;
}
