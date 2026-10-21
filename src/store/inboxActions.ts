import type { StoreApi } from 'zustand/vanilla';
import { defaultSettings, type Inbox } from '@/domain/entities';
import { nowIso } from '@/domain/ids';
import type { AppState } from './appStore';

/** The single keys remembered as read; older ones are dropped. "Mark all as read" needs none of them. */
export const MAX_READ_KEYS = 200;

export type InboxActions = ReturnType<typeof createInboxActions>;

/**
 * What the person has read in the inbox, kept in the settings. shortcut: two writes that start
 * before either lands both read the settings as they were, so one is lost; a tap opens a screen and
 * "Mark all as read" is one tap, so upgrade to a queue if a screen ever fires many.
 */
export function createInboxActions(store: StoreApi<AppState>) {
  const state = () => store.getState();

  async function save(inbox: Inbox) {
    const settings = state().data.tables.settings[0] ?? defaultSettings(nowIso());
    await state().put('settings', { ...settings, inbox, updatedAt: nowIso() });
  }

  return {
    async markRead(key: string) {
      const { readBefore, read } = state().data.tables.settings[0]?.inbox ?? {
        readBefore: null,
        read: [],
      };
      if (read.includes(key)) return;
      await save({ readBefore, read: [...read, key].slice(-MAX_READ_KEYS) });
    },

    /** Everything that came due so far is read, so no key needs remembering. */
    async markAllRead() {
      await save({ readBefore: nowIso(), read: [] });
    },
  };
}
