import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Admin, AdminSchema } from '../admin/admin.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]), JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET ?? 'development-only-change-me', signOptions: { expiresIn: '15m' } })],
  controllers: [AuthController], providers: [AuthService, AdminAuthGuard, RolesGuard], exports: [JwtModule, AdminAuthGuard, RolesGuard],
})
export class AuthModule {}
