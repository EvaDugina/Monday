import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';

export interface AuthContext {
  email: string | null;
  name: string | null;
  groups: string[];
  userId: string | null;
  username: string | null;
}

declare global {
  namespace Express {
    interface Request {
      authContext: AuthContext;
      requestId: string;
    }
  }
}

function getSingleHeader(request: Request, name: string): string | null {
  const value = request.header(name);
  return value && value.trim() ? value.trim() : null;
}

function parseGroupsHeader(raw: string | null): string[] {
  if (!raw) {
    return [];
  }

  const normalized = raw.trim();

  if (!normalized) {
    return [];
  }

  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
    } catch {
      // fall through to delimiter-based parsing
    }
  }

  return normalized
    .split(/[;,]/)
    .map((group) => group.trim())
    .filter(Boolean);
}

function extractAuthContext(request: Request): AuthContext {
  return {
    email: getSingleHeader(request, 'X-Authentik-Email'),
    name: getSingleHeader(request, 'X-Authentik-Name'),
    groups: parseGroupsHeader(getSingleHeader(request, 'X-Authentik-Groups')),
    userId: getSingleHeader(request, 'X-Authentik-Uid'),
    username: getSingleHeader(request, 'X-Authentik-Username'),
  };
}

function getClientIp(request: Request): string {
  const forwardedFor = request.header('X-Forwarded-For');

  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return request.ip || request.socket.remoteAddress || 'unknown';
}

export function attachRequestContext(): RequestHandler {
  return (request, response, next) => {
    request.requestId = request.header('X-Request-Id') || crypto.randomUUID();
    request.authContext = extractAuthContext(request);

    response.setHeader('X-Request-Id', request.requestId);

    next();
  };
}

export function requireAuth(): RequestHandler {
  return (request, response, next) => {
    if (!request.authContext.email) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }

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
          authEmail: request.authContext.email,
          authGroups: request.authContext.groups,
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

  return (request, response, next) => {
    const now = Date.now();
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
