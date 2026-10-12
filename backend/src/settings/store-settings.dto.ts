import { Type } from 'class-transformer';
import { IsBoolean, Matches, ValidateIf, IsEmail, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class ContentDto {
  @IsOptional() @IsString() @MaxLength(12000) shippingPolicy?: string;
  @IsOptional() @IsString() @MaxLength(12000) returnPolicy?: string;
  @IsOptional() @IsString() @MaxLength(12000) privacyPolicy?: string;
  @IsOptional() @IsString() @MaxLength(12000) terms?: string;
  @IsOptional() @IsString() @MaxLength(12000) about?: string;
  @IsOptional() @IsString() @MaxLength(12000) contact?: string;
  @IsOptional() @IsString() @MaxLength(12000) faq?: string;
}
class MetaPixelDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @ValidateIf((value: MetaPixelDto) => value.enabled === true || (value.pixelId !== undefined && value.pixelId !== ''))
  @IsString() @Matches(/^[0-9]{5,30}$/) pixelId?: string;
}
class SeoDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[a-zA-Z0-9_-]*$/) googleSiteVerification?: string;
}
class ValueDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeoDto) seo?: SeoDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => MetaPixelDto) metaPixel?: MetaPixelDto;
  @IsOptional() @IsString() @MaxLength(120) legalName?: string;
  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(30) supportPhone?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsappNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(300) businessHours?: string;
  @IsOptional() @ValidateNested() @Type(() => ContentDto) content?: ContentDto;
}
export class UpdateStoreSettingsDto { @IsObject() @ValidateNested() @Type(() => ValueDto) value!: ValueDto; }
