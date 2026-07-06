type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 18,
  heavy: 30,
  success: [10, 40, 10],
  warning: [20, 40, 20],
};

export function triggerHaptic(pattern: HapticPattern = 'light'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }

  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw if called from non-user-gesture; ignore silently.
  }
}
