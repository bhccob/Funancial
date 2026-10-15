import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dismiss, toast, toastStore } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
  toastStore.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

it('shows a toast and removes it after 6 seconds', () => {
  toast('success', 'Expense saved.');
  expect(toastStore.getState().toasts.map((t) => [t.tone, t.message])).toEqual([
    ['success', 'Expense saved.'],
  ]);
  vi.advanceTimersByTime(5_999);
  expect(toastStore.getState().toasts).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(toastStore.getState().toasts).toHaveLength(0);
});

it('keeps at most three, dropping the oldest', () => {
  ['a', 'b', 'c', 'd'].forEach((m) => toast('info', m));
  expect(toastStore.getState().toasts.map((t) => t.message)).toEqual(['b', 'c', 'd']);
});

it('can be dismissed early', () => {
  toast('info', 'hello');
  const [t] = toastStore.getState().toasts;
  dismiss(t!.id);
  expect(toastStore.getState().toasts).toEqual([]);
});
