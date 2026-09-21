import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { compare } from 'bcryptjs';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../admin/admin.schema';

@Injectable()
export class AuthService {
  constructor(@InjectModel(Admin.name) private readonly admins: Model<AdminDocument>, private readonly jwt: JwtService) {}

  async login(email: string, password: string) {
    const admin = await this.admins.findOne({ email: email.toLowerCase(), isActive: true }).select('+passwordHash').exec();
    if (!admin || !(await compare(password, admin.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    const payload = { sub: admin.id, role: admin.role, email: admin.email };
    return { accessToken: await this.jwt.signAsync(payload), admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } };
  }
}
