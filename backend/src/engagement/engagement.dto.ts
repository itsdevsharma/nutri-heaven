import { Transform, Type } from 'class-transformer';
import { Equals, IsEmail, IsEnum, IsInt, IsOptional, IsIn, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export class SubscribeDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @Equals(true) consent!: boolean;
}
export class NewsletterTokenDto { @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string; }
export class CreateReviewDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) productSlug!: string;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(10) @MaxLength(2000) body!: string;
}
export class ModerateReviewDto { @IsEnum(['approved', 'rejected']) status!: 'approved' | 'rejected'; }

export class EngagementListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @IsIn(['pending', 'approved', 'rejected', 'subscribed', 'unsubscribed']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class SalesReportQuery {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
