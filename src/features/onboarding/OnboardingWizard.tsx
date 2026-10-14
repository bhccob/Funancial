import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { validateSecret, type SecretKind } from '@/data/keys';
import { formatMoney, minorDigits } from '@/domain/money';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import type { CardInput } from '@/store/financeActions';
import { useFinanceActions } from '@/store/useFinance';

const STEPS = 6;
const TITLES = [
  'Before we start',
  'Your currency and name',
  'What you have now',
  'Your salary',
  'Credit cards',
  'Lock Funancial?',
];

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR', 'SGD', 'ZAR'];

function currencyOptions(): Array<{ value: string; label: string }> {
  const names = new Intl.DisplayNames(undefined, { type: 'currency' });
  const rest = Intl.supportedValuesOf('currency').filter((c) => !COMMON_CURRENCIES.includes(c));
  return [...COMMON_CURRENCIES, ...rest].map((code) => ({
    value: code,
    label: `${code} · ${names.of(code) ?? code}`,
  }));
}

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

type LockChoice = 'none' | SecretKind;
const LOCK_NAMES: Record<SecretKind, string> = { pin: 'PIN', passphrase: 'passphrase' };

interface CardDraft {
  key: number;
  card: CardInput;
}

function CardForm({
  currency,
  onSave,
  onCancel,
}: {
  currency: string;
  onSave(card: CardInput): void;
  onCancel(): void;
}) {
  const [name, setName] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [creditLimit, setCreditLimit] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState('1');
  const [payInFull, setPayInFull] = useState(true);
  const valid = name.trim() !== '' && balance !== null && balance >= 0;

  return (
    <div className="border-border flex flex-col gap-4 border-y py-5">
      <TextField
        label="Card name"
        autoFocus
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <MoneyField
        label="Current balance"
        currency={currency}
        value={balance}
        onChange={setBalance}
        hint="What you owe on it today."
      />
      <MoneyField
        label="Credit limit"
        currency={currency}
        value={creditLimit}
        onChange={setCreditLimit}
        hint="Optional."
      />
      <Select label="Due day" value={dueDay} onChange={setDueDay} options={DAY_OPTIONS} />
      <Switch label="I pay it in full each month" checked={payInFull} onChange={setPayInFull} />
      <div className="flex gap-2">
        <Button
          disabled={!valid}
          onClick={() =>
            onSave({
              name: name.trim(),
              balance: balance ?? 0,
              creditLimit,
              dueDay: Number(dueDay),
              payInFull,
            })
          }
        >
          Save card
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** First-run setup for real data: six short steps, then the Dashboard. */
export function OnboardingWizard() {
  const { completeOnboarding } = useFinanceActions();
  const setSecret = useApp((s) => s.setSecret);
  const run = useAction();
  const heading = useRef<HTMLHeadingElement>(null);
  const [options] = useState(currencyOptions);

  const [step, setStep] = useState(1);
  const [understood, setUnderstood] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [name, setName] = useState('');
  const [cash, setCash] = useState<number | null>(null);
  const [savings, setSavings] = useState<number | null>(null);
  const [noSalary, setNoSalary] = useState(false);
  const [salary, setSalary] = useState<number | null>(null);
  const [payDay, setPayDay] = useState('25');
  const [cards, setCards] = useState<CardDraft[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const nextCardKey = useRef(0);
  const [lock, setLock] = useState<LockChoice>('none');
  const [secret, setSecretText] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ secret?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const firstRender = useRef(true);
  useEffect(() => {
    // Move focus to the new step's heading so screen readers announce it.
    if (firstRender.current) firstRender.current = false;
    else heading.current?.focus();
  }, [step]);

  function changeCurrency(next: string) {
    // Amounts are kept in minor units; a currency with different decimals would misread them.
    if (minorDigits(next) !== minorDigits(currency)) {
      setCash(null);
      setSavings(null);
      setSalary(null);
      setCards([]);
    }
    setCurrency(next);
  }

  const valid: Record<number, boolean> = {
    1: understood,
    2: true,
    3: cash !== null && savings !== null && savings >= 0,
    4: noSalary || (salary !== null && salary > 0),
    5: !addingCard,
    6: !busy,
  };

  async function finish() {
    if (lock !== 'none') {
      const problem = validateSecret(secret, lock);
      const found = problem
        ? { secret: problem }
        : secret !== confirm
          ? { confirm: "Those don't match." }
          : {};
      setErrors(found);
      if (found.secret || found.confirm) return;
    }
    setBusy(true);
    await run(async () => {
      // Lock first: saving the profile switches to the Dashboard, so the chosen lock must already hold.
      if (lock !== 'none') await setSecret(secret, lock);
      await completeOnboarding({
        name,
        currency,
        openingCash: cash ?? 0,
        openingSavings: savings ?? 0,
        salary: noSalary ? null : { monthlyAmount: salary ?? 0, payDay: Number(payDay) },
        cards: cards.map((d) => d.card),
      });
    });
    setBusy(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid[step]) return;
    if (step < STEPS) setStep(step + 1);
    else void finish();
  }

  let body: ReactNode;
  switch (step) {
    case 1:
      body = (
        <>
          <p className="text-muted">
            Funancial helps you track and plan your money. It isn&apos;t financial advice, and it
            never needs your bank login. Everything stays encrypted on this device.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-bold">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="accent-primary size-5"
            />
            I understand
          </label>
        </>
      );
      break;
    case 2:
      body = (
        <>
          <Select label="Currency" value={currency} onChange={changeCurrency} options={options} />
          <TextField
            label="What should we call you?"
            hint="Optional."
            autoComplete="given-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </>
      );
      break;
    case 3:
      body = (
        <>
          <p className="text-muted">Rough numbers are fine. You can correct them anytime.</p>
          <MoneyField label="Cash & checking" currency={currency} value={cash} onChange={setCash} />
          <MoneyField label="Savings" currency={currency} value={savings} onChange={setSavings} />
        </>
      );
      break;
    case 4:
      body = (
        <>
          <Switch label="I don't have a regular salary" checked={noSalary} onChange={setNoSalary} />
          {!noSalary && (
            <>
              <MoneyField
                label="Monthly take-home pay"
                currency={currency}
                value={salary}
                onChange={setSalary}
                hint="What actually lands in your account."
              />
              <Select
                label="Pay day"
                value={payDay}
                onChange={setPayDay}
                options={DAY_OPTIONS}
                hint="Short months use their last day."
              />
            </>
          )}
        </>
      );
      break;
    case 5:
      body = (
        <>
          <p className="text-muted">
            Card spending counts toward your limits right away and is paid from cash later. Skip
            this if you don&apos;t use one.
          </p>
          {cards.length > 0 && (
            <ul className="divide-border border-border divide-y border-y">
              {cards.map(({ key, card: c }) => (
                <li key={key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{c.name}</p>
                    <p className="text-muted text-sm tabular-nums">
                      {formatMoney(c.balance, currency)} owed · due day {c.dueDay}
                      {c.payInFull ? ' · paid in full' : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => setCards(cards.filter((x) => x.key !== key))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {addingCard ? (
            <CardForm
              currency={currency}
              onCancel={() => setAddingCard(false)}
              onSave={(card) => {
                setCards([...cards, { key: nextCardKey.current++, card }]);
                setAddingCard(false);
              }}
            />
          ) : (
            <Button variant="secondary" className="self-start" onClick={() => setAddingCard(true)}>
              Add a card
            </Button>
          )}
        </>
      );
      break;
    default:
      body = (
        <>
          <p className="text-muted">
            Without a lock, anyone using this device can open Funancial. You can change this later
            in Settings.
          </p>
          <RadioGroup<LockChoice>
            legend="Lock"
            value={lock}
            onChange={(v) => {
              setLock(v);
              setSecretText('');
              setConfirm('');
              setErrors({});
            }}
            options={[
              { value: 'none', label: 'No lock' },
              { value: 'pin', label: 'PIN' },
              { value: 'passphrase', label: 'Passphrase' },
            ]}
          />
          {lock !== 'none' && (
            <>
              <TextField
                label={`Choose a ${LOCK_NAMES[lock]}`}
                type="password"
                inputMode={lock === 'pin' ? 'numeric' : undefined}
                autoComplete="new-password"
                hint={lock === 'pin' ? '4 to 8 digits' : 'At least 8 characters'}
                value={secret}
                error={errors.secret}
                onChange={(e) => setSecretText(e.target.value)}
              />
              <TextField
                label={`Confirm ${LOCK_NAMES[lock]}`}
                type="password"
                inputMode={lock === 'pin' ? 'numeric' : undefined}
                autoComplete="new-password"
                value={confirm}
                error={errors.confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </>
          )}
        </>
      );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8 md:py-16">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-extrabold tracking-tight">
          Fun<span className="text-accent-text">ancial</span>
        </p>
        <p className="text-muted text-sm font-bold">
          Step {step} of {STEPS}
        </p>
      </div>
      <div aria-hidden className="mt-3 grid grid-cols-6 gap-1">
        {TITLES.map((t, i) => (
          <span key={t} className={cn('h-1 rounded-full', i < step ? 'bg-accent' : 'bg-track')} />
        ))}
      </div>
      <form className="flex flex-1 flex-col pt-10" onSubmit={submit} noValidate>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-[28px] font-extrabold tracking-tight outline-none"
        >
          {TITLES[step - 1]}
        </h1>
        <div className="mt-6 flex flex-col gap-5">{body}</div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-10">
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" disabled={!valid[step]}>
            {step < STEPS ? 'Next' : busy ? 'Setting up…' : 'Start my adventure'}
          </Button>
        </div>
      </form>
    </main>
  );
}
