import crypto from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

const DEFAULT_DEV_USER = {
  name: 'Local mode',
  username: 'local',
};
const SESSION_COOKIE_NAME = 'monday_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface AuthContext {
  authenticated: boolean;
  name: string | null;
  username: string | null;
}

interface NoneAuthConfig {
  canLogout: false;
  mode: 'none';
}

interface ProxyAuthConfig {
  canLogout: false;
  mode: 'proxy';
}

interface LocalAuthConfig {
  basePath: string;
  canLogout: true;
  mode: 'local';
  name: string | null;
  passwordHash: string;
  passwordSalt: string;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
  sessionMaxAgeSeconds: number;
  sessionSecret: string;
  username: string;
}

export type AuthConfig = NoneAuthConfig | ProxyAuthConfig | LocalAuthConfig;

export interface CurrentUserPayload {
  canLogout: boolean;
  name: string | null;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      authContext: AuthContext;
      requestId: string;
    }
  }
}

interface SessionPayload {
  exp: number;
  n: string | null;
  u: string;
}

function isPlaceholderValue(value: string): boolean {
  return /^__.+__$/.test(value);
}

function getSingleHeader(request: Request, name: string): string | null {
  const value = request.header(name);
  return value && value.trim() ? value.trim() : null;
}

function parseCookieHeader(rawCookieHeader: string | undefined): Record<string, string> {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawName, ...rawValueParts] = part.split('=');
    const name = rawName?.trim();

    if (!name) {
      return cookies;
    }

    cookies[name] = rawValueParts.join('=').trim();
    return cookies;
  }, {});
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function signSessionPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function serializeCookie(name: string, value: string, attributes: string[]): string {
  return [`${name}=${value}`, ...attributes].join('; ');
}

function buildLocalSessionPayload(config: LocalAuthConfig): SessionPayload {
  return {
    exp: Date.now() + config.sessionMaxAgeSeconds * 1000,
    n: config.name,
    u: config.username,
  };
}

function createSessionToken(config: LocalAuthConfig): string {
  const payload = Buffer.from(JSON.stringify(buildLocalSessionPayload(config))).toString('base64url');
  const signature = signSessionPayload(payload, config.sessionSecret);
  return `${payload}.${signature}`;
}

function parseProxyAuthContext(request: Request): AuthContext {
  const username =
    getSingleHeader(request, 'X-Authentik-Username') || getSingleHeader(request, 'X-Authentik-Email') || null;
  const name = getSingleHeader(request, 'X-Authentik-Name');

  return {
    authenticated: Boolean(username),
    name,
    username,
  };
}

function parseLocalAuthContext(request: Request, config: LocalAuthConfig): AuthContext {
  const cookies = parseCookieHeader(request.header('cookie') ?? undefined);
  const token = cookies[config.sessionCookieName];

  if (!token) {
    return {
      authenticated: false,
      name: null,
      username: null,
    };
  }

  const [payload, signature] = token.split('.');

  if (!payload || !signature) {
    return {
      authenticated: false,
      name: null,
      username: null,
    };
  }

  const expectedSignature = signSessionPayload(payload, config.sessionSecret);

  if (!safeEqual(signature, expectedSignature)) {
    return {
      authenticated: false,
      name: null,
      username: null,
    };
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionPayload;

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.u !== 'string' ||
      parsed.u !== config.username ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return {
        authenticated: false,
        name: null,
        username: null,
      };
    }

    return {
      authenticated: true,
      name: typeof parsed.n === 'string' ? parsed.n : config.name,
      username: parsed.u,
    };
  } catch {
    return {
      authenticated: false,
      name: null,
      username: null,
    };
  }
}

function createDevAuthContext(): AuthContext {
  return {
    authenticated: true,
    name: DEFAULT_DEV_USER.name,
    username: DEFAULT_DEV_USER.username,
  };
}

