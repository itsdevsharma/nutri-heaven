import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { AuthModule } from '../src/auth/auth.module';
import { MediaController } from '../src/media/media.controller';
import { proxyTrust } from '../src/common/proxy-trust';

describe('Security configuration', () => {
  it('trusts only explicit proxy networks', () => {
    expect(proxyTrust({ NODE_ENV: 'development' })).toBe(false);
    expect(() => proxyTrust({ NODE_ENV: 'production' })).toThrow('TRUST_PROXY=true');
    expect(() => proxyTrust({ NODE_ENV: 'production', TRUST_PROXY: 'true' })).toThrow('TRUST_PROXY_CIDRS');
    expect(() => proxyTrust({ TRUST_PROXY: 'true', TRUST_PROXY_CIDRS: '0.0.0.0/0' })).toThrow('entire internet');
    expect(proxyTrust({ TRUST_PROXY: 'true', TRUST_PROXY_CIDRS: 'loopback, 10.1.2.0/24' })).toEqual(['loopback', '10.1.2.0/24']);
  });

  it('reads the signing secret at module initialization, after configuration loading', async () => {
    const previous = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'test-only-late-loaded-secret-123456789';
    try {
      const module = await Test.createTestingModule({ imports: [AuthModule] })
        .overrideProvider(getModelToken('Admin')).useValue({}).compile();
      try {
        const jwt = module.get(JwtService);
        const token = await jwt.signAsync({ sub: 'test' });
        expect(await jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET })).toMatchObject({ sub: 'test' });
        await expect(jwt.verifyAsync(token, { secret: 'development-only-change-me' })).rejects.toThrow();
      } finally { await module.close(); }
    } finally {
      if (previous === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = previous;
    }
  });

  it('rejects production uploads when remote storage is missing or fails', async () => {
    const previousNodeEnv = process.env.NODE_ENV, previousUrl = process.env.CLOUDINARY_URL;
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const file = { buffer, mimetype: 'image/png', size: buffer.length } as Express.Multer.File;
    process.env.NODE_ENV = 'production';
    delete process.env.CLOUDINARY_URL;
    const controller = new MediaController();
    let upload: jest.SpyInstance | undefined;
    try {
      await expect(controller.upload(file)).rejects.toMatchObject({ status: 503 });
      process.env.CLOUDINARY_URL = 'cloudinary://test:test@test';
      upload = jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((...args: any[]) => {
        const callback = args.at(-1);
        return { end: () => callback(new Error('Provider unavailable')) } as any;
      });
      await expect(controller.upload(file)).rejects.toMatchObject({ status: 503 });
    } finally {
      upload?.mockRestore();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
      if (previousUrl === undefined) delete process.env.CLOUDINARY_URL; else process.env.CLOUDINARY_URL = previousUrl;
    }
  });
});
