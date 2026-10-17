import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeAccount, linkedAccount, withAccount } from '@/test/fakeAccount';
import { useAccount } from './useAccount';

function readAccount(actions = fakeAccount(linkedAccount())) {
  let seen: ReturnType<typeof useAccount> | undefined;
  function Probe() {
    seen = useAccount();
    return null;
  }
  render(withAccount(actions, <Probe />));
  return seen!;
}

describe('what a screen can read of the account', () => {
  const secrets = { dek: 'SECRET-DATA-KEY-123', deviceToken: 'SECRET-DEVICE-TOKEN-456' };

  it('is a plain description, never the data key or the device token', () => {
    const value = readAccount(fakeAccount(linkedAccount(secrets)));
    expect(Object.keys(value).sort()).toEqual(
      ['email', 'loaded', 'offline', 'savedAt', 'status', 'tooBig', 'username'].sort(),
    );
    expect(JSON.stringify(value)).not.toContain('SECRET');
    expect(value).toMatchObject({
      loaded: true,
      status: 'linked',
      username: 'robin',
      email: 'robin@example.com',
      savedAt: '2026-10-14T10:00:00.000Z',
      tooBig: false,
    });
  });

  it('says none, with nothing to show, when there is no account', () => {
    expect(readAccount(fakeAccount(null))).toEqual({
      loaded: true,
      status: 'none',
      username: null,
      email: null,
      savedAt: null,
      tooBig: false,
      offline: false,
    });
  });

  it('shows nothing, not even the account, before it has been read', () => {
    const value = readAccount(fakeAccount(linkedAccount(secrets), false));
    expect(value.loaded).toBe(false);
  });
});
