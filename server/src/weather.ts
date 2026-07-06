import { request as httpsRequest } from 'node:https';

const OPEN_METEO_API_HOST = 'api.open-meteo.com';
const OPEN_METEO_CONNECT_HOST = process.env.OPEN_METEO_CONNECT_HOST?.trim() || 'open-meteo.com';
const OPEN_METEO_TIMEOUT_MS = 8_000;
const OPEN_METEO_MAX_RESPONSE_BYTES = 64_000;

interface OpenMeteoCurrentPayload {
  current?: {
    precipitation?: number;
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
  };
  current_units?: Record<string, unknown>;
  elevation?: number;
  generationtime_ms?: number;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
}

function requestOpenMeteoJson(path: string): Promise<OpenMeteoCurrentPayload> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        headers: {
          Accept: 'application/json',
          Host: OPEN_METEO_API_HOST,
          'User-Agent': 'MONDAY-weather/0.1',
        },
        hostname: OPEN_METEO_CONNECT_HOST,
        method: 'GET',
        path,
        port: 443,
        servername: OPEN_METEO_API_HOST,
        timeout: OPEN_METEO_TIMEOUT_MS,
      },
      (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;

          if (body.length > OPEN_METEO_MAX_RESPONSE_BYTES) {
            request.destroy(new Error('Open-Meteo response is too large'));
          }
        });

        response.on('end', () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Open-Meteo responded with status ${response.statusCode ?? 'unknown'}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as OpenMeteoCurrentPayload);
          } catch {
            reject(new Error('Open-Meteo response is not valid JSON'));
          }
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Open-Meteo request timed out'));
    });

    request.on('error', reject);
    request.end();
  });
}

export async function fetchOpenMeteoCurrent(latitude: number, longitude: number): Promise<OpenMeteoCurrentPayload> {
  const searchParams = new URLSearchParams({
    current: 'temperature_2m,weather_code,is_day,precipitation',
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: 'auto',
  });

  return requestOpenMeteoJson(`/v1/forecast?${searchParams.toString()}`);
}
