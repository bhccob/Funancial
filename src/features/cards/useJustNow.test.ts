import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushDialog, removeDialog } from '@/lib/dialogStack';
import { useLastSpend } from '@/store/useLastSpend';
import { useJustNow } from './useJustNow';

const MAIN = 'acct-main';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  useLastSpend.setState({ last: null });
});

/** A spend of `amount` on `accountId` that is `age` ms old now. */
const spend = (age: number, accountId = MAIN, amount = 12_50) =>
  act(() => useLastSpend.setState({ last: { accountId, amount, at: Date.now() - age } }));

/** The hook, over the ids on screen (`null`: where nothing can say, every card counts). */
const render = (onScreen: ReadonlySet<string> | null = null) =>
  renderHook(({ ids }) => useJustNow(ids), { initialProps: { ids: onScreen } });

describe('useJustNow', () => {
  it('has nothing to say until a spend is saved', () => {
    expect(render().result.current).toBeNull();
  });

  it('gives a spend under 30 seconds old, and not one that is 30 or 31 seconds old', () => {
    spend(29_999);
    expect(render().result.current).toMatchObject({ accountId: MAIN, amount: 12_50 });
    spend(30_000);
    const old = render();
    expect(old.result.current).toBeNull();
    old.unmount();
    spend(31_000);
    expect(render().result.current).toBeNull();
  });

  it('gives it for 4 seconds, then nothing', () => {
    spend(0);
    const { result } = render();
    expect(result.current).not.toBeNull();
    act(() => vi.advanceTimersByTime(3_999));
    expect(result.current).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBeNull();
  });

  it('counts the 30 seconds from the spend, not from the card coming on screen', () => {
    spend(20_000);
    const { result, rerender } = render(new Set());
    expect(result.current).toBeNull();
    // Nine seconds on, the card comes on screen: the spend is 29 seconds old.
    act(() => vi.advanceTimersByTime(9_000));
    rerender({ ids: new Set([MAIN]) });
    expect(result.current).toMatchObject({ accountId: MAIN });

    spend(20_000);
    const late = render(new Set());
    act(() => vi.advanceTimersByTime(10_000));
    late.rerender({ ids: new Set([MAIN]) });
    expect(late.result.current).toBeNull();
  });

  it('waits for the card that took the spend, not another one', () => {
    spend(0, 'visa');
    const { result, rerender } = render(new Set([MAIN]));
    expect(result.current).toBeNull();
    rerender({ ids: new Set(['visa']) });
    expect(result.current).toMatchObject({ accountId: 'visa' });
  });

  it('gives a spend one turn, and a newer spend its own', () => {
    spend(0);
    const { result, rerender } = render(new Set([MAIN]));
    act(() => vi.advanceTimersByTime(4_000));
    expect(result.current).toBeNull();
    // Away from the card and back, and a plain re-render: it has had its turn.
    rerender({ ids: new Set() });
    rerender({ ids: new Set([MAIN]) });
    rerender({ ids: new Set([MAIN]) });
    expect(result.current).toBeNull();
    spend(0, MAIN, 3_00);
    expect(result.current).toMatchObject({ amount: 3_00 });
  });

  it('waits while a sheet or dialog is open over the page', () => {
    const dialog = document.createElement('dialog');
    act(() => pushDialog(dialog));
    spend(0);
    const { result } = render();
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5_000));
    act(() => removeDialog(dialog));
    // Five seconds on, with the sheet gone: the spend is still under 30 seconds old.
    expect(result.current).toMatchObject({ accountId: MAIN });
  });
});
