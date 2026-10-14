import { afterEach, expect, it, vi } from 'vitest';
import { createChannel, type SyncMessage } from './broadcast';

afterEach(() => vi.unstubAllGlobals());

it('delivers messages to other channels with the same name, not to itself', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const a = createChannel(name);
  const b = createChannel(name);
  const gotA: SyncMessage[] = [];
  const gotB: SyncMessage[] = [];
  a.subscribe((m) => gotA.push(m));
  const stop = b.subscribe((m) => gotB.push(m));

  a.post({ type: 'reload', reason: 'delete' });
  await vi.waitFor(() => expect(gotB).toEqual([{ type: 'reload', reason: 'delete' }]));
  expect(gotA).toEqual([]);

  stop();
  a.close();
  b.close();
});

it('ignores unrelated messages', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const raw = new BroadcastChannel(name);
  const ch = createChannel(name);
  const got: SyncMessage[] = [];
  ch.subscribe((m) => got.push(m));
  raw.postMessage({ hello: 'world' });
  raw.postMessage({ type: 'reload', reason: 'restore' });
  await vi.waitFor(() => expect(got).toEqual([{ type: 'reload', reason: 'restore' }]));
  raw.close();
  ch.close();
});

it('is a harmless no-op where BroadcastChannel is unavailable', () => {
  vi.stubGlobal('BroadcastChannel', undefined);
  const ch = createChannel('x');
  expect(() => ch.post({ type: 'reload', reason: 'secret' })).not.toThrow();
  const stop = ch.subscribe(() => {});
  expect(() => stop()).not.toThrow();
  ch.close();
});
