import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../admin/admin.schema';
import type { Request } from 'express';

export interface AdminRequest extends Request { admin?: { sub: string; role: string; email: string; version: number } }

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, @InjectModel(Admin.name) private readonly admins: Model<AdminDocument>) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('Admin access token required');
    try { const payload = await this.jwt.verifyAsync(token) as { sub: string; role: string; email: string; version?: number }; const admin=await this.admins.findById(payload.sub).lean().exec(); if(!admin || !admin.isActive || (admin.authVersion ?? 0)!==(payload.version ?? 0)) throw new Error('revoked'); request.admin = { ...payload, version: payload.version ?? 0 }; return true; }
    catch { throw new UnauthorizedException('Invalid or expired admin access token'); }
  }
}
