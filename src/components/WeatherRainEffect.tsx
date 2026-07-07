import { useEffect, useRef } from 'react';
import { withAppBasePath } from '../basePath';
import type { RainIntensity } from '../types';

const VENDOR_SRC = withAppBasePath('/vendor/raindrop-fx/index.js');
const SCRIPT_ID = 'monday-raindrop-fx';
const MAX_RAIN_FX_OPACITY = 0.42;

type RainFxOptions = {
  canvas: HTMLCanvasElement;
  background: HTMLCanvasElement;
  dropletsPerSecond?: number;
  dropletsPerSeconds?: number;
  spawnInterval?: [number, number];
  spawnSize?: [number, number];
  spawnLimit?: number;
  mist?: boolean;
  mistColor?: [number, number, number, number];
  backgroundBlurSteps?: number;
  raindropCompose?: 'smoother' | 'harder';
  raindropDiffuseLight?: [number, number, number];
  raindropSpecularLight?: [number, number, number];
};

type RainFxInstance = {
  start?: () => Promise<void> | void;
  stop?: () => void;
  resize?: (width: number, height: number) => void;
  destroy?: () => void;
};

type RainFxConstructor = new (options: RainFxOptions) => RainFxInstance;
type RainFxGlobal = RainFxConstructor | { default?: RainFxConstructor };
type FallbackRainController = {
  resize: () => void;
  stop: () => void;
};

type VisibleRainIntensity = Exclude<RainIntensity, 'none'>;

type RainVisualProfile = {
  dropletsPerSecond: number;
  fallbackDropCount: number;
  fallbackOpacity: number;
  fallbackAlpha: [number, number];
  fallbackLength: [number, number];
  fallbackSpeed: [number, number];
  fallbackWidth: [number, number];
  fxOpacity: number;
  mistAlpha: number;
  spawnInterval: [number, number];
  spawnLimit: number;
  spawnSize: [number, number];
};

const RAIN_VISUAL_PROFILES: Record<VisibleRainIntensity, RainVisualProfile> = {
  light: {
    dropletsPerSecond: 280,
    fallbackDropCount: 44,
    fallbackOpacity: 0.12,
    fallbackAlpha: [0.08, 0.18],
    fallbackLength: [10, 24],
    fallbackSpeed: [5, 10],
    fallbackWidth: [0.45, 1],
    fxOpacity: 0.14,
    mistAlpha: 0.16,
    spawnInterval: [0.08, 0.16],
    spawnLimit: 320,
    spawnSize: [18, 46],
  },
  moderate: {
    dropletsPerSecond: 620,
    fallbackDropCount: 76,
    fallbackOpacity: 0.2,
    fallbackAlpha: [0.12, 0.28],
    fallbackLength: [13, 34],
    fallbackSpeed: [7, 14],
    fallbackWidth: [0.6, 1.35],
    fxOpacity: 0.24,
    mistAlpha: 0.28,
    spawnInterval: [0.04, 0.1],
    spawnLimit: 700,
    spawnSize: [24, 68],
  },
  heavy: {
    dropletsPerSecond: 960,
    fallbackDropCount: 104,
    fallbackOpacity: 0.29,
    fallbackAlpha: [0.16, 0.38],
    fallbackLength: [15, 44],
    fallbackSpeed: [8, 18],
    fallbackWidth: [0.7, 1.65],
    fxOpacity: 0.34,
    mistAlpha: 0.4,
    spawnInterval: [0.026, 0.07],
    spawnLimit: 1020,
    spawnSize: [32, 86],
  },
  max: {
    dropletsPerSecond: 1300,
    fallbackDropCount: 130,
    fallbackOpacity: 0.36,
    fallbackAlpha: [0.18, 0.46],
    fallbackLength: [16, 50],
    fallbackSpeed: [9, 21],
    fallbackWidth: [0.8, 2],
    fxOpacity: MAX_RAIN_FX_OPACITY,
    mistAlpha: 0.48,
    spawnInterval: [0.018, 0.05],
    spawnLimit: 1300,
    spawnSize: [38, 104],
  },
};

