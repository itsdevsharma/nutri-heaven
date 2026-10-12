import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListProductsQuery } from './list-products.query';
export class BrowseProductsQuery extends ListProductsQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsEnum(['featured', 'price_asc', 'price_desc']) sort?: 'featured' | 'price_asc' | 'price_desc';
}
