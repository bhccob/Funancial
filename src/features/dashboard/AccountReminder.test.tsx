import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, linkedAccount, withAccount } from '@/test/fakeAccount';
import { AccountReminder } from './AccountReminder';

const TEXT = 'Make an account so you can move to a new phone and keep everything.';
const MOVED =
  "This phone isn't saving its copy any more, because your account was opened on another phone.";

beforeEach(() => localStorage.clear());

function home(actions = fakeAccount(), namespace: 'real' | 'demo' = 'real') {
  return renderWithStore(
    withAccount(
      actions,
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AccountReminder />} />
          <Route path="/settings" element={<p>Settings page</p>} />
        </Routes>
      </MemoryRouter>,
    ),
    createStubStore({ namespace }),
  );
}

describe('the Home reminder to make an account', () => {
  it('shows for real data that has no account', () => {
    home();
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it('never shows in the demo', () => {
    home(fakeAccount(), 'demo');
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it('does not show before the account has been read', () => {
    home(fakeAccount(null, false));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it('does not show for a phone with an account, nor one whose account moved', () => {
    home(fakeAccount(linkedAccount()));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    home(fakeAccount(linkedAccount({ status: 'moved' })));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it('is answered once: Not now hides it for good', async () => {
    const first = home();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    first.unmount();
    home();
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it('says on Home, while the account is moved, that this phone stopped saving, and links to Settings', async () => {
    home(fakeAccount(linkedAccount({ status: 'moved' })));
    const banner = screen.getByText(MOVED).closest('[role="status"]')!;
    expect(banner).toBeInTheDocument();
    await userEvent.click(
      within(banner as HTMLElement).getByRole('link', { name: 'Account settings' }),
    );
    expect(screen.getByText('Settings page')).toBeInTheDocument();
  });

  it('says nothing of a move for a linked phone, or one with no account', () => {
    home(fakeAccount(linkedAccount()));
    expect(screen.queryByText(MOVED)).not.toBeInTheDocument();
    home();
    expect(screen.queryByText(MOVED)).not.toBeInTheDocument();
  });

  it('Set up takes the person to Settings and does not come back', async () => {
    const first = home();
    await userEvent.click(screen.getByRole('link', { name: 'Set up' }));
    expect(screen.getByText('Settings page')).toBeInTheDocument();
    first.unmount();
    home();
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });
});
