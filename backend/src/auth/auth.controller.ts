import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthGuard, AdminRequest } from './admin-auth.guard';
import { AuthService } from './auth.service';
import { LoginRequest } from './dto/login.request';

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: LoginRequest, @Req() request: Request) { return this.auth.login(body.email, body.password, request.ip); }
  @Post('logout') @UseGuards(AdminAuthGuard)
  logout(@Req() request: AdminRequest) { return this.auth.logout(request.admin!.sub); }
}
