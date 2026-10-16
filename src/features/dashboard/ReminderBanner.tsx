import { useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import {
  REMINDERS_BLOCKED,
  useReminderSettings,
  useTurnOnReminders,
} from '@/features/shared/reminders';
import { useAction } from '@/lib/useAction';
import { usePlatform } from '@/platform/PlatformProvider';
import type { Notifier } from '@/platform/types';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions } from '@/store/useFinance';

function Invitation({ notifier }: { notifier: Notifier }) {
  const reminders = useReminderSettings();
  const { updateSettings } = useFinanceActions();
  const turnOn = useTurnOnReminders(notifier);
  const run = useAction();
  const [blocked, setBlocked] = useState(false);

  return (
    <Banner
      tone="info"
      action={
        <div className="flex gap-2">
          <Button
            variant="banner"
            onClick={() =>
              void run(() => updateSettings({ reminders: { ...reminders, prompted: true } }))
            }
          >
            Not now
          </Button>
          <Button onClick={() => void run(async () => setBlocked(!(await turnOn())))}>
            Turn on
          </Button>
        </div>
      }
    >
      <p>Get reminders for bills, renewals and a daily nudge to log spending.</p>
      {blocked && <p className="mt-1 font-medium">{REMINDERS_BLOCKED}</p>}
    </Banner>
  );
}

/**
 * The one-time invitation to turn reminders on: only on a phone that can schedule them, for real
 * data (the demo never reminds anyone), and only until the person has answered. "Not now" counts
 * as an answer; a refusal from Android does not, so the person can fix it and tap Turn on again.
 */
export function ReminderBanner() {
  const { notifier } = usePlatform();
  const real = useApp((s) => s.namespace === 'real');
  const { enabled, prompted } = useReminderSettings();
  if (!notifier || !real || enabled || prompted) return null;
  return <Invitation notifier={notifier} />;
}
