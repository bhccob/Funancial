import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type StepDirection = 'forward' | 'back';

/** A little longer than the 620 ms slide, so the old step goes only once it has finished leaving. */
const LEAVE_MS = 650;

export interface StepMotionProps<K extends string | number> {
  /** Which step is showing; a new value slides the step in. */
  stepKey: K;
  /** `back` reverses the slide: the step comes down from above and the old one leaves downward. */
  direction?: StepDirection;
  /** The step's lines. Called again for the step that is leaving, so it shows as it is now. */
  render(key: K): ReactNode;
  className?: string;
  /** Classes of the step's own box: put the lines in a column here. They stagger as its children. */
  layerClassName?: string;
}

/**
 * Setup's slide, from the approved prototype: the new step rises 70px from below while it fades in,
 * the old one lifts 70px and fades out, and the step's lines come in 80 ms apart. Going `back`
 * reverses it. Everything moves under `motion-safe:`; for reduced motion the two steps only cross-fade.
 */
export function StepMotion<K extends string | number>({
  stepKey,
  direction = 'forward',
  render,
  className,
  layerClassName,
}: StepMotionProps<K>) {
  const [layers, setLayers] = useState<{ key: K; leaving: K | null }>({
    key: stepKey,
    leaving: null,
  });
  // The step that was showing is the one leaving (state set while rendering is how React follows a prop's change).
  if (layers.key !== stepKey) setLayers({ key: stepKey, leaving: layers.key });

  useEffect(() => {
    if (layers.leaving === null) return;
    const gone = setTimeout(() => setLayers((l) => ({ ...l, leaving: null })), LEAVE_MS);
    return () => clearTimeout(gone);
  }, [layers]);

  const forward = direction === 'forward';
  return (
    <div className={cn('relative flex flex-col', className)}>
      {layers.leaving !== null && (
        <div
          key={`leaving-${layers.leaving}`}
          data-motion="leaving"
          aria-hidden
          inert
          className={cn(
            'pointer-events-none absolute inset-0',
            forward ? 'motion-safe:animate-step-out-up' : 'motion-safe:animate-step-out-down',
            'motion-reduce:animate-fade-out',
            layerClassName,
          )}
        >
          {render(layers.leaving)}
        </div>
      )}
      <div
        key={`current-${stepKey}`}
        data-motion="current"
        className={cn(
          'flex-1',
          forward ? 'motion-safe:animate-step-in-up' : 'motion-safe:animate-step-in-down',
          'motion-reduce:animate-fade-in motion-safe:stagger-lines',
          layerClassName,
        )}
      >
        {render(layers.key)}
      </div>
    </div>
  );
}
