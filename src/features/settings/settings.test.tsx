import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { InvalidBackupError } from '@/data/backup';
import type { ReminderSettings } from '@/domain/entities';
import { currencyOptions } from '@/features/shared/currencies';
import { emptySnapshot } from '@/domain/snapshot';
import { downloadText } from '@/lib/download';
import { toastStore } from '@/lib/toast';
import { PlatformProvider } from '@/platform/PlatformProvider';
import type { Platform } from '@/platform/types';
import { createWebPlatform } from '@/platform/web';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { fakeNotifier, onPhone, type FakeNotifier } from '@/test/fakeNotifier';
import { makeExpense, makeGoal, makeProfile, makeSettings } from '@/test/fixtures';
import { SettingsScreen } from './SettingsScreen';

vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/download')>()),
  downloadText: vi.fn(),
}));

const finance = vi.hoisted(() => ({
  changeCurrency: vi.fn<(currency: string) => Promise<void>>(async () => {}),
  updateProfile: vi.fn(async () => {}),
  updateSettings: vi.fn(async () => {}),
}));
vi.mock('@/store/useFinance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useFinance')>()),
  useFinanceActions: () => finance,
}));

const invest = vi.hoisted(() => ({ refreshMarket: vi.fn(async () => 'ok' as const) }));
vi.mock('@/store/useInvest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useInvest')>()),
  useInvestActions: () => invest,
}));

beforeEach(() => {
  toastStore.setState({ toasts: [] });
  vi.mocked(downloadText).mockClear();
  finance.changeCurrency.mockClear();
  invest.refreshMarket.mockClear();
  finance.updateProfile.mockClear();
  finance.updateSettings.mockClear();
});

function snapshotWith(settings = makeSettings()) {
  const data = emptySnapshot();
  data.tables.settings = [settings];
  return data;
}

type Save = Platform['files']['save'];

/** A `files.save` that ends the way the person's choice in the share sheet did. */
const savingTo = (outcome: Awaited<ReturnType<Save>>) => vi.fn<Save>(async () => outcome);

/** `ui` on a web platform whose files go to `save`. */
function onPlatform(save: Save, ui: ReactElement) {
  return (
    <PlatformProvider platform={{ ...createWebPlatform(), files: { save } }}>{ui}</PlatformProvider>
  );
}

async function openBackupDialog() {
  await userEvent.click(screen.getByRole('button', { name: 'Create encrypted backup' }));
  return screen.getByRole('dialog', { name: 'Create encrypted backup' });
}

