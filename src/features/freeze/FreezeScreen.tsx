import { useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyField } from '@/components/ui/MoneyField';
import { PageHeader } from '@/components/ui/PageHeader';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Section } from '@/components/ui/Section';
import { TextField } from '@/components/ui/TextField';
import type { Profile, SalaryFreeze } from '@/domain/entities';
import { expectedSalary, freezeAllocation, freezeLoss } from '@/domain/salary';
import { formatDay, formatMonth } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useFinanceActions, useMoney } from '@/store/useFinance';

type Mode = SalaryFreeze['mode'];
type Errors = { from?: string; to?: string; amount?: string };

const BACKWARDS = 'The end date must be on or after the start date.';

function FreezeForm({ profile, freezes }: { profile: Profile; freezes: SalaryFreeze[] }) {
  const { addFreeze } = useFinanceActions();
  const money = useMoney();
  const currency = useCurrency();
  const run = useAction();
  const monthly = profile.salary?.monthlyAmount ?? 0;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState<Mode>('computed');
  const [amount, setAmount] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const datesOk = from !== '' && to !== '' && to >= from;
  const draft: SalaryFreeze | null = datesOk
    ? {
        id: 'draft',
        createdAt: '',
        updatedAt: '',
        start: from,
        end: to,
        mode,
        lostAmount: mode === 'computed' ? freezeLoss(from, to, monthly) : (amount ?? 0),
        note: '',
      }
    : null;
  const months = draft ? Object.keys(freezeAllocation(draft, monthly)).sort() : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {
      from: from ? undefined : 'Pick the first frozen day.',
      to: !to ? 'Pick the last frozen day.' : from && to < from ? BACKWARDS : undefined,
      amount: mode === 'manual' && amount === null ? 'Enter the pay you will lose.' : undefined,
    };
    setErrors(found);
    if (found.from || found.to || found.amount) return;

    setBusy(true);
    const saved = await run(
      () =>
        addFreeze({
          start: from,
          end: to,
          mode,
          ...(mode === 'manual' ? { lostAmount: amount ?? 0 } : {}),
          note: '',
        }),
      { success: 'Freeze added. Expected pay is updated.' },
    );
    setBusy(false);
    if (saved) {
      setFrom('');
      setTo('');
      setAmount(null);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="From"
          type="date"
          value={from}
          error={errors.from}
          onChange={(e) => {
            setFrom(e.target.value);
            setErrors({});
          }}
        />
        <TextField
          label="To"
          type="date"
          min={from || undefined}
          value={to}
          error={errors.to}
          onChange={(e) => {
            setTo(e.target.value);
            setErrors({});
          }}
        />
      </div>
      <RadioGroup<Mode>
        legend="Lost pay"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'computed', label: 'Calculate from my salary' },
          { value: 'manual', label: "I'll enter the amount" },
        ]}
      />
      {mode === 'manual' && (
        <MoneyField
          label="Amount lost"
          currency={currency}
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          hint="Split across the frozen months by days."
        />
      )}
      {months.length > 0 && draft && (
        <div>
          <h3 className="text-muted mb-1 text-xs font-semibold">Expected pay</h3>
          <ul className="divide-border divide-y">
            {months.map((m) => (
              <li key={m} className="py-2 text-sm font-semibold tabular-nums">
                {`${formatMonth(m)}: ${money(expectedSalary(profile, freezes, m))} → ${money(expectedSalary(profile, [...freezes, draft], m))}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-muted text-sm">Bills and subscriptions still apply during a freeze.</p>
      <Button type="submit" className="self-start" disabled={busy}>
        Add freeze
      </Button>
    </form>
  );
}

export function FreezeScreen() {
  const profile = useApp((s) => s.data.tables.profile[0]);
  const freezes = useApp((s) => s.data.tables.salaryFreeze);
  const { deleteFreeze } = useFinanceActions();
  const money = useMoney();
  const run = useAction();

  if (!profile?.salary) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Salary Freeze" />
        <div className="py-6">
          <EmptyState
            title="Add your salary first"
            action={
              <ButtonLink to="/settings" size="sm" variant="secondary">
                Open settings
              </ButtonLink>
            }
          >
            A freeze lowers your expected pay, so Funancial needs your monthly take-home pay.
          </EmptyState>
        </div>
      </div>
    );
  }

  const sorted = [...freezes].sort((a, b) => b.start.localeCompare(a.start));

  return (
    <div className="max-w-2xl">
      <PageHeader title="Salary Freeze">
        Unpaid days lower the salary you expect. Your bills don&apos;t pause.
      </PageHeader>
      <Section title="Add a freeze">
        <FreezeForm profile={profile} freezes={freezes} />
      </Section>
      {sorted.length > 0 && (
        <Section title="Your freezes">
          <ul className="divide-border -my-3 divide-y">
            {sorted.map((f) => {
              const span = `${formatDay(f.start)} – ${formatDay(f.end)}`;
              return (
                <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{span}</p>
                    <p className="text-muted text-sm tabular-nums">
                      {money(f.lostAmount)} less pay
                    </p>
                  </div>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    aria-label={`Delete freeze ${span}`}
                    onClick={() =>
                      void run(() => deleteFreeze(f.id), {
                        success: 'Freeze deleted. Expected pay is updated.',
                      })
                    }
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
