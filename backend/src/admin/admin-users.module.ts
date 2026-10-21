import { Module } from '@nestjs/common';
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AdminModule } from './admin.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AdminAuthGuard, type AdminRequest } from '../auth/admin-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRole } from './admin.schema';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './admin-users.dto';

@Controller('admin/users')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.SUPER_ADMIN)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list() { return this.users.list(); }
  @Post() create(@Body() body: CreateAdminUserDto, @Req() req: AdminRequest) { return this.users.create(body, req.admin!); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateAdminUserDto, @Req() req: AdminRequest) { return this.users.update(id, body, req.admin!); }
}

@Module({ imports: [AdminModule, AuthModule, AuditModule], controllers: [AdminUsersController], providers: [AdminUsersService] })
export class AdminUsersModule {}
