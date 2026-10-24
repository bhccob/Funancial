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

  it('counts the hold down a second at a time', async () => {
    const { run, advance, current } = setup();
    expect(current().resendLeft).toBe(0);
    await run((c) => c.request(ROBIN));
    expect(current().resendLeft).toBe(30);
    advance(1);
    expect(current().resendLeft).toBe(30);
    advance(999);
    expect(current().resendLeft).toBe(29);
    advance(28_000);
    expect(current().resendLeft).toBe(1);
    advance(1_000);
    expect(current().resendLeft).toBe(0);
    expect(current().resendHeld).toBe(false);
  });

  describe('a code that went to the address a moment ago, unseen', () => {
    it('goes on to the code for a refusal that is the 30 s gap, held for what is left of it', async () => {
      const account = fakeAccount();
      // A code went to this address 12 s ago (its answer was lost, or a reload forgot it).
      account.requestCode.mockRejectedValueOnce(
        new AccountError('limited', 'Too many tries. Try again in a minute.', 18),
      );
      const { run, advance, current } = setup(account);
      expect(await run((c) => c.request(ROBIN))).toEqual({ kind: 'ok' });
      expect(current().sentTo).toBe('robin@example.com');
      expect(current().problem).toBeUndefined();
      expect(current().resendLeft).toBe(18);
      advance(17_999);
      expect(current().resendHeld).toBe(true);
      advance(1);
      expect(current().resendHeld).toBe(false);
      // The code to type is that one: Back and on again does not ask for another.
      expect(await run((c) => c.request(ROBIN))).toEqual({ kind: 'ok' });
      expect(account.requestCode).toHaveBeenCalledTimes(1);
      act(() => current().setCode('481529'));
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'ok' });
      expect(account.signUp).toHaveBeenCalledWith({ ...SIGN_UP, code: '481529' });
    });

    it('takes the code to have gone when it was sent, for how long it works', async () => {
      const account = fakeAccount();
      account.requestCode.mockRejectedValueOnce(new AccountError('limited', 'Too many tries.', 30));
      const { run, advance, current } = setup(account);
      await run((c) => c.request(ROBIN));
      expect(current().resendLeft).toBe(30);
      // Ten minutes from then, it is gone: Continue asks for a new one.
      advance(10 * 60_000);
      await run((c) => c.request(ROBIN));
      expect(account.requestCode).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['a longer hold (the hour)', 31],
      ['one that names no wait', null],
    ])('says too many tries for %s, and goes nowhere', async (_, wait) => {
      const account = fakeAccount();
      account.requestCode.mockRejectedValueOnce(
        new AccountError('limited', 'Too many tries. Try again in a minute.', wait),
      );
      const { run, current } = setup(account);
      expect(await run((c) => c.request(ROBIN))).toEqual({
        kind: 'failed',
        failure: 'limited',
        message: 'Too many tries. Try again in a minute.',
      });
      expect(current().sentTo).toBeNull();
      expect(current().resendHeld).toBe(false);
    });
  });

  describe('kept outside the screen, for a lock or a reload', () => {
    /** What the phone keeps for a sign-up waiting on its code. */
    const kept = () =>
      JSON.parse(localStorage.getItem('funancial.signup.code') ?? 'null') as unknown;

    it('keeps who the code went to and when, and never the password or the code', async () => {
      const { run, current } = setup();
      await run((c) => c.request({ username: ' Robin ', email: ' robin@example.com' }));
      act(() => current().setCode('481529'));
      expect(kept()).toEqual({ username: 'Robin', email: 'robin@example.com', sentAt: Date.now() });
      const stored = localStorage.getItem('funancial.signup.code')!;
      expect(stored).not.toContain('481529');
      expect(stored).not.toContain(SIGN_UP.password);
    });

    it('is there for the screen that opens next, which goes back to the code without a new mail', async () => {
      const first = setup();
      await first.run((c) => c.request(ROBIN));
      act(() => first.current().setCode('48'));
      first.advance(12_000);
      // The lock takes the screen down: what was typed goes with it.
      first.hook.unmount();

      const again = setup(first.account);
      expect(again.current().restored).toEqual(ROBIN);
      expect(again.current().sentTo).toBe('robin@example.com');
      expect(again.current().code).toBe('');
      // Send a new code is held for what is left of the 30 s.
      expect(again.current().resendLeft).toBe(18);
      again.advance(17_999);
      expect(again.current().resendHeld).toBe(true);
      again.advance(1);
      expect(again.current().resendHeld).toBe(false);

      expect(await again.run((c) => c.request(ROBIN))).toEqual({ kind: 'ok' });
      expect(first.account.requestCode).toHaveBeenCalledTimes(1);
    });

    it('is read back from the phone after a reload', async () => {
      const first = setup();
      await first.run((c) => c.request(ROBIN));
      first.advance(5_000);
      first.hook.unmount();

      // The app starts again: nothing in memory, only what the phone kept.
      vi.resetModules();
      const fresh = await import('./useEmailCode');
      const providers = await import('@/test/fakeAccount');
      const account = providers.fakeAccount();
      const hook = renderHook(() => fresh.useEmailCode(), {
        wrapper: ({ children }: { children: ReactNode }) =>
          providers.withAccount(account, children),
      });
      expect(hook.result.current.restored).toEqual(ROBIN);
      expect(hook.result.current.resendLeft).toBe(25);
      await act(async () => {
        expect(await hook.result.current.request(ROBIN)).toEqual({ kind: 'ok' });
      });
      expect(account.requestCode).not.toHaveBeenCalled();
      hook.unmount();
      (await import('./pendingCode')).keepPendingCode(null);
    });

    it('is gone once the code has run out, on the phone too', async () => {
      const first = setup();
      await first.run((c) => c.request(ROBIN));
      first.hook.unmount();
      act(() => void vi.advanceTimersByTime(10 * 60_000));

      const again = setup(first.account);
      expect(again.current().restored).toBeNull();
      expect(await again.run((c) => c.request(ROBIN))).toEqual({ kind: 'ok' });
      expect(first.account.requestCode).toHaveBeenCalledTimes(2);

      // And after a reload, one that ran out is not read back, and is cleared away.
      localStorage.setItem(
        'funancial.signup.code',
        JSON.stringify({ ...ROBIN, sentAt: Date.now() - 10 * 60_000 }),
      );
      vi.resetModules();
      const fresh = await import('./pendingCode');
      expect(fresh.pendingCode()).toBeNull();
      expect(localStorage.getItem('funancial.signup.code')).toBeNull();
    });

    it('reads nothing back from what is not one of its records', async () => {
      for (const stored of ['not json', '{"username":"Robin"}', '[1,2]']) {
        localStorage.setItem('funancial.signup.code', stored);
        vi.resetModules();
        const fresh = await import('./pendingCode');
        expect(fresh.pendingCode(), stored).toBeNull();
      }
    });

    it('is let go once the account is made', async () => {
      const first = setup();
      await first.run((c) => c.request(ROBIN));
      act(() => first.current().setCode('481529'));
      await first.run((c) => c.verify(SIGN_UP));
      expect(kept()).toBeNull();
      first.hook.unmount();
      expect(setup().current().restored).toBeNull();
    });

    it('is let go, with the keys, when the person goes on without an account', async () => {
      const first = setup();
      await first.run((c) => c.request(ROBIN));
      act(() => first.current().forget());
      expect(kept()).toBeNull();
      expect(first.current().sentTo).toBeNull();
      expect(first.account.forgetKeys).toHaveBeenCalled();
    });

    it('is let go when the address changes, and kept while it does not', async () => {
      const { run, current } = setup();
      await run((c) => c.request(ROBIN));
      act(() => current().addressChanged(' robin@example.com '));
      expect(current().sentTo).toBe('robin@example.com');
      act(() => current().addressChanged('robin@example.co'));
      expect(current().sentTo).toBeNull();
      expect(kept()).toBeNull();
    });

    it('is still kept when the phone can keep nothing', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const first = setup();
      await first.run((c) => c.request(ROBIN));
      first.hook.unmount();
      expect(setup(first.account).current().restored).toEqual(ROBIN);
      vi.restoreAllMocks();
    });
  });

  describe('a refused Send a new code', () => {
    it('hands a name that has been taken meanwhile back to the screen, and keeps the code it has', async () => {
      const account = fakeAccount();
      account.requestCode.mockResolvedValueOnce().mockRejectedValueOnce(new AccountError('taken'));
      const { run, advance, current } = setup(account);
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('481'));
      advance(30_000);
      expect(await run((c) => c.resend(ROBIN))).toEqual({
        kind: 'taken',
        message: 'That username is taken. Try another one.',
      });
      // The screen fixes the name on the account step: nothing is said here, no new mail is
      // promised, and the code sent before and what was typed of it are as they were.
      expect(current().problem).toBeUndefined();
      expect(current().codeError).toBeUndefined();
      expect(current().sentTo).toBe('robin@example.com');
      expect(current().code).toBe('481');
      expect(current().resendHeld).toBe(false);
      expect(toastStore.getState().toasts).toEqual([]);
    });

    it('says what was typed being wrong on the code step, and holds nothing', async () => {
      const account = fakeAccount();
      account.requestCode
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new AccountError('invalid'));
      const { run, advance, current } = setup(account);
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('481'));
      advance(30_000);
      expect(await run((c) => c.resend(ROBIN))).toEqual({ kind: 'shown' });
      expect(current().problem).toBe('Check what you typed and try again.');
      // Not a refusal to wait out: Send a new code stays open, and the code typed is kept.
      expect(current().resendHeld).toBe(false);
      expect(current().code).toBe('481');
      expect(current().sentTo).toBe('robin@example.com');
      expect(toastStore.getState().toasts).toEqual([]);
    });
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

    it('asks for all six digits of an incomplete code, under it, and sends nothing', async () => {
      const { account, run, current } = setup();
      await run((c) => c.request(ROBIN));
      for (const typed of ['', '4815']) {
        act(() => current().setCode(typed));
        expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'incomplete' });
        expect(current().codeError).toBe('Type all 6 digits.');
      }
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

    it('says what was typed being wrong on the code step, and keeps the code, the hold and the address', async () => {
      const account = fakeAccount();
      account.signUp.mockRejectedValueOnce(new AccountError('invalid'));
      const { run, current } = setup(account);
      await run((c) => c.request(ROBIN));
      act(() => current().setCode('481529'));
      expect(await run((c) => c.verify(SIGN_UP))).toEqual({ kind: 'shown' });
      expect(current().problem).toBe('Check what you typed and try again.');
      // The code is not the matter: nothing is said under it, it stays typed and sent, and the
      // hold on Send a new code runs on.
      expect(current().codeError).toBeUndefined();
      expect(current().code).toBe('481529');
      expect(current().sentTo).toBe('robin@example.com');
      expect(current().resendHeld).toBe(true);
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
