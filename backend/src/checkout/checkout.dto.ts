import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDefined, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { OrderAddressDto, OrderLineDto } from '../orders/order.dto';
export class CheckoutQuoteDto {
  @IsString() @IsNotEmpty() cartId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderLineDto) lines!: OrderLineDto[];
  @IsDefined() @ValidateNested() @Type(() => OrderAddressDto) deliveryAddress!: OrderAddressDto;
  @IsIn(['cod', 'razorpay']) paymentMethod!: 'cod' | 'razorpay';
  @IsOptional() @IsString() couponCode?: string;
}
