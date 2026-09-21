import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '../admin/admin.schema';
import { ADMIN_ROLES } from './roles.decorator';
import type { AdminRequest } from './admin-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const admin = context.switchToHttp().getRequest<AdminRequest>().admin;
    if (admin?.role === AdminRole.SUPER_ADMIN || (admin && roles.includes(admin.role as AdminRole))) return true;
    throw new ForbiddenException('You do not have permission for this action');
  }
}
