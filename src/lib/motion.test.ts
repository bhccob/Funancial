// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './motion';

const QUERY = '(prefers-reduced-motion: reduce)';

/** A stand-in for matchMedia whose answer a test can change; the change reaches its listeners. */
function fakeMatchMedia(initiallyReduced: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initiallyReduced,
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
  };
  const matchMedia = vi.fn(() => mql);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    mql,
    set(reduced: boolean) {
      mql.matches = reduced;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('useReducedMotion', () => {
  it('reads as reduced where there is no matchMedia (jsdom), so nothing moves there', () => {
    expect(globalThis.matchMedia).toBeUndefined();
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('follows the prefers-reduced-motion query', () => {
    const media = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(media.matchMedia).toHaveBeenCalledWith(QUERY);
    expect(result.current).toBe(false);
    unmount();

    fakeMatchMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('updates when the preference changes, and stops listening on unmount', () => {
    const media = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(media.mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
