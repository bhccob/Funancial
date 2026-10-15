import { safeStorage } from './safeStorage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'funancial.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

export function getThemePreference(): ThemePreference {
  const stored = safeStorage.get(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

/** Set by initTheme so a preference change applies immediately. */
let applyCurrent: (() => void) | null = null;

export function setThemePreference(preference: ThemePreference): void {
  safeStorage.set(STORAGE_KEY, preference);
  applyCurrent?.();
}

const themeListeners = new Set<(dark: boolean) => void>();

/**
 * Runs `cb` with whether the theme is dark each time it is applied to the page, and once for the
 * theme already on it (the Android shell starts after the first one). Returns an unsubscribe.
 */
export function onThemeApplied(cb: (dark: boolean) => void): () => void {
  themeListeners.add(cb);
  const current = document.documentElement.dataset.theme;
  if (current) cb(current === 'dark');
  return () => void themeListeners.delete(cb);
}

/** Applies the theme to <html data-theme> and follows OS changes. Returns an unsubscribe. */
export function initTheme(): () => void {
  const media = globalThis.matchMedia?.(DARK_QUERY);
  const apply = () => {
    const theme = resolveTheme(getThemePreference(), media?.matches ?? false);
    document.documentElement.dataset.theme = theme;
    themeListeners.forEach((cb) => cb(theme === 'dark'));
  };
  apply();
  applyCurrent = apply;
  media?.addEventListener('change', apply);
  return () => {
    media?.removeEventListener('change', apply);
    if (applyCurrent === apply) applyCurrent = null;
  };
}
