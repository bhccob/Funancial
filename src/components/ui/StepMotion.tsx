import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  /**
   * Makes a step's own box a <form> (so its fields submit on Enter, and a button outside it can submit
   * it with `form={id}`) where this returns its `id` and handler. The box of a step that is leaving
   * is only a picture, never a form.
   */
  form?(key: K): { id: string; onSubmit(e: FormEvent<HTMLFormElement>): void } | undefined;
}

/**
 * Setup's slide, from the approved prototype: the new step rises 70px from below while it fades in,
 * the old one lifts 70px and fades out, and the step's lines come in 80 ms apart. Going `back`
 * reverses it. Everything moves under `motion-safe:`; for reduced motion the two steps only cross-fade.
 * When the step changes, focus goes to the new step's heading so a screen reader announces it.
 */
export function StepMotion<K extends string | number>({
  stepKey,
  direction = 'forward',
  render,
  className,
  layerClassName,
  form,
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

  // Not on the first showing: the page has only just opened. (Compared, not counted, so a strict-mode
  // second run of the effect does not look like a change.)
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(stepKey);
  useEffect(() => {
    if (shown.current === stepKey) return;
    shown.current = stepKey;
    const heading = root.current?.querySelector<HTMLElement>('[data-motion="current"] h1');
    if (!heading) return;
    // Focusable by script only; the screen is not scrolled to it while it is still rising.
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [stepKey]);

  const forward = direction === 'forward';
  const box = form?.(layers.key);
  const current = cn(
    'flex-1',
    forward ? 'motion-safe:animate-step-in-up' : 'motion-safe:animate-step-in-down',
    'motion-reduce:animate-fade-in motion-safe:stagger-lines',
    layerClassName,
  );
  return (
    <div ref={root} className={cn('relative flex flex-col', className)}>
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
      {box ? (
        <form
          key={`current-${stepKey}`}
          data-motion="current"
          id={box.id}
          onSubmit={box.onSubmit}
          noValidate
          className={current}
        >
          {render(layers.key)}
        </form>
      ) : (
        <div key={`current-${stepKey}`} data-motion="current" className={current}>
          {render(layers.key)}
        </div>
      )}
    </div>
  );
}
