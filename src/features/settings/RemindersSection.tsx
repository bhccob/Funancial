import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import type { ReminderSettings } from '@/domain/entities';
import type { Notifier } from '@/platform/types';
import {
  REMINDERS_BLOCKED,
  useReminderSettings,
  useTurnOnReminders,
} from '@/features/shared/reminders';
import { useAction } from '@/lib/useAction';
import { useFinanceActions } from '@/store/useFinance';

/** The daily nudge's times: every hour from 07:00 to 23:00. */
const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

/** The rules after the daily nudge, which has its time beside it. */
const RULES: Array<{
  key: 'bills' | 'freeze' | 'reviews' | 'backup' | 'dividends' | 'buyIt';
  label: string;
}> = [
  { key: 'bills', label: 'Bills and renewals' },
  { key: 'freeze', label: 'Salary freeze start and end' },
  { key: 'reviews', label: 'Weekly and monthly reviews' },
  { key: 'backup', label: 'Backup reminder' },
  { key: 'dividends', label: 'Dividends' },
  { key: 'buyIt', label: 'Buy it?' },
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

  // A time saved some other way (a restored backup) still shows as it is.
  const times = HOURS.includes(r.dailyTime) ? HOURS : [...HOURS, r.dailyTime].sort();
  const off = !r.enabled;

  return (
    <Section title="Reminders">
      <div className="flex max-w-xl flex-col gap-5">
        <Switch label="Reminders on this phone" checked={r.enabled} onChange={toggleMaster} />
        {blocked && (
          <p role="alert" className="text-danger text-sm font-semibold">
            {REMINDERS_BLOCKED}
          </p>
        )}
        <Switch
          label="Daily nudge to log spending"
          checked={r.dailyLog}
          disabled={off}
          onChange={(v) => save({ dailyLog: v })}
        />
        <Select
          variant="line"
          label="At"
          value={r.dailyTime}
          options={times.map((t) => ({ value: t, label: t }))}
          disabled={off}
          onChange={(v) => save({ dailyTime: v })}
        />
        {RULES.map(({ key, label }) => (
          <Switch
            key={key}
            label={label}
            checked={r[key]}
            disabled={off}
            onChange={(v) => save({ [key]: v })}
          />
        ))}
        <div>
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
    </Section>
  );
}
