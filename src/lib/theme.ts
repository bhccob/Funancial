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

/** Applies the theme to <html data-theme> and follows OS changes. Returns an unsubscribe. */
export function initTheme(): () => void {
  const media = globalThis.matchMedia?.(DARK_QUERY);
  const apply = () => {
    document.documentElement.dataset.theme = resolveTheme(
      getThemePreference(),
      media?.matches ?? false,
    );
  };
  apply();
  applyCurrent = apply;
  media?.addEventListener('change', apply);
  return () => {
    media?.removeEventListener('change', apply);
    if (applyCurrent === apply) applyCurrent = null;
  };
}
