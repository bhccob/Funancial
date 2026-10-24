import { Check } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { StepMotion, type StepDirection } from '@/components/ui/StepMotion';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { validateSecret, type SecretKind } from '@/data/keys';
import { CodeField } from '@/features/account/CodeField';
import { ForgotScreen } from '@/features/account/ForgotScreen';
import { LoginScreen } from '@/features/account/LoginScreen';
import {
  BackButton,
  PasswordField,
  Problem,
  ResendCode,
  SaveNote,
  ScreenHeader,
} from '@/features/account/parts';
import {
  ACCOUNT_EYEBROW,
  ACCOUNT_LEAD,
  ACCOUNT_TITLE,
  BIOMETRIC_FAILED,
  CODE_EYEBROW,
  CODE_TITLE,
  codeLead,
  EMAIL_HINT,
  PASSWORD_HINT,
} from '@/features/account/shared';
import { useEmailCode, type CodeFailure, type CodeOutcome } from '@/features/account/useEmailCode';
import { currencyOptions, defaultCurrency } from '@/features/shared/currencies';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { emailProblem, hasData, passwordProblem, usernameProblem } from '@/store/accountActions';
import { useAccount } from '@/store/useAccount';
import { useFinanceActions } from '@/store/useFinance';

const STEPS = 4;
/** The steps by name: the account, its emailed code, currency and name, the lock. */
const ACCOUNT = 1;
const CODE = 2;
const YOU = 3;
const LOCK = 4;
/** A step, the last screen, or a way out of the first step to an account the person already has. */
type Step = number | 'done' | 'login' | 'forgot';

type LockChoice = 'none' | SecretKind;
const LOCK_NAMES: Record<SecretKind, string> = { pin: 'PIN', passphrase: 'passphrase' };

/**
 * A try that failed for a reason that isn't what was typed (`CodeFailure`), with the line said over
 * "Skip for now": none of them may block setup. `line` is null where the step says it already.
 */
type Failure = { kind: CodeFailure; line: string | null };

const FAILURE_LINE: Record<Exclude<CodeFailure, 'limited'>, string> = {
  offline: "You're offline. Create your account later in Settings.",
  keys: "This phone couldn't make your keys. Close other apps and try again, or make an account later in Settings.",
  service:
    "Funcial's service isn't answering right now. You can make an account later in Settings.",
};

/**
 * The failure of an outcome. Too many tries says its own words, the wait it names (the service is
 * answering, and holding back): in the line on the account step, and on the code step in the step's
 * own message, which says it already.
 */
function failureOf(
  outcome: Extract<CodeOutcome, { kind: 'failed' }>,
  onCodeStep: boolean,
): Failure {
  const { failure, message } = outcome;
  if (failure === 'limited') return { kind: failure, line: onCodeStep ? null : message };
  return { kind: failure, line: FAILURE_LINE[failure] };
}

/**
 * First-run setup for real data in four short steps, each rising in from below: the account, the
 * code emailed to prove its address (the account is made only with it), currency and name, and the
 * lock; then "You're all set". Nothing about money is asked: Home asks for it afterwards.
 * `onFinishing(true)` asks the app to keep this screen up once the profile is saved (which would
 * otherwise switch to the Dashboard at once), and `onFinishing(false)` lets it go.
 */
