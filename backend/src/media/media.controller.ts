import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
const allowed = new Set(['image/jpeg','image/png','image/webp']);
@Controller('admin/media') @UseGuards(AdminAuthGuard,RolesGuard) @Roles(AdminRole.SUPER_ADMIN)
export class MediaController {
  @Post('images')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({ destination: 'uploads', filename: (_req, file, done) => done(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) => done(allowed.has(file.mimetype) ? null : new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), allowed.has(file.mimetype)),
  }))
  upload(@UploadedFile() file?: Express.Multer.File) { if(!file) throw new BadRequestException('Image is required'); return {url:`/uploads/${file.filename}`}; }
}
