import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState<number | null>(null);

  const throttled = lockedUntil !== null && expired !== lockedUntil;
  const onCountdownDone = useCallback(() => setExpired(lockedUntil), [lockedUntil]);

  const submit = async (secret: string) => {
    const result = await unlock(secret);
    setError(result === 'wrong' ? WRONG : undefined);
  };

  const message = throttled ? (
    <ThrottleCountdown key={lockedUntil} until={lockedUntil} onDone={onCountdownDone} />
  ) : (
    error
  );

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="flex w-full max-w-sm flex-col items-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
          <p className="text-muted">
            {lockMode === 'passphrase' ? 'Enter your passphrase.' : 'Enter your PIN.'}
          </p>
        </div>
        {lockMode === 'passphrase' ? (
          <PassphraseForm onSubmit={submit} disabled={throttled} error={message} />
        ) : (
          <PinPad onSubmit={submit} disabled={throttled} error={message} />
        )}
      </Card>
    </main>
  );
}
