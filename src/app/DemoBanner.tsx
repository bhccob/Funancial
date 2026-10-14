import { useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useApp } from '@/store/AppStoreProvider';

export function DemoBanner() {
  const namespace = useApp((s) => s.namespace);
  const exitDemo = useApp((s) => s.exitDemo);
  const [confirming, setConfirming] = useState(false);

  if (namespace !== 'demo') return null;

  return (
    <>
      <Banner
        tone="demo"
        className="mb-4"
        action={
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
            Start with my real data
          </Button>
        }
      >
        You're using demo money.
      </Banner>
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
                void exitDemo();
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
