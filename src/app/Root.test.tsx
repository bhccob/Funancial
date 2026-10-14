import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { DemoBanner } from './DemoBanner';
import { Root } from './Root';

describe('Root', () => {
  it('shows a loading state while booting', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'booting' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('explains when storage is unavailable', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'unavailable' }));
    expect(
      screen.getByRole('heading', { level: 1, name: "Funancial can't save data here" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your browser is blocking storage (this can happen in private windows). Open Funancial in a normal window to continue.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the welcome screen on first run', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'welcome' }));
    expect(screen.getByRole('button', { name: 'Try with demo money' })).toBeInTheDocument();
  });

  it('shows the lock screen when locked', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'locked', lockMode: 'pin' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows the app when unlocked', async () => {
    renderWithStore(<Root />, createStubStore({ phase: 'unlocked' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
  });
});

describe('DemoBanner', () => {
  it('is absent with real data', () => {
    renderWithStore(<DemoBanner />, createStubStore({ namespace: 'real' }));
    expect(screen.queryByText("You're using demo money.")).not.toBeInTheDocument();
  });

  it('asks before leaving demo, and only leaves on confirm', async () => {
    const { store } = renderWithStore(<DemoBanner />, createStubStore({ namespace: 'demo' }));
    expect(screen.getByText("You're using demo money.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start with my real data' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave demo?' });
    expect(dialog).toHaveAccessibleDescription(
      "Demo data will be deleted. Your real data isn't affected.",
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(store.getState().exitDemo).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Start with my real data' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave demo' }));
    expect(store.getState().exitDemo).toHaveBeenCalledTimes(1);
  });
});

describe('Root across lock cycles', () => {
  it('reuses one router instead of creating a new one per unlock', async () => {
    const routerModule = await import('./router');
    const spy = vi.spyOn(routerModule, 'createAppRouter');
    const store = createStubStore({ phase: 'unlocked' });
    renderWithStore(<Root />, store);
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    act(() => store.setState({ phase: 'locked', lockMode: 'pin' }));
    act(() => store.setState({ phase: 'unlocked' }));
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    act(() => store.setState({ phase: 'locked' }));
    act(() => store.setState({ phase: 'unlocked' }));
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });

  it('shows toasts on every screen', () => {
    renderWithStore(<Root />, createStubStore({ phase: 'welcome' }));
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
