import { describe, expect, it } from 'vitest';
import { drawScreen, SCREEN } from './screens';

/** A 2D context that remembers the text it was asked to draw and every method it was called with. */
function stubContext() {
  const texts: string[] = [];
  const calls: string[] = [];
  const state: Record<string, unknown> = {};
  const g = new Proxy(state, {
    get: (_target, key) => {
      if (typeof key !== 'string') return undefined;
      if (key in state) return state[key];
      return (...args: unknown[]) => {
        calls.push(key);
        if (key === 'fillText') texts.push(String(args[0]));
      };
    },
    set: (_target, key, value) => {
      state[String(key)] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, texts, calls };
}

const INDEXES = [0, 1, 2, 3] as const;

describe('SCREEN', () => {
  it('is the size of the spike phone screen', () => {
    expect(SCREEN).toEqual({ w: 540, h: 1140 });
  });
});

describe('drawScreen', () => {
  it.each(INDEXES.flatMap((index) => [0, 0.5, 1].map((progress) => [index, progress] as const)))(
    'draws screen %i at progress %f without throwing, and leaves the context as it found it',
    (index, progress) => {
      const { g, texts, calls } = stubContext();
      drawScreen(g, index, progress);
      expect(texts.length).toBeGreaterThan(0);
      expect(calls.filter((c) => c === 'save')).toHaveLength(
        calls.filter((c) => c === 'restore').length,
      );
    },
  );

  it('counts up as it goes: Home from $0.00 to $3,482.15', () => {
    const start = stubContext();
    drawScreen(start.g, 0, 0);
    expect(start.texts).toContain('$0.00');
    const end = stubContext();
    drawScreen(end.g, 0, 1);
    expect(end.texts).toEqual(expect.arrayContaining(['Home', 'Available to spend', '$3,482.15']));
  });

  it.each([
    [1, ['Budget', 'Food', 'Shopping', '62%', '108%']],
    [2, ['Buy it?', '38% a buy', 'Wait a few days', '$3,293.15']],
    [3, ['Level 12', 'Silver Budgeter', '1,840 / 2,600 XP']],
  ] as const)('shows screen %i as it ends, with the spike figures', (index, expected) => {
    const { g, texts } = stubContext();
    drawScreen(g, index, 1);
    expect(texts).toEqual(expect.arrayContaining([...expected]));
  });

  it('treats progress outside 0 to 1 like the nearest end', () => {
    const { g, texts } = stubContext();
    drawScreen(g, 0, 7);
    expect(texts).toContain('$3,482.15');
    const low = stubContext();
    drawScreen(low.g, 0, -3);
    expect(low.texts).toContain('$0.00');
  });
});
