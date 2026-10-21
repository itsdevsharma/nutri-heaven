import { IsString, IsEmail, MinLength, IsNotEmpty, ValidateNested, IsOptional, IsArray, IsIn, Min, IsEnum, Matches, IsInt, ArrayMinSize, MaxLength, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from './order.schema';

export class OrderLineDto {
  @IsString()
  productSlug!: string;

  @IsString()
  packSize!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class OrderAddressDto {
  @IsString()
  @IsNotEmpty()
  street!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsOptional()
  @IsString()
  landmark?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/)
  pin!: string;
}

export class OrderCreateDto {
  @IsString()
  @IsNotEmpty()
  cartId!: string;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @Matches(/^\d{10}$/)
  customerPhone!: string;

  @ValidateNested()
  @Type(() => OrderAddressDto)
  deliveryAddress!: OrderAddressDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines!: OrderLineDto[];

  @IsIn(['cod', 'razorpay'])
  paymentMethod!: 'cod' | 'razorpay';

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned', 'refunded'])
  status!: OrderStatus;

  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() @Matches(/^(https?:\/\/[^\s]+)?$/) trackingUrl?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() refundReference?: string;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}

export class ReturnInspectionLineDto {
  @IsString() @IsNotEmpty() productSlug!: string;
  @IsString() @IsNotEmpty() packSize!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsIn(['restock', 'write_off']) disposition!: 'restock' | 'write_off';
  @IsIn(['sealed', 'opened', 'damaged', 'expired']) condition!: 'sealed' | 'opened' | 'damaged' | 'expired';
}
export class OrderActionDto {
  @IsUUID() idempotencyKey!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
  @IsOptional() @IsString() @MaxLength(200) courier?: string;
  @IsOptional() @IsString() @MaxLength(200) trackingNumber?: string;
  @IsOptional() @IsString() @Matches(/^https?:\/\/[^\s]+$/) trackingUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) reference?: string;
  @IsOptional() @IsInt() @Min(1) amountPaise?: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReturnInspectionLineDto) inspection?: ReturnInspectionLineDto[];
}
