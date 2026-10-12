import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, ValidateIf, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { AdminRole } from './admin.schema';

export class CreateAdminUserDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @MinLength(12) @MaxLength(72) @Matches(/^[\x20-\x7E]+$/, { message: 'Password must contain printable ASCII characters.' })
  password!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;

  @ValidateIf((_, value) => value !== undefined) @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminUserDto {
  @ValidateIf((_, value) => value !== undefined) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @ValidateIf((_, value) => value !== undefined) @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email?: string;

  @ValidateIf((_, value) => value !== undefined) @IsString() @MinLength(12) @MaxLength(72) @Matches(/^[\x20-\x7E]+$/, { message: 'Password must contain printable ASCII characters.' })
  password?: string;

  @ValidateIf((_, value) => value !== undefined) @IsEnum(AdminRole)
  role?: AdminRole;

  @ValidateIf((_, value) => value !== undefined) @IsBoolean()
  isActive?: boolean;
}
