import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { static as serveStatic, type NextFunction, type Request, type Response } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { proxyTrust } from './common/proxy-trust';

type RateBucket = { count: number; resetAt: number };

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function limitFor(request: Request): { key: string; limit: number; windowMs: number } {
  const path = request.path;
  if (path === '/admin/auth/login') return { key: 'login', limit: positiveInteger(process.env.RATE_LIMIT_LOGIN_PER_15_MIN, 8), windowMs: 15 * 60_000 };
  if (path.startsWith('/payments/razorpay')) return { key: 'payment', limit: positiveInteger(process.env.RATE_LIMIT_PAYMENT_PER_MIN, 30), windowMs: 60_000 };
  if (!['GET', 'HEAD'].includes(request.method)) return { key: 'write', limit: positiveInteger(process.env.RATE_LIMIT_WRITE_PER_MIN, 90), windowMs: 60_000 };
  return { key: 'read', limit: positiveInteger(process.env.RATE_LIMIT_READ_PER_MIN, 300), windowMs: 60_000 };
}

async function bootstrap(): Promise<void> {
  const production = process.env.NODE_ENV === 'production';
  if (production) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32 || secret === 'replace-with-a-long-random-secret') {
      throw new Error('JWT_ACCESS_SECRET must be a unique 32+ character production secret');
    }
    const previousSecret = process.env.JWT_ACCESS_SECRET_PREVIOUS?.trim();
    if (previousSecret && (previousSecret.length < 32 || previousSecret === secret)) {
      throw new Error('JWT_ACCESS_SECRET_PREVIOUS must be a different 32+ character secret when configured');
    }
    if (!process.env.CORS_ORIGINS) {
      throw new Error('CORS_ORIGINS must be explicitly configured in production');
    }
  }
  const trustProxy = proxyTrust();
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
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

  // Correlation IDs are deliberately opaque. Access logs do not contain
  // bodies, tokens, email addresses or payment references.
  app.use((request: Request, response: Response, next: NextFunction) => {
    const supplied = request.header('x-request-id');
    const requestId = supplied && /^[a-zA-Z0-9_-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
    const startedAt = performance.now();
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      Logger.log(JSON.stringify({ event: 'http_request', requestId, method: request.method, path: request.path, status: response.statusCode, durationMs: Math.round(performance.now() - startedAt) }), 'AccessLog');
    });
    next();
  });

  // These headers protect the API itself. The storefront has its own CSP in
  // Vercel configuration because it intentionally loads analytics/payment SDKs.
  app.use((request: Request, response: Response, next: NextFunction) => {
    // Public catalogue caching is bounded in the storefront; private API data
    // (including carts, orders and admin responses) must never enter HTTP caches.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', request.path.startsWith('/uploads/') ? 'cross-origin' : 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (production && request.secure) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Per-process circuit breaker for abusive traffic. Production must also use
  // the host/CDN rate limiter, since memory state cannot be shared across
  // horizontally scaled instances. Tests disable this to keep e2e concerns
  // separate from abuse-control behaviour.
  const rateBuckets = new Map<string, RateBucket>();
  const rateLimitEnabled = process.env.NODE_ENV !== 'test' && process.env.RATE_LIMIT_ENABLED !== 'false';
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (!rateLimitEnabled || request.method === 'OPTIONS' || request.path.startsWith('/health')) return next();
    const policy = limitFor(request);
    const source = request.ip || request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${policy.key}:${source}`;
    const bucket = rateBuckets.get(key);
    const active = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + policy.windowMs };
    active.count += 1;
    rateBuckets.set(key, active);
    if (rateBuckets.size > 10_000) {
      for (const [entryKey, entry] of rateBuckets) if (entry.resetAt <= now) rateBuckets.delete(entryKey);
    }
    const remaining = Math.max(0, policy.limit - active.count);
    response.setHeader('RateLimit-Limit', String(policy.limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(Math.ceil(active.resetAt / 1000)));
    if (active.count > policy.limit) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((active.resetAt - now) / 1000))));
      return response.status(429).json({ statusCode: 429, message: 'Too many requests. Please retry shortly.' });
    }
    next();
  });

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
    serveStatic(uploads, {
      maxAge: '1d',
      setHeaders: (response) => response.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate'),
    }),
  );

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

  app.enableCors({
    origin: origins,
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Cart-Id', 'X-Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    maxAge: 600,
  });

  // Render and most managed hosts provide PORT; API_PORT remains useful for
  // local development and existing deployments.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port);
  Logger.log(JSON.stringify({ event: 'api_started', port, production, trustProxy, corsOrigins: origins.length, rateLimitEnabled }), 'Bootstrap');
}

void bootstrap();
