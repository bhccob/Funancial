import { Check } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Blobs } from '@/components/ui/Blobs';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { StepMotion, type StepDirection } from '@/components/ui/StepMotion';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { validateSecret, type SecretKind } from '@/data/keys';
import { formatMoney, minorDigits } from '@/domain/money';
import { ForgotScreen } from '@/features/account/ForgotScreen';
import { LoginScreen } from '@/features/account/LoginScreen';
import { BackButton, PasswordField, Problem, ScreenHeader } from '@/features/account/parts';
import { BIOMETRIC_FAILED, errorMessage, SAVE_NOTE, useBusy } from '@/features/account/shared';
import { currencyOptions, defaultCurrency } from '@/features/shared/currencies';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import {
  AccountError,
  emailProblem,
  hasData,
  passwordProblem,
  usernameProblem,
} from '@/store/accountActions';
import type { CardInput } from '@/store/financeActions';
import { useAccount, useAccountActions } from '@/store/useAccount';
import { useFinanceActions } from '@/store/useFinance';

const STEPS = 6;
/** A step, the last screen, or a way out of the first step to an account the person already has. */
type Step = number | 'done' | 'login' | 'forgot';

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
        variant="line"
        label="Card name"
        autoFocus
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <MoneyField
        variant="line"
        label="Current balance"
        currency={currency}
        value={balance}
        onChange={setBalance}
        hint="What you owe on it today."
      />
      <MoneyField
        variant="line"
        label="Credit limit"
        currency={currency}
        value={creditLimit}
        onChange={setCreditLimit}
        hint="Optional."
      />
      <Select
        variant="line"
        label="Due day"
        value={dueDay}
        onChange={setDueDay}
        options={DAY_OPTIONS}
      />
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

/**
 * First-run setup for real data: six short steps (the account first), each rising in from below,
 * then "You're all set". `onFinishing(true)` asks the app to keep this screen up once the profile is
 * saved (which would otherwise switch to the Dashboard at once), and `onFinishing(false)` lets it go.
 */
