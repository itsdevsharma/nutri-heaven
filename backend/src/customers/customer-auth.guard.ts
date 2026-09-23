import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { customer?: { id: string; email: string } }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Customer sign-in is required');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; type: string }>(token);
      if (payload.type !== 'customer' || !payload.sub || !payload.email) throw new Error('wrong token type');
      request.customer = { id: payload.sub, email: payload.email };
      return true;
    } catch { throw new UnauthorizedException('Your session has expired. Please sign in again.'); }
  }
}
