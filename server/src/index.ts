import express from 'express';
import type { Request, Response } from 'express';
import { extname, join, resolve } from 'node:path';
import { closeDatabase, createBackupSnapshot, getTasksState, isDatabaseReady, setTasksState } from './db.js';
import {
  attachAuthContext,
  clearLocalSession,
  getCurrentUserPayload,
  getLocalUserPayload,
  issueLocalSession,
  requireAuth,
  resolveAuthConfig,
  verifyLocalCredentials,
} from './auth.js';
import { attachRequestId, createRateLimiter, requestLogger, securityHeaders } from './http.js';
import { ValidationError, parseLoginPayload, parseTasksPayload } from './schema.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const debugMode = (process.env.DEBUG ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';
const proxyAuthRequired = (process.env.AUTH_REQUIRED ?? (debugMode ? 'false' : 'true')) === 'true';
const authConfig = resolveAuthConfig({ authRequired: proxyAuthRequired });
const appBasePath = (() => {
  const rawBasePath =
    process.env.APP_BASE_PATH?.trim() || (authConfig.mode === 'local' ? authConfig.basePath : '');

  if (!rawBasePath || rawBasePath === '/') {
    return '';
  }

  return rawBasePath.startsWith('/') ? rawBasePath.replace(/\/+$/, '') : `/${rawBasePath.replace(/\/+$/, '')}`;
})();
const mountPath = appBasePath || undefined;
const staticRoot = process.env.STATIC_ROOT?.trim() ? resolve(process.cwd(), process.env.STATIC_ROOT) : null;
const staticIndexPath = staticRoot ? join(staticRoot, 'index.html') : null;
const router = express.Router();

const hstsEnabled = (process.env.HSTS_ENABLED ?? (debugMode ? 'false' : 'true')) === 'true';

app.disable('x-powered-by');
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(attachRequestId());
app.use(securityHeaders({ enableHsts: hstsEnabled }));
app.use(express.json({ limit: '2mb' }));
app.use(attachAuthContext(authConfig));
app.use(requestLogger());

const authLimiter = createRateLimiter({
  name: 'auth',
  windowMs: 60_000,
  limit: 10,
});

const readLimiter = createRateLimiter({
  name: 'read',
  windowMs: 60_000,
  limit: 120,
});

const writeLimiter = createRateLimiter({
  name: 'write',
  windowMs: 60_000,
  limit: 30,
});

const backupLimiter = createRateLimiter({
  name: 'backup',
  windowMs: 60_000,
  limit: 12,
});

const healthLimiter = createRateLimiter({
  name: 'health',
  windowMs: 60_000,
  limit: 240,
});

function getBackupOwner(request: Request) {
  return {
    key: request.authContext.username ?? 'anonymous',
    email: null,
    name: request.authContext.name ?? request.authContext.username,
  };
}

function parseBackupSource(value: unknown): 'auto' | 'manual' {
  if (value === undefined || value === null) {
    return 'manual';
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Body must be a JSON object');
  }

  const source = (value as { source?: unknown }).source;

  if (source === undefined) {
    return 'manual';
  }

  if (source === 'auto' || source === 'manual') {
    return source;
  }

  throw new ValidationError('source must be "auto" or "manual"');
}

router.get('/api/health/live', healthLimiter, (_request, response) => {
  response.json({ ok: true });
});

router.get('/api/health/ready', healthLimiter, (_request, response) => {
  if (!isDatabaseReady()) {
    response.status(503).json({ ok: false });
    return;
  }

  response.json({ ok: true });
});

router.get('/api/health', healthLimiter, (_request, response) => {
  if (!isDatabaseReady()) {
    response.status(503).json({ ok: false });
    return;
  }

  response.json({ ok: true });
});

if (authConfig.mode === 'local') {
  router.post('/api/auth/login', authLimiter, (request, response, next) => {
    let payload: ReturnType<typeof parseLoginPayload>;

    try {
      payload = parseLoginPayload(request.body);
    } catch (error) {
      next(error);
      return;
    }

    verifyLocalCredentials(authConfig, payload.username, payload.password)
      .then((authenticated) => {
        if (!authenticated) {
          response.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        issueLocalSession(response, authConfig);
        response.json(getLocalUserPayload(authConfig));
      })
      .catch(next);
  });

  router.post('/api/auth/logout', requireAuth(), (_request, response) => {
    clearLocalSession(response, authConfig);
    response.status(204).end();
  });
}

if (authConfig.mode !== 'none') {
  router.use('/api/me', requireAuth());
  router.use('/api/tasks', requireAuth());
  router.use('/api/backups', requireAuth());
}

router.get('/api/me', readLimiter, (request, response) => {
  response.json(getCurrentUserPayload(request, authConfig));
});

router.get('/api/tasks', readLimiter, (_request, response) => {
  response.json(getTasksState());
});

router.put('/api/tasks', writeLimiter, (request, response) => {
  const payload = parseTasksPayload(request.body);
  const result = setTasksState(payload.tasks, payload.expectedVersion);

  if (result.kind === 'conflict') {
    response.status(409).json(result.state);
    return;
  }

  response.json({
    updatedAt: result.state.updatedAt,
    version: result.state.version,
  });
});

router.post('/api/backups', backupLimiter, (request, response) => {
  const source = parseBackupSource(request.body);
  response.json(createBackupSnapshot(getBackupOwner(request), source));
});

if (staticRoot && staticIndexPath) {
  router.use(
    express.static(staticRoot, {
      index: false,
      maxAge: '7d',
    }),
  );

  router.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/') || extname(request.path)) {
      next();
      return;
    }

    response.sendFile(staticIndexPath);
  });
}

if (mountPath) {
  app.use(mountPath, router);
} else {
  app.use(router);
}

app.use((error: unknown, request: Request, response: Response, _next: express.NextFunction) => {
  if (response.headersSent) {
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event: 'invalid_json_body',
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
      }),
    );
    response.status(400).json({ error: 'Request body must be valid JSON' });
    return;
  }

  if (error instanceof ValidationError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'unhandled_error',
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );

  response.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'server_started',
      authMode: authConfig.mode,
      mountedAt: appBasePath || '/',
      port,
      staticRootConfigured: Boolean(staticRoot),
    }),
  );
});

server.requestTimeout = 15_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 5_000;

function shutdown(signal: NodeJS.Signals): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'server_shutdown_requested',
      signal,
    }),
  );

  server.close(() => {
    closeDatabase();
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        event: 'server_stopped',
      }),
    );
    process.exit(0);
  });

  setTimeout(() => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'server_shutdown_forced',
      }),
    );
    process.exit(1);
  }, 20_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
