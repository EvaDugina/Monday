const rawBaseUrl = import.meta.env.BASE_URL || '/';

export const APP_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;
export const APP_BASE_PATH = APP_BASE_URL === '/' ? '' : APP_BASE_URL.replace(/\/$/, '');

function normalizeAppPath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function withAppBasePath(path: string): string {
  const normalizedPath = normalizeAppPath(path);

  if (!APP_BASE_PATH) {
    return normalizedPath;
  }

  if (normalizedPath === '/') {
    return `${APP_BASE_PATH}/`;
  }

  return `${APP_BASE_PATH}${normalizedPath}`;
}

export function stripAppBasePath(pathname: string): string {
  if (!APP_BASE_PATH) {
    return pathname || '/';
  }

  if (pathname === APP_BASE_PATH) {
    return '/';
  }

  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length) || '/';
  }

  return pathname || '/';
}

export function buildApiPath(path: string): string {
  const trimmedPath = path.replace(/^\/+/, '');
  return withAppBasePath(`/api/${trimmedPath}`);
}
