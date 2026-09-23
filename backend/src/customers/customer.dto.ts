import { Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsOptional() @Matches(/^\d{10}$/) phone?: string;
}
export class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(1) password!: string; }
export class ForgotPasswordDto { @IsEmail() email!: string; }
export class ResetPasswordDto { @IsString() @MinLength(20) token!: string; @IsString() @MinLength(12) @MaxLength(128) password!: string; }
export class UpdateProfileDto { @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string; @IsOptional() @Matches(/^\d{10}$/) phone?: string; }
export class AddressDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MinLength(2) @MaxLength(40) label!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @Matches(/^\d{10}$/) phone!: string;
  @IsString() @MinLength(5) @MaxLength(250) street!: string;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsString() @MinLength(2) @MaxLength(80) state!: string;
  @Matches(/^\d{6}$/) pin!: string;
  @IsOptional() @IsString() @MaxLength(120) landmark?: string;
}
export class WishlistDto { @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) productSlug!: string; }
export class CustomerQueryDto { @IsOptional() @IsString() q?: string; @IsOptional() @Type(() => Number) limit?: number; @IsOptional() @Type(() => Number) offset?: number; }
