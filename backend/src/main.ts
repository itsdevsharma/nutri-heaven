import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
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

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
