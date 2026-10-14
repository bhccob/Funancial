import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

/** "Start with my real data" — confirms, then deletes the demo data and returns to real data. */
export function LeaveDemoButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const exitDemo = useApp((s) => s.exitDemo);
  const run = useAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setConfirming(true)}>
        Start with my real data
      </Button>
      <Dialog
        open={confirming}
        title="Leave demo?"
        description="Demo data will be deleted. Your real data isn't affected."
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Stay
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                void run(exitDemo);
              }}
            >
              Leave demo
            </Button>
          </>
        }
      />
    </>
  );
}
