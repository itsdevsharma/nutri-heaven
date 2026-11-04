import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RefundQueryDto {
  @IsOptional() @IsString() @MaxLength(128) orderId?: string;
}

export class VerifyRazorpayPaymentDto {
  @IsString() @Matches(/^order_[a-zA-Z0-9]+$/) razorpay_order_id!: string;
  @IsString() @Matches(/^pay_[a-zA-Z0-9]+$/) razorpay_payment_id!: string;
  @IsString() @Matches(/^[a-fA-F0-9]{64}$/) razorpay_signature!: string;
}
