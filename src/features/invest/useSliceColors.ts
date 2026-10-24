import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { sliceColors } from '@/components/charts/colors';
import type { Slice } from '@/domain/charts';
import { cachedLogoColor, pickRingColors } from '@/lib/logoColor';

/** How many times the theme or the mode has been applied to <html>, for a render to follow. */
let applied = 0;

function onApplied(notify: () => void): () => void {
  const observer = new MutationObserver(() => {
    applied += 1;
    notify();
  });
  // The mode (`data-theme`, light or dark) and the Shop theme (`data-game-theme`): the two things
  // that change what the page's colour and the chart series are.
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-game-theme'],
  });
  return () => observer.disconnect();
}

/** `var(--name)` as <html> has it now, as the colour it stands for; anything else, or what has no value, as it is. */
function resolved(styles: CSSStyleDeclaration, css: string): string {
  const name = /^var\((--[\w-]+)\)$/.exec(css)?.[1];
  return (name && styles.getPropertyValue(name).trim()) || css;
}

/**
 * The colour of each of a pie's slices: the colour its company's logo gave (`report` it once the
 * logo has loaded) where that holds 3:1 against the page in the theme and mode now showing and
 * stands apart from the slices beside it (`pickRingColors`), else the slice's chart colour. One pie
 * may mix the two. The colours are `#rrggbb` where the page's tokens can be read, so a badge can
 * choose its ink on them, and follow a change of theme or mode; where they cannot (no style sheet),
 * a chart colour stays the `var()` it is.
 *
 * `symbolOf` says which logo a slice (by key) is of, so a logo sampled earlier in the session, by
 * another pie, colours its slice from the first render rather than after it loads again.
 */
export function useSliceColors(
  slices: readonly Slice[],
  symbolOf: (key: string) => string | undefined,
): { colors: string[]; report(key: string, color: string | null): void } {
  const theme = useSyncExternalStore(onApplied, () => applied);
  const [sampled, setSampled] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      slices.flatMap((slice) => {
        const symbol = symbolOf(slice.key);
        const known = symbol === undefined ? undefined : cachedLogoColor(symbol.toUpperCase());
        return known === undefined ? [] : [[slice.key, known] as const];
      }),
    ),
  );

  const report = useCallback((key: string, color: string | null) => {
    setSampled((now) => (now[key] === color ? now : { ...now, [key]: color }));
  }, []);

  const colors = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const chart = sliceColors([...slices]).map((css) => resolved(styles, css));
    return pickRingColors(
      slices.map((slice) => sampled[slice.key]),
      chart,
      styles.getPropertyValue('--color-bg').trim(),
    );
    // `theme` is no input of the colours but the reason to read the page's again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices, sampled, theme]);

  return { colors, report };
}
