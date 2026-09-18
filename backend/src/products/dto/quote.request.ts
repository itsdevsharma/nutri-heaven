import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class QuoteLine {
  /** Product `slug`, e.g. `almonds`. Resolved server-side — never trusted. */
  @IsString()
  slug!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

/**
 * Body for `POST /products/quote`. The client sends slugs + quantities only;
 * every price comes from MongoDB, so a tampered client cannot invent totals.
 */
export class QuoteRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLine)
  lines!: QuoteLine[];

  /** Optional 6-digit Indian PIN code, echoed back for future shipping rules. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  pin?: string;
}