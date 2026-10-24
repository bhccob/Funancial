import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { KeyDerivationError } from '@/data/accountCrypto';
import { toast } from '@/lib/toast';
import { AccountError } from '@/store/accountActions';
import { useAccountActions } from '@/store/useAccount';
import {
  keepPendingCode,
  pendingCode,
  stillWorks,
  subscribePendingCode,
  type PendingCode,
} from './pendingCode';
import { errorMessage } from './shared';

/** The service mails a new code only this long after the last one. */
export const RESEND_SECONDS = 30;
/** What an emailed code is: six digits. */
const CODE_LENGTH = 6;
/** What Verify says, under the code, for one that is not six digits yet. */
export const SHORT_CODE = 'Type all 6 digits.';

/** Whose account the code is for, as typed. */
export type CodeOwner = { username: string; email: string };

/**
 * A try that failed for a reason that isn't what was typed: nothing came back (as good as offline), the
 * service failed, the phone couldn't make the keys (Verify only), or the service is holding back for a
 * while. A screen offers the way on without an account for each.
 */
export type CodeFailure = 'offline' | 'service' | 'keys' | 'limited';

/**
 * What a call leaves for the screen to do:
 * - `ok`: go on, to the code (`request`), or past it with the account made (`verify`)
 * - `incomplete` (`verify`): the code is not six digits; it is said under the code and nothing was sent
 * - `shown`: what went wrong is said on the code step (`codeError` or `problem`)
 * - `taken`: the name is someone else's, said for the name field
 * - `invalid` (`request`): what was typed, said on the account step
 * - `failed`: not the person's doing (`message` says what), so the way on without an account
 *
 * A call made while another is under way does nothing and gives back `null`.
 */
export type CodeOutcome =
  | { kind: 'ok' | 'incomplete' | 'shown' }
  | { kind: 'taken' | 'invalid'; message: string }
  | { kind: 'failed'; failure: CodeFailure; message: string };

const trimmed = ({ username, email }: CodeOwner): CodeOwner => ({
  username: username.trim(),
  email: email.trim(),
});
const reasonOf = (err: unknown) => (err instanceof AccountError ? err.code : null);
/** The seconds a refusal said to wait, or `null` where it named none. */
const waitOf = (err: unknown) => (err instanceof AccountError ? err.retryAfter : null);

function failed(err: unknown): CodeOutcome {
  const reason = reasonOf(err);
  const failure: CodeFailure =
    reason === 'offline' || reason === 'limited'
      ? reason
      : err instanceof KeyDerivationError
        ? 'keys'
        : 'service';
  return { kind: 'failed', failure, message: errorMessage(err) };
}

/** The sign-up waiting on a code that still works, if there is one to come back to. */
function waiting(): PendingCode | null {
  const pending = pendingCode();
  return pending && stillWorks(pending, Date.now()) ? pending : null;
}

/** When Send a new code is let go for a screen that comes back to a code: 30 s after its mail. */
function restoredHoldEnd() {
  const pending = waiting();
  return pending ? pending.sentAt + RESEND_SECONDS * 1000 : 0;
}

/** Whole seconds from now until `end`, rounded up: 0 once it has come. */
const secondsUntil = (end: number) => Math.max(0, Math.ceil((end - Date.now()) / 1000));

/**
 * The emailed code before an account is made, for setup and for Settings' Create account: asking for
 * it, the code typed, Send a new code, and Verify, which makes the account with it.
 *
 * - Who the code was mailed for, and when, is kept outside the screen (`pendingCode`): the person
 *   goes to their email app for it, and may come back to a screen that a lock or a reload made anew.
 *   That screen refills its name and address from `restored`; the password is typed again, and
 *   Continue then goes back to the code without another mail. It is let go once the account is made,
 *   at `forget` (Skip) and when the address is changed (`addressChanged`).
 * - Asking again with the same name and address while the code sent still works (10 minutes) goes
 *   back to it without a new mail. A changed name with the same address that the service holds back
 *   (`limited`) goes on to that address's code too: the name is checked again at Verify. So does a
 *   hold of 30 seconds or less on an address this screen sent nothing to: that is the gap after a
 *   code that went there a moment ago (one whose answer was lost, or one sent before a reload).
 * - Send a new code is held `RESEND_SECONDS` after each send, or as long as a refusal says
 *   (`retryAfter`), and let go at once after Verify meets an expired code or too many tries (the code
 *   may be spent). `resendLeft` counts the seconds down.
 * - One call at a time, as the account layer has them (a resend during a sign-up would replace the
 *   code being checked): a request, a resend or a Verify while another is under way does nothing.
 * - A new code lets go of what was typed of the last one; a failed send keeps it, as the service does.
 */
