import type { CloudId, RainIntensity, WeatherControls } from './types';

const WEATHER_CONTROLS_STORAGE_KEY = 'monday:weather-controls';
const RAIN_INTENSITIES: RainIntensity[] = ['none', 'light', 'moderate', 'heavy', 'max'];
const CLOUD_IDS: CloudId[] = ['a', 'b', 'c'];

export const RAIN_INTENSITY_ORDER = RAIN_INTENSITIES;

export const RAIN_INTENSITY_LABEL: Record<RainIntensity, string> = {
  none: 'Нет',
  light: 'Лёгкий',
  moderate: 'Средний',
  heavy: 'Сильный',
  max: 'Ливень',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function makeOffsets(): Record<CloudId, { x: number; y: number }> {
  return { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, c: { x: 0, y: 0 } };
}

export function createDefaultWeatherControls(): WeatherControls {
  return {
    rainEnabled: true,
    skyEnabled: true,
    cloudsEnabled: true,
    rainAuto: true,
    rainIntensity: 'moderate',
    cloudOpacity: 1,
    cloudParallax: 1,
    cloudSpeed: 1,
    skyStrength: 1,
    cloudOffsets: makeOffsets(),
  };
}

function sanitizeOffset(value: unknown): { x: number; y: number } {
  if (typeof value !== 'object' || value === null) {
    return { x: 0, y: 0 };
  }

  const record = value as { x?: unknown; y?: unknown };
  const x = typeof record.x === 'number' && Number.isFinite(record.x) ? clamp(record.x, -3000, 3000) : 0;
  const y = typeof record.y === 'number' && Number.isFinite(record.y) ? clamp(record.y, -3000, 3000) : 0;

  return { x: Math.round(x), y: Math.round(y) };
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

  const rawOffsets = (typeof record.cloudOffsets === 'object' && record.cloudOffsets !== null
    ? record.cloudOffsets
    : {}) as Record<string, unknown>;
  const cloudOffsets = makeOffsets();
  CLOUD_IDS.forEach((id) => {
    cloudOffsets[id] = sanitizeOffset(rawOffsets[id]);
  });

  return {
    rainEnabled: bool(record.rainEnabled, defaults.rainEnabled),
    skyEnabled: bool(record.skyEnabled, defaults.skyEnabled),
    cloudsEnabled: bool(record.cloudsEnabled, defaults.cloudsEnabled),
    rainAuto: bool(record.rainAuto, defaults.rainAuto),
    rainIntensity: RAIN_INTENSITIES.includes(record.rainIntensity as RainIntensity)
      ? (record.rainIntensity as RainIntensity)
      : defaults.rainIntensity,
    cloudOpacity: num(record.cloudOpacity, defaults.cloudOpacity, 0.1, 2),
    cloudParallax: num(record.cloudParallax, defaults.cloudParallax, 0, 3),
    cloudSpeed: num(record.cloudSpeed, defaults.cloudSpeed, 0.2, 3),
    skyStrength: num(record.skyStrength, defaults.skyStrength, 0, 1),
    cloudOffsets,
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
