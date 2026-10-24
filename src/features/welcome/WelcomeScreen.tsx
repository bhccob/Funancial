import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { StepMotion, type StepDirection } from '@/components/ui/StepMotion';
import { TextButton } from '@/components/ui/TextButton';
import { ForgotScreen } from '@/features/account/ForgotScreen';
import { LoginScreen } from '@/features/account/LoginScreen';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

const VIEWS = ['home', 'login', 'forgot'] as const;
type View = (typeof VIEWS)[number];

/**
 * The first screen (design A): the name on the theme's block with its glowing shapes, as Home and
 * Profile stand on it, and the three ways in at the bottom, where a thumb reaches, on the light page
 * with its still shapes. Log in and Forgot password rise in over it, on that page. `onHold` is for
 * Log in: it asks the app to keep this screen up while the phone moves on to its account's data.
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
            {/*
              The block runs out to the screen's edges (past this column, on a wide screen too) and up
              behind the status bar, over the column's own top padding; the name stands in the middle
              of what is left of the screen.
            */}
            <HeadBlock
              compact
              className="mx-[calc(50%-50vw)] -mt-[max(1.5rem,env(safe-area-inset-top))] flex flex-1 flex-col justify-center px-[22px] pb-12"
            >
              <div className="mx-auto flex w-full max-w-md flex-col gap-2">
                <h1 className="text-[56px] leading-none font-extrabold tracking-[-0.045em] outline-none">
                  Fun<span className="text-head-dim">cial</span>
                </h1>
                <p className="text-lg font-bold">Level up your real financial life.</p>
              </div>
            </HeadBlock>
            <div className="flex flex-col gap-3">
              <Button size="lg" disabled={busy} onClick={run(startFresh)}>
                Create an account
              </Button>
              <Button size="lg" variant="secondary" disabled={busy} onClick={() => go('login')}>
                I have an account
              </Button>
              {/* 0.13's R4: the demo is a quiet word, not a pill, so the two buttons above stay the choice. */}
              <TextButton disabled={busy} onClick={run(startDemo)}>
                Try with demo money
              </TextButton>
            </div>
            <p className="text-muted px-2 text-center text-sm">
              Funcial helps you track and plan your money. It isn&apos;t financial advice.
            </p>
          </>
        );
    }
  }

  return (
    <main className="page-blobs relative flex min-h-dvh flex-col overflow-hidden">
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
