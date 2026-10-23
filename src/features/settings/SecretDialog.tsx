import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { validateSecret, type LockMode, type SecretKind } from '@/data/keys';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

export type LockTarget = 'none' | SecretKind;

const NAMES: Record<SecretKind, string> = { pin: 'PIN', passphrase: 'passphrase' };

function dialogTitle(target: LockTarget, current: LockMode): string {
  if (target === 'none') return 'Remove lock';
  return current === target ? `Change ${NAMES[target]}` : `Set a ${NAMES[target]}`;
}

interface FormProps {
  target: LockTarget;
  current: LockMode;
  onDone(): void;
}

function SecretForm({ target, current, onDone }: FormProps) {
  const verifySecret = useApp((s) => s.verifySecret);
  const setSecret = useApp((s) => s.setSecret);
  const clearSecret = useApp((s) => s.clearSecret);
  const run = useAction();
  const [currentSecret, setCurrentSecret] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const needsCurrent = current !== 'device';
  const numeric = (kind: LockMode | LockTarget) => (kind === 'pin' ? 'numeric' : undefined);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (target !== 'none') {
      const problem = validateSecret(next, target);
      if (problem) found.next = problem;
      else if (next !== confirm) found.confirm = "Those don't match.";
    }
    setErrors(found);
    if (found.next || found.confirm) return;

    setBusy(true);
    let wrongCurrent = false;
    const saved = await run(async () => {
      if (needsCurrent && !(await verifySecret(currentSecret))) {
        wrongCurrent = true;
        return;
      }
      if (target === 'none') await clearSecret();
      else await setSecret(next, target);
    });
    setBusy(false);
    if (wrongCurrent) setErrors({ current: "That didn't match. Try again." });
    else if (saved) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <div>
        {needsCurrent && (
          <TextField
            variant="row"
            label={`Current ${NAMES[current as SecretKind]}`}
            type="password"
            inputMode={numeric(current)}
            autoComplete="current-password"
            autoFocus
            value={currentSecret}
            error={errors.current}
            onChange={(e) => setCurrentSecret(e.target.value)}
          />
        )}
        {target !== 'none' && (
          <>
            <TextField
              variant="row"
              label={`New ${NAMES[target]}`}
              type="password"
              inputMode={numeric(target)}
              autoComplete="new-password"
              autoFocus={!needsCurrent}
              hint={target === 'pin' ? '4 to 8 digits' : 'At least 8 characters'}
              value={next}
              error={errors.next}
              onChange={(e) => setNext(e.target.value)}
            />
            <TextField
              variant="row"
              label={`Confirm ${NAMES[target]}`}
              type="password"
              inputMode={numeric(target)}
              autoComplete="new-password"
              value={confirm}
              error={errors.confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function SecretDialog({
  target,
  current,
  onClose,
}: {
  target: LockTarget | null;
  current: LockMode;
  onClose(): void;
}) {
  return (
    <Dialog
      open={target !== null}
      title={target ? dialogTitle(target, current) : ''}
      onClose={onClose}
    >
      {target && <SecretForm key={target} target={target} current={current} onDone={onClose} />}
    </Dialog>
  );
}