export function useEmailCode() {
  const { requestCode, signUp, forgetKeys } = useAccountActions();
  // Who the code was mailed for, and when, as the store outside the screen keeps it.
  const sent = useSyncExternalStore(subscribePendingCode, pendingCode);
  // What the screen refills its fields from as it opens: the sign-up a lock or reload left waiting.
  const [restored] = useState<CodeOwner | null>(() => {
    const pending = waiting();
    return pending && { username: pending.username, email: pending.email };
  });
  const [code, setCodeValue] = useState('');
  // What the code step says went wrong: about the code itself (under it), or about the tries.
  const [codeError, setCodeError] = useState<string>();
  const [problem, setProblem] = useState<string>();

  // Send a new code is held until `holdEnd` (ms since the epoch), counted down a second at a time.
  const holdEnd = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [resendLeft, setResendLeft] = useState(() => secondsUntil(restoredHoldEnd()));
  function tick() {
    const left = holdEnd.current - Date.now();
    setResendLeft(Math.max(0, Math.ceil(left / 1000)));
    // On at the next whole second, the one the count shows next.
    if (left > 0) holdTimer.current = setTimeout(tick, left % 1000 || 1000);
  }
  useEffect(() => {
    // A screen that comes back to a code holds Send a new code for what is left of its 30 s.
    holdEnd.current = restoredHoldEnd();
    if (holdEnd.current > 0) {
      const left = holdEnd.current - Date.now();
      holdTimer.current = setTimeout(tick, left > 0 ? left % 1000 || 1000 : 0);
    }
    return () => clearTimeout(holdTimer.current);
    // Once, as the screen opens: `tick` reads the time and the ref for itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One call at a time: read at once, so a second tap in the same instant finds it taken.
  const running = useRef(false);
  const [sending, setSending] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  async function alone(
    flag: (on: boolean) => void,
    job: () => Promise<CodeOutcome>,
  ): Promise<CodeOutcome | null> {
    if (running.current) return null;
    running.current = true;
    flag(true);
    try {
      return await job();
    } finally {
      running.current = false;
      flag(false);
    }
  }

  /** Holds Send a new code for `seconds`, or lets it go at once for 0. */
  function holdResend(seconds: number) {
    clearTimeout(holdTimer.current);
    holdEnd.current = Date.now() + seconds * 1000;
    tick();
  }

  /** A code is on its way for `who`, sent `secondsAgo`: what was typed of an earlier one is no use now. */
  function codeSent(who: CodeOwner, secondsAgo = 0) {
    keepPendingCode({ ...who, sentAt: Date.now() - secondsAgo * 1000 });
    setCodeValue('');
    setCodeError(undefined);
    setProblem(undefined);
    holdResend(RESEND_SECONDS - secondsAgo);
  }

  /** Whether the last code went to `who`'s address and still works. */
  const liveFor = (who: CodeOwner) =>
    sent !== null && sent.email === who.email && stillWorks(sent, Date.now());

  /** Continue on the account step: a code mailed for `who`, or the one that was, if it still works. */
  async function request(who: CodeOwner): Promise<CodeOutcome | null> {
    const key = trimmed(who);
    if (liveFor(key) && sent?.username === key.username) return { kind: 'ok' };
    return alone(setSending, async () => {
      try {
        await requestCode(who);
        codeSent(key);
        return { kind: 'ok' };
      } catch (err) {
        const reason = reasonOf(err);
        if (reason === 'taken' || reason === 'invalid') {
          return { kind: reason, message: errorMessage(err) };
        }
        const wait = waitOf(err);
        if (reason === 'limited' && sent !== null && liveFor(key)) {
          // Only the name changed, too soon for another mail: the code sent to this address works.
          keepPendingCode({ ...sent, username: key.username });
          holdResend(wait ?? RESEND_SECONDS);
          return { kind: 'ok' };
        }
        if (reason === 'limited' && wait !== null && wait <= RESEND_SECONDS) {
          // The gap after a code that went to this address a moment ago, which this screen did not
          // see go (its answer was lost, or it went before a lock or a reload): it is the code to
          // type, and a new one may be sent once the gap is over.
          codeSent(key, RESEND_SECONDS - wait);
          return { kind: 'ok' };
        }
        return failed(err);
      }
    });
  }

  /** Send a new code, for `who`. */
  async function resend(who: CodeOwner): Promise<CodeOutcome | null> {
    if (resendLeft > 0 || running.current) return null;
    setProblem(undefined);
    return alone(setSending, async () => {
      try {
        await requestCode(who);
        codeSent(trimmed(who));
        toast('success', 'We sent a new code.');
        return { kind: 'ok' };
      } catch (err) {
        const reason = reasonOf(err);
        if (reason === 'taken') return { kind: 'taken', message: errorMessage(err) };
        if (reason === 'limited' || reason === 'invalid') {
          if (reason === 'limited') holdResend(waitOf(err) ?? RESEND_SECONDS);
          setProblem(errorMessage(err));
          return { kind: 'shown' };
        }
        // The service keeps the last code when a mail fails, so what was typed of it stays.
        return failed(err);
      }
    });
  }

  /** Verify: makes the account for `who` with the code typed. Slow on purpose (the keys). */
  async function verify(who: CodeOwner & { password: string }): Promise<CodeOutcome | null> {
    if (running.current) return null;
    setCodeError(undefined);
    setProblem(undefined);
    // What cannot be a code is not sent: the account layer would refuse it the same way.
    if (code.length !== CODE_LENGTH) {
      setCodeError(SHORT_CODE);
      return { kind: 'incomplete' };
    }
    return alone(setSigningUp, async () => {
      try {
        await signUp({ ...who, code });
        setCodeValue('');
        keepPendingCode(null);
        return { kind: 'ok' };
      } catch (err) {
        switch (reasonOf(err)) {
          case 'code':
            setCodeError(errorMessage(err));
            return { kind: 'shown' };
          case 'expired':
            // Gone: the next request asks for a new one, and Send a new code may at once.
            keepPendingCode(null);
            holdResend(0);
            setCodeError(errorMessage(err));
            return { kind: 'shown' };
          case 'taken':
            // Someone took the name since the code was sent.
            return { kind: 'taken', message: errorMessage(err) };
          case 'invalid':
            setProblem(errorMessage(err));
            return { kind: 'shown' };
          case 'limited':
            // The service takes a right code before its sign-up limit, so this one may be spent.
            holdResend(0);
            setProblem(errorMessage(err));
            return failed(err);
          default:
            return failed(err);
        }
      }
    });
  }

  return {
    /** The name and address of a sign-up a lock or a reload left waiting on its code, for the fields. */
    restored,
    /** The code typed, digits only. */
    code,
    /** Sets the code typed (as `CodeField` gives it), which takes away what was said about the last. */
    setCode(next: string) {
      setCodeValue(next);
      setCodeError(undefined);
    },
    /** What is wrong with the code, said under it. */
    codeError,
    /** What went wrong with the tries (too many, a refused resend), said on the code step. */
    problem,
    /** The address the last code went to, or `null` when there is none to go back to. */
    sentTo: sent?.email ?? null,
    sending,
    signingUp,
    /** Whether Send a new code is held, and the whole seconds left until it is let go. */
    resendHeld: resendLeft > 0,
    resendLeft,
    request,
    resend,
    verify,
    /** The address typed on the account step changed: a code sent to another is no longer the one. */
    addressChanged(email: string) {
      const pending = pendingCode();
      if (pending && pending.email !== email.trim()) keepPendingCode(null);
    },
    /**
     * Lets go of the keys a Verify keeps for another try with the same name and password: the name or
     * password changed, or the screen is being left.
     */
    forgetKeys,
    /** The person goes on without an account (Skip): the code waiting and the keys are let go. */
    forget() {
      keepPendingCode(null);
      forgetKeys();
      setCodeValue('');
      setCodeError(undefined);
      setProblem(undefined);
    },
  };
}
