const STATUSES = new Set(['open', 'closed']);
const DEADLINE_KINDS = new Set(['none', 'date', 'range', 'recurring']);
const RECURRING_MODES = new Set(['day', 'week', 'month']);

const DEFAULT_CATEGORIES = [
  { key: 'passion', label: 'Страсти', color: '#e03131' },
  { key: 'routine', label: 'Бытец', color: '#868e96' },
  { key: 'body', label: 'Тело', color: '#002fa7' },
  { key: 'projects', label: 'Projects', color: '#7048e8' },
];

const MAX_TASKS = 500;
const MAX_CATEGORIES = 16;
const MAX_ID_LENGTH = 128;
const MAX_CATEGORY_KEY_LENGTH = 64;
const MAX_CATEGORY_LABEL_LENGTH = 40;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const MAX_BACKGROUND_DECORATIONS = 6;
const MAX_DECORATION_NAME_LENGTH = 200;
const MAX_IMAGE_ID_LENGTH = 128;
const MAX_WEATHER_CITY_ID_LENGTH = 64;
const WEATHER_CITY_ID_PATTERN = /^[a-z0-9-]+$/;

export const ACCEPTED_IMAGE_MIME = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
export const MAX_BACKGROUND_IMAGE_BYTES = 5 * 1024 * 1024;

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
  category: string;
  deadline: ApiDeadline;
  urgent: boolean;
  pinned?: boolean;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt?: string;
}

export interface ApiCategoryOption {
  key: string;
  label: string;
  color: string;
  status?: 'active' | 'archived';
  archivedAt?: string;
}

export interface ApiBackgroundDecorationRef {
  id: string;
  imageId: string;
  name: string;
  left: number;
  top: number;
  width: number;
  height?: number;
  opacity: number;
  rotation: number;
  depth: number;
}

export interface ApiAccountSettings {
  backgroundDecorations: ApiBackgroundDecorationRef[];
  weatherCityId?: string;
}

export interface PutTasksPayload {
  categories: ApiCategoryOption[];
  tasks: ApiTask[];
  settings: ApiAccountSettings;
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

function expectFiniteNumber(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${field} must be a number between ${minimum} and ${maximum}`);
  }

  return value;
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
  const category = expectTrimmedString(record.category, `tasks[${index}].category`, MAX_CATEGORY_KEY_LENGTH);
  const status = expectString(record.status, `tasks[${index}].status`, 32);

  if (!STATUSES.has(status)) {
    throw new ValidationError(`tasks[${index}].status is invalid`);
  }

  const closedAt = record.closedAt;
  const parsedTask: ApiTask = {
    id: expectTrimmedString(record.id, `tasks[${index}].id`, MAX_ID_LENGTH),
    title: expectTrimmedString(record.title, `tasks[${index}].title`, MAX_TITLE_LENGTH),
    description: expectString(record.description ?? '', `tasks[${index}].description`, MAX_DESCRIPTION_LENGTH),
    category,
    deadline: parseDeadline(record.deadline, `tasks[${index}].deadline`),
    urgent: expectBoolean(record.urgent, `tasks[${index}].urgent`),
    status: status as ApiTask['status'],
    createdAt: expectIsoDateString(record.createdAt, `tasks[${index}].createdAt`),
  };

  if (record.pinned !== undefined && record.pinned !== false) {
    parsedTask.pinned = expectBoolean(record.pinned, `tasks[${index}].pinned`);
  }

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

function parseCategories(value: unknown): ApiCategoryOption[] {
  if (value === undefined) {
    return DEFAULT_CATEGORIES;
  }

  if (!Array.isArray(value)) {
    throw new ValidationError('Body must include categories: CategoryOption[]');
  }

  if (value.length === 0) {
    throw new ValidationError('categories must not be empty');
  }

  if (value.length > MAX_CATEGORIES) {
    throw new ValidationError(`categories must contain at most ${MAX_CATEGORIES} items`);
  }

  const seenKeys = new Set<string>();

  return value.map((candidate, index) => {
    const record = expectRecord(candidate, `categories[${index}] must be an object`);
    const key = expectTrimmedString(record.key, `categories[${index}].key`, MAX_CATEGORY_KEY_LENGTH);
    const label = expectTrimmedString(record.label, `categories[${index}].label`, MAX_CATEGORY_LABEL_LENGTH);
    const color = expectTrimmedString(record.color, `categories[${index}].color`, 7);
    const status = record.status === 'archived' ? 'archived' : undefined;

    if (seenKeys.has(key)) {
      throw new ValidationError(`categories[${index}].key is duplicated`);
    }

    if (!HEX_COLOR_PATTERN.test(color)) {
      throw new ValidationError(`categories[${index}].color must be a #RRGGBB color`);
    }

