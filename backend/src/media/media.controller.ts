import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import { memoryStorage } from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
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
    // Originals may come straight from a modern phone. They are optimised
    // below, so accept a sensible source-size ceiling rather than rejecting a
    // usable image merely because it has not been compressed yet.
    limits: { fileSize: 12 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) => done(allowed.has(file.mimetype) ? null : new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), allowed.has(file.mimetype)),
  }))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image is required');
    if (!validImage(file)) throw new BadRequestException('File contents do not match its image type');

    let image: ReturnType<typeof sharp>;
    try { image = sharp(file.buffer, { failOn: 'error' }); await image.metadata(); }
    catch { throw new BadRequestException('The uploaded file is not a readable image'); }
    // Product imagery is served as WebP at a visually lossless quality. The
    // resize is never an upscale and retains the source aspect ratio.
    const optimised = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();

    // Cloudinary is optional in local development. Without it, use the API's
    // static uploads directory so creating a product still works end-to-end.
    const saveLocally = async () => {
      const filename = `${randomUUID()}.webp`;
      const uploads = join(process.cwd(), 'uploads');
      await mkdir(uploads, { recursive: true });
      await writeFile(join(uploads, filename), optimised);
      return { url: `/uploads/${filename}`, publicId: null, originalBytes: file.size, optimisedBytes: optimised.length };
    };
    if (!process.env.CLOUDINARY_URL) return saveLocally();

    cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });
    let result: { secure_url: string; public_id: string };
    try {
      result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'nutri-heaven', resource_type: 'image', format: 'webp', transformation: [{ quality: 'auto:good', fetch_format: 'auto' }] },
          (error, upload) => error || !upload ? reject(error ?? new Error('Cloudinary returned no upload result')) : resolve(upload),
        );
        stream.end(optimised);
      });
    } catch {
      // Local development and a temporarily unavailable remote provider should
      // not prevent an operator from creating a product.
      return saveLocally();
    }

    return { url: result.secure_url, publicId: result.public_id, originalBytes: file.size, optimisedBytes: optimised.length };
  }
}
