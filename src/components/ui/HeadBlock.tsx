import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useBlockTone } from '@/features/game/useGameTheme';
import { cn } from '@/lib/cn';
import { claimTop } from '@/lib/systemBars';

export interface HeadBlockProps {
  children: ReactNode;
  className?: string;
}

/**
 * The theme's block at the top of a screen, the same in both modes: its color with the glowing
 * shapes in it, running out to the screen's side edges and 36px round at the bottom, with room under
 * what is inside for a piece to hang over its edge. What is inside it reads the block's ink where it
 * asks for `text` and `text-muted`, so the app's own components work on it as they are; the muted
 * line is the full ink too, as the 88% mix is too faint on the glass of some blocks. It names its
 * kind in `data-block-tone`, for what inside it is drawn by kind (the cards' veil). While it covers
 * the top of the viewport it claims the status bar for its kind (see `claimTop`), so the bar's icons
 * are light on a dark block and dark on a light one, whatever the mode.
 */
export function HeadBlock({ children, className }: HeadBlockProps) {
  const block = useRef<HTMLDivElement>(null);
  const tone = useBlockTone();
  // With nothing to watch the viewport with, it covers the top for as long as it is on the screen.
  const [covering, setCovering] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = block.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    // False once unmounted: an entry the observer queued just before is still delivered after the
    // disconnect, and must not take a claim nothing is left to release.
    let live = true;
    // The strip left after the bottom 96% of the viewport is cut away: about the status bar and a
    // little under it. The block is "at the top" while it touches that strip.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!live) return;
        const latest = entries.at(-1);
        if (latest) setCovering(latest.isIntersecting);
      },
      { rootMargin: '0px 0px -96% 0px' },
    );
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, []);

  // The claim follows what the block covers and its kind. A theme changed while it covers the top
  // trades one claim for the other in the same commit, so the bars never stop at the mode between.
  useEffect(() => {
    if (!covering) return;
    return claimTop(tone);
  }, [covering, tone]);

  return (
    <div
      ref={block}
      data-head-block
      data-block-tone={tone}
      className={cn(
        'bg-head text-head-ink rounded-b-hero',
        '[--color-text-muted:var(--color-head-ink)] [--color-text:var(--color-head-ink)]',
        // Out across main's side padding, and down behind the status bar.
        '-mx-5 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[60px]',
        // On the dark page a dark block would run into the body: a hairline sets it apart.
        'dark:border-border dark:border-b',
        className,
      )}
    >
      {children}
    </div>
  );
}
