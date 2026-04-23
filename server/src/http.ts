import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';

function getClientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

export function attachRequestId(): RequestHandler {
  return (request, response, next) => {
    request.requestId = request.header('X-Request-Id') || crypto.randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    next();
  };
}

export function requestLogger(): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          event: 'http_request',
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl,
          status: response.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
          clientIp: getClientIp(request),
          authenticated: request.authContext.authenticated,
          authUsername: request.authContext.username,
        }),
      );
    });

    next();
  };
}

interface RateLimitOptions {
  limit: number;
  name: string;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter({ limit, name, windowMs }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  let lastSweepAt = 0;

  function sweepExpiredBuckets(now: number): void {
    if (now - lastSweepAt < windowMs) {
      return;
    }

    lastSweepAt = now;

    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  return (request, response, next) => {
    const now = Date.now();
    sweepExpiredBuckets(now);
    const key = `${name}:${getClientIp(request)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;

    if (existing.count > limit) {
      response.setHeader('Retry-After', Math.ceil((existing.resetAt - now) / 1000));
      response.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}
