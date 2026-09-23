import { IsString, IsEmail, MinLength, IsNotEmpty, ValidateNested, IsOptional, IsArray, IsIn, IsNumber, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from './order.schema';

export class OrderLineDto {
  @IsString()
  productSlug!: string;

  @IsString()
  packSize!: string;

  @IsNumber()
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
  @MinLength(6)
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
  @IsNotEmpty()
  customerPhone!: string;

  @ValidateNested()
  @Type(() => OrderAddressDto)
  deliveryAddress!: OrderAddressDto;

  @IsArray()
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
  razorpayOrderId?: string;

  @IsOptional()
  @IsString()
  razorpayPaymentId?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned', 'refunded'])
  status!: OrderStatus;

  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() trackingUrl?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() refundReference?: string;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}
