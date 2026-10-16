import { useState } from 'react';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

/** Confirms, then deletes the demo data and returns to real data. The label fits where it stands. */
export function LeaveDemoButton({
  size = 'sm',
  variant = 'secondary',
  label = 'Start with my real data',
}: {
  size?: 'sm' | 'md';
  variant?: ButtonVariant;
  label?: string;
}) {
  const exitDemo = useApp((s) => s.exitDemo);
  const run = useAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setConfirming(true)}>
        {label}
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
