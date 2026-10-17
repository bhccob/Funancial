import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { TextField } from '@/components/ui/TextField';
import type { Goal } from '@/domain/entities';
import { useAction } from '@/lib/useAction';
import { useCurrency, useFinanceActions } from '@/store/useFinance';

type Kind = Goal['kind'];
type Errors = { name?: string; target?: string };

function GoalForm({ goal, onDone }: { goal: Goal | null; onDone(): void }) {
  const { saveGoal, deleteGoal } = useFinanceActions();
  const currency = useCurrency();
  const run = useAction();
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<Kind>(goal?.kind ?? 'savings');
  const [target, setTarget] = useState<number | null>(goal?.target ?? null);
  const [saved, setSaved] = useState<number | null>(goal?.current ?? null);
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      name: name.trim() ? undefined : 'Give it a name.',
      target: target === null || target <= 0 ? 'Enter an amount like 12.50' : undefined,
    };
    setErrors(found);
    if (found.name || found.target) return;
    setBusy(true);
    const ok = await run(
      () =>
        saveGoal({
          ...(goal ? { id: goal.id } : {}),
          name: name.trim(),
          kind,
          target: target ?? 0,
          current: saved ?? 0,
          deadline: deadline || null,
        }),
      { success: goal ? 'Goal updated.' : 'Goal added.' },
    );
    setBusy(false);
    if (ok) onDone();
  }

  async function remove() {
    if (!goal) return;
    setBusy(true);
    const ok = await run(() => deleteGoal(goal.id), { success: 'Goal deleted.' });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <TextField
        variant="line"
        label="Name"
        autoComplete="off"
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <RadioGroup<Kind>
        variant="underline"
        legend="Kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'savings', label: 'Savings' },
          { value: 'emergency', label: 'Emergency fund' },
          { value: 'custom', label: 'Other' },
        ]}
      />
      <MoneyField
        variant="line"
        label="Target"
        currency={currency}
        value={target}
        onChange={setTarget}
        error={errors.target}
      />
      <MoneyField
        variant="line"
        label="Saved so far"
        currency={currency}
        value={saved}
        onChange={setSaved}
        hint="Already in your savings. Changing it doesn't move money."
      />
      <TextField
        variant="line"
        label="Deadline"
        type="date"
        hint="Optional."
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {goal ? (
          <Button variant="danger-ghost" disabled={busy} onClick={remove}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Add or edit a goal. `goal` undefined = closed, null = new. */
export function GoalDialog({ goal, onClose }: { goal: Goal | null | undefined; onClose(): void }) {
  return (
    <Dialog open={goal !== undefined} title={goal ? 'Edit goal' : 'Add a goal'} onClose={onClose}>
      {goal !== undefined && <GoalForm key={goal?.id ?? 'new'} goal={goal} onDone={onClose} />}
    </Dialog>
  );
}
