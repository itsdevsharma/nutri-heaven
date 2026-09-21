import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AdminRequest extends Request { admin?: { sub: string; role: string; email: string } }

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Admin access token required');
    try { request.admin = await this.jwt.verifyAsync(token) as { sub: string; role: string; email: string }; return true; }
    catch { throw new UnauthorizedException('Invalid or expired admin access token'); }
  }
}
