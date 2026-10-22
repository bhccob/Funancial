import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { MOTION } from '@/lib/motion';
import { heroGlass } from './heroGlass';

export interface SegmentedControlProps<T extends string> {
  /** What the group is called to a screen reader ("Period"). */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
  tone?: 'light' | 'hero' | 'glass';
  /** Runs the width of its box, each option an equal share, rather than as wide as its labels. */
  stretch?: boolean;
  className?: string;
}

/**
 * A row of options of which one is chosen: an ink pill on the light page, a white one on the dark
 * header's glass, and the surface's own on page glass (`glass`, in a glass box such as the Cards
 * chart), with the ink on it. The chosen pill glides to the tapped option (it jumps for reduced
 * motion). Each option is a 34px button with a 44px tap area.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  tone = 'light',
  stretch = false,
  className,
}: SegmentedControlProps<T>) {
  // One id per control: a shared id would make the pill fly between controls.
  const pillId = useId();
  const hero = tone === 'hero';
  const glass = tone === 'glass';
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        stretch ? 'isolate flex w-full' : 'isolate inline-flex',
        'gap-0.5 rounded-full p-1',
        hero ? heroGlass : glass ? 'glass' : 'bg-surface-2',
        className,
      )}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            className={cn(
              'text-small press hit-44 relative h-8.5 rounded-full px-3.5 whitespace-nowrap select-none',
              stretch && 'flex-1',
            )}
          >
            {on && (
              <motion.span
                layoutId={pillId}
                aria-hidden="true"
                transition={{ duration: MOTION.small, ease: MOTION.ease }}
                // In `style`, not a class: only that radius stays round while motion stretches the pill.
                style={{ borderRadius: 9999 }}
                // The header is dark in both themes, so its pill is white; the light one is ink.
                className={cn(
                  'absolute inset-0',
                  hero
                    ? 'bg-hero-text'
                    : glass
                      ? 'bg-surface shadow-[0_2px_8px_-4px_rgb(0_0_0/0.3)]'
                      : 'bg-primary',
                )}
              />
            )}
            <span
              className={cn(
                // z-10: the label stays above the pill however far the pill sweeps across it.
                'motion-safe:ease-glass relative z-10 motion-safe:transition-colors motion-safe:duration-(--duration-small)',
                // The ones not chosen on the block's glass are in its full ink: the 88% muted line
                // falls under 4.5:1 there in some themes.
                on
                  ? hero
                    ? 'text-hero-to'
                    : glass
                      ? 'text-text'
                      : 'text-primary-contrast'
                  : hero
                    ? 'text-hero-text'
                    : 'text-muted',
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
