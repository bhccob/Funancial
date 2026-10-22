import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onBarsBackground } from '@/lib/systemBars';
import { GlassHeader } from './GlassHeader';

/** An IntersectionObserver that sits still until a test says what it sees. */
class FakeObserver {
  static all: FakeObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.all.push(this);
  }
  see(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as never);
  }
}

let heard: ReturnType<typeof vi.fn<(bg: 'dark' | 'light') => void>>;
let stop: () => void;
beforeEach(() => {
  // The light theme: what the bars say is then up to the header alone.
  document.documentElement.dataset.theme = 'light';
  FakeObserver.all = [];
  heard = vi.fn();
  stop = onBarsBackground(heard);
});
afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('GlassHeader', () => {
  it('renders its children inside the header', () => {
    const { container } = render(
      <GlassHeader>
        <h1>Profile</h1>
      </GlassHeader>,
    );
    const header = container.querySelector('[data-glass-header]');
    expect(header).toContainElement(screen.getByRole('heading', { name: 'Profile' }));
  });

  it('is the dark hero, full bleed, with the hero text colors for what is inside it', () => {
    const { container } = render(<GlassHeader className="mb-4">Hi</GlassHeader>);
    const header = container.querySelector('[data-glass-header]');
    expect(header).toHaveClass(
      'bg-hero',
      'text-hero-text',
      'rounded-b-hero',
      '[--color-text:var(--color-hero-text)]',
      '[--color-text-muted:var(--color-hero-muted)]',
      '-mx-5',
      'px-5',
      'pt-[max(1rem,env(safe-area-inset-top))]',
      'pb-7',
      'mb-4',
    );
  });

  it('is told apart from the dark body by a hairline, and only there', () => {
    const { container } = render(<GlassHeader>Hi</GlassHeader>);
    const header = container.querySelector('[data-glass-header]');
    expect(header).toHaveClass('dark:border-b', 'dark:border-border');
    expect(header).not.toHaveClass('border-b');
  });

  it('turns the status bar dark while mounted when nothing can watch the viewport, light after', () => {
    expect(heard).toHaveBeenLastCalledWith('light');

    const { unmount } = render(<GlassHeader>Hi</GlassHeader>);
    expect(heard).toHaveBeenLastCalledWith('dark');

    unmount();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  describe('with an IntersectionObserver', () => {
    beforeEach(() => vi.stubGlobal('IntersectionObserver', FakeObserver));

    it('watches the top 4% of the viewport, and the header itself', () => {
      const { container } = render(<GlassHeader>Hi</GlassHeader>);

      const [observer] = FakeObserver.all;
      expect(FakeObserver.all).toHaveLength(1);
      expect(observer?.options).toEqual({ rootMargin: '0px 0px -96% 0px' });
      expect(observer?.observe).toHaveBeenCalledExactlyOnceWith(
        container.querySelector('[data-glass-header]'),
      );
    });

    it('claims the dark top only while the header covers the top of the viewport', () => {
      render(<GlassHeader>Hi</GlassHeader>);
      const [observer] = FakeObserver.all;
      // Nothing seen yet: scrolled out of the strip, no claim.
      expect(heard).toHaveBeenLastCalledWith('light');

      observer?.see(true);
      expect(heard).toHaveBeenLastCalledWith('dark');
      observer?.see(true);
      observer?.see(false);
      expect(heard).toHaveBeenLastCalledWith('light');
      observer?.see(true);
      expect(heard).toHaveBeenLastCalledWith('dark');
    });

    it('lets go of the claim and the observer on unmount', () => {
      const { unmount } = render(<GlassHeader>Hi</GlassHeader>);
      const [observer] = FakeObserver.all;
      observer?.see(true);

      unmount();

      expect(heard).toHaveBeenLastCalledWith('light');
      expect(observer?.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
