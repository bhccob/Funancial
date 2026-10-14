import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
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
