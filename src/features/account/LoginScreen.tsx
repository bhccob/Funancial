import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { TextField } from '@/components/ui/TextField';
import { validateSecret } from '@/data/keys';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useAccount, useAccountActions } from '@/store/useAccount';
import { BackButton, PasswordField, Problem, ScreenHeader } from './parts';
import { BIOMETRIC_FAILED, errorMessage, useBusy } from './shared';

const REPLACE = "Replace this phone's data with your account's copy?";

/** The new phone has no lock yet: the account's data is here, so ask for a PIN to open it with. */
function NewPhonePin({ onDone }: { onDone(): void }) {
  const setSecret = useApp((s) => s.setSecret);
  const biometricAvailable = useApp((s) => s.biometric !== 'unavailable');
  const enableBiometric = useApp((s) => s.enableBiometric);
  const run = useAction();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [alsoBiometric, setAlsoBiometric] = useState(true);
  const [errors, setErrors] = useState<{ pin?: string; confirm?: string }>({});
  const { busy, guard } = useBusy();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateSecret(pin, 'pin');
    const found = problem
      ? { pin: problem }
      : pin !== confirm
        ? { confirm: "Those don't match." }
        : {};
    setErrors(found);
    if ('pin' in found || 'confirm' in found) return;
    await guard(async () => {
      if (!(await run(() => setSecret(pin, 'pin')))) return;
      // Last, and never in the way: the PIN already holds.
      if (biometricAvailable && alsoBiometric) {
        await enableBiometric().catch(() => toast('warning', BIOMETRIC_FAILED));
      }
      onDone();
    });
  }

  return (
    <>
      <ScreenHeader
        eyebrow="Almost there"
        title="Lock this phone"
        lead="Choose a PIN to open Funcial on this phone."
        focus
      />
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <TextField
          variant="line"
          label="Choose a PIN"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          hint="4 to 8 digits"
          value={pin}
          error={errors.pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <TextField
          variant="line"
          label="Confirm PIN"
          type="password"
          inputMode="numeric"
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
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Setting up…' : 'Set PIN'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          Skip the lock
        </Button>
      </form>
    </>
  );
}

/**
 * Log in (I have an account): the username and password, then the account's copy on this phone, then
 * a PIN for it. `onHold(true)` from the first tap asks the app to keep this screen up while the phone
 * moves on to its new data (it passes through "unlocked" on the way), and `onHold(false)` lets go.
 * `onDone` is for a host that goes on showing after the PIN step (setup, when the account had no copy).
 */
export function LoginScreen({
  onBack,
  onForgot,
  onHold,
  onDone,
}: {
  onBack(): void;
  onForgot(): void;
  onHold?(held: boolean): void;
  onDone?(): void;
}) {
  const { logIn } = useAccountActions();
  const { offline } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'pin'>('form');
  const [error, setError] = useState<string>();
  const { busy, guard } = useBusy();

  // Never leave the app held by a screen that is gone.
  useEffect(() => () => onHold?.(false), [onHold]);

  function leave() {
    onHold?.(false);
    onBack();
  }

  async function attempt(replace: boolean) {
    setError(undefined);
    await guard(async () => {
      onHold?.(true);
      try {
        // Slow on purpose (the password is stretched into keys): once per tap, behind the busy state.
        const outcome = await logIn({ username, password }, { replace });
        if (outcome === 'needs-confirm') return setStep('confirm');
        setPassword('');
        setStep('pin');
      } catch (err) {
        setStep('form');
        setError(errorMessage(err));
      }
    });
  }

  if (step === 'pin') {
    return (
      <NewPhonePin
        onDone={() => {
          onHold?.(false);
          onDone?.();
        }}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <>
        <ScreenHeader
          eyebrow="Before you log in"
          title={REPLACE}
          focus
          lead="What is on this phone now is replaced by your account's copy."
        />
        <div className="flex flex-col gap-3">
          <Button variant="danger" size="lg" disabled={busy} onClick={() => void attempt(true)}>
            {busy ? 'Logging in…' : 'Replace'}
          </Button>
          <Button variant="secondary" size="lg" disabled={busy} onClick={leave}>
            Keep this phone&apos;s data
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <BackButton onClick={leave} disabled={busy} />
      </div>
      <ScreenHeader
        eyebrow="Welcome back"
        title="Log in"
        lead="Use the username and password you made for your account."
      />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void attempt(false);
        }}
        noValidate
      >
        <TextField
          variant="line"
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <PasswordField
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {offline && (
          <p className="text-muted text-sm">
            You&apos;re offline. Connect to the internet to log in.
          </p>
        )}
        <Problem>{error}</Problem>
        <Button type="submit" size="lg" disabled={busy || !username || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
        <button
          type="button"
          onClick={onForgot}
          disabled={busy}
          className="text-accent-text -my-1 inline-flex min-h-11 items-center justify-center font-bold underline underline-offset-4 disabled:pointer-events-none disabled:opacity-45"
        >
          Forgot password?
        </button>
      </form>
    </>
  );
}
