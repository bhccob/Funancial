import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyDerivationError } from '@/data/accountCrypto';
import { toastStore } from '@/lib/toast';
import { AccountError } from '@/store/accountActions';
import { fakeAccount, withAccount } from '@/test/fakeAccount';
import { useEmailCode, type CodeOutcome } from './useEmailCode';

const ROBIN = { username: 'Robin', email: 'robin@example.com' };
const SIGN_UP = { ...ROBIN, password: 'a long enough password' };

beforeEach(() => {
  // The clock moves only when a test moves it: a hold is measured to the millisecond.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  toastStore.setState({ toasts: [] });
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(account = fakeAccount()) {
  const wrapper = ({ children }: { children: ReactNode }) => withAccount(account, children);
  const hook = renderHook(() => useEmailCode(), { wrapper });
  /** Runs `call` on the hook as it is now, and gives back its outcome once its state has settled. */
  async function run(call: (code: ReturnType<typeof useEmailCode>) => Promise<CodeOutcome | null>) {
    let outcome: CodeOutcome | null = null;
    await act(async () => {
      outcome = await call(hook.result.current);
    });
    return outcome as CodeOutcome | null;
  }
  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  return { account, hook, run, advance, current: () => hook.result.current };
}

describe('useEmailCode', () => {
  it('holds a new code for 30 seconds after a send, to the millisecond', async () => {
    const { account, run, advance, current } = setup();
    expect(current().resendHeld).toBe(false);
    expect(await run((c) => c.request(ROBIN))).toEqual({ kind: 'ok' });
    expect(account.requestCode).toHaveBeenCalledWith(ROBIN);
    expect(current().sentTo).toBe('robin@example.com');
    expect(current().resendHeld).toBe(true);
    advance(29_999);
    expect(current().resendHeld).toBe(true);
    advance(1);
    expect(current().resendHeld).toBe(false);

    // And again after the resend, which says so.
    expect(await run((c) => c.resend(ROBIN))).toEqual({ kind: 'ok' });
    expect(account.requestCode).toHaveBeenCalledTimes(2);
    expect(toastStore.getState().toasts.map((t) => t.message)).toEqual(['We sent a new code.']);
    expect(current().resendHeld).toBe(true);
    advance(29_999);
    expect(current().resendHeld).toBe(true);
    advance(1);
    expect(current().resendHeld).toBe(false);
  });

  it('does nothing for a resend while it is held', async () => {
    const { account, run } = setup();
    await run((c) => c.request(ROBIN));
    expect(await run((c) => c.resend(ROBIN))).toBeNull();
    expect(account.requestCode).toHaveBeenCalledTimes(1);
  });

  it('holds it as long as the service says when it refuses one, and says why', async () => {
    const account = fakeAccount();
    account.requestCode
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(
        new AccountError('limited', 'Too many tries. Try again in 2 minutes.', 120),
      );
    const { run, advance, current } = setup(account);
    await run((c) => c.request(ROBIN));
    advance(30_000);
    expect(await run((c) => c.resend(ROBIN))).toEqual({ kind: 'shown' });
    expect(current().problem).toBe('Too many tries. Try again in 2 minutes.');
    expect(current().resendHeld).toBe(true);
    advance(119_999);
    expect(current().resendHeld).toBe(true);
    advance(1);
    expect(current().resendHeld).toBe(false);
  });

  it('goes back to the code it sent for the same details while it works, then asks again', async () => {
    const { account, run, advance, current } = setup();
    await run((c) => c.request(ROBIN));
    act(() => current().setCode('48'));
    // Back and on again, as typed with a space: the code sent is still the one, with what was typed.
    expect(
      await run((c) => c.request({ username: ' Robin', email: 'robin@example.com ' })),
    ).toEqual({ kind: 'ok' });
    expect(account.requestCode).toHaveBeenCalledTimes(1);
    expect(current().code).toBe('48');

    // A code works 10 minutes: after that, a new one.
    advance(10 * 60_000);
    expect(await run((c) => c.request(ROBIN))).toEqual({ kind: 'ok' });
    expect(account.requestCode).toHaveBeenCalledTimes(2);
    expect(current().code).toBe('');
  });

  it('asks again for a changed address, and lets go of what was typed of the old code', async () => {
    const { account, run, current } = setup();
    await run((c) => c.request(ROBIN));
    act(() => current().setCode('48'));
    await run((c) => c.request({ ...ROBIN, email: 'robin@mail.example' }));
    expect(account.requestCode).toHaveBeenLastCalledWith({
      username: 'Robin',
      email: 'robin@mail.example',
    });
    expect(current().sentTo).toBe('robin@mail.example');
    expect(current().code).toBe('');
  });

  it("goes on to the address's code when only the name changed, too soon for another mail", async () => {
    const account = fakeAccount();
    account.requestCode
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new AccountError('limited', 'Too many tries.', 20));
    const { run, advance, current } = setup(account);
    await run((c) => c.request(ROBIN));
    expect(await run((c) => c.request({ ...ROBIN, username: 'Robin2' }))).toEqual({ kind: 'ok' });
    // Held for the wait the service named.
    advance(19_999);
    expect(current().resendHeld).toBe(true);
    advance(1);
    expect(current().resendHeld).toBe(false);
  });

  it.each([
    [
      'taken',
      new AccountError('taken'),
      { kind: 'taken', message: 'That username is taken. Try another one.' },
    ],
    [
      'invalid',
      new AccountError('invalid'),
      { kind: 'invalid', message: 'Check what you typed and try again.' },
    ],
    [
      'offline',
      new AccountError('offline'),
      {
        kind: 'failed',
        failure: 'offline',
        message: "You're offline. Try again when you're connected.",
      },
    ],
    [
      'limited',
      new AccountError('limited', 'Too many tries. Try again in 60 minutes.', 3600),
      { kind: 'failed', failure: 'limited', message: 'Too many tries. Try again in 60 minutes.' },
    ],
    [
      'unavailable',
      new AccountError('unavailable'),
      {
        kind: 'failed',
        failure: 'service',
        message: "Funcial's service isn't answering right now. Try again in a moment.",
      },
    ],
  ] as const)('hands a refused first code (%s) back to the screen', async (_, error, outcome) => {
    const account = fakeAccount();
    account.requestCode.mockRejectedValueOnce(error);
    const { run, current } = setup(account);
    expect(await run((c) => c.request(ROBIN))).toEqual(outcome);
    expect(current().sentTo).toBeNull();
    expect(current().resendHeld).toBe(false);
  });

  describe('one call at a time', () => {
    it('does nothing for a second request, or a Verify, while a code is on its way', async () => {
      const account = fakeAccount();
      account.requestCode.mockReturnValue(new Promise(() => {}));
      const { run, current } = setup(account);
      void act(() => void current().request(ROBIN));
      expect(current().sending).toBe(true);
      expect(await run((c) => c.request(ROBIN))).toBeNull();
      act(() => current().setCode('481529'));
      expect(await run((c) => c.verify(SIGN_UP))).toBeNull();
      expect(account.requestCode).toHaveBeenCalledTimes(1);
      expect(account.signUp).not.toHaveBeenCalled();
    });

    it('does nothing for a resend, or a second Verify, while the account is being made', async () => {
      const account = fakeAccount();
      account.signUp.mockReturnValue(new Promise(() => {}));
      const { run, advance, current } = setup(account);
      await run((c) => c.request(ROBIN));
      advance(30_000);
      act(() => current().setCode('481529'));
      void act(() => void current().verify(SIGN_UP));
      expect(current().signingUp).toBe(true);
      expect(await run((c) => c.resend(ROBIN))).toBeNull();
      expect(await run((c) => c.verify(SIGN_UP))).toBeNull();
      expect(account.requestCode).toHaveBeenCalledTimes(1);
      expect(account.signUp).toHaveBeenCalledTimes(1);
    });
  });

  describe('verify', () => {
    it('makes the account with the code, then forgets the code and the address', async () => {
      const { account, run, current } = setup();
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('481529'));
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'ok' });
      expect(account.signUp).toHaveBeenCalledWith({ ...SIGN_UP, code: '481529' });
      expect(current().code).toBe('');
      expect(current().sentTo).toBeNull();
    });

    it('says an incomplete code is not right under it, and sends nothing', async () => {
      const { account, run, current } = setup();
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('4815'));
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'incomplete' });
      expect(current().codeError).toBe("That code isn't right. Check the email and try again.");
      expect(account.signUp).not.toHaveBeenCalled();
    });

    it('says a wrong code under it, and takes the message away once it is typed again', async () => {
      const account = fakeAccount();
      account.signUp.mockRejectedValueOnce(new AccountError('code'));
      const { run, current } = setup(account);
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('111111'));
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'shown' });
      expect(current().codeError).toBe("That code isn't right. Check the email and try again.");
      act(() => current().setCode('11111'));
      expect(current().codeError).toBeUndefined();
    });

    it('lets the hold go for an expired code, and forgets it, so the next request asks again', async () => {
      const account = fakeAccount();
      account.signUp.mockRejectedValueOnce(new AccountError('expired'));
      const { run, current } = setup(account);
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('481529'));
      expect(current().resendHeld).toBe(true);
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'shown' });
      expect(current().codeError).toBe('That code has expired. Send a new one.');
      expect(current().resendHeld).toBe(false);
      await run((c) => c.request(ROBIN));
      expect(account.requestCode).toHaveBeenCalledTimes(2);
    });

    it('lets the hold go after too many tries, as the code may be spent, and says why', async () => {
      const account = fakeAccount();
      account.signUp.mockRejectedValueOnce(
        new AccountError('limited', 'Too many tries. Try again in 60 minutes.', 3600),
      );
      const { run, current } = setup(account);
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('481529'));
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({
        kind: 'failed',
        failure: 'limited',
        message: 'Too many tries. Try again in 60 minutes.',
      });
      expect(current().problem).toBe('Too many tries. Try again in 60 minutes.');
      expect(current().resendHeld).toBe(false);
    });

    it.each([
      [
        'taken',
        new AccountError('taken'),
        { kind: 'taken', message: 'That username is taken. Try another one.' },
      ],
      [
        'keys',
        new KeyDerivationError(new RangeError('Out of memory')),
        { kind: 'failed', failure: 'keys' },
      ],
      ['offline', new AccountError('offline'), { kind: 'failed', failure: 'offline' }],
      ['unavailable', new AccountError('unavailable'), { kind: 'failed', failure: 'service' }],
    ] as const)(
      'hands a sign-up that failed (%s) back to the screen',
      async (_, error, outcome) => {
        const account = fakeAccount();
        account.signUp.mockRejectedValueOnce(error);
        const { run, current } = setup(account);
        await run((c) => c.request(ROBIN));
        act(() => current().setCode('481529'));
        expect(await run((c) => c.verify(SIGN_UP))).toMatchObject(outcome);
        // Nothing said on the code step: the screen says it.
        expect(current().codeError).toBeUndefined();
        expect(current().problem).toBeUndefined();
      },
    );
  });
});
