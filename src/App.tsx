import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImageOff, Palette, Save } from 'lucide-react';
import {
  ApiError,
  createBackupSnapshot,
  fetchCurrentUser,
  isConflictStatePayload,
  loginToServer,
  logoutFromServer,
  pullTasksFromServer,
  pushTasksToServer,
} from './api';
import { stripAppBasePath, withAppBasePath } from './basePath';
import ArchiveList from './components/ArchiveList';
import BackgroundDecorations, { type BackgroundDecoration } from './components/BackgroundDecorations';
import CategorySection from './components/CategorySection';
import Header from './components/Header';
import InlineCreator from './components/InlineCreator';
import LoginScreen from './components/LoginScreen';
import SearchBar from './components/SearchBar';
import Toast, { ToastState } from './components/Toast';
import WeatherBadge from './components/WeatherBadge';

const CreateTaskModal = lazy(() => import('./components/CreateTaskModal'));
const TaskDetailsModal = lazy(() => import('./components/TaskDetailsModal'));
import { loadLocalState, sanitizeCategories, sanitizeTasks, saveLocalState, serializeBoardState } from './storage';
import { triggerHaptic } from './utils/haptic';
import type {
  BackupSnapshotResponse,
  BackupSource,
  Category,
  CategoryOption,
  CurrentUser,
  Deadline,
  Screen,
  ServerTasksState,
  SyncStatus,
  Task,
} from './types';
import {
  CATEGORIES,
  CATEGORY_COLOR_PALETTE,
  MAX_CATEGORIES,
  MAX_CATEGORY_KEY_LENGTH,
  MAX_CATEGORY_LABEL_LENGTH,
} from './types';
import { compareIsoDates } from './utils/dates';

const AUTO_BACKUP_INTERVAL_MS = 5 * 60_000;
const BACKGROUND_SAVE_CONFIRM_MS = 400;
const BACKGROUND_SAVE_TOAST_DISMISS_MS = 5_000;
const TASK_CLOSE_DELAY_MS = 10_000;
const DRAG_SCROLL_EDGE_THRESHOLD_PX = 140;
const DRAG_SCROLL_MAX_STEP_PX = 22;
const DEFAULT_BACKUP_TOOLTIP =
  'Резервные копии создаются автоматически раз в 5 минут. Нажмите на точку, чтобы создать снимок сейчас.';
const LOGIN_REQUIRED_TOOLTIP = 'Войдите, чтобы открыть MONDAY и синхронизировать задачи.';
const SESSION_EXPIRED_MESSAGE = 'Сессия завершилась. Войдите снова.';
const BACKGROUND_DECORATIONS_STORAGE_KEY = 'monday:background-decorations';
const MAX_BACKGROUND_DECORATIONS = 6;
const MAX_BACKGROUND_FILE_BYTES = 5 * 1024 * 1024;
const MAX_BACKGROUND_DATA_URL_LENGTH = 1_600_000;
const ACCEPTED_BACKGROUND_IMAGE_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);

interface PreparedBackgroundImage {
  height: number;
  src: string;
  width: number;
}

function isBackgroundDecoration(value: unknown): value is BackgroundDecoration {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const decoration = value as Partial<BackgroundDecoration>;

  return (
    (decoration.anchor === undefined || decoration.anchor === 'center') &&
    typeof decoration.id === 'string' &&
    typeof decoration.name === 'string' &&
    typeof decoration.src === 'string' &&
    typeof decoration.left === 'number' &&
    typeof decoration.top === 'number' &&
    typeof decoration.width === 'number' &&
    (decoration.height === undefined || typeof decoration.height === 'number') &&
    typeof decoration.opacity === 'number' &&
    typeof decoration.rotation === 'number' &&
    typeof decoration.depth === 'number'
  );
}

function normalizeBackgroundDecoration(decoration: BackgroundDecoration): BackgroundDecoration {
  if (decoration.anchor === 'center') {
    return decoration;
  }

  const referenceWidth = Math.max(window.innerWidth, 1);
  const legacyLeftPx = (decoration.left / 100) * referenceWidth;

  return {
    ...decoration,
    anchor: 'center',
    left: Math.round(legacyLeftPx + decoration.width / 2 - referenceWidth / 2),
  };
}

function loadBackgroundDecorations(): BackgroundDecoration[] {
  const raw = window.localStorage.getItem(BACKGROUND_DECORATIONS_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const validDecorations = Array.isArray(parsed)
      ? parsed.filter(isBackgroundDecoration).slice(0, MAX_BACKGROUND_DECORATIONS)
      : [];
    const normalizedDecorations = validDecorations.map(normalizeBackgroundDecoration);

    if (validDecorations.some((decoration) => decoration.anchor !== 'center')) {
      saveBackgroundDecorations(normalizedDecorations);
    }

    return normalizedDecorations;
  } catch {
    return [];
  }
}

function saveBackgroundDecorations(decorations: BackgroundDecoration[]): boolean {
  try {
    if (decorations.length === 0) {
      window.localStorage.removeItem(BACKGROUND_DECORATIONS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(BACKGROUND_DECORATIONS_STORAGE_KEY, JSON.stringify(decorations));
    }

    return true;
  } catch (error) {
    console.error('[MONDAY] Failed to persist background decorations:', error);
    return false;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader result is not a data URL'));
      }
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read file')));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    image.src = dataUrl;
  });
}

