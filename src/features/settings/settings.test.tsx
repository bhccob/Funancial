import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { InvalidBackupError } from '@/data/backup';
import { emptySnapshot } from '@/domain/snapshot';
import { downloadText } from '@/lib/download';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { makeExpense, makeGoal, makeProfile, makeSettings } from '@/test/fixtures';
import { SettingsScreen } from './SettingsScreen';

vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/download')>()),
  downloadText: vi.fn(),
}));

const finance = vi.hoisted(() => ({
  updateProfile: vi.fn(async () => {}),
  updateSettings: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => finance,
}));

beforeEach(() => {
  vi.mocked(downloadText).mockClear();
  finance.updateProfile.mockClear();
  finance.updateSettings.mockClear();
});

function snapshotWith(settings = makeSettings()) {
  const data = emptySnapshot();
  data.tables.settings = [settings];
  return data;
}

describe('Security', () => {
  it('setting a PIN rejects invalid and mismatched entries, then saves', async () => {
    const { store } = renderWithStore(<SettingsScreen />, createStubStore({ lockMode: 'device' }));
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    const dialog = screen.getByRole('dialog', { name: 'Set a PIN' });
    const save = within(dialog).getByRole('button', { name: 'Save' });

    await userEvent.type(within(dialog).getByLabelText('New PIN'), '12');
    await userEvent.type(within(dialog).getByLabelText('Confirm PIN'), '12');
    await userEvent.click(save);
    expect(within(dialog).getByText('Use 4 to 8 digits.')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('New PIN'));
    await userEvent.type(within(dialog).getByLabelText('New PIN'), '2468');
    await userEvent.clear(within(dialog).getByLabelText('Confirm PIN'));
    await userEvent.type(within(dialog).getByLabelText('Confirm PIN'), '2469');
    await userEvent.click(save);
    expect(within(dialog).getByText("Those don't match.")).toBeInTheDocument();
    expect(store.getState().setSecret).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText('Confirm PIN'));
    await userEvent.type(within(dialog).getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(save);
    expect(store.getState().setSecret).toHaveBeenCalledWith('2468', 'pin');
    expect(screen.queryByRole('dialog', { name: 'Set a PIN' })).not.toBeInTheDocument();
  });

  it('removing a lock checks the current PIN first', async () => {
    const verifySecret = vi.fn(async (s: string) => s === '2468');
    const { store } = renderWithStore(
      <SettingsScreen />,
      createStubStore({ lockMode: 'pin', verifySecret, data: snapshotWith() }),
    );
    expect(
      screen.getByText(
        'A PIN keeps casual snoopers out. For stronger protection, use a passphrase.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'No lock' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove lock' });
    await userEvent.type(within(dialog).getByLabelText('Current PIN'), '1111');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText("That didn't match. Try again.")).toBeInTheDocument();
    expect(store.getState().clearSecret).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText('Current PIN'));
    await userEvent.type(within(dialog).getByLabelText('Current PIN'), '2468');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(store.getState().clearSecret).toHaveBeenCalledTimes(1);
  });

  it('saves the auto-lock choice, offered only when a lock is set', async () => {
    const settings = makeSettings({ autoLockMinutes: 5 });
    const { store } = renderWithStore(
      <SettingsScreen />,
      createStubStore({ lockMode: 'pin', data: snapshotWith(settings) }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Auto-lock'), '15 minutes');
    expect(store.getState().put).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({ id: 'settings', autoLockMinutes: 15 }),
    );
  });

  it('does not offer auto-lock without a lock', () => {
    renderWithStore(
      <SettingsScreen />,
      createStubStore({ lockMode: 'device', data: snapshotWith() }),
    );
    expect(screen.queryByLabelText('Auto-lock')).not.toBeInTheDocument();
  });
});

