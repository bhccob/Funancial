import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshRealStore } from '@/test/realStore';
import { createInboxActions, MAX_READ_KEYS } from './inboxActions';

async function setup() {
  const t = await freshRealStore();
  const actions = createInboxActions(t.store);
  const inbox = () => t.store.getState().data.tables.settings[0]!.inbox;
  return { ...t, actions, inbox };
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T10:00:00.000Z') }));
afterEach(() => vi.useRealTimers());

describe('markRead', () => {
  it('remembers the key, once, and leaves the rest of the settings alone', async () => {
    const { store, actions, inbox } = await setup();
    const before = store.getState().data.tables.settings[0]!;
    vi.setSystemTime(new Date('2026-10-14T10:05:00.000Z'));
    await actions.markRead('week:2026-10-11');
    expect(inbox()).toEqual({ readBefore: null, read: ['week:2026-10-11'] });

    const after = store.getState().data.tables.settings[0]!;
    expect({ ...after, inbox: before.inbox, updatedAt: before.updatedAt }).toEqual(before);
    expect(after.updatedAt).toBe('2026-10-14T10:05:00.000Z');

    // Reading it again is not a second entry, nor a second write.
    const put = vi.spyOn(store.getState(), 'put');
    await actions.markRead('week:2026-10-11');
    expect(inbox().read).toEqual(['week:2026-10-11']);
    expect(put).not.toHaveBeenCalled();
  });

  it('keeps the moment "Mark all as read" set', async () => {
    const { actions, inbox } = await setup();
    await actions.markAllRead();
    await actions.markRead('week:2026-10-11');
    expect(inbox()).toEqual({
      readBefore: '2026-10-14T10:00:00.000Z',
      read: ['week:2026-10-11'],
    });
  });

  it(`keeps the newest ${MAX_READ_KEYS} keys and drops the oldest`, async () => {
    const { actions, inbox } = await setup();
    for (let i = 0; i < MAX_READ_KEYS + 5; i++) await actions.markRead(`k${i}`);
    const { read } = inbox();
    expect(read).toHaveLength(MAX_READ_KEYS);
    expect(read[0]).toBe('k5');
    expect(read.at(-1)).toBe(`k${MAX_READ_KEYS + 4}`);
    // A dropped key is no longer remembered, so reading it again adds it back as the newest.
    await actions.markRead('k0');
    expect(inbox().read).toHaveLength(MAX_READ_KEYS);
    expect(inbox().read.at(-1)).toBe('k0');
    expect(inbox().read).not.toContain('k5');
  });

  it('is stored: it survives a reload from storage', async () => {
    const { store, actions, inbox } = await setup();
    await actions.markRead('week:2026-10-11');
    await store.getState().refresh();
    expect(inbox().read).toEqual(['week:2026-10-11']);
  });
});

describe('markAllRead', () => {
  it('reads everything up to now, and forgets the single keys it covers', async () => {
    const { actions, inbox } = await setup();
    await actions.markRead('a');
    await actions.markRead('b');
    await actions.markAllRead();
    expect(inbox()).toEqual({ readBefore: '2026-10-14T10:00:00.000Z', read: [] });
  });

  it('moves the moment forward each time', async () => {
    const { actions, inbox } = await setup();
    await actions.markAllRead();
    vi.setSystemTime(new Date('2026-10-15T08:30:00.000Z'));
    await actions.markAllRead();
    expect(inbox().readBefore).toBe('2026-10-15T08:30:00.000Z');
  });
});
