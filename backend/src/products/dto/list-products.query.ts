import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query string for `GET /products`. Everything arrives as a string over HTTP,
 * so the global `ValidationPipe({ transform: true })` coerces `?limit=10`
 * into a number via `@Type(() => Number)` before these validators run.
 */
export class ListProductsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}