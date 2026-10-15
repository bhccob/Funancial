import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Platform } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';
import { StorageUnavailable } from './StorageUnavailable';

afterEach(() => vi.unstubAllGlobals());

function renderOn(kind: Platform['kind']) {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  render(
    <PlatformProvider platform={{ ...createWebPlatform(), kind }}>
      <StorageUnavailable />
    </PlatformProvider>,
  );
  return { reload };
}

describe('StorageUnavailable', () => {
  it('on the web, says the browser is blocking storage', async () => {
    const { reload } = renderOn('web');

    expect(
      screen.getByRole('heading', { level: 1, name: "Funancial can't save data here" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your browser is blocking storage (this can happen in private windows). Open Funancial in a normal window to continue.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("on the phone, says the encrypted storage couldn't be opened and that the data is safe", async () => {
    const { reload } = renderOn('android');

    expect(
      screen.getByRole('heading', { level: 1, name: "Funancial can't open its storage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Something went wrong opening Funancial's encrypted storage on this phone. Close Funancial completely and open it again. Your data stays on this phone.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/browser/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