interface WeatherRainEffectProps {
  intensity: RainIntensity;
}

declare global {
  interface Window {
    RaindropFX?: RainFxGlobal;
  }
}

let rainFxScriptPromise: Promise<void> | null = null;

function getRainFxConstructor(): RainFxConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rainFx = window.RaindropFX;
  if (typeof rainFx === 'function') {
    return rainFx;
  }

  if (rainFx && typeof rainFx === 'object' && typeof rainFx.default === 'function') {
    return rainFx.default;
  }

  return null;
}

function loadRainFxScript(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Document is unavailable'));
  }

  if (getRainFxConstructor()) {
    return Promise.resolve();
  }

  if (rainFxScriptPromise) {
    return rainFxScriptPromise;
  }

  rainFxScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          rainFxScriptPromise = null;
          reject(new Error('Failed to load raindrop-fx'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = VENDOR_SRC;
    script.async = true;
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        rainFxScriptPromise = null;
        reject(new Error('Failed to load raindrop-fx'));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  return rainFxScriptPromise;
}

function resizeCanvasToCssPixels(canvas: HTMLCanvasElement): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || window.innerWidth));
  const height = Math.max(1, Math.round(rect.height || window.innerHeight));
  canvas.width = width;
  canvas.height = height;

  return { width, height };
}

function createRainBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const background = document.createElement('canvas');
  const width = Math.max(1, canvas.width || window.innerWidth);
  const height = Math.max(1, canvas.height || window.innerHeight);
  background.width = width;
  background.height = height;

  const context = background.getContext('2d');
  if (!context) {
    return background;
  }

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f9fbff');
  gradient.addColorStop(0.5, '#d9e0ea');
  gradient.addColorStop(1, '#ffffff');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(255, 255, 255, 0.36)';
  context.fillRect(width * 0.16, 0, width * 0.2, height);
  context.fillStyle = 'rgba(76, 92, 113, 0.16)';
  context.fillRect(width * 0.58, 0, width * 0.18, height);

  return background;
}

function setRainOpacity(canvas: HTMLCanvasElement, opacity: number): void {
  canvas.style.setProperty('--rain-fx-opacity', Math.min(MAX_RAIN_FX_OPACITY, Math.max(0, opacity)).toFixed(2));
}

type FallbackDrop = {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  width: number;
  drift: number;
};

function getRainVisualProfile(intensity: RainIntensity): RainVisualProfile {
  if (intensity === 'none') {
    return RAIN_VISUAL_PROFILES.light;
  }

  return RAIN_VISUAL_PROFILES[intensity];
}

function randomRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function createFallbackDrop(
  width: number,
  height: number,
  randomizeY: boolean,
  profile: RainVisualProfile,
): FallbackDrop {
  const length = randomRange(profile.fallbackLength);
  const speed = randomRange(profile.fallbackSpeed);

  return {
    x: Math.random() * width,
    y: randomizeY ? Math.random() * height : -length,
    length,
    speed,
    alpha: randomRange(profile.fallbackAlpha),
    width: randomRange(profile.fallbackWidth),
    drift: 0.24 + Math.random() * 0.18,
  };
}

function startFallbackRain(canvas: HTMLCanvasElement, profile: RainVisualProfile): FallbackRainController | null {
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  let frameId = 0;
  let previousTime = performance.now();
  let width = 1;
  let height = 1;
  let drops: FallbackDrop[] = [];

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(rect.width || window.innerWidth));
    height = Math.max(1, Math.round(rect.height || window.innerHeight));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const density = Math.min(1.6, Math.max(0.8, (width * height) / (1280 * 720)));
    const count = Math.round(profile.fallbackDropCount * density);
    drops = Array.from({ length: count }, () => createFallbackDrop(width, height, true, profile));
  };

  const render = (time: number) => {
    const delta = Math.min(2.4, Math.max(0.5, (time - previousTime) / 16.67));
    previousTime = time;

    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';

    for (const drop of drops) {
      context.beginPath();
      context.strokeStyle = `rgba(82, 113, 143, ${drop.alpha})`;
      context.lineWidth = drop.width;
      context.moveTo(drop.x, drop.y);
      context.lineTo(drop.x - drop.length * drop.drift, drop.y + drop.length);
      context.stroke();

      drop.x -= drop.speed * drop.drift * delta;
      drop.y += drop.speed * delta;

      if (drop.y - drop.length > height || drop.x < -drop.length) {
        Object.assign(drop, createFallbackDrop(width, height, false, profile));
        drop.x = Math.random() * (width + 80);
      }
    }

    frameId = window.requestAnimationFrame(render);
  };

  resize();
  frameId = window.requestAnimationFrame(render);

  return {
    resize,
    stop: () => window.cancelAnimationFrame(frameId),
  };
}

