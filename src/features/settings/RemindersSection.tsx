import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import type { ReminderSettings } from '@/domain/entities';
import type { Notifier } from '@/platform/types';
import {
  REMINDERS_BLOCKED,
  useReminderSettings,
  useTurnOnReminders,
} from '@/features/shared/reminders';
import { UNDER_TITLE } from '@/features/shared/IconRow';
import { PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/useAction';
import { useFinanceActions } from '@/store/useFinance';

/** The daily nudge's times: every hour from 07:00 to 23:00. */
const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

/** The rules after the daily nudge, which has its time beside it. */
const RULES: Array<{
  key: 'bills' | 'reviews' | 'dividends';
  label: string;
}> = [
  { key: 'bills', label: 'Bills and renewals' },
  { key: 'reviews', label: 'Weekly and monthly reviews' },
  { key: 'dividends', label: 'Dividends' },
];

/** Only offered where the phone can schedule reminders (`Platform.notifier`). */
export function RemindersSection({ notifier }: { notifier: Notifier }) {
  const r = useReminderSettings();
  const { updateSettings } = useFinanceActions();
  const turnOn = useTurnOnReminders(notifier);
  const run = useAction();
  const [blocked, setBlocked] = useState(false);

  // Reminders are on but Android has taken the permission back (or never gave it, as after a
  // restore): say so. This only looks. Asking is for the switch, after a person's tap.
  useEffect(() => {
    if (!r.enabled) return;
    let current = true;
    void (async () => {
      try {
        const permission = await notifier.permission();
        if (current && permission !== 'granted') setBlocked(true);
      } catch (e) {
        console.error('Could not check the notification permission', e);
      }
    })();
    return () => {
      current = false;
    };
  }, [notifier, r.enabled]);

  const save = (patch: Partial<ReminderSettings>) =>
    void run(() => updateSettings({ reminders: { ...r, ...patch } }));

  const toggleMaster = (on: boolean) =>
    void run(async () => {
      if (on) {
        setBlocked(!(await turnOn()));
      } else {
        setBlocked(false);
        await updateSettings({ reminders: { ...r, enabled: false } });
      }
    });

  // A time saved some other way (a restored copy) still shows as it is.
  const times = HOURS.includes(r.dailyTime) ? HOURS : [...HOURS, r.dailyTime].sort();
  const off = !r.enabled;

  return (
    <PlainSection title="Reminders">
      <div className={ROWS}>
        <div>
          <Switch
            variant="row"
            icon={Bell}
            label="Reminders on this phone"
            checked={r.enabled}
            onChange={toggleMaster}
          />
          {blocked && (
            <p role="alert" className={cn('text-danger pb-3 text-sm font-semibold', UNDER_TITLE)}>
              {REMINDERS_BLOCKED}
            </p>
          )}
        </div>
        <Switch
          variant="row"
          className={UNDER_TITLE}
          label="Daily nudge to log spending"
          checked={r.dailyLog}
          disabled={off}
          onChange={(v) => save({ dailyLog: v })}
        />
        <Select
          variant="row"
          className={UNDER_TITLE}
          label="At"
          value={r.dailyTime}
          options={times.map((t) => ({ value: t, label: t }))}
          disabled={off}
          onChange={(v) => save({ dailyTime: v })}
        />
        {RULES.map(({ key, label }) => (
          <Switch
            key={key}
            variant="row"
            className={UNDER_TITLE}
            label={label}
            checked={r[key]}
            disabled={off}
            onChange={(v) => save({ [key]: v })}
          />
        ))}
        <div className={cn('py-3', UNDER_TITLE)}>
          <Button
            variant="secondary"
            disabled={off}
            onClick={() =>
              void run(() => notifier.sendTest(), {
                success: 'A test reminder arrives in about a minute.',
              })
            }
          >
            Send a test reminder
          </Button>
        </div>
      </div>
    </PlainSection>
  );
}