export function OnboardingWizard({ onFinishing }: { onFinishing?(finishing: boolean): void }) {
  const { completeOnboarding } = useFinanceActions();
  const setSecret = useApp((s) => s.setSecret);
  const biometricAvailable = useApp((s) => s.biometric !== 'unavailable');
  const enableBiometric = useApp((s) => s.enableBiometric);
  const deleteAllData = useApp((s) => s.deleteAllData);
  const emptyData = useApp((s) => !hasData(s.data));
  // Set up again after Delete all data started over: the name, currency and lock it kept. The
  // lock is the one there was as setup opened, not one the last step sets.
  const kept = useApp((s) => s.data.tables.profile[0]);
  const lockMode = useApp((s) => s.lockMode);
  const [keptLock] = useState(() =>
    lockMode === 'pin' || lockMode === 'passphrase' ? lockMode : null,
  );
  // The code step: the code mailed, typed, sent again, and Verify, which makes the account.
  const emailCode = useEmailCode();
  // The code step's lead, which its field is described by.
  const codeLeadId = useId();
  const account = useAccount();
  const run = useAction();
  const [options] = useState(() => currencyOptions());

  const [step, setStep] = useState(ACCOUNT);
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
  const [failure, setFailure] = useState<Failure | null>(null);

  // A guess from where the phone is; the Select still offers every currency.
  const [currency, setCurrency] = useState(
    () =>
      kept?.currency ??
      defaultCurrency(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language),
  );
  const [name, setName] = useState(kept?.name ?? '');
  const [lock, setLock] = useState<LockChoice>('none');
  const [secret, setSecretText] = useState('');
  const [confirm, setConfirm] = useState('');
  const [alsoBiometric, setAlsoBiometric] = useState(true);
  const [errors, setErrors] = useState<{ secret?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  function go(to: number) {
    setDirection(to > step ? 'forward' : 'back');
    // A failure belongs to the try on the step it was met on.
    setFailure(null);
    setStep(to);
  }

  function goAside(to: 'login' | 'forgot' | null) {
    // Further in (log in, then forgot) rises; back out comes down.
    setDirection(to === null || (to === 'login' && aside === 'forgot') ? 'back' : 'forward');
    setAside(to);
  }

  /** Continue on the account step: checks what was typed, then has a code mailed to the address. */
  async function askForCode() {
    const found = {
      username: usernameProblem(username) ?? undefined,
      email: emailProblem(email) ?? undefined,
      password: passwordProblem(password, { username, email }) ?? undefined,
    };
    setAccountErrors(found);
    if (found.username || found.email || found.password) return;
    const outcome = await emailCode.request({ username, email });
    switch (outcome?.kind) {
      case 'ok':
        // Mailed, or the one mailed for these details still works (Back and on again).
        return go(CODE);
      case 'taken':
        // The person's own input: theirs to fix, with no way round it.
        setFailure(null);
        return setAccountErrors({ username: outcome.message });
      case 'invalid':
        setFailure(null);
        return setAccountErrors({ other: outcome.message });
      case 'failed':
        // Say so once, in the one line that comes with the way on.
        setAccountErrors({});
        return setFailure(failureOf(outcome, false));
    }
  }

  /** "Send a new code" on the code step. */
  async function resend() {
    const outcome = await emailCode.resend({ username, email });
    switch (outcome?.kind) {
      case 'ok':
        return setFailure(null);
      case 'taken':
        setAccountErrors({ username: outcome.message });
        return go(ACCOUNT);
      case 'failed':
        // The service keeps the last code when a mail fails, so what was typed of it stays.
        return setFailure(failureOf(outcome, true));
    }
  }

  /** Verify on the code step: makes the account with the code. */
  async function verify() {
    // Slow on purpose (the password is stretched into keys): once per tap, behind the busy state.
    const outcome = await emailCode.verify({ username, email, password });
    switch (outcome?.kind) {
      case 'ok':
        setPassword('');
        return go(YOU);
      case 'shown':
        // Said on the code step (a wrong or expired code, …): no failure of the service's.
        return setFailure(null);
      case 'taken':
        // Someone took the name since the code was sent: the account step is where it is fixed.
        setAccountErrors({ username: outcome.message });
        return go(ACCOUNT);
      case 'failed':
        // Too many tries is said on the step, which offers a new code (this one may be spent) and
        // the way on without an account.
        return setFailure(failureOf(outcome, true));
    }
  }

  function skip() {
    setPassword('');
    emailCode.setCode('');
    go(YOU);
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
      await completeOnboarding({ name, currency });
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

  const { sending, signingUp } = emailCode;
  const working = busy || sending || signingUp;
  const valid: Record<number, boolean> = {
    // Not before the phone has read whether it already has an account.
    [ACCOUNT]: account.loaded && !working,
    [CODE]: !working,
    [YOU]: true,
    [LOCK]: !busy,
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (done) return onFinishing?.(false);
    if (!valid[step]) return;
    if (step === ACCOUNT) {
      // An account the phone already has (a log-in over setup, or one kept by Delete all data) has
      // nothing to prove: on past the code.
      if (account.status === 'none') void askForCode();
      else go(YOU);
    } else if (step === CODE) void verify();
    else if (step < STEPS) go(step + 1);
    else void finish();
  }

  const offline = account.offline || failure?.kind === 'offline';
  // Back on the first step undoes "Create an account", but only while the data it made is still
  // empty: no account (none made, none logged in to), nothing entered. Log in hides this row.
  const canLeave = account.loaded && account.status === 'none' && emptyData;
  // Back from Currency and name goes to the account step: a code there is nothing to go back to
  // once the account is made, or after the person skipped it.
  const backTo = step === YOU ? ACCOUNT : step - 1;

  async function backToWelcome() {
    setBusy(true);
    // The Delete all data path, which boots to the Welcome screen.
    await run(deleteAllData);
    setBusy(false);
  }

  /** The way on without an account, and why, when the service or the phone let the person down. */
  function skipOffer() {
    if (!offline && failure === null) return null;
    const line = offline ? FAILURE_LINE.offline : (failure?.line ?? null);
    return (
      <div className="flex flex-col items-start gap-3">
        {line && <p className="text-muted text-sm">{line}</p>}
        <Button variant="secondary" disabled={working} onClick={skip}>
          Skip for now
        </Button>
      </div>
    );
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
      case ACCOUNT:
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
            <ScreenHeader eyebrow={ACCOUNT_EYEBROW} title={ACCOUNT_TITLE} lead={ACCOUNT_LEAD} />
            <div>
              <TextField
                variant="row"
                label="Username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                error={accountErrors.username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <TextField
                variant="row"
                label="Email"
                hint={EMAIL_HINT}
                type="email"
                autoComplete="email"
                value={email}
                error={accountErrors.email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordField
                variant="row"
                strength={{ username, email }}
                autoComplete="new-password"
                hint={PASSWORD_HINT}
                value={password}
                error={accountErrors.password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <SaveNote />
            <button
              type="button"
              onClick={() => goAside('login')}
              disabled={!account.loaded || working}
              className="text-accent-text -my-1 inline-flex min-h-11 items-center self-start font-bold underline underline-offset-4 disabled:pointer-events-none disabled:opacity-45"
            >
              I already have an account
            </button>
            {skipOffer()}
            <Problem>{accountErrors.other}</Problem>
          </>
        );
      case CODE:
        return (
          <>
            <ScreenHeader
              eyebrow={CODE_EYEBROW}
              title={CODE_TITLE}
              lead={codeLead(emailCode.sentTo ?? email.trim())}
              leadId={codeLeadId}
            />
            <CodeField
              describedBy={codeLeadId}
              value={emailCode.code}
              onChange={emailCode.setCode}
              error={emailCode.codeError}
            />
            <ResendCode onResend={() => void resend()} disabled={emailCode.resendHeld || working} />
            <Problem>{emailCode.problem}</Problem>
            {skipOffer()}
          </>
        );
      case YOU:
        return (
          <>
            <ScreenHeader
              eyebrow="You"
              title="Your currency and name"
              lead="Pick the money you use. Your name is optional."
            />
            <div>
              <Select
                variant="row"
                label="Currency"
                value={currency}
                onChange={setCurrency}
                options={options}
              />
              <TextField
                variant="row"
                label="What should we call you?"
                hint="Optional."
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </>
        );
      default:
        // `lock` stays 'none', so finishing leaves the lock there is as it is.
        if (keptLock) {
          return (
            <ScreenHeader
              eyebrow="Keep it private"
              title={`Your ${LOCK_NAMES[keptLock]} stays`}
              lead="Funcial keeps the lock you have. You can change it anytime in Settings."
            />
          );
        }
        return (
          <>
            <ScreenHeader
              eyebrow="Keep it private"
              title="Lock Funcial?"
              lead="Without a lock, anyone using this device can open Funcial. You can change this later in Settings."
            />
            <RadioGroup<LockChoice>
              variant="pills"
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
              <div>
                <TextField
                  variant="row"
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
                  variant="row"
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
                    variant="row"
                    label="Also unlock with fingerprint or face"
                    checked={alsoBiometric}
                    onChange={setAlsoBiometric}
                  />
                )}
              </div>
            )}
          </>
        );
    }
  }

  // The prototype's bar: empty on the first step, full at the end.
  const progress = done ? 100 : ((step - 1) / STEPS) * 100;
  let label = 'Continue';
  if (done) label = 'Open Funcial';
  else if (step === ACCOUNT && sending) label = 'Sending…';
  else if (step === CODE) label = signingUp ? 'Verifying…' : 'Verify';
  else if (step === STEPS) label = busy ? 'Setting up…' : 'Start my adventure';

  return (
    <main className="page-blobs relative flex min-h-dvh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-[22px] pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-16">
        {!aside && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              {step > ACCOUNT && !done ? (
                <BackButton onClick={() => go(backTo)} disabled={working} />
              ) : step === ACCOUNT && canLeave ? (
                <BackButton onClick={() => void backToWelcome()} disabled={working} />
              ) : (
                <span aria-hidden className="size-11 shrink-0" />
              )}
              <p className="text-muted text-sm font-bold">
                {done ? '' : `Step ${step} of ${STEPS}`}
              </p>
              <span aria-hidden className="size-11 shrink-0" />
            </div>
            <div aria-hidden className="bg-track h-1.5 overflow-hidden rounded-full">
              <div
                data-progress
                className="bg-primary h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        <div className={`flex flex-1 flex-col ${aside ? 'mt-1' : 'mt-7'}`}>
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
