import { Type } from 'class-transformer';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class ContentDto {
  @IsOptional() @IsString() @MaxLength(12000) shippingPolicy?: string;
  @IsOptional() @IsString() @MaxLength(12000) returnPolicy?: string;
  @IsOptional() @IsString() @MaxLength(12000) privacyPolicy?: string;
  @IsOptional() @IsString() @MaxLength(12000) terms?: string;
  @IsOptional() @IsString() @MaxLength(12000) about?: string;
  @IsOptional() @IsString() @MaxLength(12000) contact?: string;
  @IsOptional() @IsString() @MaxLength(12000) faq?: string;
}
class ValueDto {
  @IsOptional() @IsString() @MaxLength(120) legalName?: string;
  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) supportPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsappNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(300) businessHours?: string;
  @IsOptional() @ValidateNested() @Type(() => ContentDto) content?: ContentDto;
}
export class UpdateStoreSettingsDto { @IsObject() @ValidateNested() @Type(() => ValueDto) value!: ValueDto; }
