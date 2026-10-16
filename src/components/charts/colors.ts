import type { Category } from '@/domain/entities';

/** How many categorical chart colours there are (`--color-chart-1..5`); "Other" has its own. */
const SERIES = 5;

/**
 * The colour of a slice. `index` is its 0-based position among the non-Other slices, so the first
 * is `--color-chart-1`, the second `--color-chart-2`, and so on; "Other" is always
 * `--color-chart-other`, wherever it stands.
 */
export function sliceColor(key: Category | 'other', index: number): string {
  if (key === 'other') return 'var(--color-chart-other)';
  return `var(--color-chart-${(index % SERIES) + 1})`;
}

/** The colour of each slice, counting the non-Other slices in order. */
export function sliceColors(slices: Array<{ key: Category | 'other' }>): string[] {
  let named = 0;
  return slices.map((s) =>
    s.key === 'other' ? sliceColor('other', 0) : sliceColor(s.key, named++),
  );
}
