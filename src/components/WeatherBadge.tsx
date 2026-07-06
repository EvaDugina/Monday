import { useEffect, useState } from 'react';

const WEATHER_CITY_STORAGE_KEY = 'monday:weather-city';
const DEFAULT_CITY_ID = 'moscow';
const YANDEX_WEATHER_ICON_BASE_URL = 'https://yastatic.net/weather/i/icons/funky/light';

interface WeatherCityOption {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

const WEATHER_CITY_OPTIONS: WeatherCityOption[] = [
  { id: 'moscow', label: 'Москва', latitude: 55.7558, longitude: 37.6173 },
  { id: 'saint-petersburg', label: 'Санкт-Петербург', latitude: 59.9343, longitude: 30.3351 },
  { id: 'novosibirsk', label: 'Новосибирск', latitude: 55.0084, longitude: 82.9357 },
  { id: 'yekaterinburg', label: 'Екатеринбург', latitude: 56.8389, longitude: 60.6057 },
  { id: 'kazan', label: 'Казань', latitude: 55.7961, longitude: 49.1064 },
  { id: 'nizhny-novgorod', label: 'Нижний Новгород', latitude: 56.2965, longitude: 43.9361 },
  { id: 'sochi', label: 'Сочи', latitude: 43.6028, longitude: 39.7342 },
  { id: 'kaliningrad', label: 'Калининград', latitude: 54.7104, longitude: 20.4522 },
  { id: 'vladivostok', label: 'Владивосток', latitude: 43.1155, longitude: 131.8855 },
  { id: 'tbilisi', label: 'Тбилиси', latitude: 41.7151, longitude: 44.8271 },
  { id: 'london', label: 'Лондон', latitude: 51.5072, longitude: -0.1276 },
  { id: 'berlin', label: 'Берлин', latitude: 52.52, longitude: 13.405 },
  { id: 'paris', label: 'Париж', latitude: 48.8566, longitude: 2.3522 },
  { id: 'new-york', label: 'Нью-Йорк', latitude: 40.7128, longitude: -74.006 },
  { id: 'dubai', label: 'Дубай', latitude: 25.2048, longitude: 55.2708 },
];

interface ForecastResponse {
  current?: {
    precipitation?: number;
    rain?: number;
    showers?: number;
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
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

function findCityOption(value: string | null): WeatherCityOption {
  const normalized = value?.trim().toLowerCase();
  const city =
    WEATHER_CITY_OPTIONS.find(
      (option) => option.id === normalized || option.label.toLowerCase() === normalized,
    ) ?? WEATHER_CITY_OPTIONS.find((option) => option.id === DEFAULT_CITY_ID);

  return city ?? WEATHER_CITY_OPTIONS[0];
}

function loadWeatherCityId(): string {
  try {
    return findCityOption(window.localStorage.getItem(WEATHER_CITY_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_CITY_ID;
  }
}

function saveWeatherCityId(cityId: string): void {
  try {
    window.localStorage.setItem(WEATHER_CITY_STORAGE_KEY, cityId);
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

function getDayNightSuffix(isDay: boolean | null): 'd' | 'n' {
  return isDay === false ? 'n' : 'd';
}

function withDayNight(iconCode: string, isDay: boolean | null): string {
  return `${iconCode}_${getDayNightSuffix(isDay)}`;
}

function getYandexWeatherIconUrl(iconCode: string): string {
  return `${YANDEX_WEATHER_ICON_BASE_URL}/${iconCode}.svg`;
}

function getWeatherVisual(
  weatherCode: number | null,
  isDay: boolean | null,
): {
  iconCode: string;
  label: string;
  tone: 'clear' | 'cloud' | 'drizzle' | 'fog' | 'rain' | 'storm' | 'snow' | 'unknown';
} {
  if (weatherCode === 0) {
    return { iconCode: withDayNight('skc', isDay), label: 'Ясно', tone: 'clear' };
  }

  if (weatherCode === 1 || weatherCode === 2) {
    return { iconCode: withDayNight('bkn', isDay), label: 'Переменная облачность', tone: 'cloud' };
  }

  if (weatherCode === 3) {
    return { iconCode: 'ovc', label: 'Пасмурно', tone: 'cloud' };
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return { iconCode: withDayNight('fg', isDay), label: 'Туман', tone: 'fog' };
  }

  if (weatherCode === 51 || weatherCode === 53 || weatherCode === 55 || weatherCode === 56 || weatherCode === 57) {
    return { iconCode: withDayNight('bkn_-ra', isDay), label: 'Морось', tone: 'drizzle' };
  }

  if (weatherCode === 61 || weatherCode === 66 || weatherCode === 80) {
    return { iconCode: withDayNight('bkn_ra', isDay), label: 'Дождь', tone: 'rain' };
  }

  if (weatherCode === 63 || weatherCode === 81) {
    return { iconCode: 'ovc_ra', label: 'Дождь', tone: 'rain' };
  }

  if (weatherCode === 65 || weatherCode === 67 || weatherCode === 82) {
    return { iconCode: 'ovc_+ra', label: 'Сильный дождь', tone: 'rain' };
  }

  if (weatherCode === 71 || weatherCode === 77 || weatherCode === 85) {
    return { iconCode: withDayNight('bkn_-sn', isDay), label: 'Снег', tone: 'snow' };
  }

  if (weatherCode === 73) {
    return { iconCode: withDayNight('bkn_sn', isDay), label: 'Снег', tone: 'snow' };
  }

  if (weatherCode === 75 || weatherCode === 86) {
    return { iconCode: 'ovc_+sn', label: 'Сильный снег', tone: 'snow' };
  }

  if (weatherCode === 95) {
    return { iconCode: 'ovc_ts', label: 'Гроза', tone: 'storm' };
  }

  if (weatherCode === 96 || weatherCode === 99) {
    return { iconCode: 'ovc_ts_ha', label: 'Гроза с градом', tone: 'storm' };
  }

  return { iconCode: withDayNight('bkn', isDay), label: 'Погода', tone: 'unknown' };
}

async function fetchWeather(
  city: WeatherCityOption,
  signal: AbortSignal,
): Promise<{ isDay: boolean | null; isRainy: boolean; temperature: string; weatherCode: number | null }> {
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(city.latitude));
  forecastUrl.searchParams.set('longitude', String(city.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,weather_code,is_day,precipitation,rain,showers');
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
    isDay:
      typeof forecastPayload.current?.is_day === 'number'
        ? forecastPayload.current.is_day === 1
        : null,
    isRainy: isRainyForecast(forecastPayload.current),
    temperature: formatTemperature(temperature),
    weatherCode:
      typeof forecastPayload.current?.weather_code === 'number' ? forecastPayload.current.weather_code : null,
  };
}

function WeatherBadge({ onRainChange }: WeatherBadgeProps) {
  const [cityId, setCityId] = useState(loadWeatherCityId);
  const selectedCity = findCityOption(cityId);
  const [temperature, setTemperature] = useState<string | null>(null);
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [isDay, setIsDay] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const weatherVisual = hasError ? getWeatherVisual(null, true) : getWeatherVisual(weatherCode, isDay);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    setHasError(false);
    onRainChange?.(false);

    void fetchWeather(selectedCity, controller.signal)
      .then((result) => {
        setTemperature(result.temperature);
        setWeatherCode(result.weatherCode);
        setIsDay(result.isDay);
        onRainChange?.(result.isRainy);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setHasError(true);
        setTemperature(null);
        setWeatherCode(null);
        setIsDay(null);
        onRainChange?.(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [onRainChange, selectedCity]);

  function handleCityChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCityId = event.target.value;
    setCityId(nextCityId);
    saveWeatherCityId(nextCityId);
  }

  return (
    <span
      className={`weather-badge weather-badge--${weatherVisual.tone}${hasError ? ' weather-badge--error' : ''}`}
      title={
        hasError
          ? 'Не удалось загрузить погоду'
          : `${weatherVisual.label}: ${selectedCity.label}, ${temperature ?? '--°'}`
      }
    >
      <img
        className="weather-badge__icon"
        src={getYandexWeatherIconUrl(weatherVisual.iconCode)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <label className="weather-badge__city-label">
        <span className="sr-only">Город для погоды</span>
        <select className="weather-badge__city-select" value={cityId} onChange={handleCityChange}>
          {WEATHER_CITY_OPTIONS.map((city) => (
            <option key={city.id} value={city.id}>
              {city.label}
            </option>
          ))}
        </select>
      </label>
      <span className="weather-badge__temperature">{isLoading ? '...' : temperature ?? '--°'}</span>
    </span>
  );
}

export default WeatherBadge;
