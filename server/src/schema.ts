const CATEGORIES = new Set(['passion', 'routine', 'body', 'projects']);
const STATUSES = new Set(['open', 'closed']);
const DEADLINE_KINDS = new Set(['none', 'date', 'range', 'recurring']);
const RECURRING_MODES = new Set(['day', 'week', 'month']);

const MAX_TASKS = 2000;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

export interface ApiDeadlineNone {
  kind: 'none';
}

export interface ApiDeadlineDate {
  kind: 'date';
  date: string;
}

export interface ApiDeadlineRange {
  kind: 'range';
  from: string;
  to: string;
}

export interface ApiDeadlineRecurring {
  kind: 'recurring';
  mode: 'day' | 'week' | 'month';
  weekday?: number;
}

export type ApiDeadline = ApiDeadlineNone | ApiDeadlineDate | ApiDeadlineRange | ApiDeadlineRecurring;

export interface ApiTask {
  id: string;
  title: string;
  description: string;
  category: 'passion' | 'routine' | 'body' | 'projects';
  deadline: ApiDeadline;
  urgent: boolean;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
}

export interface PutTasksPayload {
  tasks: ApiTask[];
  expectedVersion: number;
}

export interface LoginPayload {
  password: string;
  username: string;
}

export class ValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(message);
  }

  return value;
}

function expectString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  }

  return value;
}

function expectTrimmedString(value: unknown, field: string, maxLength: number): string {
  const parsed = expectString(value, field, maxLength);

  if (!parsed.trim()) {
    throw new ValidationError(`${field} must not be empty`);
  }

  return parsed;
}

function expectIsoDateString(value: unknown, field: string): string {
  const parsed = expectString(value, field, 64);

  if (Number.isNaN(Date.parse(parsed))) {
    throw new ValidationError(`${field} must be a valid ISO date string`);
  }

  return parsed;
}

function expectBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} must be a boolean`);
  }

  return value;
}

function expectInteger(value: unknown, field: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new ValidationError(`${field} must be an integer >= ${minimum}`);
  }

  return value as number;
}

function parseDeadline(value: unknown, field: string): ApiDeadline {
  const record = expectRecord(value, `${field} must be an object`);
  const kind = expectString(record.kind, `${field}.kind`, 32);

  if (!DEADLINE_KINDS.has(kind)) {
    throw new ValidationError(`${field}.kind is invalid`);
  }

  switch (kind) {
    case 'none':
      return { kind: 'none' };
    case 'date':
      return {
        kind: 'date',
        date: expectIsoDateString(record.date, `${field}.date`),
      };
    case 'range': {
      const from = expectIsoDateString(record.from, `${field}.from`);
      const to = expectIsoDateString(record.to, `${field}.to`);
      return { kind: 'range', from, to };
    }
    case 'recurring': {
      const mode = expectString(record.mode, `${field}.mode`, 32);

      if (!RECURRING_MODES.has(mode)) {
        throw new ValidationError(`${field}.mode is invalid`);
      }

      if (mode === 'week') {
        const weekday = expectInteger(record.weekday, `${field}.weekday`, 0);

        if (weekday > 6) {
          throw new ValidationError(`${field}.weekday must be between 0 and 6`);
        }

        return { kind: 'recurring', mode: 'week', weekday };
      }

      return { kind: 'recurring', mode: mode as 'day' | 'month' };
    }
    default:
      throw new ValidationError(`${field}.kind is invalid`);
  }
}

function parseTask(value: unknown, index: number): ApiTask {
  const record = expectRecord(value, `tasks[${index}] must be an object`);
  const category = expectString(record.category, `tasks[${index}].category`, 32);
  const status = expectString(record.status, `tasks[${index}].status`, 32);

  if (!CATEGORIES.has(category)) {
    throw new ValidationError(`tasks[${index}].category is invalid`);
  }

  if (!STATUSES.has(status)) {
    throw new ValidationError(`tasks[${index}].status is invalid`);
  }

  const closedAt = record.closedAt;
  const parsedTask: ApiTask = {
    id: expectTrimmedString(record.id, `tasks[${index}].id`, MAX_ID_LENGTH),
    title: expectTrimmedString(record.title, `tasks[${index}].title`, MAX_TITLE_LENGTH),
    description: expectString(record.description ?? '', `tasks[${index}].description`, MAX_DESCRIPTION_LENGTH),
    category: category as ApiTask['category'],
    deadline: parseDeadline(record.deadline, `tasks[${index}].deadline`),
    urgent: expectBoolean(record.urgent, `tasks[${index}].urgent`),
    status: status as ApiTask['status'],
    createdAt: expectIsoDateString(record.createdAt, `tasks[${index}].createdAt`),
  };

  if (closedAt !== undefined) {
    parsedTask.closedAt = expectIsoDateString(closedAt, `tasks[${index}].closedAt`);
  }

  if (parsedTask.status === 'closed' && !parsedTask.closedAt) {
    throw new ValidationError(`tasks[${index}].closedAt is required when status is closed`);
  }

  if (parsedTask.status === 'open' && parsedTask.closedAt) {
    throw new ValidationError(`tasks[${index}].closedAt must be omitted when status is open`);
  }

  return parsedTask;
}

export function parseTasksPayload(value: unknown): PutTasksPayload {
  const record = expectRecord(value, 'Body must be a JSON object');
  const tasks = record.tasks;

  if (!Array.isArray(tasks)) {
    throw new ValidationError('Body must include tasks: Task[]');
  }

  if (tasks.length > MAX_TASKS) {
    throw new ValidationError(`tasks must contain at most ${MAX_TASKS} items`);
  }

  return {
    tasks: tasks.map((task, index) => parseTask(task, index)),
    expectedVersion: expectInteger(record.expectedVersion, 'expectedVersion', 0),
  };
}

export function parseLoginPayload(value: unknown): LoginPayload {
  const record = expectRecord(value, 'Body must be a JSON object');

  return {
    password: expectTrimmedString(record.password, 'password', 200),
    username: expectTrimmedString(record.username, 'username', MAX_ID_LENGTH),
  };
}
