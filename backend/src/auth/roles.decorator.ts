import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '../admin/admin.schema';
export const ADMIN_ROLES = 'admin_roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES, roles);
