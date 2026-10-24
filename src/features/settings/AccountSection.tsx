import { UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { CodeField } from '@/features/account/CodeField';
import { ForgotForm } from '@/features/account/ForgotScreen';
import { BackButton, PasswordField, Problem, ResendCode } from '@/features/account/parts';
import {
  CODE_EYEBROW,
  CODE_TITLE,
  codeLead,
  errorMessage,
  FORGOT_LEAD,
  SAVE_NOTE,
  useBusy,
} from '@/features/account/shared';
import { useEmailCode, type CodeOutcome } from '@/features/account/useEmailCode';
import { IconRow, ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { emailProblem, passwordProblem, usernameProblem } from '@/store/accountActions';
import { useAccount, useAccountActions } from '@/store/useAccount';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const SaveNote = () => <p className="text-muted text-sm">{SAVE_NOTE}</p>;

/** The two steps of Create account: the account, then the code emailed to prove its address. */
type Step = 'account' | 'code';

const TITLES: Record<Step, string> = { account: 'Create your account', code: CODE_TITLE };

/**
 * What heads a step of the sheet: a small word, the step's title and a muted line. The sheet is named
 * by its title, which is the one heading a screen reader meets; the words drawn here are its copy (the
 * credit-card sheet draws its own the same way), so they are left out of the reading.
 */
function StepHeader({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return (
    <header className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <p className="text-xp-text text-xs font-extrabold tracking-[0.12em] uppercase">{eyebrow}</p>
        <p className="text-section">{title}</p>
      </div>
      <p className="text-muted font-semibold">{lead}</p>
    </header>
  );
}

/**
 * Create account, in a sheet and in two steps as setup's first two are: the account (username, email,
 * password), whose Continue has a code mailed to the address, then the code, whose Verify makes the
 * account with it. Back returns to the first step with everything kept; the code step is
 * `useEmailCode`, which setup uses too. Closing starts over from the first step, with the name and
 * address kept and the password and the code typed gone, and a code sent a moment ago is gone back to
 * rather than mailed again.
 */
function CreateAccountSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const emailCode = useEmailCode();
  const [step, setStep] = useState<Step>('account');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    other?: string;
  }>({});
  // What went wrong with a try on the code step that the code step itself does not say.
  const [codeProblem, setCodeProblem] = useState<string>();

  const { sending, signingUp } = emailCode;
  const working = sending || signingUp;

  const close = () => {
    setPassword('');
    setErrors({});
    setStep('account');
    setCodeProblem(undefined);
    emailCode.setCode('');
    onClose();
  };
  // Not while a call is under way: its answer would land in a sheet nobody is looking at.
  const closeUnlessWorking = () => {
    if (!working) close();
  };

  /** What a try that failed for a reason outside the person's input says, where the step is. */
  function say(outcome: Extract<CodeOutcome, { kind: 'failed' }>, onCodeStep: boolean) {
    // Too many tries is already said on the code step, by the hook, as `problem`.
    if (onCodeStep && outcome.failure === 'limited') return;
    if (onCodeStep) setCodeProblem(outcome.message);
    else setErrors({ other: outcome.message });
  }

  /** Continue: checks what was typed, then has a code mailed to the address. */
  async function askForCode(e: FormEvent) {
    e.preventDefault();
    const found = {
      username: usernameProblem(username) ?? undefined,
      email: emailProblem(email) ?? undefined,
      password: passwordProblem(password, { username, email }) ?? undefined,
    };
    setErrors(found);
    if (found.username || found.email || found.password) return;
    const outcome = await emailCode.request({ username, email });
    switch (outcome?.kind) {
      case 'ok':
        // Mailed, or the one mailed for these details still works (Back and on again).
        setCodeProblem(undefined);
        return setStep('code');
      case 'taken':
        return setErrors({ username: outcome.message });
      case 'invalid':
        return setErrors({ other: outcome.message });
      case 'failed':
        return say(outcome, false);
    }
  }

  /** Send a new code. */
  async function resend() {
    setCodeProblem(undefined);
    const outcome = await emailCode.resend({ username, email });
    switch (outcome?.kind) {
      case 'taken':
        // Someone took the name since: the account step is where it is fixed.
        setErrors({ username: outcome.message });
        return setStep('account');
      case 'failed':
        // The service keeps the last code when a mail fails, so what was typed of it stays.
        return say(outcome, true);
    }
  }

  /** Verify: makes the account with the code. */
  async function verify(e: FormEvent) {
    e.preventDefault();
    setCodeProblem(undefined);
    const outcome = await emailCode.verify({ username, email, password });
    switch (outcome?.kind) {
      case 'ok':
        toast('success', 'Your account is ready.');
        setUsername('');
        setEmail('');
        return close();
      case 'taken':
        setErrors({ username: outcome.message });
        return setStep('account');
      case 'failed':
        return say(outcome, true);
    }
    // A wrong or expired code, or too many tries: said on the code step by `useEmailCode`.
  }

  return (
    <Sheet open={open} title={TITLES[step]} onClose={closeUnlessWorking}>
      {open && (
        <div className="mx-auto w-full max-w-lg">
          {step === 'account' ? (
            <form key="account" className="flex flex-col gap-5" onSubmit={askForCode} noValidate>
              <StepHeader
                eyebrow="Your account"
                title={TITLES.account}
                lead="So you can move to a new phone and keep everything."
              />
              <div>
                <TextField
                  variant="row"
                  label="Username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={username}
                  error={errors.username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <TextField
                  variant="row"
                  label="Email"
                  hint={'For "forgot password".'}
                  type="email"
                  autoComplete="email"
                  value={email}
                  error={errors.email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <PasswordField
                  variant="row"
                  strength={{ username, email }}
                  autoComplete="new-password"
                  hint="At least 10 characters"
                  value={password}
                  error={errors.password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <SaveNote />
              <Problem>{errors.other}</Problem>
              <div className="flex flex-col gap-2">
                <Button type="submit" size="lg" disabled={working}>
                  {sending ? 'Sending…' : 'Continue'}
                </Button>
                <Button variant="secondary" onClick={close} disabled={working}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form key="code" className="flex flex-col gap-5" onSubmit={verify} noValidate>
              <BackButton onClick={() => setStep('account')} disabled={working} />
              <StepHeader
                eyebrow={CODE_EYEBROW}
                title={TITLES.code}
                lead={codeLead(emailCode.sentTo ?? email.trim())}
              />
              <CodeField
                autoFocus
                value={emailCode.code}
                onChange={emailCode.setCode}
                error={emailCode.codeError}
              />
              <ResendCode
                onResend={() => void resend()}
                disabled={emailCode.resendHeld || working}
              />
              <Problem>{emailCode.problem ?? codeProblem}</Problem>
              <Button type="submit" size="lg" disabled={working}>
                {signingUp ? 'Verifying…' : 'Verify'}
              </Button>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ForgotDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} title="Forgot password?" description={FORGOT_LEAD} onClose={onClose}>
      {open && <ForgotForm doneLabel="Close" onDone={onClose} onCancel={onClose} />}
    </Dialog>
  );
}

function LogInDialog({
  open,
  defaultUsername = '',
  onClose,
  onForgot,
}: {
  open: boolean;
  defaultUsername?: string;
  onClose(): void;
  onForgot(): void;
}) {
  const { logIn } = useAccountActions();
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const { busy, guard } = useBusy();

  const close = () => {
    setPassword('');
    setConfirming(false);
    setError(undefined);
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    await guard(async () => {
      try {
        // Without `replace` a phone that has data is not touched: the person is asked first.
        const outcome = await logIn({ username, password }, { replace: confirming });
        if (outcome === 'needs-confirm') return setConfirming(true);
        toast('success', "You're logged in. This phone now has your account's copy.");
        close();
      } catch (err) {
        setConfirming(false);
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Log in"
      description={
        confirming
          ? "Replace this phone's data with your account's copy?"
          : "Get your account's data on this phone."
      }
      onClose={close}
    >
      {open && (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          {confirming ? (
            <p className="text-muted text-sm">
              What is on this phone now is replaced by your account&apos;s copy.
            </p>
          ) : (
            <>
              <div>
                <TextField
                  variant="row"
                  label="Username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <PasswordField
                  variant="row"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  // Not kept across a trip out of this dialog: it is typed again when it is back.
                  setPassword('');
                  onForgot();
                }}
                disabled={busy}
                className="text-accent-text -my-1 inline-flex min-h-11 items-center self-start font-bold underline underline-offset-4 disabled:pointer-events-none disabled:opacity-45"
              >
                Forgot password?
              </button>
            </>
          )}
          <Problem>{error}</Problem>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !username || !password}>
              {busy ? 'Logging in…' : confirming ? 'Replace' : 'Log in'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { changePassword } = useAccountActions();
  const { username, email } = useAccount();
  // Whose password it is: the bar and the check against the names read the same.
  const owner = { username: username ?? undefined, email: email ?? undefined };
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ next?: string; again?: string; other?: string }>({});
  const { busy, guard } = useBusy();

  const close = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setErrors({});
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(next, owner);
    if (problem) return setErrors({ next: problem });
    if (next !== again) return setErrors({ again: "Those don't match." });
    setErrors({});
    await guard(async () => {
      try {
        await changePassword(current, next);
        toast('success', 'Password changed.');
        close();
      } catch (err) {
        setErrors({ other: errorMessage(err) });
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Change password"
      description="You need the new password only to log in on another phone."
      onClose={close}
    >
      {open && (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <div>
            <PasswordField
              variant="row"
              label="Current password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <PasswordField
              variant="row"
              label="New password"
              strength={owner}
              autoComplete="new-password"
              hint="At least 10 characters"
              value={next}
              error={errors.next}
              onChange={(e) => setNext(e.target.value)}
            />
            <PasswordField
              variant="row"
              label="Confirm new password"
              autoComplete="new-password"
              value={again}
              error={errors.again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </div>
          <Problem>{errors.other}</Problem>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !current || !next}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function DeleteCopyDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { deleteAccount } = useAccountActions();
  const [error, setError] = useState<string>();
  const { busy, guard } = useBusy();

  const close = () => {
    setError(undefined);
    onClose();
  };

  async function confirm() {
    setError(undefined);
    await guard(async () => {
      try {
        if ((await deleteAccount()) === 'deleted') {
          toast('success', 'Your account and its copy are deleted.');
        } else {
          // The service was never asked to delete anything: say so, not "deleted".
          toast(
            'info',
            'This phone was no longer signed in, so nothing was deleted. If you use your account on another phone, delete it from there.',
          );
        }
        close();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Turn off and delete my copy?"
      description="Your account and its locked copy are removed from Funcial's service, and this phone stops saving. The data on this phone stays."
      onClose={close}
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Deleting…' : 'Delete my copy'}
          </Button>
        </>
      }
    >
      <Problem>{error}</Problem>
    </Dialog>
  );
}

function LogOutDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { unlink } = useAccountActions();
  const run = useAction();
  const { busy, guard } = useBusy();

  return (
    <Dialog
      open={open}
      title="Log out on this phone?"
      description="Your data stays on this phone, and your account and its copy stay on Funcial's service. This phone stops saving to your account until you log in again. If you log in again later, your account's copy replaces what is on this phone."
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              void guard(async () => {
                await run(unlink, { success: 'Logged out. Your data is still on this phone.' });
                onClose();
              })
            }
          >
            Log out
          </Button>
        </>
      }
    />
  );
}

type Opened = 'create' | 'login' | 'forgot' | 'password' | 'logout' | 'delete' | null;

function Loaded() {
  const { status, username, email, savedAt, tooBig, offline } = useAccount();
  const { unlink } = useAccountActions();
  const run = useAction();
  const [opened, setOpened] = useState<Opened>(null);
  const close = () => setOpened(null);

  return (
    <div className="flex flex-col gap-5">
      {status === 'none' && (
        <>
          <p>Make an account so you can move to a new phone and keep everything.</p>
          <SaveNote />
          {offline && (
            <p className="text-muted text-sm">
              You&apos;re offline. Connect to the internet to create an account or log in.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setOpened('create')}>Create account</Button>
            <Button variant="secondary" onClick={() => setOpened('login')}>
              Log in
            </Button>
          </div>
        </>
      )}

      {status === 'linked' && (
        <div className={ROWS}>
          <IconRow icon={UserRound}>
            <p className={ROW_TITLE}>{username}</p>
            {email && <p className={ROW_SUB}>{email}</p>}
            <p className={ROW_SUB}>
              {savedAt
                ? `Last copy saved ${dateTime.format(new Date(savedAt))}`
                : 'No copy saved yet.'}
            </p>
            {tooBig && (
              <p className="text-danger text-sm font-bold">
                Your copy is too big to save. Ask the app&apos;s owner for help.
              </p>
            )}
          </IconRow>
          <div className="flex flex-wrap gap-3 py-3">
            <Button variant="secondary" onClick={() => setOpened('password')}>
              Change password
            </Button>
            <Button variant="secondary" onClick={() => setOpened('logout')}>
              Log out
            </Button>
            <Button variant="danger-ghost" onClick={() => setOpened('delete')}>
              Turn off and delete my copy
            </Button>
          </div>
        </div>
      )}

      {status === 'moved' && (
        <>
          <Banner tone="warning" title="Your account moved to another phone">
            This phone&apos;s data is still here. It is no longer saved to your account.
          </Banner>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setOpened('login')}>Log in again</Button>
            <Button variant="secondary" onClick={() => void run(unlink)}>
              Keep using without an account
            </Button>
          </div>
        </>
      )}

      <CreateAccountSheet open={opened === 'create'} onClose={close} />
      <LogInDialog
        open={opened === 'login'}
        defaultUsername={username ?? undefined}
        onClose={close}
        onForgot={() => setOpened('forgot')}
      />
      <ForgotDialog open={opened === 'forgot'} onClose={close} />
      <ChangePasswordDialog open={opened === 'password'} onClose={close} />
      <LogOutDialog open={opened === 'logout'} onClose={close} />
      <DeleteCopyDialog open={opened === 'delete'} onClose={close} />
    </div>
  );
}

/**
 * Settings → Account: make an account or log in, then see it and change its password, log out or turn it off;
 * or, after another phone logged in, choose between logging in again and carrying on without one.
 * Nothing shows until the account has been read for the open data, and the demo has none.
 */
export function AccountSection() {
  const { loaded } = useAccount();
  if (!loaded) return null;
  return (
    <PlainSection title="Account">
      <Loaded />
    </PlainSection>
  );
}