async function createBackupIn(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText('Backup passphrase'), 'correct horse');
  await userEvent.type(within(dialog).getByLabelText('Confirm passphrase'), 'correct horse');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create backup' }));
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

  it('turns biometric unlock on and off when a PIN is set', async () => {
    const store = createStubStore({ lockMode: 'pin', biometric: 'off', data: snapshotWith() });
    store.setState({
      enableBiometric: vi.fn(async () => store.setState({ biometric: 'on' })),
      disableBiometric: vi.fn(async () => store.setState({ biometric: 'off' })),
    });
    renderWithStore(<SettingsScreen />, store);
    const toggle = screen.getByRole('switch', { name: 'Unlock with fingerprint or face' });
    expect(toggle).toHaveAccessibleDescription('Your PIN still works if this fails.');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);
    expect(store.getState().enableBiometric).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(toggle);
    expect(store.getState().disableBiometric).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('hides biometric unlock without a lock or on the web', () => {
    const name = 'Unlock with fingerprint or face';
    const { unmount } = renderWithStore(
      <SettingsScreen />,
      createStubStore({ lockMode: 'device', biometric: 'off', data: snapshotWith() }),
    );
    expect(screen.queryByRole('switch', { name })).not.toBeInTheDocument();
    unmount();

    renderWithStore(
      <SettingsScreen />,
      createStubStore({ lockMode: 'pin', biometric: 'unavailable', data: snapshotWith() }),
    );
    expect(screen.queryByRole('switch', { name })).not.toBeInTheDocument();
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
          fileName: 'funcial-backup-2026-10-14.funbak',
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
    expect(store.getState().markBackedUp).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Confirm passphrase'), 'e');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create backup' }));
    expect(store.getState().createBackup).toHaveBeenCalledWith('correct horse');
    expect(downloadText).toHaveBeenCalledWith(
      'funcial-backup-2026-10-14.funbak',
      'X',
      'application/octet-stream',
    );
    await vi.waitFor(() => expect(store.getState().markBackedUp).toHaveBeenCalledTimes(1));
  });

  it('saves the backup through the platform, then records it and closes', async () => {
    const save = savingTo('saved');
    const store = createStubStore({
      data: snapshotWith(),
      createBackup: vi.fn(async () => ({
        fileName: 'funcial-backup-2026-10-15.funbak',
        text: 'ENCRYPTED',
      })),
    });
    renderWithStore(onPlatform(save, <SettingsScreen />), store);
    const dialog = await openBackupDialog();
    await createBackupIn(dialog);

    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledExactlyOnceWith(
        'funcial-backup-2026-10-15.funbak',
        'ENCRYPTED',
        'application/octet-stream',
      ),
    );
    await vi.waitFor(() => expect(store.getState().markBackedUp).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('dialog', { name: 'Create encrypted backup' }),
    ).not.toBeInTheDocument();
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('keeps the backup dialog open, and unrecorded, when the share sheet was cancelled', async () => {
    const save = savingTo('cancelled');
    const { store } = renderWithStore(
      onPlatform(save, <SettingsScreen />),
      createStubStore({ data: snapshotWith() }),
    );
    const dialog = await openBackupDialog();
    await createBackupIn(dialog);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Nothing was saved. Choose where to save your backup to finish.',
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getState().markBackedUp).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Create encrypted backup' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Backup passphrase')).toHaveValue('correct horse');
    expect(within(dialog).getByLabelText('Confirm passphrase')).toHaveValue('correct horse');
  });

  it('records the backup when a retry after a cancelled share is saved', async () => {
    const save = vi.fn<Save>().mockResolvedValueOnce('cancelled').mockResolvedValueOnce('saved');
    const { store } = renderWithStore(
      onPlatform(save, <SettingsScreen />),
      createStubStore({ data: snapshotWith() }),
    );
    const dialog = await openBackupDialog();
    await createBackupIn(dialog);
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create backup' }));

    await vi.waitFor(() => expect(store.getState().markBackedUp).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole('dialog', { name: 'Create encrypted backup' }),
    ).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('keeps the backup dialog open and says why when the file cannot be saved', async () => {
    const save = vi.fn<Save>(async () => {
      throw new Error('No space left on device');
    });
    const { store } = renderWithStore(
      onPlatform(save, <SettingsScreen />),
      createStubStore({ data: snapshotWith() }),
    );
    const dialog = await openBackupDialog();
    await createBackupIn(dialog);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No space left on device');
    expect(store.getState().markBackedUp).not.toHaveBeenCalled();
  });

  it.each([
    ['Export unencrypted copy', 'export.json', '{}', 'application/json'],
    [
      'Export expenses (CSV)',
      'funcial-expenses-2026-10-14.csv',
      'date,amount,currency,category,payment_method,card,note,subscription\r\n',
      'text/csv',
    ],
  ])('saves "%s" through the platform, shared or not', async (label, fileName, text, mime) => {
    const save = savingTo('cancelled');
    const { store } = renderWithStore(
      onPlatform(save, <SettingsScreen />),
      createStubStore({ data: snapshotWith(), today: '2026-10-14' }),
    );
    await userEvent.click(screen.getByRole('button', { name: label }));
    const dialog = screen.getByRole('dialog', { name: 'Export an unprotected copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith(fileName, text, mime));
    expect(downloadText).not.toHaveBeenCalled();
    expect(store.getState().markBackedUp).not.toHaveBeenCalled();
  });

  it('shows a message when an export cannot be saved', async () => {
    const save = vi.fn<Save>(async () => {
      throw new Error('No space left on device');
    });
    renderWithStore(
      onPlatform(
        save,
        <>
          <SettingsScreen />
          <Toaster />
        </>,
      ),
      createStubStore({ data: snapshotWith() }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export unencrypted copy' }));
    const dialog = screen.getByRole('dialog', { name: 'Export an unprotected copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No space left on device');
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
    expect(await screen.findByRole('alert')).toHaveTextContent("This file isn't a Funcial backup.");
  });

  it('narrows the backup file picker to .funbak on the web only', () => {
    // Android's file chooser crashes on an extension it has no MIME type for, and `.funbak` has
    // none. On the phone the picker shows every file; the restore rejects anything else.
    const web = renderWithStore(<SettingsScreen />, createStubStore({ data: snapshotWith() }));
    expect(screen.getByLabelText('Backup file')).toHaveAttribute('accept', '.funbak');
    web.unmount();

    renderWithStore(onPhone(null, <SettingsScreen />), createStubStore({ data: snapshotWith() }));
    expect(screen.getByLabelText('Backup file')).not.toHaveAttribute('accept');
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

  it('exports expenses as CSV after the same warning', async () => {
    const data = snapshotWith();
    data.tables.expense.push(makeExpense({ id: 'e1', amount: 12_50, date: '2026-10-14' }));
    renderWithStore(<SettingsScreen />, createStubStore({ data, today: '2026-10-14' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export expenses (CSV)' }));
    const dialog = screen.getByRole('dialog', { name: 'Export an unprotected copy?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    expect(downloadText).toHaveBeenCalledWith(
      'funcial-expenses-2026-10-14.csv',
      'date,amount,currency,category,payment_method,card,note,subscription\r\n' +
        '2026-10-14,12.50,USD,food,cash,,,\r\n',
      'text/csv',
    );
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
    await userEvent.type(within(profile).getByLabelText('Monthly take-home pay'), '4200');
    await userEvent.selectOptions(within(profile).getByLabelText('Pay day'), '25');
    await userEvent.click(within(profile).getByRole('button', { name: 'Save' }));
    expect(finance.updateProfile).toHaveBeenCalledWith({
      name: 'Sam',
      salary: { monthlyAmount: 420_000, payDay: 25 },
    });
  });
});

describe('Currency', () => {
  /** What the row and the list print for a code: the machine's language decides the name. */
  const labelOf = (code: string) => currencyOptions((c) => c === code)[0]!.label;

  function renderCurrency(currency = 'EUR') {
    const data = snapshotWith();
    data.tables.profile.push(makeProfile({ currency }));
    return renderWithStore(
      <>
        <SettingsScreen />
        <Toaster />
      </>,
      createStubStore({ data }),
    );
  }
  const row = () => within(screen.getByRole('region', { name: 'Profile & salary' }));
  const changeButton = () => row().getByRole('button', { name: 'Change currency' });
  const openPicker = async () => {
    await userEvent.click(changeButton());
    return screen.getByRole('dialog', { name: 'Change currency' });
  };

  it('shows the current code and name with a Change action', () => {
    renderCurrency('EUR');
    expect(row().getByText('Currency')).toBeInTheDocument();
    expect(row().getByText(labelOf('EUR'))).toBeInTheDocument();
    expect(row().getByRole('button', { name: 'Change currency' })).toHaveTextContent('Change');
  });

  it('lists only currencies with the same decimals as the current one, and not the current one', async () => {
    renderCurrency('EUR');
    const dialog = await openPicker();
    const values = within(dialog)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain('USD');
    expect(values).toContain('GBP');
    expect(values).not.toContain('JPY');
    expect(values).not.toContain('EUR');
    expect(dialog).toHaveTextContent(
      'Only currencies with the same decimals as EUR are listed. Your amounts keep their numbers; they are not converted.',
    );
  });

  it('offers the whole-unit currencies from yen, and no cent currency', async () => {
    renderCurrency('JPY');
    const dialog = await openPicker();
    const values = within(dialog)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toContain('KRW');
    expect(values).not.toContain('EUR');
  });

  it('has no confirmation in the page until a currency is picked', async () => {
    renderCurrency('EUR');
    const picker = await openPicker();
    expect(document.body).not.toHaveTextContent('Change your currency');
    await userEvent.selectOptions(within(picker).getByLabelText('New currency'), 'GBP');
    expect(document.body).toHaveTextContent('Change your currency to GBP?');
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Change your currency to GBP?' })).getByRole(
        'button',
        { name: 'Cancel' },
      ),
    );
    expect(document.body).not.toHaveTextContent('Change your currency');
  });

  it('asks before changing, then relabels on confirm and closes', async () => {
    renderCurrency('EUR');
    const picker = await openPicker();
    await userEvent.selectOptions(within(picker).getByLabelText('New currency'), 'GBP');

    const confirm = screen.getByRole('dialog', { name: 'Change your currency to GBP?' });
    expect(confirm).toHaveAccessibleDescription(
      'Every amount keeps its number. 1,200 EUR becomes 1,200 GBP.',
    );
    expect(finance.changeCurrency).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Change currency' }));
    expect(finance.changeCurrency).toHaveBeenCalledExactlyOnceWith('GBP');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(changeButton()).toHaveFocus();
  });

  it('fetches the rates for the new currency at once, and not when the change fails', async () => {
    finance.changeCurrency.mockRejectedValueOnce(new Error('Storage is full.'));
    renderCurrency('EUR');
    const picker = await openPicker();
    await userEvent.selectOptions(within(picker).getByLabelText('New currency'), 'GBP');
    const confirm = screen.getByRole('dialog', { name: 'Change your currency to GBP?' });
    const change = within(confirm).getByRole('button', { name: 'Change currency' });
    await userEvent.click(change);
    expect(await screen.findByText('Storage is full.')).toBeInTheDocument();
    expect(invest.refreshMarket).not.toHaveBeenCalled();

    await userEvent.click(change);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invest.refreshMarket).toHaveBeenCalledOnce();
  });

  it('changes nothing on Cancel', async () => {
    renderCurrency('EUR');
    const picker = await openPicker();
    await userEvent.selectOptions(within(picker).getByLabelText('New currency'), 'GBP');
    const confirm = screen.getByRole('dialog', { name: 'Change your currency to GBP?' });

    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(finance.changeCurrency).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(row().getByText(labelOf('EUR'))).toBeInTheDocument();
    // Both dialogs close together, and focus goes back to where the person started.
    expect(changeButton()).toHaveFocus();
  });

  it('puts focus back on Change when the list is cancelled on its own', async () => {
    renderCurrency('EUR');
    const picker = await openPicker();
    await userEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(changeButton()).toHaveFocus();
  });

  it('stays open and says why when the change fails', async () => {
    finance.changeCurrency.mockRejectedValueOnce(new Error('Storage is full.'));
    renderCurrency('EUR');
    const picker = await openPicker();
    await userEvent.selectOptions(within(picker).getByLabelText('New currency'), 'GBP');
    const confirm = screen.getByRole('dialog', { name: 'Change your currency to GBP?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Change currency' }));
    expect(finance.changeCurrency).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Storage is full.')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Change your currency to GBP?' }),
    ).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('radio', { name: 'Sunday' }));
    expect(finance.updateSettings).toHaveBeenCalledWith({ weekStartsOn: 0 });
  });
});

describe('Reminders', () => {
  const BLOCKED =
    'Notifications are blocked for Funcial. Turn them on in Android Settings → Apps → Funcial → Notifications.';
  const MASTER = 'Reminders on this phone';
  const OTHERS = [
    ['Daily nudge to log spending', 'dailyLog'],
    ['Bills and renewals', 'bills'],
    ['Salary freeze start and end', 'freeze'],
    ['Weekly and monthly reviews', 'reviews'],
    ['Backup reminder', 'backup'],
    ['Dividends', 'dividends'],
    ['Buy it?', 'buyIt'],
  ] as const;

  /** What a fresh install holds: reminders off, the rest at their defaults, nobody asked yet. */
  const fresh = makeSettings().reminders;
  /** Reminders on, as after the person said yes. */
  const on: ReminderSettings = { ...fresh, enabled: true, prompted: true };

  function renderReminders(notifier: FakeNotifier | null, reminders: ReminderSettings = fresh) {
    return renderWithStore(
      onPhone(notifier, <SettingsScreen />),
      createStubStore({ data: snapshotWith(makeSettings({ reminders })) }),
    );
  }
  const section = () => screen.getByRole('region', { name: 'Reminders' });
  const master = () => within(section()).getByRole('switch', { name: MASTER });
  const switchNamed = (name: string) => within(section()).getByRole('switch', { name });
  const testButton = () => within(section()).getByRole('button', { name: 'Send a test reminder' });

  it('turns reminders on after Android allows it', async () => {
    const notifier = fakeNotifier();
    renderReminders(notifier);
    expect(master()).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(master());

    expect(notifier.request).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(finance.updateSettings).toHaveBeenCalledExactlyOnceWith({ reminders: on }),
    );
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument();
    // Asking is the switch's job: it never asks on opening. Scheduling follows the saved data.
    expect(notifier.permission).not.toHaveBeenCalled();
    expect(notifier.replace).not.toHaveBeenCalled();
  });

  it('explains how to unblock notifications when refused', async () => {
    const notifier = fakeNotifier({ request: async () => false });
    renderReminders(notifier);

    await userEvent.click(master());

    const alert = await within(section()).findByRole('alert');
    expect(alert.textContent).toBe(BLOCKED);
    expect(notifier.request).toHaveBeenCalledTimes(1);
    expect(finance.updateSettings).not.toHaveBeenCalled();
    expect(master()).toHaveAttribute('aria-checked', 'false');
  });

  it('shows how to unblock on opening when reminders are on but Android blocks them', async () => {
    for (const permission of ['denied', 'prompt'] as const) {
      const notifier = fakeNotifier({ permission: async () => permission });
      const { unmount } = renderReminders(notifier, on);

      const alert = await within(section()).findByRole('alert');
      expect(alert.textContent).toBe(BLOCKED);
      // Looking is not asking: a person who only opens Settings must not get a system prompt.
      expect(notifier.request).not.toHaveBeenCalled();
      expect(master()).toHaveAttribute('aria-checked', 'true');
      unmount();
    }
  });

  it('says nothing on opening when notifications are allowed, or reminders are off', async () => {
    const allowed = fakeNotifier();
    const first = renderReminders(allowed, on);
    await vi.waitFor(() => expect(allowed.permission).toHaveBeenCalledTimes(1));
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument();
    first.unmount();

    // Off while Android blocks: nothing was promised, so there is nothing to warn about.
    const blocked = fakeNotifier({ permission: async () => 'denied' });
    renderReminders(blocked, fresh);
    await act(async () => {});
    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument();
    expect(blocked.request).not.toHaveBeenCalled();
  });

  it('clears the warning when reminders are switched off', async () => {
    const notifier = fakeNotifier({ permission: async () => 'denied' });
    renderReminders(notifier, on);
    await within(section()).findByRole('alert');

    await userEvent.click(master());

    expect(within(section()).queryByRole('alert')).not.toBeInTheDocument();
    expect(finance.updateSettings).toHaveBeenCalledExactlyOnceWith({
      reminders: { ...on, enabled: false },
    });
    expect(notifier.request).not.toHaveBeenCalled();
  });

  it('turns reminders off without asking Android', async () => {
    const notifier = fakeNotifier();
    renderReminders(notifier, on);

    await userEvent.click(master());

    expect(finance.updateSettings).toHaveBeenCalledExactlyOnceWith({
      reminders: { ...on, enabled: false },
    });
    expect(notifier.request).not.toHaveBeenCalled();
  });

  it('saves each reminder switch and the daily time', async () => {
    renderReminders(fakeNotifier(), on);

    for (const [label, key] of OTHERS) {
      finance.updateSettings.mockClear();
      expect(switchNamed(label)).toBeEnabled();
      expect(switchNamed(label)).toHaveAttribute('aria-checked', 'true');

      await userEvent.click(switchNamed(label));

      expect(finance.updateSettings).toHaveBeenCalledExactlyOnceWith({
        reminders: { ...on, [key]: false },
      });
    }

    finance.updateSettings.mockClear();
    const at = within(section()).getByLabelText('At');
    expect(at).toHaveValue('20:00');
    expect(
      within(at)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`));
    await userEvent.selectOptions(at, '07:00');
    expect(finance.updateSettings).toHaveBeenLastCalledWith({
      reminders: { ...on, dailyTime: '07:00' },
    });
    await userEvent.selectOptions(at, '23:00');
    expect(finance.updateSettings).toHaveBeenLastCalledWith({
      reminders: { ...on, dailyTime: '23:00' },
    });
  });

  it('keeps a saved time that is not on the hour, as saved', () => {
    renderReminders(fakeNotifier(), { ...on, dailyTime: '20:30' });

    expect(within(section()).getByLabelText('At')).toHaveValue('20:30');
  });

  it('shows the other controls but leaves them inert until the master switch is on', () => {
    const others = () => [
      ...OTHERS.map(([label]) => switchNamed(label)),
      within(section()).getByLabelText('At'),
      testButton(),
    ];

    const off = renderReminders(fakeNotifier(), fresh);
    expect(master()).toBeEnabled();
    others().forEach((c) => expect(c).toBeDisabled());
    off.unmount();

    renderReminders(fakeNotifier(), on);
    expect(master()).toBeEnabled();
    others().forEach((c) => expect(c).toBeEnabled());
  });

  it('sends a test reminder', async () => {
    const notifier = fakeNotifier();
    renderReminders(notifier, on);

    await userEvent.click(testButton());

    expect(notifier.sendTest).toHaveBeenCalledTimes(1);
    expect(toastStore.getState().toasts).toEqual([
      expect.objectContaining({
        tone: 'success',
        message: 'A test reminder arrives in about a minute.',
      }),
    ]);
  });

  it('says so when the test reminder cannot be sent', async () => {
    const notifier = fakeNotifier({
      sendTest: async () => {
        throw new Error('Notifications are disabled');
      },
    });
    renderReminders(notifier, on);

    await userEvent.click(testButton());

    expect(toastStore.getState().toasts).toEqual([
      expect.objectContaining({ tone: 'danger', message: 'Notifications are disabled' }),
    ]);
  });

  it('comes right after Preferences', () => {
    renderReminders(fakeNotifier());
    const after = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(after(screen.getByRole('region', { name: 'Preferences' }), section())).toBe(true);
    expect(after(section(), screen.getByRole('region', { name: 'Appearance' }))).toBe(true);
  });

  it('has no reminders section in the demo, even on a phone', () => {
    // Demo money never schedules reminders, so a switch for them would promise nothing.
    renderWithStore(
      onPhone(fakeNotifier(), <SettingsScreen />),
      createStubStore({ namespace: 'demo', data: snapshotWith() }),
    );

    expect(screen.getByRole('region', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: MASTER })).not.toBeInTheDocument();
  });

  it('has no reminders section on the web', () => {
    // The default platform is the web, which has no notifier.
    const web = renderWithStore(<SettingsScreen />, createStubStore({ data: snapshotWith() }));
    expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: MASTER })).not.toBeInTheDocument();
    web.unmount();

    renderWithStore(onPhone(null, <SettingsScreen />), createStubStore({ data: snapshotWith() }));
    expect(screen.queryByRole('region', { name: 'Reminders' })).not.toBeInTheDocument();
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

describe('Settings in the line style', () => {
  const isLine = (el: HTMLElement, label: string) => {
    expect(el, label).toHaveClass('border-b', 'font-extrabold');
    expect(el, label).not.toHaveClass('rounded-md');
  };
  const isTab = (name: string, on: boolean) =>
    expect(screen.getByText(name)).toHaveClass(on ? 'border-text' : 'border-transparent');
  const tabsOf = (legend: string) =>
    within(screen.getByRole('group', { name: legend }))
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.textContent);

  it('has line fields in the profile', () => {
    const data = snapshotWith();
    data.tables.profile.push(makeProfile({ name: 'Sam', salary: null }));
    renderWithStore(<SettingsScreen />, createStubStore({ data }));
    for (const label of ['Name', 'Monthly take-home pay', 'Pay day']) {
      isLine(screen.getByLabelText(label), label);
    }
  });

  it('has underline tabs for the week, warning style, theme and lock method', () => {
    renderWithStore(
      <SettingsScreen />,
      createStubStore({ lockMode: 'device', data: snapshotWith() }),
    );
    // Two choices are tabs, not a select, and still radios.
    expect(screen.queryByLabelText('Week starts on')).not.toBeInTheDocument();
    expect(tabsOf('Week starts on')).toEqual(['Monday', 'Sunday']);
    expect(tabsOf('Warning style')).toEqual(['Gentle', 'Motivational', 'Strict']);
    expect(tabsOf('Theme')).toEqual(['System', 'Light', 'Dark']);
    expect(tabsOf('Lock method')).toEqual(['No lock', 'PIN', 'Passphrase']);
    isTab('Monday', true);
    isTab('Sunday', false);
    isTab('Motivational', true);
    isTab('Gentle', false);
    isTab('No lock', true);
    // Not the boxed well.
    expect(screen.getByText('Monday').closest('div')).not.toHaveClass('bg-surface-2');
  });

  it('has the auto-lock as a line select', () => {
    renderWithStore(
      <SettingsScreen />,
      createStubStore({
        lockMode: 'pin',
        data: snapshotWith(makeSettings({ autoLockMinutes: 5 })),
      }),
    );
    isLine(screen.getByLabelText('Auto-lock'), 'Auto-lock');
    expect(screen.getByLabelText('Auto-lock')).toHaveValue('5');
  });

  it('has a line select for the reminder time', () => {
    const fresh = makeSettings().reminders;
    renderWithStore(
      onPhone(fakeNotifier(), <SettingsScreen />),
      createStubStore({
        data: snapshotWith(makeSettings({ reminders: { ...fresh, enabled: true } })),
      }),
    );
    isLine(screen.getByLabelText('At'), 'At');
  });

  it('has line fields in the currency, PIN, backup, restore and erase dialogs', async () => {
    renderWithStore(<SettingsScreen />, createStubStore({ lockMode: 'pin', data: snapshotWith() }));
    isLine(screen.getByLabelText('Passphrase for this backup'), 'Passphrase for this backup');

    await userEvent.click(screen.getByRole('button', { name: 'Create encrypted backup' }));
    let dialog = screen.getByRole('dialog', { name: 'Create encrypted backup' });
    for (const label of ['Backup passphrase', 'Confirm passphrase']) {
      isLine(within(dialog).getByLabelText(label), label);
    }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Change PIN' }));
    dialog = screen.getByRole('dialog', { name: 'Change PIN' });
    for (const label of ['Current PIN', 'New PIN', 'Confirm PIN']) {
      isLine(within(dialog).getByLabelText(label), label);
    }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete all data' }));
    dialog = screen.getByRole('dialog', { name: 'Delete all data?' });
    isLine(within(dialog).getByLabelText('Type DELETE to confirm'), 'Type DELETE to confirm');
  });

  it('has a line select in the currency picker', async () => {
    const data = snapshotWith();
    data.tables.profile.push(makeProfile({ currency: 'USD' }));
    renderWithStore(<SettingsScreen />, createStubStore({ data }));
    await userEvent.click(screen.getByRole('button', { name: 'Change currency' }));
    const picker = screen.getByRole('dialog', { name: 'Change currency' });
    isLine(within(picker).getByLabelText('New currency'), 'New currency');
  });
});

describe('Account', () => {
  it('has its section for real data', () => {
    renderWithStore(withAccount(fakeAccount(), <SettingsScreen />), createStubStore());
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('has none in the demo', () => {
    renderWithStore(
      withAccount(fakeAccount(), <SettingsScreen />),
      createStubStore({ namespace: 'demo' }),
    );
    expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument();
  });
});