export function OnboardingWizard({ onFinishing }: { onFinishing?(finishing: boolean): void }) {
  const { completeOnboarding } = useFinanceActions();
  const setSecret = useApp((s) => s.setSecret);
  const biometricAvailable = useApp((s) => s.biometric !== 'unavailable');
  const enableBiometric = useApp((s) => s.enableBiometric);
  const deleteAllData = useApp((s) => s.deleteAllData);
  const emptyData = useApp((s) => !hasData(s.data));
  const { signUp } = useAccountActions();
  const account = useAccount();
  const run = useAction();
  const [options] = useState(() => currencyOptions());

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<StepDirection>('forward');
  // Log in (and its Forgot password) over the first step, for someone who already has an account.
  const [aside, setAside] = useState<'login' | 'forgot' | null>(null);
  const [done, setDone] = useState(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountErrors, setAccountErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    other?: string;
  }>({});
  // The last try failed for a reason that isn't what was typed: nothing came back (as good as
  // offline), or the service failed. Either way a down service must not block setup.
  const [failure, setFailure] = useState<'offline' | 'service' | null>(null);
  const { busy: signingUp, guard } = useBusy();

  // A guess from where the phone is; the Select still offers every currency.
  const [currency, setCurrency] = useState(() =>
    defaultCurrency(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language),
  );
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
  const [alsoBiometric, setAlsoBiometric] = useState(true);
  const [errors, setErrors] = useState<{ secret?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  function go(to: number) {
    setDirection(to > step ? 'forward' : 'back');
    setStep(to);
  }

  function goAside(to: 'login' | 'forgot' | null) {
    // Further in (log in, then forgot) rises; back out comes down.
    setDirection(to === null || (to === 'login' && aside === 'forgot') ? 'back' : 'forward');
    setAside(to);
  }

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
    // Not before the phone has read whether it already has an account.
    1: account.loaded && !signingUp,
    2: true,
    3: cash !== null && savings !== null && savings >= 0,
    4: noSalary || (salary !== null && salary > 0),
    5: !addingCard,
    6: !busy,
  };

  async function createAccount() {
    const found = {
      username: usernameProblem(username) ?? undefined,
      email: emailProblem(email) ?? undefined,
      password: passwordProblem(password) ?? undefined,
    };
    setAccountErrors(found);
    if (found.username || found.email || found.password) return;
    await guard(async () => {
      try {
        // Slow on purpose (the password is stretched into keys): once per tap, behind the busy state.
        await signUp({ username, email, password });
        setPassword('');
        go(2);
      } catch (err) {
        const code = err instanceof AccountError ? err.code : null;
        if (code === 'taken' || code === 'invalid') {
          // The person's own input: theirs to fix, with no way round it.
          setFailure(null);
          setAccountErrors(
            code === 'taken' ? { username: errorMessage(err) } : { other: errorMessage(err) },
          );
        } else {
          // Say so once, in the one line that comes with the way on.
          setAccountErrors({});
          setFailure(code === 'offline' ? 'offline' : 'service');
        }
      }
    });
  }

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
    // Saving the profile switches the app to the Dashboard: ask it to stay here for the last step.
    onFinishing?.(true);
    const saved = await run(async () => {
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
      // Biometrics last, once set up: an extra that must never stop the person finishing, and
      // never left on by an attempt that did not finish.
      if (lock !== 'none' && biometricAvailable && alsoBiometric) {
        await enableBiometric().catch(() => toast('warning', BIOMETRIC_FAILED));
      }
    });
    setBusy(false);
    if (saved) {
      setDirection('forward');
      setDone(true);
    } else onFinishing?.(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (done) return onFinishing?.(false);
    if (!valid[step]) return;
    if (step === 1 && account.status === 'none') void createAccount();
    else if (step < STEPS) go(step + 1);
    else void finish();
  }

  const offline = account.offline || failure === 'offline';
  // Back on the first step undoes "Create an account", but only while the data it made is still
  // empty: no account (none made, none logged in to), nothing entered. Log in hides this row.
  const canLeave = account.loaded && account.status === 'none' && emptyData;

  async function backToWelcome() {
    setBusy(true);
    // The Delete all data path, which boots to the Welcome screen.
    await run(deleteAllData);
    setBusy(false);
  }

  function render(shown: Step) {
    switch (shown) {
      case 'done':
        return (
          <>
            <div
              aria-hidden
              className="bg-success-soft text-success grid size-[84px] place-items-center rounded-full"
            >
              <Check className="size-10" strokeWidth={3} />
            </div>
            <ScreenHeader
              title={name.trim() ? `You're all set, ${name.trim()}` : "You're all set"}
              lead="Level 1 · your first quest is waiting."
            />
          </>
        );
      case 'login':
        return (
          <LoginScreen
            onBack={() => goAside(null)}
            onForgot={() => goAside('forgot')}
            // Over setup the profile the account brings would end it at once: stay for the PIN.
            onHold={onFinishing}
            onDone={() => goAside(null)}
          />
        );
      case 'forgot':
        return <ForgotScreen onBack={() => goAside('login')} />;
      case 1:
        if (account.status !== 'none') {
          return (
            <ScreenHeader
              eyebrow="Your account"
              title="Your account is ready"
              lead={`You're signed in as ${account.username}.`}
            />
          );
        }
        return (
          <>
            <ScreenHeader
              eyebrow="Your account"
              title="Create your account"
              lead="So you can move to a new phone and keep everything."
            />
            <TextField
              variant="line"
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              error={accountErrors.username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              variant="line"
              label={'Email (for "forgot password")'}
              type="email"
              autoComplete="email"
              value={email}
              error={accountErrors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordField
              autoComplete="new-password"
              hint="At least 10 characters"
              value={password}
              error={accountErrors.password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-muted text-sm">{SAVE_NOTE}</p>
            <button
              type="button"
              onClick={() => goAside('login')}
              disabled={!account.loaded || signingUp}
              className="text-accent-text -my-1 inline-flex min-h-11 items-center self-start font-bold underline underline-offset-4 disabled:pointer-events-none disabled:opacity-45"
            >
              I already have an account
            </button>
            {(offline || failure === 'service') && (
              <div className="flex flex-col items-start gap-3">
                <p className="text-muted text-sm">
                  {offline
                    ? "You're offline. Create your account later in Settings."
                    : "Funancial's service isn't answering right now. You can make an account later in Settings."}
                </p>
                <Button
                  variant="secondary"
                  disabled={signingUp}
                  onClick={() => {
                    setPassword('');
                    go(2);
                  }}
                >
                  Skip for now
                </Button>
              </div>
            )}
            <Problem>{accountErrors.other}</Problem>
          </>
        );
      case 2:
        return (
          <>
            <ScreenHeader
              eyebrow="About you"
              title="Your currency and name"
              lead="Pick the money you use. Your name is optional."
            />
            <Select
              variant="line"
              label="Currency"
              value={currency}
              onChange={changeCurrency}
              options={options}
            />
            <TextField
              variant="line"
              label="What should we call you?"
              hint="Optional."
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        );
      case 3:
        return (
          <>
            <ScreenHeader
              eyebrow="Your money"
              title="What you have now"
              lead="Rough numbers are fine. You can correct them anytime."
            />
            <MoneyField
              variant="line"
              label="Cash & checking"
              currency={currency}
              value={cash}
              onChange={setCash}
            />
            <MoneyField
              variant="line"
              label="Savings"
              currency={currency}
              value={savings}
              onChange={setSavings}
            />
          </>
        );
      case 4:
        return (
          <>
            <ScreenHeader
              eyebrow="Your income"
              title="Your salary"
              lead="So Funancial knows when money comes in."
            />
            <Switch
              label="I don't have a regular salary"
              checked={noSalary}
              onChange={setNoSalary}
            />
            {!noSalary && (
              <>
                <MoneyField
                  variant="line"
                  label="Monthly take-home pay"
                  currency={currency}
                  value={salary}
                  onChange={setSalary}
                  hint="What actually lands in your account."
                />
                <Select
                  variant="line"
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
      case 5:
        return (
          <>
            <ScreenHeader
              eyebrow="Your cards"
              title="Credit cards"
              lead="Card spending counts toward your limits right away and is paid from cash later. Skip this if you don't use one."
            />
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
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => setAddingCard(true)}
              >
                Add a card
              </Button>
            )}
          </>
        );
      default:
        return (
          <>
            <ScreenHeader
              eyebrow="Keep it private"
              title="Lock Funancial?"
              lead="Without a lock, anyone using this device can open Funancial. You can change this later in Settings."
            />
            <RadioGroup<LockChoice>
              variant="underline"
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
                  variant="line"
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
                  variant="line"
                  label={`Confirm ${LOCK_NAMES[lock]}`}
                  type="password"
                  inputMode={lock === 'pin' ? 'numeric' : undefined}
                  autoComplete="new-password"
                  value={confirm}
                  error={errors.confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {biometricAvailable && (
                  <Switch
                    label="Also unlock with fingerprint or face"
                    checked={alsoBiometric}
                    onChange={setAlsoBiometric}
                  />
                )}
              </>
            )}
          </>
        );
    }
  }

  // The prototype's bar: empty on the first step, full at the end.
  const progress = done ? 100 : Math.round(((step - 1) / STEPS) * 1000) / 10;
  const working = busy || signingUp;
  let label = 'Next';
  if (done) label = 'Open Funancial';
  else if (step === 1 && signingUp) label = 'Creating…';
  else if (step === STEPS) label = busy ? 'Setting up…' : 'Start my adventure';

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Blobs step={done ? STEPS : step - 1} />
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-[22px] pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-16">
        {!aside && (
          <div className="flex items-center gap-3">
            {step > 1 && !done ? (
              <BackButton onClick={() => go(step - 1)} disabled={working} />
            ) : step === 1 && canLeave ? (
              <BackButton onClick={() => void backToWelcome()} disabled={working} />
            ) : (
              <span aria-hidden className="size-11 shrink-0" />
            )}
            <div aria-hidden className="bg-track h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                data-progress
                className="bg-primary h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-muted min-w-[5.25rem] text-right text-sm font-bold">
              {done ? '' : `Step ${step} of ${STEPS}`}
            </p>
          </div>
        )}
        <div className={`flex flex-1 flex-col ${aside ? 'mt-1' : 'mt-8'}`}>
          {/* Each step is its own form (Enter submits it), as Log in has its own: no form inside a form. */}
          <StepMotion<Step>
            stepKey={aside ?? (done ? 'done' : step)}
            direction={direction}
            render={render}
            layerClassName="flex flex-col gap-5"
            form={(key) =>
              key === 'login' || key === 'forgot'
                ? undefined
                : { id: `setup-${key}`, onSubmit: submit }
            }
          />
          {!aside && (
            <div className="mt-auto pt-10">
              <Button
                type="submit"
                form={`setup-${done ? 'done' : step}`}
                size="lg"
                className="w-full"
                disabled={!done && !valid[step]}
              >
                {label}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
