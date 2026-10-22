import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { purchaseEntry } from '@/domain/game/shop';
import { emptySnapshot } from '@/domain/snapshot';
import { onBarsBackground } from '@/lib/systemBars';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeSettings } from '@/test/fixtures';
import { HeadBlock } from './HeadBlock';

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
    act(() => this.callback([{ isIntersecting } as IntersectionObserverEntry], this as never));
  }
}

/** A store wearing `theme`, bought, so it is the one equipped. */
function wearing(theme: string) {
  const data = emptySnapshot();
  data.tables.settings = [
    makeSettings({ cosmetics: { theme, avatar: 'avatar-sprout', frame: 'frame-none' } }),
  ];
  data.tables.ledger = [purchaseEntry(theme, 'p1', '2026-10-01T10:00:00.000Z')];
  return createStubStore({ data });
}

const block = (container: HTMLElement) => container.querySelector('[data-head-block]');

let heard: ReturnType<typeof vi.fn<(bg: 'dark' | 'light') => void>>;
let stop = () => {};
/** Puts the page in `mode` and listens to the bars from there. */
function listenIn(mode: 'light' | 'dark') {
  stop();
  document.documentElement.dataset.theme = mode;
  heard = vi.fn();
  stop = onBarsBackground(heard);
}
beforeEach(() => {
  FakeObserver.all = [];
  // The light theme: what the bars say is then up to the block alone.
  listenIn('light');
});
afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('HeadBlock', () => {
  it('renders its children inside the block', () => {
    const { container } = renderWithStore(
      <HeadBlock>
        <h1>Profile</h1>
      </HeadBlock>,
    );
    expect(block(container)).toContainElement(screen.getByRole('heading', { name: 'Profile' }));
  });

  it("is the theme's block, full bleed, round at the bottom, with the block's ink for what is inside it", () => {
    const { container } = renderWithStore(<HeadBlock className="mb-4">Hi</HeadBlock>);
    expect(block(container)).toHaveClass(
      'bg-head',
      'text-head-ink',
      'rounded-b-hero',
      'pb-[60px]',
      // Both text colors are the full ink: the muted mix fails on the glass of some blocks.
      '[--color-text:var(--color-head-ink)]',
      '[--color-text-muted:var(--color-head-ink)]',
      '-mx-5',
      'px-5',
      'pt-[max(1rem,env(safe-area-inset-top))]',
      'mb-4',
    );
  });

  it('has less room under it with compact, for a block with nothing hanging over its edge', () => {
    const { container } = renderWithStore(<HeadBlock compact>Hi</HeadBlock>);
    expect(block(container)).toHaveClass('pb-[22px]');
    expect(block(container)).not.toHaveClass('pb-[60px]');
  });

  it('is told apart from the dark body by a hairline, and only there', () => {
    const { container } = renderWithStore(<HeadBlock>Hi</HeadBlock>);
    expect(block(container)).toHaveClass('dark:border-b', 'dark:border-border');
    expect(block(container)).not.toHaveClass('border-b');
  });

  it('turns the status bar dark while mounted when nothing can watch the viewport, light after', () => {
    expect(heard).toHaveBeenLastCalledWith('light');

    const { unmount } = renderWithStore(<HeadBlock>Hi</HeadBlock>);
    expect(heard).toHaveBeenLastCalledWith('dark');

    unmount();
    expect(heard).toHaveBeenLastCalledWith('light');
  });

  describe('with an IntersectionObserver', () => {
    beforeEach(() => vi.stubGlobal('IntersectionObserver', FakeObserver));

    it('watches the top 4% of the viewport, and the block itself', () => {
      const { container } = renderWithStore(<HeadBlock>Hi</HeadBlock>);

      const [observer] = FakeObserver.all;
      expect(FakeObserver.all).toHaveLength(1);
      expect(observer?.options).toEqual({ rootMargin: '0px 0px -96% 0px' });
      expect(observer?.observe).toHaveBeenCalledExactlyOnceWith(block(container));
    });

    it('claims the top only while the block covers the top of the viewport', () => {
      renderWithStore(<HeadBlock>Hi</HeadBlock>);
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
      const { unmount } = renderWithStore(<HeadBlock>Hi</HeadBlock>);
      const [observer] = FakeObserver.all;
      observer?.see(true);

      unmount();

      expect(heard).toHaveBeenLastCalledWith('light');
      expect(observer?.disconnect).toHaveBeenCalledTimes(1);
    });

    it('takes no claim for an entry that arrives after unmount', () => {
      const { unmount } = renderWithStore(<HeadBlock>Hi</HeadBlock>);
      const [observer] = FakeObserver.all;

      unmount();
      // Queued before the disconnect, delivered after it: a disconnect does not drop it.
      observer?.see(true);

      expect(heard).toHaveBeenLastCalledWith('light');
    });
  });
});

describe('HeadBlock on each kind of block', () => {
  it('claims dark for Black & White, the default, so the icons are light on it', () => {
    renderWithStore(<HeadBlock>Hi</HeadBlock>);
    expect(heard).toHaveBeenLastCalledWith('dark');
  });

  it('claims dark for a dark theme in the light mode', () => {
    renderWithStore(<HeadBlock>Hi</HeadBlock>, wearing('theme-navy'));
    expect(heard).toHaveBeenLastCalledWith('dark');
  });

  it('claims light for a light block, even in the dark mode, so the icons are dark on it', () => {
    // Dark with no claim: the claim is what turns it light.
    listenIn('dark');
    expect(heard).toHaveBeenLastCalledWith('dark');

    const { unmount } = renderWithStore(<HeadBlock>Hi</HeadBlock>, wearing('theme-sky'));
    expect(heard).toHaveBeenLastCalledWith('light');

    unmount();
    expect(heard).toHaveBeenLastCalledWith('dark');
  });

  it('swaps its claim when the theme changes under it, with no stop at the mode between', () => {
    listenIn('dark');
    const store = wearing('theme-sky');
    renderWithStore(<HeadBlock>Hi</HeadBlock>, store);
    expect(heard).toHaveBeenLastCalledWith('light');
    heard.mockClear();

    act(() => store.setState({ data: wearing('theme-forest').getState().data }));

    expect(heard.mock.calls).toEqual([['dark']]);
  });
});
