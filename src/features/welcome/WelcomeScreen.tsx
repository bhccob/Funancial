import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

export function WelcomeScreen() {
  const startDemo = useApp((s) => s.startDemo);
  const startFresh = useApp((s) => s.startFresh);
  const [busy, setBusy] = useState(false);

  const act = useAction();
  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    await act(action);
    setBusy(false);
  };

  return (
    <main className="grid min-h-dvh place-items-center px-[22px] py-10">
      <Card className="flex w-full max-w-md flex-col items-center gap-6 p-8 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-5xl font-extrabold tracking-tight">
            Fun<span className="text-accent-text">ancial</span>
          </h1>
          <p className="text-lg font-bold">Level up your real financial life.</p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <Button size="lg" disabled={busy} onClick={run(startDemo)}>
            Try with demo money
          </Button>
          <Button size="lg" variant="secondary" disabled={busy} onClick={run(startFresh)}>
            Start with my real data
          </Button>
        </div>
        <p className="text-muted text-sm">
          Funancial is a personal tracking tool, not financial advice. Your data stays on this
          device.
        </p>
      </Card>
    </main>
  );
}
