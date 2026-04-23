import express from 'express';
import type { Request, Response } from 'express';
import { closeDatabase, createBackupSnapshot, getTasksState, isDatabaseReady, setTasksState } from './db.js';
import { attachRequestContext, createRateLimiter, requestLogger, requireAuth } from './http.js';
import { ValidationError, parseTasksPayload } from './schema.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const debugMode = (process.env.DEBUG ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';
const authRequired = (process.env.AUTH_REQUIRED ?? (debugMode ? 'false' : 'true')) === 'true';

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(attachRequestContext());
app.use(requestLogger());

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

function getUserPayload(request: Request) {
  return {
    email: request.authContext.email ?? '',
    name: request.authContext.name,
    groups: request.authContext.groups,
  };
}

function getBackupOwner(request: Request) {
  return {
    key: request.authContext.email ?? request.authContext.username ?? 'anonymous',
    email: request.authContext.email,
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

app.get('/api/health/live', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/health/ready', (_request, response) => {
  if (!isDatabaseReady()) {
    response.status(503).json({ ok: false });
    return;
  }

  response.json({ ok: true });
});

app.get('/api/health', (_request, response) => {
  if (!isDatabaseReady()) {
    response.status(503).json({ ok: false });
    return;
  }

  response.json({ ok: true });
});

if (authRequired) {
  app.use('/api/me', requireAuth());
  app.use('/api/tasks', requireAuth());
  app.use('/api/backups', requireAuth());
}

app.get('/api/me', readLimiter, (request, response) => {
  response.json(getUserPayload(request));
});

app.get('/api/tasks', readLimiter, (_request, response) => {
  response.json(getTasksState());
});

app.put('/api/tasks', writeLimiter, (request, response) => {
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

app.post('/api/backups', backupLimiter, (request, response) => {
  const source = parseBackupSource(request.body);
  response.json(createBackupSnapshot(getBackupOwner(request), source));
});

app.use((error: unknown, request: Request, response: Response, _next: express.NextFunction) => {
  if (response.headersSent) {
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
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
      port,
      authRequired,
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
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