async function prepareBackgroundImage(file: File): Promise<PreparedBackgroundImage> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);

  if (file.type === 'image/gif') {
    return {
      height: Math.max(1, image.naturalHeight),
      src: dataUrl,
      width: Math.max(1, image.naturalWidth),
    };
  }

  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext('2d');

  if (!context) {
    return {
      height: Math.max(1, image.naturalHeight),
      src: dataUrl,
      width: Math.max(1, image.naturalWidth),
    };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    height: canvas.height,
    src: canvas.toDataURL('image/webp', 0.82),
    width: canvas.width,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createBackgroundDecoration(file: File, image: PreparedBackgroundImage, index: number): BackgroundDecoration {
  const column = index % 3;
  const row = Math.floor(index / 3) % 2;
  const width = 180 + (index % 3) * 46;
  const height = Math.round(width * (image.height / Math.max(image.width, 1)));
  const maxCenterOffset = Math.max(0, Math.min(360, (window.innerWidth - width) / 2 - 16));
  const preferredCenterOffset = [-360, 280, -120][column] ?? 0;

  return {
    anchor: 'center',
    id: crypto.randomUUID(),
    name: file.name,
    src: image.src,
    left: Math.round(clampNumber(preferredCenterOffset, -maxCenterOffset, maxCenterOffset)),
    top: [10, 54][row] ?? 18,
    width,
    height,
    opacity: 0.82,
    rotation: [-5, 4, -2, 6, -4, 3][index % 6] ?? 0,
    depth: 0.45 + (index % 4) * 0.18,
  };
}

function isFileDrag(event: React.DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

function getScreenFromPath(pathname: string): Screen {
  const relativePath = stripAppBasePath(pathname);
  return relativePath === '/archive' || relativePath.startsWith('/archive/') ? 'archive' : 'active';
}

function getPathForScreen(screen: Screen): string {
  return screen === 'archive' ? withAppBasePath('/archive') : withAppBasePath('/');
}

function normalizeDeadline(deadline: Deadline): Deadline {
  switch (deadline.kind) {
    case 'date':
      return deadline.date ? deadline : { kind: 'none' };
    case 'range': {
      const from = deadline.from.trim();
      const to = deadline.to.trim();

      if (!from && !to) {
        return { kind: 'none' };
      }

      if (from && !to) {
        return { kind: 'date', date: from };
      }

      if (!from && to) {
        return { kind: 'date', date: to };
      }

      return compareIsoDates(from, to) <= 0 ? { kind: 'range', from, to } : { kind: 'range', from: to, to: from };
    }
    case 'recurring':
      return deadline.mode === 'week'
        ? { kind: 'recurring', mode: 'week', weekday: deadline.weekday ?? 1 }
        : { kind: 'recurring', mode: deadline.mode };
    default:
      return deadline;
  }
}

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

function formatDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(timestamp));
}

function formatSyncedTooltip(updatedAt: string): string {
  return `Синхронизировано с сервером: ${formatDateTime(updatedAt)}`;
}

function formatBackupTooltip(result: BackupSnapshotResponse): string {
  const backupTime = formatDateTime(result.createdAt);
  const snapshotTime = formatDateTime(result.stateUpdatedAt);
  const actionLabel = result.created ? 'Резервная копия создана' : 'Последняя резервная копия уже актуальна';

  return `${actionLabel}: ${backupTime}. Снимок состояния: ${snapshotTime}. Храним последние ${result.retainedBackups} бэкапа на пользователя.`;
}

function shouldPreserveLocalSnapshot(params: {
  lastSyncedJson: string | null;
  localHasChanges: boolean;
  localJson: string;
  serverJson: string;
}): boolean {
  const { lastSyncedJson, localHasChanges, localJson, serverJson } = params;

  if (!localHasChanges || localJson === serverJson) {
    return false;
  }

  if (lastSyncedJson === null) {
    return true;
  }

  return localJson !== lastSyncedJson;
}

function getDefaultBoardJson(): string {
  return serializeBoardState([], CATEGORIES);
}