    seenKeys.add(key);
    const category: ApiCategoryOption = { key, label, color };

    if (status) {
      category.status = status;
      category.archivedAt =
        record.archivedAt === undefined
          ? new Date().toISOString()
          : expectIsoDateString(record.archivedAt, `categories[${index}].archivedAt`);
    }

    return category;
  });
}

function parseBackgroundRef(value: unknown, index: number): ApiBackgroundDecorationRef {
  const field = `settings.backgroundDecorations[${index}]`;
  const record = expectRecord(value, `${field} must be an object`);
  const imageId = expectTrimmedString(record.imageId, `${field}.imageId`, MAX_IMAGE_ID_LENGTH);

  if (imageId.startsWith('data:')) {
    throw new ValidationError(`${field}.imageId must be an image id, not a data URL`);
  }

  const ref: ApiBackgroundDecorationRef = {
    id: expectTrimmedString(record.id, `${field}.id`, MAX_ID_LENGTH),
    imageId,
    name: expectString(record.name ?? '', `${field}.name`, MAX_DECORATION_NAME_LENGTH),
    left: expectFiniteNumber(record.left, `${field}.left`, -20000, 20000),
    top: expectFiniteNumber(record.top, `${field}.top`, -200, 200),
    width: expectFiniteNumber(record.width, `${field}.width`, 1, 20000),
    opacity: expectFiniteNumber(record.opacity, `${field}.opacity`, 0, 1),
    rotation: expectFiniteNumber(record.rotation, `${field}.rotation`, -360, 360),
    depth: expectFiniteNumber(record.depth, `${field}.depth`, 0, 1000),
  };

  if (record.height !== undefined) {
    ref.height = expectFiniteNumber(record.height, `${field}.height`, 1, 20000);
  }

  return ref;
}

function parseSettings(value: unknown): ApiAccountSettings {
  if (value === undefined) {
    return { backgroundDecorations: [] };
  }

  const record = expectRecord(value, 'settings must be an object');
  const rawDecorations = record.backgroundDecorations;

  if (rawDecorations !== undefined && !Array.isArray(rawDecorations)) {
    throw new ValidationError('settings.backgroundDecorations must be an array');
  }

  const decorationsArray = Array.isArray(rawDecorations) ? rawDecorations : [];

  if (decorationsArray.length > MAX_BACKGROUND_DECORATIONS) {
    throw new ValidationError(`settings.backgroundDecorations must contain at most ${MAX_BACKGROUND_DECORATIONS} items`);
  }

  const settings: ApiAccountSettings = {
    backgroundDecorations: decorationsArray.map((candidate, index) => parseBackgroundRef(candidate, index)),
  };

  if (record.weatherCityId !== undefined) {
    const weatherCityId = expectTrimmedString(record.weatherCityId, 'settings.weatherCityId', MAX_WEATHER_CITY_ID_LENGTH);

    if (!WEATHER_CITY_ID_PATTERN.test(weatherCityId)) {
      throw new ValidationError('settings.weatherCityId must match [a-z0-9-]');
    }

    settings.weatherCityId = weatherCityId;
  }

  return settings;
}

export function parseTasksPayload(value: unknown): PutTasksPayload {
  const record = expectRecord(value, 'Body must be a JSON object');
  const categories = parseCategories(record.categories);
  const tasks = record.tasks;

  if (!Array.isArray(tasks)) {
    throw new ValidationError('Body must include tasks: Task[]');
  }

  if (tasks.length > MAX_TASKS) {
    throw new ValidationError(`tasks must contain at most ${MAX_TASKS} items`);
  }

  return {
    categories,
    tasks: tasks.map((task, index) => parseTask(task, index)),
    settings: parseSettings(record.settings),
    expectedVersion: expectInteger(record.expectedVersion, 'expectedVersion', 0),
  };
}

export function parseUploadContentType(header: unknown): string {
  if (typeof header !== 'string') {
    throw new ValidationError('Content-Type header is required');
  }

  const mime = header.split(';')[0].trim().toLowerCase();

  if (!ACCEPTED_IMAGE_MIME.has(mime)) {
    throw new ValidationError('Unsupported image type');
  }

  return mime;
}

export function parseLoginPayload(value: unknown): LoginPayload {
  const record = expectRecord(value, 'Body must be a JSON object');

  return {
    password: expectTrimmedString(record.password, 'password', 200),
    username: expectTrimmedString(record.username, 'username', MAX_ID_LENGTH),
  };
}
