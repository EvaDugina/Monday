import type {
  BackupSnapshotResponse,
  BackupSource,
  CurrentUser,
  SaveTasksResponse,
  ServerTasksState,
  Task,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServerTasksState(value: unknown): value is ServerTasksState {
  return (
    isRecord(value) &&
    Array.isArray(value.tasks) &&
    typeof value.updatedAt === 'string' &&
    typeof value.version === 'number'
  );
}

function isSaveTasksResponse(value: unknown): value is SaveTasksResponse {
  return isRecord(value) && typeof value.updatedAt === 'string' && typeof value.version === 'number';
}

function isCurrentUser(value: unknown): value is CurrentUser {
  return (
    isRecord(value) &&
    typeof value.email === 'string' &&
    (typeof value.name === 'string' || value.name === null) &&
    Array.isArray(value.groups)
  );
}

function isBackupSnapshotResponse(value: unknown): value is BackupSnapshotResponse {
  return (
    isRecord(value) &&
    typeof value.created === 'boolean' &&
    typeof value.createdAt === 'string' &&
    typeof value.retainedBackups === 'number' &&
    (value.source === 'auto' || value.source === 'manual') &&
    typeof value.stateUpdatedAt === 'string' &&
    typeof value.stateVersion === 'number' &&
    (value.reason === undefined || value.reason === 'unchanged')
  );
}

async function readJsonResponse<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, payload);
  }

  return payload as T;
}

export function isConflictStatePayload(value: unknown): value is ServerTasksState {
  return isServerTasksState(value);
}

export async function pullTasksFromServer(): Promise<ServerTasksState> {
  const payload = await readJsonResponse<ServerTasksState>('/api/tasks', {
    cache: 'no-store',
  });

  if (!isServerTasksState(payload)) {
    throw new Error('Invalid /api/tasks response payload');
  }

  return payload;
}

export async function pushTasksToServer(tasks: Task[], expectedVersion: number): Promise<SaveTasksResponse> {
  const payload = await readJsonResponse<SaveTasksResponse>('/api/tasks', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tasks, expectedVersion }),
  });

  if (!isSaveTasksResponse(payload)) {
    throw new Error('Invalid PUT /api/tasks response payload');
  }

  return payload;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const payload = await readJsonResponse<CurrentUser>('/api/me', {
    cache: 'no-store',
  });

  if (!isCurrentUser(payload)) {
    throw new Error('Invalid /api/me response payload');
  }

  return payload;
}

export async function createBackupSnapshot(source: BackupSource): Promise<BackupSnapshotResponse> {
  const payload = await readJsonResponse<BackupSnapshotResponse>('/api/backups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source }),
  });

  if (!isBackupSnapshotResponse(payload)) {
    throw new Error('Invalid POST /api/backups response payload');
  }

  return payload;
}
