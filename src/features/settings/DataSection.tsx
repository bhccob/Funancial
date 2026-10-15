import { useId, useState, type FormEvent } from 'react';
import { LeaveDemoButton } from '@/app/LeaveDemoButton';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { EraseDialog } from '@/features/system/EraseDialog';
import { validateSecret } from '@/data/keys';
import type { DataSnapshot, TableName } from '@/domain/snapshot';
import { expensesToCsv } from '@/data/csv';
import { readFileText } from '@/lib/download';
import { useAction } from '@/lib/useAction';
import { usePlatform } from '@/platform/PlatformProvider';
import { useApp } from '@/store/AppStoreProvider';

/** Order and wording of the summary line. Profile and settings are not "entries". */
const SUMMARY: Array<[TableName, string, string]> = [
  ['expense', 'expense', 'expenses'],
  ['subscription', 'subscription', 'subscriptions'],
  ['budgetLimit', 'limit', 'limits'],
  ['income', 'income entry', 'income entries'],
  ['salaryFreeze', 'salary freeze', 'salary freezes'],
  ['transaction', 'transaction', 'transactions'],
  ['goal', 'goal', 'goals'],
  ['debt', 'debt or card', 'debts and cards'],
];

function summarize(data: DataSnapshot): string {
  const parts = SUMMARY.flatMap(([table, one, many]) => {
    const n = data.tables[table].length;
    return n === 0 ? [] : [`${n} ${n === 1 ? one : many}`];
  });
  return parts.length ? parts.join(' · ') : 'No entries yet.';
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function BackupDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const createBackup = useApp((s) => s.createBackup);
  const platform = usePlatform();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ pass?: string; confirm?: string; other?: string }>({});
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPass('');
    setConfirm('');
    setErrors({});
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateSecret(pass, 'passphrase');
    if (problem) return setErrors({ pass: problem });
    if (pass !== confirm) return setErrors({ confirm: "Those don't match." });
    setBusy(true);
    try {
      const { fileName, text } = await createBackup(pass);
      await platform.files.save(fileName, text, 'application/octet-stream');
      close();
    } catch (err) {
      setErrors({ other: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} title="Create encrypted backup" onClose={close}>
      {open && (
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <p className="text-muted text-sm">
            If you forget this passphrase, the backup can't be opened.
          </p>
          <TextField
            label="Backup passphrase"
            type="password"
            autoComplete="new-password"
            autoFocus
            hint="At least 8 characters"
            value={pass}
            error={errors.pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <TextField
            label="Confirm passphrase"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={errors.confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {errors.other && (
            <p role="alert" className="text-danger text-sm font-bold">
              {errors.other}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create backup
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function RestoreForm() {
  const restoreBackup = useApp((s) => s.restoreBackup);
  const [file, setFile] = useState<File | null>(null);
  const [pass, setPass] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileId = useId();

  async function restore() {
    setConfirming(false);
    if (!file) return;
    setResult(null);
    try {
      await restoreBackup(await readFileText(file), pass);
      setPass('');
      setResult({ ok: true, message: 'Backup restored.' });
    } catch (e) {
      setResult({ ok: false, message: errorMessage(e) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold">Restore from backup</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fileId} className="text-sm font-bold">
          Backup file
        </label>
        <input
          id={fileId}
          type="file"
          accept=".funbak"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="file:border-border-strong file:bg-surface text-sm file:mr-3 file:rounded-md file:border-2 file:px-3 file:py-2 file:font-bold"
        />
      </div>
      <TextField
        label="Passphrase for this backup"
        type="password"
        autoComplete="off"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
      <div>
        <Button
          variant="secondary"
          disabled={!file || pass.length === 0}
          onClick={() => setConfirming(true)}
        >
          Restore
        </Button>
      </div>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={result.ok ? 'text-success text-sm font-bold' : 'text-danger text-sm font-bold'}
        >
          {result.message}
        </p>
      )}
      <Dialog
        open={confirming}
        title="Restore this backup?"
        description="It replaces all data on this device."
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void restore()}>Restore</Button>
          </>
        }
      />
    </div>
  );
}

/** Any export that writes readable finances to a file asks first. */
function ExportButton({ label, onExport }: { label: string; onExport(): void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        {label}
      </Button>
      <Dialog
        open={confirming}
        title="Export an unprotected copy?"
        description="This file isn't protected. Anyone who gets it can read your finances."
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onExport();
                setConfirming(false);
              }}
            >
              Export
            </Button>
          </>
        }
      />
    </>
  );
}

function DeleteAllButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete all data
      </Button>
      <EraseDialog
        open={open}
        title="Delete all data?"
        description="This erases everything Funancial stores on this device. Make a backup first if you might want it back."
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function DataSection() {
  const namespace = useApp((s) => s.namespace);
  const data = useApp((s) => s.data);
  const persisted = useApp((s) => s.persisted);
  const skipped = useApp((s) => s.skipped);
  const exportPlain = useApp((s) => s.exportPlain);
  const today = useApp((s) => s.today);
  const platform = usePlatform();
  const run = useAction();
  const [backupOpen, setBackupOpen] = useState(false);
  const lastBackupAt = data.tables.settings[0]?.lastBackupAt ?? null;
  const demo = namespace === 'demo';

  return (
    <Section title="Data">
      <div className="flex flex-col gap-5">
        {skipped.length > 0 && (
          <Banner tone="warning">
            {skipped.length} saved items couldn't be read and are hidden. They're still kept on this
            device.
          </Banner>
        )}
        <div className="flex flex-col gap-1">
          <p className="font-bold">{summarize(data)}</p>
          <p className="text-muted text-sm">
            {persisted
              ? 'Storage: protected from automatic clearing'
              : 'Storage: the browser may clear it if space runs low'}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2">
          <Button onClick={() => setBackupOpen(true)}>Create encrypted backup</Button>
          <p className="text-muted text-sm">
            {lastBackupAt
              ? `Last backup: ${dateTime.format(new Date(lastBackupAt))}`
              : 'No backup yet.'}
          </p>
          <BackupDialog open={backupOpen} onClose={() => setBackupOpen(false)} />
        </div>

        {demo ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted text-sm">This is demo money. Leaving demo deletes it.</p>
            <LeaveDemoButton size="md" />
          </div>
        ) : (
          <>
            <hr className="border-border border-t-2 border-dashed" />
            <RestoreForm />
            <hr className="border-border border-t-2 border-dashed" />
            <div className="flex flex-wrap gap-3">
              <ExportButton
                label="Export unencrypted copy"
                onExport={() =>
                  void run(async () => {
                    const { fileName, text } = exportPlain();
                    await platform.files.save(fileName, text, 'application/json');
                  })
                }
              />
              <ExportButton
                label="Export expenses (CSV)"
                onExport={() =>
                  void run(() =>
                    platform.files.save(
                      `funancial-expenses-${today}.csv`,
                      expensesToCsv(data, data.tables.profile[0]?.currency ?? 'USD'),
                      'text/csv',
                    ),
                  )
                }
              />
              <DeleteAllButton />
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