function WeatherRainEffect({ intensity }: WeatherRainEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rainFxRef = useRef<RainFxInstance | null>(null);
  const fallbackRef = useRef<FallbackRainController | null>(null);
  const rainProfile = getRainVisualProfile(intensity);

  useEffect(() => {
    const canvas = canvasRef.current;
    const fallbackCanvas = fallbackCanvasRef.current;
    if (!canvas || !fallbackCanvas) {
      return undefined;
    }

    const rainCanvas: HTMLCanvasElement = canvas;
    const fallbackRainCanvas: HTMLCanvasElement = fallbackCanvas;
    let isCancelled = false;

    async function startRain() {
      try {
        await loadRainFxScript();
        if (isCancelled) {
          return;
        }

        const RaindropFX = getRainFxConstructor();
        if (!RaindropFX) {
          throw new Error('RaindropFX constructor is unavailable');
        }

        resizeCanvasToCssPixels(rainCanvas);

        const instance = new RaindropFX({
          canvas: rainCanvas,
          background: createRainBackground(rainCanvas),
          dropletsPerSecond: rainProfile.dropletsPerSecond,
          dropletsPerSeconds: rainProfile.dropletsPerSecond,
          spawnInterval: rainProfile.spawnInterval,
          spawnSize: rainProfile.spawnSize,
          spawnLimit: rainProfile.spawnLimit,
          mist: true,
          mistColor: [0.04, 0.04, 0.05, rainProfile.mistAlpha],
          backgroundBlurSteps: 3,
          raindropCompose: 'harder',
          raindropDiffuseLight: [0.42, 0.42, 0.44],
          raindropSpecularLight: [0.78, 0.78, 0.8],
        });
        rainFxRef.current = instance;

        await instance.start?.();
        if (isCancelled) {
          instance.stop?.();
          instance.destroy?.();
          return;
        }

        setRainOpacity(rainCanvas, rainProfile.fxOpacity);
        setRainOpacity(fallbackRainCanvas, 0);
      } catch {
        if (isCancelled) {
          return;
        }

        resizeCanvasToCssPixels(fallbackRainCanvas);
        fallbackRef.current = startFallbackRain(fallbackRainCanvas, rainProfile);
        setRainOpacity(rainCanvas, 0);
        setRainOpacity(fallbackRainCanvas, fallbackRef.current ? rainProfile.fallbackOpacity : 0);
      }
    }

    const handleResize = () => {
      const size = resizeCanvasToCssPixels(rainCanvas);
      if (rainFxRef.current) {
        rainFxRef.current.resize?.(size.width, size.height);
      } else {
        fallbackRef.current?.resize();
      }
    };

    setRainOpacity(rainCanvas, 0);
    setRainOpacity(fallbackRainCanvas, 0);
    window.requestAnimationFrame(() => {
      if (!isCancelled) {
        void startRain();
      }
    });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      isCancelled = true;
      window.removeEventListener('resize', handleResize);
      rainFxRef.current?.stop?.();
      rainFxRef.current?.destroy?.();
      rainFxRef.current = null;
      fallbackRef.current?.stop();
      fallbackRef.current = null;
    };
  }, [rainProfile]);

  return (
    <div className="weather-rain" aria-hidden="true">
      <canvas ref={canvasRef} className="weather-rain__canvas" />
      <canvas ref={fallbackCanvasRef} className="weather-rain__canvas" />
    </div>
  );
}

export default WeatherRainEffect;
