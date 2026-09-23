import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AddressDto, CustomerQueryDto, ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto, UpdateProfileDto, WishlistDto } from './customer.dto';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerService } from './customer.service';

type CustomerRequest = Request & { customer: { id: string; email: string } };

@Controller('customer')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}
  @Post('auth/signup') signup(@Body() dto: SignupDto) { return this.service.signup(dto); }
  @Post('auth/login') login(@Body() dto: LoginDto) { return this.service.login(dto.email, dto.password); }
  @Post('auth/forgot-password') forgot(@Body() dto: ForgotPasswordDto) { return this.service.forgotPassword(dto.email); }
  @Post('auth/reset-password') reset(@Body() dto: ResetPasswordDto) { return this.service.resetPassword(dto.token, dto.password); }
  @Get('me') @UseGuards(CustomerAuthGuard) me(@Req() req: CustomerRequest) { return this.service.me(req.customer.id); }
  @Patch('me') @UseGuards(CustomerAuthGuard) update(@Req() req: CustomerRequest, @Body() dto: UpdateProfileDto) { return this.service.update(req.customer.id, dto); }
  @Get('me/addresses') @UseGuards(CustomerAuthGuard) addresses(@Req() req: CustomerRequest) { return this.service.me(req.customer.id).then(customer => customer.addresses); }
  @Post('me/addresses') @UseGuards(CustomerAuthGuard) addAddress(@Req() req: CustomerRequest, @Body() dto: AddressDto) { return this.service.addAddress(req.customer.id, dto); }
  @Patch('me/addresses/:id') @UseGuards(CustomerAuthGuard) updateAddress(@Req() req: CustomerRequest, @Param('id') id: string, @Body() dto: AddressDto) { return this.service.updateAddress(req.customer.id, id, dto); }
  @Delete('me/addresses/:id') @UseGuards(CustomerAuthGuard) deleteAddress(@Req() req: CustomerRequest, @Param('id') id: string) { return this.service.deleteAddress(req.customer.id, id); }
  @Get('me/wishlist') @UseGuards(CustomerAuthGuard) wishlist(@Req() req: CustomerRequest) { return this.service.wishlist(req.customer.id); }
  @Post('me/wishlist') @UseGuards(CustomerAuthGuard) addWishlist(@Req() req: CustomerRequest, @Body() dto: WishlistDto) { return this.service.addWishlist(req.customer.id, dto.productSlug); }
  @Delete('me/wishlist/:slug') @UseGuards(CustomerAuthGuard) removeWishlist(@Req() req: CustomerRequest, @Param('slug') slug: string) { return this.service.removeWishlist(req.customer.id, slug); }
  @Get('me/orders') @UseGuards(CustomerAuthGuard) orders(@Req() req: CustomerRequest) { return this.service.ordersFor(req.customer.email); }

  @Get('admin') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT) adminList(@Query() query: CustomerQueryDto) { return this.service.adminList(query.q, query.limit, query.offset); }
  @Get('admin/:id') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT) adminGet(@Param('id') id: string) { return this.service.adminGet(id); }
}
