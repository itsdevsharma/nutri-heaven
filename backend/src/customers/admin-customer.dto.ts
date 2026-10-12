import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class AdminUpdateCustomerDto {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(2) @MaxLength(100)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString() @Matches(/^(\d{10})?$/, { message: 'Phone must be empty or contain 10 digits.' })
  phone?: string;
}
export class AdminCustomerStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
