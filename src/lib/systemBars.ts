import { onThemeApplied } from './theme';

export type BarsBackground = 'dark' | 'light';

/** How many things are holding the top of the screen dark right now (see `claimDarkTop`). */
let claims = 0;

const listeners = new Set<() => void>();

/**
 * Says the top of the screen, under the status bar, is dark whatever the theme, until the returned
 * function is called. The glass header does this while it covers the top of the viewport, so the
 * status-bar icons stay light on it in the light theme. Each call is its own claim, and its
 * release counts once however many times it is called.
 */
export function claimDarkTop(): () => void {
  claims += 1;
  listeners.forEach((report) => report());
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    claims -= 1;
    listeners.forEach((report) => report());
  };
}

/**
 * Runs `cb` with what is behind the status bar: `'dark'` when the theme is dark or any claim is
 * held, else `'light'`. It runs once for the background as it stands (when a theme is already
 * applied) and then each time that changes, not for a change that leaves it as it was. Returns an
 * unsubscribe.
 */
export function onBarsBackground(cb: (background: BarsBackground) => void): () => void {
  let themeIsDark = false;
  let last: BarsBackground | undefined;
  const report = () => {
    const background = themeIsDark || claims > 0 ? 'dark' : 'light';
    if (background === last) return;
    last = background;
    cb(background);
  };
  const stopTheme = onThemeApplied((dark) => {
    themeIsDark = dark;
    report();
  });
  listeners.add(report);
  return () => {
    stopTheme();
    listeners.delete(report);
  };
}
