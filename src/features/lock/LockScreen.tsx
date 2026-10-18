import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EraseDialog } from '@/features/system/EraseDialog';
import { usePlatform } from '@/platform/PlatformProvider';
import { useApp } from '@/store/AppStoreProvider';
import { PinPad } from './PinPad';

const WRONG = "That didn't match. Try again.";

const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - Date.now()) / 1000));

function ThrottleCountdown({ until, onDone }: { until: number; onDone(): void }) {
  const [seconds, setSeconds] = useState(() => secondsLeft(until));
  useEffect(() => {
    const id = setInterval(() => {
      const s = secondsLeft(until);
      setSeconds(s);
      if (s === 0) {
        clearInterval(id);
        onDone();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onDone]);
  return <>{`Too many tries. Try again in ${seconds}s.`}</>;
}

function PassphraseForm({
  onSubmit,
  disabled,
  error,
}: {
  onSubmit(secret: string): void;
  disabled: boolean;
  error: React.ReactNode;
}) {
  const [value, setValue] = useState('');
  const id = useId();
  const errorId = useId();
  return (
    <form
      className="flex w-full max-w-xs flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled || value.length === 0) return;
        onSubmit(value);
        setValue('');
      }}
    >
      <label htmlFor={id} className="text-sm font-bold">
        Passphrase
      </label>
      <input
        id={id}
        type="password"
        autoComplete="current-password"
        autoFocus
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => setValue(e.target.value)}
        className="border-border-strong bg-surface h-11 rounded-md border-2 px-3"
      />
      {error && (
        <p id={errorId} role="alert" className="text-danger text-sm font-bold">
          {error}
        </p>
      )}
      <Button type="submit" disabled={disabled || value.length === 0}>
        Unlock
      </Button>
    </form>
  );
}

export function LockScreen() {
  const lockMode = useApp((s) => s.lockMode);
  const unlock = useApp((s) => s.unlock);
  const lockedUntil = useApp((s) => s.lockedUntil);
  const biometric = useApp((s) => s.biometric);
  const unlockWithBiometric = useApp((s) => s.unlockWithBiometric);
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState<number | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [enrolmentChanged, setEnrolmentChanged] = useState(false);
  const checking = useApp((s) => s.checking);
  const platform = usePlatform();

  // A failed or cancelled prompt leaves the PIN pad as it is: nothing to say.
  const askBiometric = useCallback(async () => {
    const result = await unlockWithBiometric().catch((e: unknown) => {
      console.error('Biometric unlock failed', e);
      return 'cancelled' as const;
    });
    if (result === 'changed') setEnrolmentChanged(true);
  }, [unlockWithBiometric]);

  // Asks once, as soon as the lock screen is on screen; after that, the button asks again. The
  // idle timer can lock the app while it is behind another app, and a prompt started from there
  // can land over that app, come back cancelled or never finish, so then it waits for the app to
  // come back (or the page to be shown, whichever is reported first).
  const asked = useRef(false);
  useEffect(() => {
    if (biometric !== 'on' || asked.current) return;
    const ask = () => {
      if (asked.current) return;
      asked.current = true;
      void askBiometric();
    };
    if (document.visibilityState === 'visible') {
      ask();
      return;
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ask();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const stopResume = platform.onResume(ask);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopResume();
    };
  }, [biometric, askBiometric, platform]);

  const throttled = lockedUntil !== null && expired !== lockedUntil;
  const onCountdownDone = useCallback(() => {
    setExpired(lockedUntil);
    setError(undefined);
  }, [lockedUntil]);

  const submit = async (secret: string) => {
    const result = await unlock(secret);
    if (result === 'busy') return;
    setError(result === 'wrong' ? WRONG : undefined);
  };
  const secretName = lockMode === 'passphrase' ? 'passphrase' : 'PIN';

  const message = throttled ? (
    <ThrottleCountdown key={lockedUntil} until={lockedUntil} onDone={onCountdownDone} />
  ) : (
    error
  );

  return (
    <main className="grid min-h-dvh place-items-center px-[22px] py-10">
      <Card className="flex w-full max-w-sm flex-col items-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.035em]">
            Welcome back
          </h1>
          <p className="text-muted">
            {lockMode === 'passphrase' ? 'Enter your passphrase.' : 'Enter your PIN.'}
          </p>
        </div>
        {enrolmentChanged && (
          <Banner tone="warning">
            Your fingerprints or face changed, so use your {secretName} this time. You can turn
            biometric unlock back on in Settings.
          </Banner>
        )}
        {lockMode === 'passphrase' ? (
          <PassphraseForm onSubmit={submit} disabled={throttled || checking} error={message} />
        ) : (
          <PinPad onSubmit={submit} disabled={throttled || checking} error={message} />
        )}
        {checking && (
          <p role="status" className="text-muted text-sm font-bold">
            Checking…
          </p>
        )}
        {biometric === 'on' && (
          <Button variant="secondary" onClick={() => void askBiometric()}>
            Use fingerprint or face
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setForgotOpen(true)}>
          Forgot your {secretName}?
        </Button>
        <EraseDialog
          open={forgotOpen}
          title="Erase this device and start over?"
          description={`Without your ${secretName}, the data on this device can't be recovered. If you have an account, log in after starting over to get your data back.`}
          onClose={() => setForgotOpen(false)}
        />
      </Card>
    </main>
  );
}
