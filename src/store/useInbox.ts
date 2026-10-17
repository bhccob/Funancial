import { useMemo } from 'react';
import { formatLocalDateTime } from '@/domain/dates';
import { inboxItems, type InboxItem } from '@/domain/notifications';
import { useApp, useAppStore } from './AppStoreProvider';
import { createInboxActions, type InboxActions } from './inboxActions';
import { useToday } from './useFinance';

/**
 * The inbox's reminders at the time of day it is. The clock is read here, as `useReminderSync`
 * reads it, and handed on. It is read again when the data or the day changes, and when the screen
 * opens, which is when a reminder that came due since can show up.
 */
export function useInboxItems(): InboxItem[] {
  const data = useApp((s) => s.data);
  const today = useToday();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is what makes the clock read again
  return useMemo(() => inboxItems(data, formatLocalDateTime(new Date())), [data, today]);
}

export function useInboxActions(): InboxActions {
  const store = useAppStore();
  return useMemo(() => createInboxActions(store), [store]);
}