export function resolveAuthConfig(options: { authRequired: boolean }): AuthConfig {
  const basePath = (() => {
    const rawBasePath = process.env.APP_BASE_PATH?.trim() || '/monday';

    if (!rawBasePath || rawBasePath === '/') {
      return '/';
    }

    return rawBasePath.startsWith('/') ? rawBasePath.replace(/\/+$/, '') : `/${rawBasePath.replace(/\/+$/, '')}`;
  })();
  const username = process.env.MONDAY_AUTH_USERNAME?.trim() || '';
  const passwordHash = process.env.MONDAY_AUTH_PASSWORD_HASH?.trim() || '';
  const passwordSalt = process.env.MONDAY_AUTH_PASSWORD_SALT?.trim() || '';
  const sessionSecret = process.env.MONDAY_SESSION_SECRET?.trim() || '';
  const hasLocalAuthConfig = [username, passwordHash, passwordSalt, sessionSecret].some(Boolean);

  if (hasLocalAuthConfig) {
    if (!username || !passwordHash || !passwordSalt || !sessionSecret) {
      throw new Error(
        'Local auth requires MONDAY_AUTH_USERNAME, MONDAY_AUTH_PASSWORD_HASH, MONDAY_AUTH_PASSWORD_SALT, and MONDAY_SESSION_SECRET.',
      );
    }

    if ([username, passwordHash, passwordSalt, sessionSecret].some(isPlaceholderValue)) {
      throw new Error(
        'Replace placeholder values in MONDAY_AUTH_USERNAME, MONDAY_AUTH_PASSWORD_HASH, MONDAY_AUTH_PASSWORD_SALT, and MONDAY_SESSION_SECRET before starting the Timeweb deployment.',
      );
    }

    return {
      basePath,
      canLogout: true,
      mode: 'local',
      name: process.env.MONDAY_AUTH_NAME?.trim() || null,
      passwordHash,
      passwordSalt,
      sessionCookieName: SESSION_COOKIE_NAME,
      sessionCookieSecure: (process.env.SESSION_COOKIE_SECURE ?? 'false') === 'true',
      sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS ?? SESSION_MAX_AGE_SECONDS),
      sessionSecret,
      username,
    };
  }

  if (options.authRequired) {
    return {
      canLogout: false,
      mode: 'proxy',
    };
  }

  return {
    canLogout: false,
    mode: 'none',
  };
}

export function attachAuthContext(config: AuthConfig): RequestHandler {
  return (request, _response, next) => {
    if (config.mode === 'proxy') {
      request.authContext = parseProxyAuthContext(request);
      next();
      return;
    }

    if (config.mode === 'local') {
      request.authContext = parseLocalAuthContext(request, config);
      next();
      return;
    }

    request.authContext = createDevAuthContext();
    next();
  };
}

export function requireAuth(): RequestHandler {
  return (request, response, next) => {
    if (!request.authContext.authenticated || !request.authContext.username) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }

    next();
  };
}

export function getCurrentUserPayload(request: Request, config: AuthConfig): CurrentUserPayload {
  if (request.authContext.username) {
    return {
      canLogout: config.canLogout,
      name: request.authContext.name,
      username: request.authContext.username,
    };
  }

  return {
    canLogout: false,
    name: DEFAULT_DEV_USER.name,
    username: DEFAULT_DEV_USER.username,
  };
}

export function verifyLocalCredentials(config: AuthConfig, username: string, password: string): boolean {
  if (config.mode !== 'local') {
    return false;
  }

  if (!safeEqual(username, config.username)) {
    return false;
  }

  return safeEqual(hashPassword(password, config.passwordSalt), config.passwordHash);
}

export function issueLocalSession(response: Response, config: AuthConfig): void {
  if (config.mode !== 'local') {
    throw new Error('Local session issuance is only available in local auth mode.');
  }

  const attributes = [
    'HttpOnly',
    `Path=${config.basePath}`,
    'SameSite=Lax',
    `Max-Age=${config.sessionMaxAgeSeconds}`,
  ];

  if (config.sessionCookieSecure) {
    attributes.push('Secure');
  }

  response.setHeader(
    'Set-Cookie',
    serializeCookie(config.sessionCookieName, createSessionToken(config), attributes),
  );
}

export function clearLocalSession(response: Response, config: AuthConfig): void {
  const cookieName = config.mode === 'local' ? config.sessionCookieName : SESSION_COOKIE_NAME;
  const cookiePath = config.mode === 'local' ? config.basePath : '/monday';
  const attributes = ['HttpOnly', `Path=${cookiePath}`, 'SameSite=Lax', 'Max-Age=0'];

  if (config.mode === 'local' && config.sessionCookieSecure) {
    attributes.push('Secure');
  }

  response.setHeader('Set-Cookie', serializeCookie(cookieName, '', attributes));
}

export function getLocalUserPayload(config: AuthConfig): CurrentUserPayload {
  if (config.mode !== 'local') {
    throw new Error('Local user payload is only available in local auth mode.');
  }

  return {
    canLogout: true,
    name: config.name,
    username: config.username,
  };
}
