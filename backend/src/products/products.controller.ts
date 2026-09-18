import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ListProductsQuery } from './dto/list-products.query';
import { QuoteRequest } from './dto/quote.request';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.findAll(query.limit, query.offset);
  }

  /**
   * Prices before the `:slug` route on purpose — otherwise Express would read
   * `quote` as a slug and return 404. Route order inside a controller matters.
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@Body() dto: QuoteRequest) {
    return this.products.quote(dto);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }
}