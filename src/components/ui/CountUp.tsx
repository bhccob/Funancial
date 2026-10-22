import { animate } from 'motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MOTION, useReducedMotion } from '@/lib/motion';

/** Ease-out-quart: quick at first, then settling slowly onto the number. */
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export interface CountUpProps {
  value: number;
  /** Turns a number into what is shown, e.g. as money. It is only ever given whole numbers. */
  format(n: number): ReactNode;
  /** In seconds. */
  duration?: number;
  className?: string;
}

/**
 * A number that counts to `value`: from 0 when it first shows, and from the number last shown when
 * `value` changes. While it counts, a screen reader skips the moving number and reads the final one
 * from a hidden copy; once it has arrived it is one plain span. For reduced motion it is the final
 * number at once.
 */
export function CountUp({ value, format, duration = MOTION.countUp, className }: CountUpProps) {
  const reduced = useReducedMotion();
  // What is on screen now, not rounded. A ref beside the state, so a new animation can start from it
  // without restarting for every frame.
  const [shown, setShown] = useState(reduced ? value : 0);
  const last = useRef(shown);

  useEffect(() => {
    if (reduced || last.current === value) return;
    const counting = animate(last.current, value, {
      duration,
      ease: EASE_OUT_QUART,
      onUpdate: (n) => {
        last.current = n;
        setShown(n);
      },
      onComplete: () => {
        last.current = value;
        setShown(value);
      },
    });
    return () => counting.stop();
  }, [value, reduced, duration]);

  if (reduced || shown === value) {
    return <span className={className}>{format(Math.round(value))}</span>;
  }
  return (
    <span className={className}>
      <span aria-hidden>{format(Math.round(shown))}</span>
      <span className="sr-only">{format(Math.round(value))}</span>
    </span>
  );
}
