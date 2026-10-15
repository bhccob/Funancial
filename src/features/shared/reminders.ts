import { useCallback } from 'react';
import { defaultSettings, type ReminderSettings } from '@/domain/entities';
import type { Notifier } from '@/platform/types';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions } from '@/store/useFinance';

/** What to tell a person whose phone refused notifications: only Android's own settings can undo it. */
export const REMINDERS_BLOCKED =
  'Notifications are blocked for Funancial. Turn them on in Android Settings → Apps → Funancial → Notifications.';

/** The settings before any were saved: reminders off, nobody asked. */
const NONE_SAVED = defaultSettings('').reminders;

export function useReminderSettings(): ReminderSettings {
  return useApp((s) => s.data.tables.settings[0]?.reminders) ?? NONE_SAVED;
}

/**
 * The one way reminders get turned on, for the Settings switch and the Home invitation alike:
 * ask Android, and only when it allows, save them as on (and as asked about). Resolves `false`,
 * saving nothing, when Android refuses. Saving changes the data, which is what makes the app
 * schedule the reminders; nothing else needs telling.
 */
export function useTurnOnReminders(notifier: Notifier): () => Promise<boolean> {
  const reminders = useReminderSettings();
  const { updateSettings } = useFinanceActions();
  return useCallback(async () => {
    if (!(await notifier.request())) return false;
    await updateSettings({ reminders: { ...reminders, enabled: true, prompted: true } });
    return true;
  }, [notifier, reminders, updateSettings]);
}
