import { act, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { toastStore } from './toast';
import { useAction } from './useAction';

beforeEach(() => toastStore.setState({ toasts: [] }));

it('shows the error in a danger toast and reports failure', async () => {
  render(<Toaster />);
  const { result } = renderHook(() => useAction());
  let ok = true;
  await act(async () => {
    ok = await result.current(async () => {
      throw new Error('Storage is full.');
    });
  });
  expect(ok).toBe(false);
  expect(screen.getByRole('alert')).toHaveTextContent('Storage is full.');
});

it('reports success and can announce it', async () => {
  render(<Toaster />);
  const { result } = renderHook(() => useAction());
  let ok = false;
  await act(async () => {
    ok = await result.current(async () => {}, { success: 'Expense saved.' });
  });
  expect(ok).toBe(true);
  expect(screen.getByText('Expense saved.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
