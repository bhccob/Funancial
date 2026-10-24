import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui/TextField';
import { CodeField } from '@/features/account/CodeField';
import { BackButton, PasswordField, Problem, ResendCode, SaveNote } from '@/features/account/parts';
import {
  ACCOUNT_EYEBROW,
  ACCOUNT_LEAD,
  ACCOUNT_TITLE,
  CODE_EYEBROW,
  CODE_TITLE,
  codeLead,
  EMAIL_HINT,
  PASSWORD_HINT,
} from '@/features/account/shared';
import { useEmailCode, type CodeOutcome } from '@/features/account/useEmailCode';
import { toast } from '@/lib/toast';
import { emailProblem, passwordProblem, usernameProblem } from '@/store/accountActions';

/** The two steps of Create account: the account, then the code emailed to prove its address. */
type Step = 'account' | 'code';

const TITLES: Record<Step, string> = { account: ACCOUNT_TITLE, code: CODE_TITLE };

/**
 * What heads a step of the sheet: a small word, the step's title and a muted line. The sheet is named
 * by its title, which is the one heading a screen reader meets; the words drawn here are its copy (the
 * credit-card sheet draws its own the same way), so they are left out of the reading.
 */
function StepHeader({
  eyebrow,
  title,
  lead,
  leadId,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  /** The lead's id, for a field the lead tells about (`aria-describedby`). */
  leadId?: string;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <p className="text-xp-text text-xs font-extrabold tracking-[0.12em] uppercase">{eyebrow}</p>
        <p className="text-section">{title}</p>
      </div>
      <p id={leadId} className="text-muted font-semibold">
        {lead}
      </p>
    </header>
  );
}

/**
 * Create account, in a sheet and in two steps as setup's first two are: the account (username, email,
 * password), whose Continue has a code mailed to the address, then the code, whose Verify makes the
 * account with it. Back returns to the first step with everything kept; the code step is
 * `useEmailCode`, which setup uses too. Closing starts over from the first step, with the name and
 * address kept and the password, the code typed and the keys gone, and a code sent a moment ago is
 * gone back to rather than mailed again. So is one sent before a lock took Settings down, or before
 * a reload: the sheet opens with that name and address.
 */
export function CreateAccountSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const emailCode = useEmailCode();
  // The code step's lead, which its field is described by.
  const codeLeadId = useId();
  const [step, setStep] = useState<Step>('account');
  const [username, setUsername] = useState(emailCode.restored?.username ?? '');
  const [email, setEmail] = useState(emailCode.restored?.email ?? '');
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
    emailCode.forgetKeys();
    onClose();
  };
  // Not while a call is under way: a close that left the call running would have its answer land in
  // a sheet nobody is looking at. A Verify can take about a minute and a half at its very worst (the
  // keys, then a sign-up of up to 30 s, a retry after a lost reply of up to 30 s, and the log-in that
  // claims the name of up to 30 s, after a moment's wait when the retry found its code spent; the
  // first copy goes up after it, not inside it), so the buttons that would leave are off meanwhile,
  // as setup's Back is.
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
              <StepHeader eyebrow={ACCOUNT_EYEBROW} title={TITLES.account} lead={ACCOUNT_LEAD} />
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
                  onChange={(e) => {
                    setUsername(e.target.value);
                    emailCode.forgetKeys();
                  }}
                />
                <TextField
                  variant="row"
                  label="Email"
                  hint={EMAIL_HINT}
                  type="email"
                  autoComplete="email"
                  value={email}
                  error={errors.email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    emailCode.addressChanged(e.target.value);
                  }}
                />
                <PasswordField
                  variant="row"
                  strength={{ username, email }}
                  autoComplete="new-password"
                  hint={PASSWORD_HINT}
                  value={password}
                  error={errors.password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    emailCode.forgetKeys();
                  }}
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
                leadId={codeLeadId}
              />
              {/* The code is what comes next: the field takes the focus, and is heard with the lead. */}
              <CodeField
                autoFocus
                describedBy={codeLeadId}
                value={emailCode.code}
                onChange={emailCode.setCode}
                error={emailCode.codeError}
              />
              <ResendCode
                onResend={() => void resend()}
                disabled={emailCode.resendHeld || working}
                secondsLeft={emailCode.resendLeft}
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
