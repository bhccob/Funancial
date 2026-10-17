import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

type Hue = 'blue' | 'violet' | 'mint' | 'peach' | 'green';

/** [light page, dark page]: the prototype's pastels, and dimmer ones that glow on the dark page instead of shining. */
const HUES: Record<Hue, [string, string]> = {
  blue: ['#c9dbff', '#2c4a8f'],
  violet: ['#e3d2ff', '#4b3392'],
  mint: ['#d9f1e4', '#1f6b50'],
  peach: ['#ffe2c4', '#8a5a2b'],
  green: ['#b7f0cf', '#1f7a52'],
};

/** What each step is lit with, one hue per blob: the colours change a little with every step. */
const STEPS: Array<[Hue, Hue]> = [
  ['blue', 'violet'],
  ['mint', 'blue'],
  ['peach', 'violet'],
  ['blue', 'mint'],
  ['violet', 'peach'],
  ['mint', 'violet'],
  ['green', 'blue'],
];

const blob =
  'absolute rounded-full bg-(--blob-light) blur-[40px] opacity-50 dark:bg-(--blob-dark) dark:opacity-50 ' +
  'motion-safe:transition-[transform,background-color] motion-safe:duration-900 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)] ' +
  'motion-safe:animate-blob-drift';

const tint = (hue: Hue, shift: string): CSSProperties =>
  ({
    '--blob-light': HUES[hue][0],
    '--blob-dark': HUES[hue][1],
    transform: shift,
  }) as CSSProperties;

/**
 * Two soft colour shapes behind a screen, like the download page's. They drift slowly (under
 * `motion-safe:`) and, with `step`, move and change colour a little each step. Decoration only; the
 * screen around it must be `relative isolate overflow-hidden`.
 */
export function Blobs({ step = 0 }: { step?: number }) {
  const i = Math.max(0, Math.min(Math.trunc(step), STEPS.length - 1));
  const [first, second] = STEPS[i] as [Hue, Hue];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span
        data-blob
        className={cn(blob, '-top-20 -left-[90px] size-[260px]')}
        style={tint(first, `translate(${i * 14}px, ${i * 22}px)`)}
      />
      <span
        data-blob
        className={cn(
          blob,
          'top-[38%] -right-[90px] size-[220px] motion-safe:[animation-direction:alternate-reverse] motion-safe:[animation-duration:23s]',
        )}
        style={tint(second, `translate(${-i * 12}px, ${-i * 18}px)`)}
      />
    </div>
  );
}
