import { BadRequestException, Controller, Post, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import { memoryStorage } from 'multer';
import { AdminRole } from '../admin/admin.schema';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
const allowed = new Set(['image/jpeg','image/png','image/webp']);
const validImage = (file: Express.Multer.File) => { const bytes=file.buffer; return (file.mimetype==='image/jpeg' && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) || (file.mimetype==='image/png' && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) || (file.mimetype==='image/webp' && bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP'); };
@Controller('admin/media') @UseGuards(AdminAuthGuard,RolesGuard) @Roles(AdminRole.SUPER_ADMIN, AdminRole.CATALOGUE_MANAGER)
export class MediaController {
  @Post('images')
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) => done(allowed.has(file.mimetype) ? null : new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), allowed.has(file.mimetype)),
  }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image is required');
    if (!validImage(file)) throw new BadRequestException('File contents do not match its image type');
    if (!process.env.CLOUDINARY_URL) throw new ServiceUnavailableException('Image storage is not configured');

    cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'nutri-heaven', resource_type: 'image', format: file.mimetype.split('/')[1] },
        (error, upload) => error || !upload ? reject(error ?? new Error('Cloudinary returned no upload result')) : resolve(upload),
      );
      stream.end(file.buffer);
    }).catch(() => { throw new ServiceUnavailableException('Image upload failed'); });

    return { url: result.secure_url, publicId: result.public_id };
  }
}
