import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { WelcomeScreen } from './WelcomeScreen';

it('introduces the app and its promise', () => {
  renderWithStore(<WelcomeScreen />, createStubStore({ phase: 'welcome' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Funancial' })).toBeInTheDocument();
  expect(screen.getByText('Level up your real financial life.')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Funancial is a personal tracking tool, not financial advice. Your data stays on this device.',
    ),
  ).toBeInTheDocument();
});

it('starts demo mode', async () => {
  const { store } = renderWithStore(<WelcomeScreen />, createStubStore({ phase: 'welcome' }));
  await userEvent.click(screen.getByRole('button', { name: 'Try with demo money' }));
  expect(store.getState().startDemo).toHaveBeenCalledTimes(1);
  expect(store.getState().startFresh).not.toHaveBeenCalled();
});

it('starts with real data', async () => {
  const { store } = renderWithStore(<WelcomeScreen />, createStubStore({ phase: 'welcome' }));
  await userEvent.click(screen.getByRole('button', { name: 'Start with my real data' }));
  expect(store.getState().startFresh).toHaveBeenCalledTimes(1);
});

it('tells the user when starting fails instead of doing nothing', async () => {
  const store = createStubStore({
    phase: 'welcome',
    startFresh: vi.fn(async () => {
      throw new Error('This browser blocks encryption here.');
    }),
  });
  renderWithStore(
    <>
      <WelcomeScreen />
      <Toaster />
    </>,
    store,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Start with my real data' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This browser blocks encryption here.',
  );
  expect(screen.getByRole('button', { name: 'Start with my real data' })).toBeEnabled();
});
