import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { claimDarkTop } from '@/lib/systemBars';

export interface GlassHeaderProps {
  children: ReactNode;
  className?: string;
}

/**
 * The dark band at the top of a screen, the same in both themes: the hero backdrop, running out to
 * the screen's side edges and 34px round at the bottom. What is inside it reads the hero text
 * colors where it asks for `text` and `text-muted`, so the app's own components work on it as they
 * are. While it covers the top of the viewport it holds a dark claim on the status bar (see
 * `claimDarkTop`), so the bar's icons stay light on it in the light theme too.
 */
export function GlassHeader({ children, className }: GlassHeaderProps) {
  const header = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    let release: (() => void) | undefined;
    const cover = (covering: boolean) => {
      if (covering && !release) release = claimDarkTop();
      if (!covering && release) {
        release();
        release = undefined;
      }
    };
    // Nothing to watch the viewport with: be dark for as long as it is on the screen.
    if (typeof IntersectionObserver === 'undefined') {
      cover(true);
      return () => cover(false);
    }
    // The strip left after the bottom 96% of the viewport is cut away: about the status bar and a
    // little under it. The header is "at the top" while it touches that strip.
    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries.at(-1);
        if (latest) cover(latest.isIntersecting);
      },
      { rootMargin: '0px 0px -96% 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cover(false);
    };
  }, []);

  return (
    <div
      ref={header}
      data-glass-header
      className={cn(
        'bg-hero text-hero-text rounded-b-hero',
        '[--color-text-muted:var(--color-hero-muted)] [--color-text:var(--color-hero-text)]',
        // Out across main's side padding, and down behind the status bar.
        '-mx-5 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-7',
        // On the dark page the header's own dark would run into the body: a hairline sets it apart.
        'dark:border-border dark:border-b',
        className,
      )}
    >
      {children}
    </div>
  );
}
