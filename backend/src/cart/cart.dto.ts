import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
export class AddCartItemDto { @IsString() productId!: string; @IsString() packSize!: string; @IsInt() @Min(1) @Max(20) quantity!: number; }
export class UpdateCartItemDto { @IsOptional() @IsInt() @Min(1) @Max(20) quantity?: number; @IsOptional() @IsString() packSize?: string; }
export class CartNoteDto { @IsString() @Length(0, 500) note!: string; }
export class CouponDto { @IsString() @Length(3, 32) code!: string; }
