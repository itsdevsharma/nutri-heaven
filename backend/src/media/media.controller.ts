import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { readFileSync, unlinkSync } from 'fs';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
const allowed = new Set(['image/jpeg','image/png','image/webp']);
const extension: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const validImage = (file: Express.Multer.File) => { const bytes=readFileSync(file.path); return (file.mimetype==='image/jpeg' && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) || (file.mimetype==='image/png' && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) || (file.mimetype==='image/webp' && bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP'); };
@Controller('admin/media') @UseGuards(AdminAuthGuard,RolesGuard) @Roles(AdminRole.SUPER_ADMIN)
export class MediaController {
  @Post('images')
  @UseInterceptors(FileInterceptor('image', {
    storage: diskStorage({ destination: 'uploads', filename: (_req, file, done) => done(null, `${randomUUID()}${extension[file.mimetype] ?? ''}`) }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) => done(allowed.has(file.mimetype) ? null : new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), allowed.has(file.mimetype)),
  }))
  upload(@UploadedFile() file?: Express.Multer.File) { if(!file) throw new BadRequestException('Image is required'); if(!validImage(file)) { unlinkSync(file.path); throw new BadRequestException('File contents do not match its image type'); } return {url:`/uploads/${file.filename}`}; }
}
