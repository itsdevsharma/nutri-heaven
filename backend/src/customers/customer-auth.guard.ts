import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './customer.schema';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { verifyWithRotatedJwtSecret } from '../auth/jwt-secret';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, @InjectModel(Customer.name) private readonly customers: Model<CustomerDocument>) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { customer?: { id: string; email: string } }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Customer sign-in is required');
    try {
      const payload = await verifyWithRotatedJwtSecret<{ sub: string; email: string; type: string; version?: number }>(this.jwt, token);
      if (payload.type !== 'customer' || !payload.sub || !payload.email) throw new Error('wrong token type');
      const customer = await this.customers.findById(payload.sub).lean().exec();
      if (!customer || !customer.isActive || (customer.authVersion ?? 0) !== (payload.version ?? 0)) throw new Error('revoked');
      request.customer = { id: String(customer._id), email: customer.email };
      return true;
    } catch { throw new UnauthorizedException('Your session has expired. Please sign in again.'); }
  }
}
