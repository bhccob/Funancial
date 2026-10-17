import { useState } from 'react';
import { Blobs } from '@/components/ui/Blobs';
import { Button } from '@/components/ui/Button';
import { StepMotion, type StepDirection } from '@/components/ui/StepMotion';
import { ForgotScreen } from '@/features/account/ForgotScreen';
import { LoginScreen } from '@/features/account/LoginScreen';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

const VIEWS = ['home', 'login', 'forgot'] as const;
type View = (typeof VIEWS)[number];

/**
 * The first screen (design A): the name over soft drifting colour, and the three ways in at the
 * bottom, where a thumb reaches. Log in and Forgot password rise in over it. `onHold` is for Log in:
 * it asks the app to keep this screen up while the phone moves on to its account's data.
 */
export function WelcomeScreen({ onHold }: { onHold?(held: boolean): void }) {
  const startDemo = useApp((s) => s.startDemo);
  const startFresh = useApp((s) => s.startFresh);
  const [view, setView] = useState<View>('home');
  const [direction, setDirection] = useState<StepDirection>('forward');
  const [busy, setBusy] = useState(false);

  const act = useAction();
  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    await act(action);
    setBusy(false);
  };

  function go(next: View) {
    setDirection(VIEWS.indexOf(next) > VIEWS.indexOf(view) ? 'forward' : 'back');
    setView(next);
  }

  function render(shown: View) {
    switch (shown) {
      case 'login':
        return (
          <LoginScreen onBack={() => go('home')} onForgot={() => go('forgot')} onHold={onHold} />
        );
      case 'forgot':
        return <ForgotScreen onBack={() => go('login')} />;
      default:
        return (
          <>
            <div className="flex flex-1 flex-col gap-2 pt-[16dvh]">
              <h1 className="text-[56px] leading-none font-extrabold tracking-[-0.045em]">
                Fun<span className="text-accent-text">ancial</span>
              </h1>
              <p className="text-lg font-bold">Level up your real financial life.</p>
            </div>
            <div className="flex flex-col gap-3">
              <Button size="lg" disabled={busy} onClick={run(startFresh)}>
                Create an account
              </Button>
              <Button size="lg" variant="secondary" disabled={busy} onClick={() => go('login')}>
                I have an account
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={run(startDemo)}>
                Try with demo money
              </Button>
            </div>
            <p className="text-muted px-2 text-center text-sm">
              Funancial helps you track and plan your money. It isn&apos;t financial advice.
            </p>
          </>
        );
    }
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Blobs step={VIEWS.indexOf(view)} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-[22px] pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <StepMotion
          stepKey={view}
          direction={direction}
          render={render}
          className="flex-1"
          layerClassName="flex flex-col gap-5"
        />
      </div>
    </main>
  );
}
