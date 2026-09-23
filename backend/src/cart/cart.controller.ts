import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AddCartItemDto, CartNoteDto, UpdateCartItemDto } from './cart.dto';
import { CartService } from './cart.service';
@Controller('cart')
export class CartController {
  constructor(private service: CartService) {}
  private id(id?: string) { if (!id || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new Error('A valid x-cart-id header is required'); return id; }
  @Get() get(@Headers('x-cart-id') id?: string) { return this.service.get(this.id(id)); }
  @Post('items') add(@Headers('x-cart-id') id: string, @Body() dto: AddCartItemDto) { return this.service.add(this.id(id), dto); }
  @Patch('items/:index') update(@Headers('x-cart-id') id: string, @Param('index') index: string, @Body() dto: UpdateCartItemDto) { return this.service.update(this.id(id), Number(index), dto); }
  @Delete('items/:index') remove(@Headers('x-cart-id') id: string, @Param('index') index: string) { return this.service.remove(this.id(id), Number(index)); }
  @Delete('items') clear(@Headers('x-cart-id') id: string) { return this.service.clear(this.id(id)); }
  @Post('items/:index/save') save(@Headers('x-cart-id') id: string, @Param('index') index: string) { return this.service.saveForLater(this.id(id), Number(index)); }
  @Post('items/:index/move-to-cart') move(@Headers('x-cart-id') id: string, @Param('index') index: string) { return this.service.saveForLater(this.id(id), Number(index), false); }
  @Patch('note') note(@Headers('x-cart-id') id: string, @Body() dto: CartNoteDto) { return this.service.note(this.id(id), dto.note); }
}
