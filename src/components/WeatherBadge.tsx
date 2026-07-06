import { CloudSun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const WEATHER_CITY_STORAGE_KEY = 'monday:weather-city';
const DEFAULT_CITY = 'Москва';

interface GeocodingResult {
  latitude: number;
  longitude: number;
  name: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

interface ForecastResponse {
  current?: {
    precipitation?: number;
    rain?: number;
    showers?: number;
    temperature_2m?: number;
    weather_code?: number;
  };
  current_units?: {
    temperature_2m?: string;
  };
}

interface WeatherBadgeProps {
  onRainChange?: (isRainy: boolean) => void;
}

const RAINY_WEATHER_CODES = new Set([
  51,
  53,
  55,
  56,
  57,
  61,
  63,
  65,
  66,
  67,
  80,
  81,
  82,
  95,
  96,
  99,
]);

function loadWeatherCity(): string {
  try {
    const savedCity = window.localStorage.getItem(WEATHER_CITY_STORAGE_KEY);
    return savedCity?.trim() || DEFAULT_CITY;
  } catch {
    return DEFAULT_CITY;
  }
}

function saveWeatherCity(city: string): void {
  try {
    window.localStorage.setItem(WEATHER_CITY_STORAGE_KEY, city);
  } catch {
    // Weather city is a convenience preference; ignore localStorage quota/private-mode failures.
  }
}

function formatTemperature(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function isRainyForecast(current: ForecastResponse['current']): boolean {
  if (!current) {
    return false;
  }

  if ((current.rain ?? 0) > 0 || (current.showers ?? 0) > 0 || (current.precipitation ?? 0) > 0) {
    return true;
  }

  return typeof current.weather_code === 'number' && RAINY_WEATHER_CODES.has(current.weather_code);
}

async function fetchWeather(
  city: string,
  signal: AbortSignal,
): Promise<{ city: string; isRainy: boolean; temperature: string }> {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodingUrl.searchParams.set('name', city);
  geocodingUrl.searchParams.set('count', '1');
  geocodingUrl.searchParams.set('language', 'ru');
  geocodingUrl.searchParams.set('format', 'json');

  const geocodingResponse = await fetch(geocodingUrl, { signal });

  if (!geocodingResponse.ok) {
    throw new Error('Failed to resolve weather city');
  }

  const geocodingPayload = (await geocodingResponse.json()) as GeocodingResponse;
  const location = geocodingPayload.results?.[0];

  if (!location) {
    throw new Error('Weather city was not found');
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(location.latitude));
  forecastUrl.searchParams.set('longitude', String(location.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,weather_code,precipitation,rain,showers');
  forecastUrl.searchParams.set('timezone', 'auto');

  const forecastResponse = await fetch(forecastUrl, { signal });

  if (!forecastResponse.ok) {
    throw new Error('Failed to load weather');
  }

  const forecastPayload = (await forecastResponse.json()) as ForecastResponse;
  const temperature = forecastPayload.current?.temperature_2m;

  if (typeof temperature !== 'number') {
    throw new Error('Weather response does not contain temperature');
  }

  return {
    city: location.name || city,
    isRainy: isRainyForecast(forecastPayload.current),
    temperature: formatTemperature(temperature),
  };
}

function WeatherBadge({ onRainChange }: WeatherBadgeProps) {
  const [city, setCity] = useState(loadWeatherCity);
  const [draftCity, setDraftCity] = useState(city);
  const [displayCity, setDisplayCity] = useState(city);
  const [temperature, setTemperature] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setHasError(false);
    onRainChange?.(false);

    void fetchWeather(city, controller.signal)
      .then((result) => {
        setDisplayCity(result.city);
        setTemperature(result.temperature);
        onRainChange?.(result.isRainy);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setHasError(true);
        setDisplayCity(city);
        setTemperature(null);
        onRainChange?.(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [city, onRainChange]);

  useEffect(() => {
    if (isEditing) {
      setDraftCity(city);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [city, isEditing]);

  function commitCity() {
    const trimmedCity = draftCity.trim();

    if (!trimmedCity) {
      return;
    }

    setCity(trimmedCity);
    saveWeatherCity(trimmedCity);
    setIsEditing(false);
  }

  function cancelCityEdit() {
    setDraftCity(city);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <form
        className="weather-badge weather-badge--editing"
        onSubmit={(event) => {
          event.preventDefault();
          commitCity();
        }}
      >
        <CloudSun size={15} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={inputRef}
          className="weather-badge__input"
          value={draftCity}
          maxLength={80}
          aria-label="Город для погоды"
          onChange={(event) => setDraftCity(event.target.value)}
          onBlur={commitCity}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelCityEdit();
            }
          }}
        />
      </form>
    );
  }

  return (
    <span
      className={`weather-badge${hasError ? ' weather-badge--error' : ''}`}
      title={hasError ? 'Не удалось загрузить погоду' : `Температура сейчас: ${displayCity}`}
    >
      <CloudSun size={15} strokeWidth={1.8} aria-hidden="true" />
      <button type="button" className="weather-badge__city" onClick={() => setIsEditing(true)}>
        {displayCity}
      </button>
      <span className="weather-badge__temperature">{isLoading ? '...' : temperature ?? '--°'}</span>
    </span>
  );
}

export default WeatherBadge;
