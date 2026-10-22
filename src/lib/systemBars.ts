import { onThemeApplied } from './theme';

export type BarsBackground = 'dark' | 'light';

/** What the claims on the top of the screen say is there, oldest first (see `claimTop`). */
const claims: { tone: BarsBackground }[] = [];

const listeners = new Set<() => void>();

/**
 * Says the top of the screen, under the status bar, is `tone` whatever the theme, until the
 * returned function is called. The theme's block does this while it covers the top of the viewport,
 * with its own kind: a dark block keeps the status-bar icons light on it, a light block keeps them
 * dark, in either theme. Each call is its own claim, and the most recent one held is what counts
 * (the block of a screen coming in over the one going out); its release counts once however many
 * times it is called.
 */
export function claimTop(tone: BarsBackground): () => void {
  const claim = { tone };
  claims.push(claim);
  listeners.forEach((report) => report());
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    claims.splice(claims.indexOf(claim), 1);
    listeners.forEach((report) => report());
  };
}

/**
 * Runs `cb` with what is behind the status bar: what the most recent claim held says, else the
 * theme (`'dark'` on the dark theme, `'light'` on the light one). It runs once for the background as
 * it stands (when a theme is already applied) and then each time that changes, not for a change that
 * leaves it as it was. Returns an unsubscribe.
 *
 * A `cb` that throws is logged and goes no further: it is called from inside a claim, its release
 * and the theme's own listeners, and none of those may be cut short by it (a claim cut short is
 * never released, and the bars would keep its icons for the rest of the session).
 */
export function onBarsBackground(cb: (background: BarsBackground) => void): () => void {
  let themeIsDark = false;
  let last: BarsBackground | undefined;
  const report = () => {
    const background = claims.at(-1)?.tone ?? (themeIsDark ? 'dark' : 'light');
    if (background === last) return;
    last = background;
    try {
      cb(background);
    } catch (e) {
      console.error('Could not report what is behind the status bar', e);
    }
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
