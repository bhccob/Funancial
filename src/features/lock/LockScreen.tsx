import { CircleAlert, Fingerprint } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { TextButton } from '@/components/ui/TextButton';
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

/**
 * The lock stands on the theme's block, whose ink the text tokens are there. So its fields, buttons and
 * words are drawn in the block's glass and ink (src/features/lock/PinPad.tsx says why), never in
 * `Button`, the page's glass or the danger red, which are the page's.
 */
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
        className="border-head-dim text-text h-14 w-full rounded-full border bg-(--hg-bg) px-5 text-base font-semibold"
      />
      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm font-bold">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || value.length === 0}
        className="btn-head press motion-safe:ease-glass inline-flex h-14 items-center justify-center rounded-full text-base font-bold disabled:pointer-events-none disabled:opacity-45 motion-safe:transition-[transform,opacity] motion-safe:duration-(--duration-press)"
      >
        Unlock
      </button>
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
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/*
        The whole screen is the theme's block, with its glowing shapes: the pad stands straight on it,
        no panel between (glass on glass). It runs out to the screen's edges and up behind the status
        bar (its own top padding holds the bar's height) and down to the bottom edge's safe area.
      */}
      <HeadBlock
        compact
        className="mx-0 flex flex-1 flex-col justify-center px-[22px] pb-[max(1.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 py-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.035em]">
              Welcome back
            </h1>
            <p className="font-semibold">
              {lockMode === 'passphrase' ? 'Enter your passphrase.' : 'Enter your PIN.'}
            </p>
          </div>
          {enrolmentChanged && (
            // A pale card with its own ink, on the block: the page's ink back, not the block's.
            <Banner tone="warning" className="page-ink text-text">
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
            <p role="status" className="text-sm font-bold">
              Checking…
            </p>
          )}
          {biometric === 'on' && (
            <button
              type="button"
              onClick={() => void askBiometric()}
              className="glass-head press motion-safe:ease-glass inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 font-bold motion-safe:transition-transform motion-safe:duration-(--duration-press)"
            >
              <Fingerprint aria-hidden className="size-5" />
              Use fingerprint or face
            </button>
          )}
          {/* 0.13's R4: a quiet word in the block's ink; a glass pill on the block's pad is one too many. */}
          <TextButton tone="ink" className="-my-2" onClick={() => setForgotOpen(true)}>
            Forgot your {secretName}?
          </TextButton>
        </div>
      </HeadBlock>
      {/* Off the block: a dialog inside it would read the block's ink on its own page-coloured sheet. */}
      <EraseDialog
        open={forgotOpen}
        title="Erase this device and start over?"
        description={`Without your ${secretName}, the data on this device can't be recovered. If you have an account, log in after starting over to get your data back.`}
        onClose={() => setForgotOpen(false)}
      />
    </main>
  );
}