describe('Data', () => {
  it('summarizes what is stored', () => {
    const data = snapshotWith();
    data.tables.expense = [makeExpense(), makeExpense()];
    data.tables.goal = [makeGoal()];
    renderWithStore(<SettingsScreen />, createStubStore({ data }));
    expect(screen.getByText('2 expenses · 1 goal')).toBeInTheDocument();
  });

  it('creates a backup only with matching passphrases, then downloads it', async () => {
    const { store } = renderWithStore(
      <SettingsScreen />,
      createStubStore({
        data: snapshotWith(),
        createBackup: vi.fn(async () => ({
          fileName: 'funancial-backup-2026-10-14.funbak',
          text: 'X',
        })),
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create encrypted backup' }));
    const dialog = screen.getByRole('dialog', { name: 'Create encrypted backup' });
    expect(
      within(dialog).getByText("If you forget this passphrase, the backup can't be opened."),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Backup passphrase'), 'correct horse');
    await userEvent.type(within(dialog).getByLabelText('Confirm passphrase'), 'correct hors');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create backup' }));
    expect(within(dialog).getByText("Those don't match.")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Confirm passphrase'), 'e');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create backup' }));
    expect(store.getState().createBackup).toHaveBeenCalledWith('correct horse');
    expect(downloadText).toHaveBeenCalledWith(
      'funancial-backup-2026-10-14.funbak',
      'X',
      'application/octet-stream',
    );
  });

  it('restore shows the error message from a bad file', async () => {
    const restoreBackup = vi.fn(async () => {
      throw new InvalidBackupError();
    });
    renderWithStore(<SettingsScreen />, createStubStore({ data: snapshotWith(), restoreBackup }));
    const file = new File(['not a backup'], 'notes.funbak');
    await userEvent.upload(screen.getByLabelText('Backup file'), file);
    await userEvent.type(screen.getByLabelText('Passphrase for this backup'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const confirm = screen.getByRole('dialog', { name: 'Restore this backup?' });
    expect(confirm).toHaveAccessibleDescription('It replaces all data on this device.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Restore' }));

    expect(restoreBackup).toHaveBeenCalledWith('not a backup', 'correct horse');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This file isn't a Funancial backup.",
    );
  });

  it('warns before exporting an unprotected copy', async () => {
    const { store } = renderWithStore(
      <SettingsScreen />,
      createStubStore({ data: snapshotWith() }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export unencrypted copy' }));
    const dialog = screen.getByRole('dialog', { name: 'Export an unprotected copy?' });
    expect(dialog).toHaveAccessibleDescription(
      "This file isn't protected. Anyone who gets it can read your finances.",
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    expect(store.getState().exportPlain).toHaveBeenCalledTimes(1);
    expect(downloadText).toHaveBeenCalledWith('export.json', '{}', 'application/json');
  });

  it('keeps Delete disabled until DELETE is typed', async () => {
    const { store } = renderWithStore(
      <SettingsScreen />,
      createStubStore({ data: snapshotWith() }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete all data?' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete everything' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'delete');
    expect(confirm).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText('Type DELETE to confirm'));
    await userEvent.type(within(dialog).getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(store.getState().deleteAllData).toHaveBeenCalledTimes(1);
  });

  it('in demo, offers backup and leaving demo but hides lock, restore, export and delete', () => {
    renderWithStore(
      <SettingsScreen />,
      createStubStore({ namespace: 'demo', data: snapshotWith() }),
    );
    expect(screen.getByText("Demo data isn't locked.")).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'PIN' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create encrypted backup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start with my real data' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Backup file')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export unencrypted copy' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete all data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Profile & salary' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Preferences' })).toBeInTheDocument();
  });
});

describe('Profile & salary', () => {
  it('saves a salary with its pay day', async () => {
    const data = snapshotWith();
    data.tables.profile.push(makeProfile({ name: 'Sam', salary: null }));
    renderWithStore(<SettingsScreen />, createStubStore({ data }));
    const profile = screen.getByRole('region', { name: 'Profile & salary' });
    expect(within(profile).getByLabelText('Name')).toHaveValue('Sam');
    expect(within(profile).getByLabelText('Currency')).toHaveAccessibleDescription(
      "Changing this relabels amounts; it doesn't convert them.",
    );
    await userEvent.type(within(profile).getByLabelText('Monthly take-home pay'), '4200');
    await userEvent.selectOptions(within(profile).getByLabelText('Pay day'), '25');
    await userEvent.click(within(profile).getByRole('button', { name: 'Save' }));
    expect(finance.updateProfile).toHaveBeenCalledWith({
      name: 'Sam',
      currency: 'USD',
      salary: { monthlyAmount: 420_000, payDay: 25 },
    });
  });
});

describe('Preferences', () => {
  it('saves the warning style and shows an example of it', async () => {
    renderWithStore(<SettingsScreen />, createStubStore({ data: snapshotWith() }));
    const prefs = screen.getByRole('region', { name: 'Preferences' });
    expect(
      within(prefs).getByText("Food is at 85%. A few careful days and you've got this!"),
    ).toBeInTheDocument();
    await userEvent.click(within(prefs).getByRole('radio', { name: 'Strict' }));
    expect(finance.updateSettings).toHaveBeenCalledWith({ warningTone: 'strict' });
  });

  it('saves the first day of the week', async () => {
    renderWithStore(<SettingsScreen />, createStubStore({ data: snapshotWith() }));
    await userEvent.selectOptions(screen.getByLabelText('Week starts on'), 'Sunday');
    expect(finance.updateSettings).toHaveBeenCalledWith({ weekStartsOn: 0 });
  });
});

describe('Data: unreadable items', () => {
  it('tells the user when saved items could not be read', () => {
    renderWithStore(
      <SettingsScreen />,
      createStubStore({
        data: snapshotWith(),
        skipped: [
          { table: 'expense', id: 'x', reason: 'decrypt' },
          { table: 'goal', id: 'y', reason: 'invalid' },
        ],
      }),
    );
    expect(
      screen.getByText(
        "2 saved items couldn't be read and are hidden. They're still kept on this device.",
      ),
    ).toBeInTheDocument();
  });
});

describe('Security: failures are visible', () => {
  it('shows a message when saving the PIN fails', async () => {
    renderWithStore(
      <>
        <SettingsScreen />
        <Toaster />
      </>,
      createStubStore({
        lockMode: 'device',
        setSecret: vi.fn(async () => {
          throw new Error('Storage is full.');
        }),
      }),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    const dialog = screen.getByRole('dialog', { name: 'Set a PIN' });
    await userEvent.type(within(dialog).getByLabelText('New PIN'), '2468');
    await userEvent.type(within(dialog).getByLabelText('Confirm PIN'), '2468');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full.');
  });
});
