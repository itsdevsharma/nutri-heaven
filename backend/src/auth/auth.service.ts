import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { compare } from 'bcryptjs';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../admin/admin.schema';

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  constructor(@InjectModel(Admin.name) private readonly admins: Model<AdminDocument>, private readonly jwt: JwtService) {}

  async login(email: string, password: string, source = 'unknown') {
    const key = `${source}:${email.toLowerCase()}`; const now = Date.now(); const prior = this.attempts.get(key);
    if (prior && prior.resetAt > now && prior.count >= 5) throw new HttpException('Too many sign-in attempts. Please try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const admin = await this.admins.findOne({ email: email.toLowerCase(), isActive: true }).select('+passwordHash').exec();
    if (!admin || !(await compare(password, admin.passwordHash))) { this.attempts.set(key,{count:(prior?.resetAt??0)>now?(prior?.count??0)+1:1,resetAt:now+15*60*1000}); throw new UnauthorizedException('Invalid email or password'); }
    this.attempts.delete(key);
    const payload = { sub: admin.id, role: admin.role, email: admin.email, version: admin.authVersion ?? 0 };
    return { accessToken: await this.jwt.signAsync(payload), admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
  }
  async logout(id: string) { await this.admins.findByIdAndUpdate(id, { $inc: { authVersion: 1 } }).exec(); return { loggedOut: true }; }
}