function createCategoryKey(label: string, categories: CategoryOption[]): Category {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'category';
  const existingKeys = new Set(categories.map((category) => category.key));

  if (!existingKeys.has(base)) {
    return base;
  }

  let suffix = 2;
  while (existingKeys.has(`${base}-${suffix}`) && `${base}-${suffix}`.length <= MAX_CATEGORY_KEY_LENGTH) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function getNextCategoryColor(index: number): string {
  return CATEGORY_COLOR_PALETTE[index % CATEGORY_COLOR_PALETTE.length];
}

function isArchivedCategory(category: CategoryOption): boolean {
  return category.status === 'archived';
}

function App() {
  const initialStateRef = useRef<ReturnType<typeof loadLocalState> | null>(null);

  if (!initialStateRef.current) {
    initialStateRef.current = loadLocalState();
  }

  const initialState = initialStateRef.current;

  const [authError, setAuthError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [tasks, setTasks] = useState<Task[]>(() => initialState.tasks);
  const [categories, setCategories] = useState<CategoryOption[]>(() => initialState.categories);
  const [serverVersion, setServerVersion] = useState<number | null>(() => initialState.version);
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(() => initialState.updatedAt);
  const [screen, setScreen] = useState<Screen>(() => getScreenFromPath(window.location.pathname));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetCategory, setDropTargetCategory] = useState<Category | null>(null);
  const [closingTaskIds, setClosingTaskIds] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [conflictState, setConflictState] = useState<ServerTasksState | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [syncTooltip, setSyncTooltip] = useState(LOGIN_REQUIRED_TOOLTIP);
  const [backupTooltip, setBackupTooltip] = useState(DEFAULT_BACKUP_TOOLTIP);
  const [isBackuping, setIsBackuping] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [backgroundDecorations, setBackgroundDecorations] = useState<BackgroundDecoration[]>(() =>
    loadBackgroundDecorations(),
  );
  const [isBackgroundEditMode, setIsBackgroundEditMode] = useState(false);
  const [isBackgroundSaveConfirmed, setIsBackgroundSaveConfirmed] = useState(false);
  const [isBackgroundDragActive, setIsBackgroundDragActive] = useState(false);
  const [isRainyWeather, setIsRainyWeather] = useState(false);
  const latestTasksRef = useRef(tasks);
  const latestCategoriesRef = useRef(categories);
  const backgroundDecorationsRef = useRef(backgroundDecorations);
  const serverVersionRef = useRef(serverVersion);
  const syncStatusRef = useRef<SyncStatus>(syncStatus);
  const conflictStateRef = useRef<ServerTasksState | null>(conflictState);
  const lastSyncedJsonRef = useRef<string | null>(initialState.lastSyncedJson);
  const lastBackedUpVersionRef = useRef<number | null>(null);
  const hasInitializedSyncRef = useRef(false);
  const backupInFlightRef = useRef(false);
  const closingTimeoutsRef = useRef<Record<string, number>>({});
  const backgroundSaveConfirmTimeoutRef = useRef<number | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const backupRunnerRef = useRef<(source: BackupSource) => void>(() => undefined);

  async function addBackgroundFiles(files: FileList): Promise<void> {
    const currentDecorations = backgroundDecorationsRef.current;
    const availableSlots = MAX_BACKGROUND_DECORATIONS - currentDecorations.length;

    if (availableSlots <= 0) {
      setToast({
        id: Date.now(),
        message: `Фон уже содержит максимум ${MAX_BACKGROUND_DECORATIONS} изображений`,
      });
      return;
    }

    const candidates = Array.from(files).filter(
      (file) => ACCEPTED_BACKGROUND_IMAGE_TYPES.has(file.type) && file.size <= MAX_BACKGROUND_FILE_BYTES,
    );
    const selectedFiles = candidates.slice(0, availableSlots);

    if (selectedFiles.length === 0) {
      setToast({
        id: Date.now(),
        message: 'Добавьте изображение до 5 МБ в PNG, JPG, WebP или GIF',
      });
      return;
    }

    const prepared = await Promise.allSettled(
      selectedFiles.map(async (file, index) => {
        const image = await prepareBackgroundImage(file);

        if (image.src.length > MAX_BACKGROUND_DATA_URL_LENGTH) {
          throw new Error('Prepared image is too large for localStorage');
        }

        return createBackgroundDecoration(file, image, currentDecorations.length + index);
      }),
    );
    const nextDecorations = prepared
      .filter((result): result is PromiseFulfilledResult<BackgroundDecoration> => result.status === 'fulfilled')
      .map((result) => result.value);

    if (nextDecorations.length === 0) {
      setToast({
        id: Date.now(),
        message: 'Не удалось подготовить изображение для фона',
      });
      return;
    }

    const nextState = [...currentDecorations, ...nextDecorations].slice(0, MAX_BACKGROUND_DECORATIONS);

    if (!saveBackgroundDecorations(nextState)) {
      setToast({
        id: Date.now(),
        message: 'Не удалось сохранить фон: хранилище браузера заполнено',
      });
      return;
    }

    backgroundDecorationsRef.current = nextState;
    setBackgroundDecorations(nextState);
    setToast({
      id: Date.now(),
      message: nextDecorations.length === 1 ? 'Изображение добавлено на фон' : 'Изображения добавлены на фон',
    });
  }

  function clearBackgroundDecorations(): void {
    saveBackgroundDecorations([]);
    backgroundDecorationsRef.current = [];
    setBackgroundDecorations([]);
    setIsBackgroundEditMode(false);
    setToast({
      id: Date.now(),
      message: 'Фон очищен',
    });
  }

  function startBackgroundEditMode(): void {
    if (backgroundDecorationsRef.current.length === 0) {
      setToast({
        id: Date.now(),
        message: 'Сначала добавьте изображение на фон',
      });
      return;
    }

    setIsBackgroundSaveConfirmed(false);
    setIsBackgroundEditMode(true);
  }

  function saveBackgroundDecorationState(errorMessage = 'Не удалось сохранить изменения фона'): boolean {
    if (!saveBackgroundDecorations(backgroundDecorationsRef.current)) {
      setToast({
        id: Date.now(),
        message: errorMessage,
      });
      return false;
    }

    return true;
  }

  function saveAndExitBackgroundEditMode(): void {
    if (!saveBackgroundDecorationState()) {
      return;
    }

    if (backgroundSaveConfirmTimeoutRef.current !== null) {
      window.clearTimeout(backgroundSaveConfirmTimeoutRef.current);
    }

    setIsBackgroundSaveConfirmed(true);
    setToast({
      duration: BACKGROUND_SAVE_TOAST_DISMISS_MS,
      id: Date.now(),
      message: 'Изменения фона сохранены',
      slowDismiss: true,
      tone: 'success',
    });

    backgroundSaveConfirmTimeoutRef.current = window.setTimeout(() => {
      setIsBackgroundEditMode(false);
      setIsBackgroundSaveConfirmed(false);
      backgroundSaveConfirmTimeoutRef.current = null;
    }, BACKGROUND_SAVE_CONFIRM_MS);
  }

  function moveBackgroundDecoration(decorationId: string, left: number, top: number): void {
    const nextState = backgroundDecorationsRef.current.map((decoration) =>
      decoration.id === decorationId ? { ...decoration, left, top } : decoration,
    );

    backgroundDecorationsRef.current = nextState;
    setBackgroundDecorations(nextState);
  }

  function resizeBackgroundDecoration(decorationId: string, width: number, height: number): void {
    const nextState = backgroundDecorationsRef.current.map((decoration) =>
      decoration.id === decorationId ? { ...decoration, width, height } : decoration,
    );

    backgroundDecorationsRef.current = nextState;
    setBackgroundDecorations(nextState);
  }

  function commitBackgroundDecorationMove(): void {
    saveBackgroundDecorationState('Не удалось сохранить положение фона');
  }

  function deleteBackgroundDecoration(decorationId: string): void {
    const nextState = backgroundDecorationsRef.current.filter((decoration) => decoration.id !== decorationId);

    backgroundDecorationsRef.current = nextState;
    saveBackgroundDecorations(nextState);
    setBackgroundDecorations(nextState);

    if (nextState.length === 0) {
      setIsBackgroundEditMode(false);
    }

    setToast({
      id: Date.now(),
      message: 'Изображение удалено с фона',
    });
  }

  function handleBackgroundDragEnter(event: React.DragEvent<HTMLDivElement>): void {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    setIsBackgroundDragActive(true);
  }

  function handleBackgroundDragOver(event: React.DragEvent<HTMLDivElement>): void {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsBackgroundDragActive(true);
  }

  function handleBackgroundDragLeave(event: React.DragEvent<HTMLDivElement>): void {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setIsBackgroundDragActive(false);
  }

  function handleBackgroundDrop(event: React.DragEvent<HTMLDivElement>): void {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    setIsBackgroundDragActive(false);
    void addBackgroundFiles(event.dataTransfer.files);
  }

  function clearClosingAnimations(): void {
    Object.values(closingTimeoutsRef.current).forEach((timeoutId) => window.clearTimeout(timeoutId));
    closingTimeoutsRef.current = {};
    setClosingTaskIds([]);
  }

  function moveToUnauthenticatedState(message: string, errorMessage: string | null): void {
    clearClosingAnimations();
    backupInFlightRef.current = false;
    hasInitializedSyncRef.current = false;
    lastBackedUpVersionRef.current = null;
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
    setAuthError(errorMessage);
    setConflictState(null);
    setSelectedTaskId(null);
    setCreateModalOpen(false);
    setDraggedTaskId(null);
    setDropTargetCategory(null);
    setIsBackuping(false);
    setSyncStatus('offline');
    setSyncTooltip(message);
    setBackupTooltip(DEFAULT_BACKUP_TOOLTIP);
  }

  function handleUnauthorizedError(error: unknown, message = SESSION_EXPIRED_MESSAGE): boolean {
    if (error instanceof ApiError && error.status === 401) {
      moveToUnauthenticatedState(message, message);
      return true;
    }

    return false;
  }

  useEffect(() => {
    latestTasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    latestCategoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    serverVersionRef.current = serverVersion;
  }, [serverVersion]);

  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);

  useEffect(() => {
    conflictStateRef.current = conflictState;
  }, [conflictState]);

  useEffect(() => {
    saveLocalState({
      categories,
      lastSyncedJson: lastSyncedJsonRef.current,
      tasks,
      version: serverVersion,
      updatedAt: serverUpdatedAt,
    });
  }, [categories, serverUpdatedAt, serverVersion, tasks]);

  useEffect(() => {
    function handlePopState() {
      setScreen(getScreenFromPath(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId && task.status === 'open')) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, tasks]);

  useEffect(
    () => () => {
      clearClosingAnimations();

      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
      }

      if (backgroundSaveConfirmTimeoutRef.current !== null) {
        window.clearTimeout(backgroundSaveConfirmTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const user = await fetchCurrentUser();

        if (isCancelled) {
          return;
        }

        setCurrentUser(user);
        setAuthStatus('authenticated');
        setAuthError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          moveToUnauthenticatedState(LOGIN_REQUIRED_TOOLTIP, null);
          return;
        }

        moveToUnauthenticatedState(
          'Сервер недоступен. Проверьте сервис и попробуйте ещё раз.',
          'Сервер недоступен. Проверьте сервис и попробуйте ещё раз.',
        );
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return;
    }

    let didLoseAuth = false;
    let isCancelled = false;
    hasInitializedSyncRef.current = false;
    setSyncStatus('syncing');
    setSyncTooltip('Подключаемся к серверу…');

    async function bootstrapSync() {
      try {
        const serverState = await pullTasksFromServer();

        if (isCancelled) {
          return;
        }

        const serverTasks = sanitizeTasks(serverState.tasks);
        const serverCategories = sanitizeCategories(serverState.categories, serverTasks);
        const serverJson = serializeBoardState(serverTasks, serverCategories);
        const localTasks = latestTasksRef.current;
        const localCategories = latestCategoriesRef.current;
        const localJson = serializeBoardState(localTasks, localCategories);
        const localHasChanges = localJson !== getDefaultBoardJson();

        if (serverTasks.length === 0 && localHasChanges && serverJson === getDefaultBoardJson()) {
          const seededState = await pushTasksToServer(localTasks, localCategories, serverState.version);

          if (isCancelled) {
            return;
          }

          lastSyncedJsonRef.current = localJson;
          setServerVersion(seededState.version);
          setServerUpdatedAt(seededState.updatedAt);
          setConflictState(null);
          setSyncStatus('synced');
          setSyncTooltip(formatSyncedTooltip(seededState.updatedAt));
          return;
        }

        if (
          shouldPreserveLocalSnapshot({
            lastSyncedJson: initialState.lastSyncedJson,
            localHasChanges,
            localJson,
            serverJson,
          })
        ) {
          lastSyncedJsonRef.current = serverJson;
          setServerVersion(serverState.version);
          setServerUpdatedAt(serverState.updatedAt);
          setConflictState(serverState);
          setSyncStatus('conflict');
          setSyncTooltip('Локальная версия отличается от серверной. Разрешите конфликт перед следующей записью.');
          return;
        }

        setTasks(serverTasks);
        setCategories(serverCategories);
        lastSyncedJsonRef.current = serverJson;
        setServerVersion(serverState.version);
        setServerUpdatedAt(serverState.updatedAt);
        setConflictState(null);
        setSyncStatus('synced');
        setSyncTooltip(formatSyncedTooltip(serverState.updatedAt));
      } catch (error) {
        if (isCancelled) {
          return;
        }

        if (handleUnauthorizedError(error)) {
          didLoseAuth = true;
          return;
        }

        setSyncStatus('offline');
        setSyncTooltip('Сервер недоступен, работаем из localStorage.');
      } finally {
        if (!isCancelled && !didLoseAuth) {
          hasInitializedSyncRef.current = true;
          setIsInitialLoading(false);
        }
      }
    }

    void bootstrapSync();

    return () => {
      isCancelled = true;
    };
  }, [authStatus, initialState.lastSyncedJson]);

  async function waitForPendingSync(timeoutMs = 8_000): Promise<boolean> {
    const startedAt = Date.now();

    while (syncStatusRef.current === 'syncing') {
      if (Date.now() - startedAt >= timeoutMs) {
        return false;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }

    return true;
  }

  async function pushLatestTasksForBackup(): Promise<void> {
    const nextTasks = latestTasksRef.current;
    const nextCategories = latestCategoriesRef.current;
    const nextJson = serializeBoardState(nextTasks, nextCategories);

    if (lastSyncedJsonRef.current !== null && nextJson === lastSyncedJsonRef.current) {
      return;
    }

    setSyncStatus('syncing');
    setSyncTooltip('Сохраняем изменения перед созданием резервной копии…');

    try {
      const nextState = await pushTasksToServer(nextTasks, nextCategories, serverVersionRef.current ?? 0);

      lastSyncedJsonRef.current = nextJson;
      setServerVersion(nextState.version);
      setServerUpdatedAt(nextState.updatedAt);
      setConflictState(null);
      setSyncStatus('synced');
      setSyncTooltip(formatSyncedTooltip(nextState.updatedAt));
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }

      if (error instanceof ApiError && error.status === 409 && isConflictStatePayload(error.payload)) {
        setConflictState(error.payload);
        setSyncStatus('conflict');
        setSyncTooltip('На сервере есть более новая версия. Загрузите её перед следующей записью.');
        throw error;
      }

      if (error instanceof ApiError && error.status === 400) {
        setSyncStatus('invalid');
        setSyncTooltip('Сервер отклонил данные. Проверьте длину названия и описания задачи.');
        throw error;
      }

      setSyncStatus('offline');
      setSyncTooltip('Сервер недоступен, изменения сохранены только локально.');
      throw error;
    }
  }

  async function runBackup(source: BackupSource): Promise<void> {
    if (authStatus !== 'authenticated') {
      setBackupTooltip(LOGIN_REQUIRED_TOOLTIP);
      return;
    }

    if (backupInFlightRef.current) {
      if (source === 'manual') {
        setBackupTooltip('Резервное копирование уже выполняется. Подождите завершения текущего снимка.');
      }
      return;
    }

    if (source === 'auto') {
      if (
        document.visibilityState === 'hidden' ||
        !hasInitializedSyncRef.current ||
        syncStatusRef.current !== 'synced' ||
        conflictStateRef.current !== null ||
        lastBackedUpVersionRef.current === serverVersionRef.current ||
        serializeBoardState(latestTasksRef.current, latestCategoriesRef.current) !== lastSyncedJsonRef.current
      ) {
        return;
      }
    }

    backupInFlightRef.current = true;
    setIsBackuping(true);

    try {
      if (source === 'manual' && syncStatusRef.current === 'syncing') {
        setBackupTooltip('Дожидаемся завершения синхронизации перед созданием резервной копии…');

        const didSyncSettle = await waitForPendingSync();

        if (!didSyncSettle) {
          setBackupTooltip('Синхронизация не завершилась вовремя. Повторите создание резервной копии ещё раз.');
          return;
        }
      }

      if (conflictStateRef.current) {
        setBackupTooltip('Сначала разрешите конфликт синхронизации, затем создайте резервную копию ещё раз.');
        return;
      }

      if (
        source === 'manual' &&
        serializeBoardState(latestTasksRef.current, latestCategoriesRef.current) !== lastSyncedJsonRef.current
      ) {
        await pushLatestTasksForBackup();
      }

      const result = await createBackupSnapshot(source);
      lastBackedUpVersionRef.current = result.stateVersion;
      setBackupTooltip(formatBackupTooltip(result));
    } catch (error) {
      if (handleUnauthorizedError(error)) {
        return;
      }

      if (error instanceof ApiError && error.status === 409 && isConflictStatePayload(error.payload)) {
        setBackupTooltip('Резервная копия не создана: на сервере уже есть более новая версия. Сначала загрузите её.');
      } else if (source === 'manual') {
        setBackupTooltip('Не удалось создать резервную копию: сервер сейчас недоступен. Попробуйте ещё раз.');
      }
    } finally {
      backupInFlightRef.current = false;
      setIsBackuping(false);
    }
  }

  useEffect(() => {
    backupRunnerRef.current = (source: BackupSource) => {
      void runBackup(source);
    };
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      backupRunnerRef.current('auto');
    }, AUTO_BACKUP_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    let lastY = window.scrollY;

    function handleScroll() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastY;

        if (currentY > 80 && delta > 4) {
          setIsHeaderHidden(true);
        } else if (delta < -4 || currentY < 16) {
          setIsHeaderHidden(false);
        }

        lastY = currentY;
        frame = null;
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !hasInitializedSyncRef.current || conflictState) {
      return;
    }

    const nextJson = serializeBoardState(tasks, categories);

    if (lastSyncedJsonRef.current !== null && nextJson === lastSyncedJsonRef.current) {
      return;
    }

    let isCancelled = false;
    setSyncStatus('syncing');
    setSyncTooltip('Сохраняем изменения и отправляем их на сервер…');

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const nextState = await pushTasksToServer(tasks, categories, serverVersionRef.current ?? 0);

          if (isCancelled) {
            return;
          }

          lastSyncedJsonRef.current = nextJson;
          setServerVersion(nextState.version);
          setServerUpdatedAt(nextState.updatedAt);
          setConflictState(null);
          setSyncStatus('synced');
          setSyncTooltip(formatSyncedTooltip(nextState.updatedAt));
        } catch (error) {
          if (isCancelled) {
            return;
          }

          if (handleUnauthorizedError(error)) {
            return;
          }

          if (error instanceof ApiError && error.status === 409 && isConflictStatePayload(error.payload)) {
            setConflictState(error.payload);
            setSyncStatus('conflict');
            setSyncTooltip('На сервере есть более новая версия. Загрузите её перед следующей записью.');
            return;
          }

          if (error instanceof ApiError && error.status === 400) {
            setSyncStatus('invalid');
            setSyncTooltip('Сервер отклонил данные. Проверьте длину названия и описания задачи.');
            return;
          }

          setSyncStatus('offline');
          setSyncTooltip('Сервер недоступен, изменения сохранены только локально.');
        }
      })();
    }, 500);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authStatus, categories, conflictState, tasks]);

  useEffect(() => {
    if (!draggedTaskId) {
      dragPointerYRef.current = null;

      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }

      return;
    }

    function handleWindowDragOver(event: DragEvent) {
      dragPointerYRef.current = event.clientY;
    }

    function stepWindowScroll() {
      const pointerY = dragPointerYRef.current;

      if (pointerY !== null) {
        const viewportHeight = window.innerHeight;
        const distanceToTop = pointerY;
        const distanceToBottom = viewportHeight - pointerY;
        let nextDelta = 0;

        if (distanceToTop < DRAG_SCROLL_EDGE_THRESHOLD_PX) {
          const intensity = (DRAG_SCROLL_EDGE_THRESHOLD_PX - distanceToTop) / DRAG_SCROLL_EDGE_THRESHOLD_PX;
          nextDelta = -(DRAG_SCROLL_MAX_STEP_PX * intensity * intensity);
        } else if (distanceToBottom < DRAG_SCROLL_EDGE_THRESHOLD_PX) {
          const intensity = (DRAG_SCROLL_EDGE_THRESHOLD_PX - distanceToBottom) / DRAG_SCROLL_EDGE_THRESHOLD_PX;
          nextDelta = DRAG_SCROLL_MAX_STEP_PX * intensity * intensity;
        }

        if (nextDelta !== 0) {
          const maxScrollTop = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
          const nextScrollTop = Math.min(maxScrollTop, Math.max(0, window.scrollY + nextDelta));

          if (Math.abs(nextScrollTop - window.scrollY) > 0.1) {
            window.scrollTo({ top: nextScrollTop, behavior: 'auto' });
          }
        }
      }

      dragScrollFrameRef.current = window.requestAnimationFrame(stepWindowScroll);
    }

    window.addEventListener('dragover', handleWindowDragOver, true);
    dragScrollFrameRef.current = window.requestAnimationFrame(stepWindowScroll);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver, true);
      dragPointerYRef.current = null;

      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
    };
  }, [draggedTaskId]);

  async function handleLogin(username: string, password: string): Promise<void> {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      const user = await loginToServer(username, password);
      hasInitializedSyncRef.current = false;
      lastBackedUpVersionRef.current = null;
      setCurrentUser(user);
      setAuthStatus('authenticated');
      setAuthError(null);
      setSyncStatus('syncing');
      setSyncTooltip('Подключаемся к серверу…');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthError('Неверный логин или пароль.');
        return;
      }

      setAuthError('Не удалось подключиться к серверу. Попробуйте ещё раз.');
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);

    try {
      await logoutFromServer();
    } catch {
      // logout should still clear local auth state
    } finally {
      setIsLoggingOut(false);
      moveToUnauthenticatedState(LOGIN_REQUIRED_TOOLTIP, null);
    }
  }

  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query),
    );
  }, [tasks, searchQuery]);
  const activeCategories = useMemo(() => categories.filter((category) => !isArchivedCategory(category)), [categories]);
  const archivedCategories = useMemo(
    () =>
      categories
        .filter(isArchivedCategory)
        .sort((left, right) => (right.archivedAt ?? '').localeCompare(left.archivedAt ?? '')),
    [categories],
  );
  const activeCategoryKeys = useMemo(
    () => new Set(activeCategories.map((category) => category.key)),
    [activeCategories],
  );
  const openTasks = useMemo(
    () => visibleTasks.filter((task) => task.status === 'open' && activeCategoryKeys.has(task.category)),
    [activeCategoryKeys, visibleTasks],
  );
  const archiveTasks = useMemo(
    () =>
      visibleTasks
        .filter((task) => task.status === 'closed')
        .sort((left, right) => (right.closedAt ?? '').localeCompare(left.closedAt ?? '')),
    [visibleTasks],
  );
  const tasksByCategory = useMemo(() => {
    const grouped = Object.fromEntries(activeCategories.map((category) => [category.key, [] as Task[]])) as Record<
      Category,
      Task[]
    >;

    for (const task of openTasks) {
      if (!grouped[task.category]) {
        grouped[task.category] = [];
      }
      grouped[task.category].push(task);
    }

    for (const key of Object.keys(grouped) as Category[]) {
      grouped[key].sort((left, right) => {
        const leftPin = left.pinned ? 1 : 0;
        const rightPin = right.pinned ? 1 : 0;
        if (leftPin !== rightPin) return rightPin - leftPin;
        return left.createdAt.localeCompare(right.createdAt);
      });
    }
    return grouped;
  }, [activeCategories, openTasks]);
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId && task.status === 'open' && activeCategoryKeys.has(task.category)) ??
    null;
  const draggedTask =
    tasks.find((task) => task.id === draggedTaskId && task.status === 'open' && activeCategoryKeys.has(task.category)) ??
    null;

  function navigateToScreen(nextScreen: Screen) {
    window.history.pushState({}, '', getPathForScreen(nextScreen));
    setScreen(nextScreen);
    setSelectedTaskId(null);
  }

  function reloadServerState() {
    if (!conflictState) {
      return;
    }

    const serverTasks = sanitizeTasks(conflictState.tasks);
    const serverCategories = sanitizeCategories(conflictState.categories, serverTasks);

    setTasks(serverTasks);
    setCategories(serverCategories);
    setServerVersion(conflictState.version);
    setServerUpdatedAt(conflictState.updatedAt);
    lastSyncedJsonRef.current = serializeBoardState(serverTasks, serverCategories);
    setConflictState(null);
    setSyncStatus('synced');
    setSyncTooltip(formatSyncedTooltip(conflictState.updatedAt));
    setSelectedTaskId(null);
  }

  function createTask(payload: {
    title: string;
    description: string;
    category: Category;
    deadline: Deadline;
    urgent?: boolean;
  }) {
    const nextTask: Task = {
      id: crypto.randomUUID(),
      title: payload.title,
      description: payload.description,
      category: payload.category,
      deadline: normalizeDeadline(payload.deadline),
      urgent: payload.urgent ?? false,
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    setTasks((current) => [nextTask, ...current]);
  }

  function createCategory(label: string) {
    const trimmed = label.trim().slice(0, MAX_CATEGORY_LABEL_LENGTH);

    if (!trimmed) {
      return;
    }

    const currentCategories = latestCategoriesRef.current;

    if (currentCategories.length >= MAX_CATEGORIES) {
      setToast({
        id: Date.now(),
        message: `Можно добавить максимум ${MAX_CATEGORIES} категорий`,
      });
      return;
    }

    if (currentCategories.some((category) => category.label.toLowerCase() === trimmed.toLowerCase())) {
      setToast({
        id: Date.now(),
        message: 'Такая категория уже есть',
      });
      return;
    }

    const nextCategories = [
      ...currentCategories,
      {
        key: createCategoryKey(trimmed, currentCategories),
        label: trimmed,
        color: getNextCategoryColor(currentCategories.length),
      },
    ];

    latestCategoriesRef.current = nextCategories;
    setCategories(nextCategories);
    triggerHaptic('light');
  }

  function renameCategory(categoryKey: Category, nextLabel: string) {
    const trimmed = nextLabel.trim().slice(0, MAX_CATEGORY_LABEL_LENGTH);

    if (!trimmed) {
      return;
    }

    const currentCategories = latestCategoriesRef.current;
    const duplicate = currentCategories.some(
      (category) => category.key !== categoryKey && category.label.toLowerCase() === trimmed.toLowerCase(),
    );

    if (duplicate) {
      setToast({
        id: Date.now(),
        message: 'Такая категория уже есть',
      });
      return;
    }

    const nextCategories = currentCategories.map((category) =>
      category.key === categoryKey && category.label !== trimmed ? { ...category, label: trimmed } : category,
    );

    latestCategoriesRef.current = nextCategories;
    setCategories(nextCategories);
  }

  function changeCategoryColor(categoryKey: Category, color: string) {
    const nextCategories = latestCategoriesRef.current.map((category) =>
      category.key === categoryKey ? { ...category, color } : category,
    );

    latestCategoriesRef.current = nextCategories;
    setCategories(nextCategories);
  }

  function archiveCategory(categoryKey: Category) {
    const currentCategories = latestCategoriesRef.current;
    const category = currentCategories.find((candidate) => candidate.key === categoryKey);

    if (!category || isArchivedCategory(category)) {
      return;
    }

    if (currentCategories.filter((candidate) => !isArchivedCategory(candidate)).length <= 1) {
      setToast({
        id: Date.now(),
        message: 'Нельзя архивировать последнюю категорию',
      });
      return;
    }

    const tasksInCategory = latestTasksRef.current.filter((task) => task.category === categoryKey);
    const confirmed = window.confirm(
      `Переместить категорию "${category.label}" и ${tasksInCategory.length} задач в архив?`,
    );

    if (!confirmed) {
      return;
    }

    const archivedAt = new Date().toISOString();
    const taskIdsInCategory = new Set(tasksInCategory.map((task) => task.id));
    const nextCategories = currentCategories.map((candidate) =>
      candidate.key === categoryKey ? { ...candidate, status: 'archived' as const, archivedAt } : candidate,
    );

    for (const taskId of taskIdsInCategory) {
      const closingTimeoutId = closingTimeoutsRef.current[taskId];
      if (closingTimeoutId) {
        window.clearTimeout(closingTimeoutId);
        delete closingTimeoutsRef.current[taskId];
      }
    }

    latestCategoriesRef.current = nextCategories;
    setCategories(nextCategories);
    setClosingTaskIds((current) => current.filter((taskId) => !taskIdsInCategory.has(taskId)));
    setTasks((current) =>
      current.map((task) =>
        task.category === categoryKey && task.status === 'open'
          ? {
              ...task,
              status: 'closed',
              closedAt: archivedAt,
            }
          : task,
      ),
    );
    setSelectedTaskId((current) =>
      current && latestTasksRef.current.find((task) => task.id === current)?.category === categoryKey ? null : current,
    );
    triggerHaptic('medium');
    setToast({
      id: Date.now(),
      message: 'Категория перемещена в архив',
    });
  }

  function restoreCategory(categoryKey: Category) {
    const category = latestCategoriesRef.current.find((candidate) => candidate.key === categoryKey);

    if (!category || !isArchivedCategory(category)) {
      return;
    }

    const nextCategories = latestCategoriesRef.current.map((candidate) => {
      if (candidate.key !== categoryKey) {
        return candidate;
      }

      return { ...candidate, archivedAt: undefined, status: undefined };
    });
    const archivedAt = category.archivedAt;

    latestCategoriesRef.current = nextCategories;
    setCategories(nextCategories);
    setTasks((current) =>
      current.map((task) =>
        task.category === categoryKey && task.status === 'closed' && task.closedAt === archivedAt
          ? {
              ...task,
              status: 'open',
              closedAt: undefined,
            }
          : task,
      ),
    );
    triggerHaptic('light');
    setToast({
      id: Date.now(),
      message: 'Категория восстановлена',
    });
  }

  function deleteArchivedCategory(categoryKey: Category) {
    const category = latestCategoriesRef.current.find((candidate) => candidate.key === categoryKey);

    if (!category || !isArchivedCategory(category)) {
      return;
    }

    const nextCategories = latestCategoriesRef.current.filter((candidate) => candidate.key !== categoryKey);
    const taskIdsInCategory = new Set(
      latestTasksRef.current.filter((task) => task.category === categoryKey).map((task) => task.id),
    );

    for (const taskId of taskIdsInCategory) {
      const closingTimeoutId = closingTimeoutsRef.current[taskId];
      if (closingTimeoutId) {
        window.clearTimeout(closingTimeoutId);
        delete closingTimeoutsRef.current[taskId];
      }
    }

    latestCategoriesRef.current = nextCategories;
    setCategories(nextCategories);
    setTasks((current) => current.filter((task) => task.category !== categoryKey));
    setClosingTaskIds((current) => current.filter((taskId) => !taskIdsInCategory.has(taskId)));
    setSelectedTaskId((current) =>
      current && latestTasksRef.current.find((task) => task.id === current)?.category === categoryKey ? null : current,
    );
    triggerHaptic('warning');
    setToast({
      id: Date.now(),
      message: 'Категория удалена',
    });
  }

  function updateTask(updatedTask: Task) {
    setTasks((current) =>
      current.map((task) =>
        task.id === updatedTask.id
          ? {
              ...updatedTask,
              deadline: normalizeDeadline(updatedTask.deadline),
            }
          : task,
      ),
    );
  }

  function finalizeArchiveTask(taskId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'closed',
              closedAt: new Date().toISOString(),
            }
          : task,
      ),
    );
    setSelectedTaskId(null);
  }

  function undoArchive(taskId: string) {
    const closingTimeoutId = closingTimeoutsRef.current[taskId];
    if (closingTimeoutId) {
      window.clearTimeout(closingTimeoutId);
      delete closingTimeoutsRef.current[taskId];
    }
    setClosingTaskIds((current) => current.filter((candidate) => candidate !== taskId));
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'open',
              closedAt: undefined,
            }
          : task,
      ),
    );
    triggerHaptic('light');
  }

  function archiveTask(taskId: string) {
    const task = latestTasksRef.current.find((candidate) => candidate.id === taskId);

    if (!task || task.status !== 'open') {
      return;
    }

    if (closingTimeoutsRef.current[taskId]) {
      return;
    }

    setSelectedTaskId((current) => (current === taskId ? null : current));
    setClosingTaskIds((current) => (current.includes(taskId) ? current : [...current, taskId]));
    triggerHaptic('medium');

    closingTimeoutsRef.current[taskId] = window.setTimeout(() => {
      finalizeArchiveTask(taskId);
      setClosingTaskIds((current) => current.filter((candidate) => candidate !== taskId));
      delete closingTimeoutsRef.current[taskId];
    }, TASK_CLOSE_DELAY_MS);

    setToast({
      id: Date.now(),
      message: 'Задача в архиве',
      actionLabel: 'Вернуть',
      onAction: () => undoArchive(taskId),
      duration: TASK_CLOSE_DELAY_MS,
    });
  }

  function restoreTask(taskId: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: 'open',
              closedAt: undefined,
            }
          : task,
      ),
    );
    triggerHaptic('light');
  }

  function deleteTask(taskId: string) {
    const taskToDelete = latestTasksRef.current.find((candidate) => candidate.id === taskId);
    const closingTimeoutId = closingTimeoutsRef.current[taskId];

    if (closingTimeoutId) {
      window.clearTimeout(closingTimeoutId);
      delete closingTimeoutsRef.current[taskId];
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
    setClosingTaskIds((current) => current.filter((candidate) => candidate !== taskId));
    setSelectedTaskId((current) => (current === taskId ? null : current));
    triggerHaptic('warning');

    if (taskToDelete) {
      setToast({
        id: Date.now(),
        message: 'Задача удалена',
        actionLabel: 'Вернуть',
        onAction: () => {
          setTasks((current) => [taskToDelete, ...current]);
          triggerHaptic('light');
        },
      });
    }
  }

  function startTaskDrag(taskId: string) {
    setDraggedTaskId(taskId);
  }

  function updateDropTarget(category: Category | null) {
    setDropTargetCategory((current) => (current === category ? current : category));
  }

  function endTaskDrag() {
    setDraggedTaskId(null);
    setDropTargetCategory(null);
  }

  function moveTaskToCategory(taskId: string, nextCategory: Category) {
    const targetCategory = latestCategoriesRef.current.find((category) => category.key === nextCategory);

    if (!targetCategory || isArchivedCategory(targetCategory)) {
      return;
    }

    let didChange = false;
    setTasks((current) => {
      let hasChanged = false;

      const nextTasks = current.map((task) => {
        if (task.id !== taskId || task.status !== 'open' || task.category === nextCategory) {
          return task;
        }

        hasChanged = true;
        return {
          ...task,
          category: nextCategory,
        };
      });

      didChange = hasChanged;
      return hasChanged ? nextTasks : current;
    });

    if (didChange) {
      triggerHaptic('medium');
    }
  }

  if (authStatus !== 'authenticated') {
    return <LoginScreen error={authError} isLoading={authStatus === 'loading'} isSubmitting={isAuthSubmitting} onLogin={handleLogin} />;
  }

  return (
    <div
      className={`app${isBackgroundDragActive ? ' app--background-dragging' : ''}${
        isBackgroundEditMode ? ' app--background-editing' : ''
      }${isRainyWeather ? ' app--weather-rain' : ''}`}
      onDragEnter={handleBackgroundDragEnter}
      onDragLeave={handleBackgroundDragLeave}
      onDragOver={handleBackgroundDragOver}
      onDrop={handleBackgroundDrop}
    >
      <BackgroundDecorations
        decorations={backgroundDecorations}
        isEditing={isBackgroundEditMode}
        onDecorationDelete={deleteBackgroundDecoration}
        onDecorationMove={moveBackgroundDecoration}
        onDecorationMoveEnd={commitBackgroundDecorationMove}
        onDecorationResize={resizeBackgroundDecoration}
        onDecorationResizeEnd={commitBackgroundDecorationMove}
      />
      {isRainyWeather && <div className="weather-rain" aria-hidden="true" />}
      <aside className="weather-widget" aria-label="Погода">
        <WeatherBadge onRainChange={setIsRainyWeather} />
      </aside>
      {isBackgroundDragActive && <div className="background-drop-hint">Отпустите изображение на фон</div>}
      {backgroundDecorations.length > 0 && (
        <aside className="background-toolbar" aria-label="Управление фоном">
          <button
            type="button"
            className={`icon-button background-toolbar__button has-tooltip has-tooltip--end${
              isBackgroundEditMode ? ' icon-button--active' : ''
            }${isBackgroundSaveConfirmed ? ' background-toolbar__button--saved' : ''}`}
            data-tooltip={
              isBackgroundSaveConfirmed
                ? 'Сохранено'
                : isBackgroundEditMode
                  ? 'Сохранить изменения и выйти'
                  : 'Редактировать фон'
            }
            title={
              isBackgroundSaveConfirmed
                ? 'Сохранено'
                : isBackgroundEditMode
                  ? 'Сохранить изменения и выйти'
                  : 'Редактировать фон'
            }
            aria-pressed={isBackgroundEditMode}
            disabled={isBackgroundSaveConfirmed}
            onClick={isBackgroundEditMode ? saveAndExitBackgroundEditMode : startBackgroundEditMode}
          >
            {isBackgroundSaveConfirmed ? (
              <Check size={18} strokeWidth={2.3} aria-hidden="true" />
            ) : isBackgroundEditMode ? (
              <Save size={18} strokeWidth={1.9} aria-hidden="true" />
            ) : (
              <Palette size={18} strokeWidth={1.9} aria-hidden="true" />
            )}
            <span className="sr-only">
              {isBackgroundSaveConfirmed
                ? 'Сохранено'
                : isBackgroundEditMode
                  ? 'Сохранить изменения и выйти'
                  : 'Редактировать фон'}
            </span>
          </button>
          {isBackgroundEditMode && (
            <button
              type="button"
              className="icon-button background-toolbar__button has-tooltip has-tooltip--end"
              data-tooltip="Очистить фон"
              title="Очистить фон"
              onClick={clearBackgroundDecorations}
            >
              <ImageOff size={18} strokeWidth={1.9} aria-hidden="true" />
              <span className="sr-only">Очистить фон</span>
            </button>
          )}
        </aside>
      )}
      <div className="app__inner">
        <Header
          backupTooltip={backupTooltip}
          screen={screen}
          currentUser={currentUser}
          isBackuping={isBackuping}
          isCollapsed={isHeaderHidden}
          isLoggingOut={isLoggingOut}
          syncStatus={syncStatus}
          syncTooltip={syncTooltip}
          onBackup={() => backupRunnerRef.current('manual')}
          onCreate={() => setCreateModalOpen(true)}
          onLogout={() => void handleLogout()}
          onToggleScreen={() => navigateToScreen(screen === 'active' ? 'archive' : 'active')}
        />

        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {conflictState && (
          <section className="sync-alert sync-alert--conflict" role="status">
            <div className="sync-alert__copy">
              <strong>Конфликт синхронизации</strong>
              <span>
                На сервере уже есть другая версия. Текущее локальное состояние сохранено в браузере и не будет
                отправляться, пока вы не разрешите конфликт.
              </span>
            </div>

            <button type="button" className="button button--secondary" onClick={reloadServerState}>
              Загрузить серверную версию
            </button>
          </section>
        )}

        {screen === 'active' ? (
          <main className="screen">
            <div className="sections">
              {activeCategories.map((category) => {
                const tasksForCategory = tasksByCategory[category.key] ?? [];

                return (
                  <CategorySection
                    key={category.key}
                    category={category.key}
                    categories={categories}
                    color={category.color}
                    label={category.label}
                    tasks={tasksForCategory}
                    isLoading={isInitialLoading}
                    draggedTaskId={draggedTaskId}
                    draggedTaskCategory={draggedTask?.category ?? null}
                    isDropTarget={dropTargetCategory === category.key}
                    closingTaskIds={closingTaskIds}
                    onCreate={(title) =>
                      createTask({
                        title,
                        description: '',
                        category: category.key,
                        deadline: { kind: 'none' },
                      })
                    }
                    onCategoryArchive={archiveCategory}
                    onCategoryColorChange={changeCategoryColor}
                    onCategoryRename={renameCategory}
                    onDropTargetChange={updateDropTarget}
                    onQuickClose={(taskId) => archiveTask(taskId)}
                    onTaskDragEnd={endTaskDrag}
                    onTaskDragStart={startTaskDrag}
                    onTaskDrop={moveTaskToCategory}
                    onTaskOpen={setSelectedTaskId}
                  />
                );
              })}
            </div>
            <div className="category-creator">
              <InlineCreator
                maxLength={MAX_CATEGORY_LABEL_LENGTH}
                placeholder="Новая категория..."
                onCreate={createCategory}
              />
            </div>
          </main>
        ) : (
          <main className="screen">
            <ArchiveList
              tasks={archiveTasks}
              categories={categories}
              archivedCategories={archivedCategories}
              onDelete={deleteTask}
              onDeleteCategory={deleteArchivedCategory}
              onRestore={restoreTask}
              onRestoreCategory={restoreCategory}
            />
          </main>
        )}
      </div>

      {selectedTask && (
        <Suspense fallback={null}>
          <TaskDetailsModal
            task={selectedTask}
            onArchive={archiveTask}
            onClose={() => setSelectedTaskId(null)}
            onDelete={deleteTask}
            onSave={updateTask}
          />
        </Suspense>
      )}

      {isCreateModalOpen && (
        <Suspense fallback={null}>
          <CreateTaskModal
            isOpen={isCreateModalOpen}
            categories={activeCategories}
            defaultCategory={activeCategories[0]?.key ?? 'passion'}
            onClose={() => setCreateModalOpen(false)}
            onCreate={createTask}
          />
        </Suspense>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default App;
