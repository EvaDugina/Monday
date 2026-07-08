import { useEffect, useRef, useState } from 'react';
import { buildApiPath, withAppBasePath } from '../basePath';
import type { RainIntensity } from '../types';

const DEFAULT_CITY_ID = 'moscow';
const WEATHER_ICON_BASE_PATH = '/weather-icons';
const WEATHER_FLAG_BASE_PATH = '/flags';
const WEATHER_REQUEST_TIMEOUT_MS = 8000;

type WeatherCountryCode = 'ru' | 'ge';

interface WeatherCityOption {
  id: string;
  label: string;
  countryCode: WeatherCountryCode;
  latitude: number;
  longitude: number;
}

const WEATHER_CITY_OPTIONS: WeatherCityOption[] = [
  { id: 'moscow', label: 'Москва', countryCode: 'ru', latitude: 55.7558, longitude: 37.6173 },
  { id: 'tbilisi', label: 'Тбилиси', countryCode: 'ge', latitude: 41.7151, longitude: 44.8271 },
];

interface ForecastResponse {
  current?: {
    precipitation?: number;
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
}

interface WeatherBadgeProps {
  cityId: string;
  onCityChange: (cityId: string) => void;
  onRainIntensityChange?: (rainIntensity: RainIntensity) => void;
}

const RAIN_INTENSITY_RANK: Record<RainIntensity, number> = {
  none: 0,
  light: 1,
  moderate: 2,
  heavy: 3,
  max: 4,
};

function findCityOption(value: string | null): WeatherCityOption {
  const normalized = value?.trim().toLowerCase();
  const city =
    WEATHER_CITY_OPTIONS.find(
      (option) => option.id === normalized || option.label.toLowerCase() === normalized,
    ) ?? WEATHER_CITY_OPTIONS.find((option) => option.id === DEFAULT_CITY_ID);

  return city ?? WEATHER_CITY_OPTIONS[0];
}

function formatTemperature(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function maxRainIntensity(left: RainIntensity, right: RainIntensity): RainIntensity {
  return RAIN_INTENSITY_RANK[right] > RAIN_INTENSITY_RANK[left] ? right : left;
}

function getPrecipitationRainIntensity(precipitation: number | undefined): RainIntensity {
  if (typeof precipitation !== 'number' || precipitation <= 0) {
    return 'none';
  }

  if (precipitation >= 7.5) {
    return 'max';
  }

  if (precipitation >= 2.5) {
    return 'heavy';
  }

  if (precipitation >= 0.8) {
    return 'moderate';
  }

  return 'light';
}

function getWeatherCodeRainIntensity(weatherCode: number | undefined): RainIntensity {
  if (typeof weatherCode !== 'number') {
    return 'none';
  }

  if (weatherCode === 51 || weatherCode === 56 || weatherCode === 61 || weatherCode === 66 || weatherCode === 80) {
    return 'light';
  }

  if (weatherCode === 53 || weatherCode === 55 || weatherCode === 57 || weatherCode === 63 || weatherCode === 81) {
    return 'moderate';
  }

  if (
    weatherCode === 65 ||
    weatherCode === 67 ||
    weatherCode === 82 ||
    weatherCode === 95 ||
    weatherCode === 96 ||
    weatherCode === 99
  ) {
    return 'max';
  }

  return 'none';
}

function getForecastRainIntensity(current: ForecastResponse['current']): RainIntensity {
  if (!current) {
    return 'none';
  }

  return maxRainIntensity(
    getPrecipitationRainIntensity(current.precipitation),
    getWeatherCodeRainIntensity(current.weather_code),
  );
}

function getDayNightSuffix(isDay: boolean | null): 'd' | 'n' {
  return isDay === false ? 'n' : 'd';
}

function withDayNight(iconCode: string, isDay: boolean | null): string {
  return `${iconCode}_${getDayNightSuffix(isDay)}`;
}

function getWeatherIconUrl(iconCode: string): string {
  return withAppBasePath(`${WEATHER_ICON_BASE_PATH}/${iconCode}.svg`);
}

function getWeatherFlagUrl(countryCode: WeatherCountryCode): string {
  return withAppBasePath(`${WEATHER_FLAG_BASE_PATH}/${countryCode}.svg`);
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
): Promise<{ isDay: boolean | null; rainIntensity: RainIntensity; temperature: string; weatherCode: number | null }> {
  const forecastUrl = new URL(buildApiPath('weather/current'), window.location.origin);
  forecastUrl.searchParams.set('latitude', String(city.latitude));
  forecastUrl.searchParams.set('longitude', String(city.longitude));

  const forecastResponse = await fetch(forecastUrl, {
    credentials: 'same-origin',
    signal,
  });

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
    rainIntensity: getForecastRainIntensity(forecastPayload.current),
    temperature: formatTemperature(temperature),
    weatherCode:
      typeof forecastPayload.current?.weather_code === 'number' ? forecastPayload.current.weather_code : null,
  };
}

function WeatherBadge({ cityId, onCityChange, onRainIntensityChange }: WeatherBadgeProps) {
  const selectedCity = findCityOption(cityId);
  const [temperature, setTemperature] = useState<string | null>(null);
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [isDay, setIsDay] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isCityMenuOpen, setIsCityMenuOpen] = useState(false);
  const cityPickerRef = useRef<HTMLDivElement>(null);
  const weatherVisual = hasError ? getWeatherVisual(null, true) : getWeatherVisual(weatherCode, isDay);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    const timeoutId = window.setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS);

    setIsLoading(true);
    setHasError(false);
    onRainIntensityChange?.('none');

    void fetchWeather(selectedCity, controller.signal)
      .then((result) => {
        if (!isActive) {
          return;
        }

        setTemperature(result.temperature);
        setWeatherCode(result.weatherCode);
        setIsDay(result.isDay);
        onRainIntensityChange?.(result.rainIntensity);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setHasError(true);
        setTemperature(null);
        setWeatherCode(null);
        setIsDay(null);
        onRainIntensityChange?.('none');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);

        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [onRainIntensityChange, selectedCity]);

  useEffect(() => {
    if (!isCityMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && cityPickerRef.current?.contains(event.target)) {
        return;
      }

      setIsCityMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsCityMenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCityMenuOpen]);

  function handleCityChange(nextCityId: string) {
    onCityChange(nextCityId);
    setIsCityMenuOpen(false);
  }

  function handleCityButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsCityMenuOpen(true);
    }
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
        src={getWeatherIconUrl(weatherVisual.iconCode)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <div ref={cityPickerRef} className="weather-badge__city-picker">
        <button
          type="button"
          className="weather-badge__city-select"
          aria-haspopup="listbox"
          aria-expanded={isCityMenuOpen}
          aria-label={`Город для погоды: ${selectedCity.label}`}
          onClick={() => setIsCityMenuOpen((current) => !current)}
          onKeyDown={handleCityButtonKeyDown}
        >
          <img
            className="weather-badge__flag"
            src={getWeatherFlagUrl(selectedCity.countryCode)}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <span className="weather-badge__city-name">{selectedCity.label}</span>
        </button>

        {isCityMenuOpen && (
          <div className="weather-badge__city-menu" role="listbox" aria-label="Город для погоды">
            {WEATHER_CITY_OPTIONS.map((city) => {
              const isSelected = city.id === cityId;

              return (
                <button
                  key={city.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`weather-badge__city-option${
                    isSelected ? ' weather-badge__city-option--active' : ''
                  }`}
                  onClick={() => handleCityChange(city.id)}
                >
                  <img
                    className="weather-badge__flag"
                    src={getWeatherFlagUrl(city.countryCode)}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                  <span className="weather-badge__city-name">{city.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <span className="weather-badge__temperature">{isLoading ? '...' : temperature ?? '--°'}</span>
    </span>
  );
}

export default WeatherBadge;
