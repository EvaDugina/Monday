import type { RainIntensity, SkyCloud, WeatherControls } from './types';

const WEATHER_CONTROLS_STORAGE_KEY = 'monday:weather-controls';
const RAIN_INTENSITIES: RainIntensity[] = ['none', 'light', 'moderate', 'heavy', 'max'];

export const RAIN_INTENSITY_ORDER = RAIN_INTENSITIES;

// Manual rain always shows at least a light shower; "none" is expressed by the rain toggle being off.
export const MANUAL_RAIN_INTENSITIES: RainIntensity[] = ['light', 'moderate', 'heavy', 'max'];

export const RAIN_INTENSITY_LABEL: Record<RainIntensity, string> = {
  none: 'Нет',
  light: 'Лёгкий',
  moderate: 'Средний',
  heavy: 'Сильный',
  max: 'Ливень',
};

// Editing bounds for individual sky clouds. Widths are in px; the image keeps its aspect ratio.
export const MIN_CLOUD_WIDTH = 120;
export const MAX_CLOUD_WIDTH = 1600;
export const MAX_CLOUDS = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// The three seed clouds reproduce the original hand-tuned look (band, size, depth and drift phase).
function makeDefaultClouds(): SkyCloud[] {
  return [
    { id: 'a', top: 8, x: 0, y: 0, width: 560, depth: 1, duration: 95, opacity: 0.5, delay: 12 },
    { id: 'b', top: 58, x: 0, y: 0, width: 460, depth: 0.55, duration: 140, opacity: 0.4, delay: 70 },
    { id: 'c', top: 32, x: 0, y: 0, width: 690, depth: 1.5, duration: 180, opacity: 0.32, delay: 120 },
  ];
}

export function createDefaultWeatherControls(): WeatherControls {
  return {
    live: true,
    rainEnabled: false,
    skyEnabled: true,
    cloudsEnabled: true,
    rainIntensity: 'moderate',
    cloudOpacity: 1,
    cloudParallax: 1,
    cloudSpeed: 1,
    skyStrength: 1,
    clouds: makeDefaultClouds(),
  };
}

// Fresh cloud dropped near the centre with a bit of natural variation in depth/drift.
export function createSkyCloud(): SkyCloud {
  const rand = (min: number, max: number): number => min + Math.random() * (max - min);
  const duration = Math.round(rand(90, 180));

  return {
    id: crypto.randomUUID(),
    top: Math.round(rand(20, 60)),
    x: Math.round(rand(-140, 140)),
    y: 0,
    width: Math.round(rand(360, 520)),
    depth: Number(rand(0.6, 1.5).toFixed(2)),
    duration,
    opacity: Number(rand(0.34, 0.5).toFixed(2)),
    delay: Math.round(rand(0, duration)),
  };
}

function sanitizeCloud(value: unknown, index: number): SkyCloud | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const num = (candidate: unknown, fallback: number, min: number, max: number): number =>
    typeof candidate === 'number' && Number.isFinite(candidate) ? clamp(candidate, min, max) : fallback;
  const id = typeof record.id === 'string' && record.id ? record.id : `cloud-${index}`;

  return {
    id,
    top: num(record.top, 30, -20, 120),
    x: Math.round(num(record.x, 0, -6000, 6000)),
    y: Math.round(num(record.y, 0, -6000, 6000)),
    width: Math.round(num(record.width, 480, MIN_CLOUD_WIDTH, MAX_CLOUD_WIDTH)),
    depth: num(record.depth, 1, 0, 3),
    duration: num(record.duration, 120, 20, 400),
    opacity: num(record.opacity, 0.4, 0.05, 1),
    delay: num(record.delay, 0, 0, 400),
  };
}

// Legacy snapshots stored only per-cloud drag offsets keyed by 'a' | 'b' | 'c'.
function migrateLegacyOffsets(value: unknown): SkyCloud[] | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const offsets = value as Record<string, unknown>;
  return makeDefaultClouds().map((cloud) => {
    const legacy = offsets[cloud.id];
    if (typeof legacy !== 'object' || legacy === null) {
      return cloud;
    }

    const record = legacy as { x?: unknown; y?: unknown };
    const x = typeof record.x === 'number' && Number.isFinite(record.x) ? clamp(record.x, -6000, 6000) : 0;
    const y = typeof record.y === 'number' && Number.isFinite(record.y) ? clamp(record.y, -6000, 6000) : 0;
    return { ...cloud, x: Math.round(x), y: Math.round(y) };
  });
}

function sanitizeClouds(record: Record<string, unknown>): SkyCloud[] {
  if (Array.isArray(record.clouds)) {
    const clouds = record.clouds
      .map((cloud, index) => sanitizeCloud(cloud, index))
      .filter((cloud): cloud is SkyCloud => cloud !== null)
      .slice(0, MAX_CLOUDS);
    return clouds.length > 0 ? clouds : makeDefaultClouds();
  }

  return migrateLegacyOffsets(record.cloudOffsets) ?? makeDefaultClouds();
}

export function sanitizeWeatherControls(value: unknown): WeatherControls {
  const defaults = createDefaultWeatherControls();

  if (typeof value !== 'object' || value === null) {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  const bool = (candidate: unknown, fallback: boolean): boolean =>
    typeof candidate === 'boolean' ? candidate : fallback;
  const num = (candidate: unknown, fallback: number, min: number, max: number): number =>
    typeof candidate === 'number' && Number.isFinite(candidate) ? clamp(candidate, min, max) : fallback;

  return {
    live: bool(record.live, defaults.live),
    rainEnabled: bool(record.rainEnabled, defaults.rainEnabled),
    skyEnabled: bool(record.skyEnabled, defaults.skyEnabled),
    cloudsEnabled: bool(record.cloudsEnabled, defaults.cloudsEnabled),
    rainIntensity: RAIN_INTENSITIES.includes(record.rainIntensity as RainIntensity)
      ? (record.rainIntensity as RainIntensity)
      : defaults.rainIntensity,
    cloudOpacity: num(record.cloudOpacity, defaults.cloudOpacity, 0.1, 2),
    cloudParallax: num(record.cloudParallax, defaults.cloudParallax, 0, 3),
    cloudSpeed: num(record.cloudSpeed, defaults.cloudSpeed, 0.2, 3),
    skyStrength: num(record.skyStrength, defaults.skyStrength, 0, 1),
    clouds: sanitizeClouds(record),
  };
}

export function loadWeatherControls(): WeatherControls {
  try {
    const raw = window.localStorage.getItem(WEATHER_CONTROLS_STORAGE_KEY);
    return raw ? sanitizeWeatherControls(JSON.parse(raw)) : createDefaultWeatherControls();
  } catch {
    return createDefaultWeatherControls();
  }
}

export function saveWeatherControls(controls: WeatherControls): void {
  try {
    window.localStorage.setItem(WEATHER_CONTROLS_STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Weather controls are a convenience preference; ignore storage quota/private-mode failures.
  }
}
