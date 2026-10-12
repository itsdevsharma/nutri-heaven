import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { isValidObjectId, Model } from 'mongoose';
import { Admin, AdminDocument } from './admin.schema';
import { CreateAdminUserDto, UpdateAdminUserDto } from './admin-users.dto';
import { AuditService } from '../audit/audit.service';
import { AdminRequest } from '../auth/admin-auth.guard';

const publicFields = '_id name email role isActive createdAt updatedAt';
@Injectable()
export class AdminUsersService {
  constructor(@InjectModel(Admin.name) private readonly admins: Model<AdminDocument>, private readonly audit: AuditService) {}

  list() { return this.admins.find().select(publicFields).sort({ createdAt: -1 }).lean().exec(); }

  async create(dto: CreateAdminUserDto, actor: NonNullable<AdminRequest['admin']>) {
    const { password, ...fields } = dto;
    try {
      const user = await this.admins.create({ ...fields, passwordHash: await hash(password, 12) });
      const result = await this.admins.findById(user.id).select(publicFields).lean().exec();
      await this.audit.record({ actorId: actor.sub, actorEmail: actor.email, action: 'admin.create', entityType: 'admin', entityId: user.id, after: result! });
      return result;
    } catch (error) { this.handleError(error); }
  }

  async update(id: string, dto: UpdateAdminUserDto, actor: NonNullable<AdminRequest['admin']>) {
    if (!isValidObjectId(id)) throw new BadRequestException('Invalid user ID');
    const before = await this.admins.findById(id).select(publicFields).lean().exec();
    if (!before) throw new NotFoundException('User not found');
    if (id === actor.sub && (dto.isActive === false || (dto.role !== undefined && dto.role !== before.role))) {
      throw new BadRequestException('You cannot deactivate or change the role of your own account.');
    }
    const { password, ...fields } = dto;
    const changes: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    if (password !== undefined) changes.passwordHash = await hash(password, 12);
    const revoke = password !== undefined || (dto.role !== undefined && dto.role !== before.role) || (dto.isActive !== undefined && dto.isActive !== before.isActive) || (dto.email !== undefined && dto.email !== before.email);
    try {
      const after = await this.admins.findByIdAndUpdate(id, { $set: changes, ...(revoke ? { $inc: { authVersion: 1 }, $unset: { refreshTokenHash: 1 } } : {}) }, { new: true, runValidators: true }).select(publicFields).lean().exec();
      if (!after) throw new NotFoundException('User not found');
      await this.audit.record({ actorId: actor.sub, actorEmail: actor.email, action: password !== undefined ? 'admin.update_password' : 'admin.update', entityType: 'admin', entityId: id, before, after });
      return after;
    } catch (error) { this.handleError(error); }
  }

  private handleError(error: unknown): never {
    if ((error as { code?: number })?.code === 11000) throw new ConflictException('A user with this email already exists.');
    throw error;
  }
}
