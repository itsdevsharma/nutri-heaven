import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { static as serveStatic, type NextFunction, type Request, type Response } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32 || secret === 'replace-with-a-long-random-secret') {
      throw new Error('JWT_ACCESS_SECRET must be a unique 32+ character production secret');
    }
    if (!process.env.CORS_ORIGINS) {
      throw new Error('CORS_ORIGINS must be explicitly configured in production');
    }
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const uploads = join(process.cwd(), 'uploads');
  if (!existsSync(uploads)) mkdirSync(uploads, { recursive: true });
  // An empty host environment variable must not silently produce an empty
  // allow-list (which causes successful OPTIONS responses with no CORS header).
  // Vite falls back to 5174 when 5173 is occupied during local development.
  // Production deployments should still set CORS_ORIGINS explicitly.
  const origins = (process.env.CORS_ORIGINS?.trim() || 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,https://nutri-heaven-mu.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Canvas-based image editing needs the upload origin to be CORS-readable.
  // Static middleware runs before Nest's regular route handling, so it must
  // emit the header itself rather than relying on `app.enableCors()` below.
  // Reflect only configured origins; using the first configured origin breaks
  // uploads when more than one storefront origin is allowed.
  app.use(
    '/uploads',
    (request: Request, response: Response, next: NextFunction) => {
      const origin = request.headers.origin;
      if (origin && origins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.vary('Origin');
      }
      next();
    },
    serveStatic(uploads),
  );

  // Baseline browser protections without adding a second middleware stack.
  // A deployed reverse proxy remains responsible for HTTPS/HSTS.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Reject unknown properties and coerce query strings (e.g. `?limit=10`
  // arrives as a string) into their DTO types in one place, instead of
  // validating by hand in every handler.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: origins });

  // Render and most managed hosts provide PORT; API_PORT remains useful for
  // local development and existing deployments.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
