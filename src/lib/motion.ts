import { useSyncExternalStore } from 'react';

/**
 * The glass look's timings for animations that run in JavaScript (the `motion` library), in seconds.
 * The same numbers sit in tokens.css as `:root` variables, in ms, for the CSS animations, and
 * tests/unit/tokens.test.ts holds the two together.
 */
export const MOTION = {
  /** The glass easing, as `motion` takes it; `--ease-glass` in tokens.css. */
  ease: [0.2, 0.8, 0.2, 1],
  press: 0.14,
  pressScale: 0.96,
  small: 0.22,
  standard: 0.38,
  /** How far a rising block starts below its place, in px. */
  rise: 12,
  /** The gap between one rising block and the next. */
  stagger: 0.06,
  /** The gap between one bubble of the fan and the next. */
  fanStagger: 0.05,
  countUp: 0.9,
  /** How far the + turns to become the ×, in degrees. */
  plusTurn: 135,
} as const;

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(REDUCED_QUERY);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** Without matchMedia (jsdom) nothing is known, and that reads as reduced: nothing moves there. */
const getSnapshot = () => globalThis.matchMedia?.(REDUCED_QUERY).matches ?? true;

/**
 * Whether the person asked for less motion. Our own hook, not the one in `motion/react`: that one
 * reads the preference once and keeps the answer for the whole page, and has no answer in jsdom.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
