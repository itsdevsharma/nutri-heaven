import { CustomerOrderReasonDto } from './customer-order.dto';
import { orderReceipt } from '../orders/order-receipt';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminRole } from '../admin/admin.schema';
import { AdminUpdateCustomerDto, AdminCustomerStatusDto } from './admin-customer.dto';
import { AdminAuthGuard, AdminRequest } from '../auth/admin-auth.guard';
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
  @Patch('me/addresses/:id/default') @UseGuards(CustomerAuthGuard) defaultAddress(@Req() req: CustomerRequest, @Param('id') id: string) { return this.service.defaultAddress(req.customer.id, id); }
  @Delete('me/addresses/:id') @UseGuards(CustomerAuthGuard) deleteAddress(@Req() req: CustomerRequest, @Param('id') id: string) { return this.service.deleteAddress(req.customer.id, id); }
  @Get('me/wishlist') @UseGuards(CustomerAuthGuard) wishlist(@Req() req: CustomerRequest) { return this.service.wishlist(req.customer.id); }
  @Post('me/wishlist') @UseGuards(CustomerAuthGuard) addWishlist(@Req() req: CustomerRequest, @Body() dto: WishlistDto) { return this.service.addWishlist(req.customer.id, dto.productSlug); }
  @Delete('me/wishlist/:slug') @UseGuards(CustomerAuthGuard) removeWishlist(@Req() req: CustomerRequest, @Param('slug') slug: string) { return this.service.removeWishlist(req.customer.id, slug); }
  @Get('me/orders/:id') @UseGuards(CustomerAuthGuard) order(@Req() req: CustomerRequest, @Param('id') id: string) { return this.service.ownedOrder(req.customer.id, id); }
  @Post('me/orders/:id/cancel') @UseGuards(CustomerAuthGuard) cancel(@Req() req: CustomerRequest, @Param('id') id: string, @Body() dto: CustomerOrderReasonDto) { return this.service.requestOrderAction(req.customer.id, id, dto.reason, 'cancel'); }
  @Post('me/orders/:id/return') @UseGuards(CustomerAuthGuard) requestReturn(@Req() req: CustomerRequest, @Param('id') id: string, @Body() dto: CustomerOrderReasonDto) { return this.service.requestOrderAction(req.customer.id, id, dto.reason, 'return'); }
  @Get('me/orders/:id/receipt') @UseGuards(CustomerAuthGuard) async receipt(@Req() req: CustomerRequest, @Param('id') id: string, @Res() res: Response) {
    const order = await this.service.ownedOrder(req.customer.id, id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="order-receipt.html"');
    res.send(orderReceipt(order));
  }
  @Get('me/orders') @UseGuards(CustomerAuthGuard) orders(@Req() req: CustomerRequest) { return this.service.ordersFor(req.customer.id); }

  @Get('admin') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT) adminList(@Query() query: CustomerQueryDto) { return this.service.adminList(query.q, query.limit, query.offset, query.status); }
  @Patch('admin/:id') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPPORT) adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateCustomerDto, @Req() req: AdminRequest) { return this.service.adminUpdate(id, dto, req.admin!); }
  @Patch('admin/:id/status') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN) adminStatus(@Param('id') id: string, @Body() dto: AdminCustomerStatusDto, @Req() req: AdminRequest) { return this.service.adminStatus(id, dto.isActive, req.admin!); }
  @Get('admin/:id') @UseGuards(AdminAuthGuard, RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT) adminGet(@Param('id') id: string) { return this.service.adminGet(id); }
}
