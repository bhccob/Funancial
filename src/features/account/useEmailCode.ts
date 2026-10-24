import { useEffect, useRef, useState } from 'react';
import { KeyDerivationError } from '@/data/accountCrypto';
import { toast } from '@/lib/toast';
import { AccountError } from '@/store/accountActions';
import { useAccountActions } from '@/store/useAccount';
import { errorMessage } from './shared';

/** The service mails a new code only this long after the last one. */
export const RESEND_SECONDS = 30;
/** How long a code works, from the service's mail. One older than this is not gone back to. */
const CODE_LIFETIME_MS = 10 * 60_000;
/** What an emailed code is: six digits. */
const CODE_LENGTH = 6;

/** Whose account the code is for, as typed. */
export type CodeOwner = { username: string; email: string };

/** Who a code was mailed for (trimmed), and when: asking again with the same details goes back to it. */
type Sent = CodeOwner & { at: number };

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

/**
 * The emailed code before an account is made, for setup and for Settings' Create account: asking for
 * it, the code typed, Send a new code, and Verify, which makes the account with it.
 *
 * - Asking again with the same name and address while the code sent still works (10 minutes) goes
 *   back to it without a new mail. A changed name with the same address that the service holds back
 *   (`limited`) goes on to that address's code too: the name is checked again at Verify.
 * - Send a new code is held `RESEND_SECONDS` after each send, or as long as a refusal says
 *   (`retryAfter`), and let go at once after Verify meets an expired code or too many tries (the code
 *   may be spent).
 * - One call at a time, as the account layer has them (a resend during a sign-up would replace the
 *   code being checked): a request, a resend or a Verify while another is under way does nothing.
 * - A new code lets go of what was typed of the last one; a failed send keeps it, as the service does.
 */
export function useEmailCode() {
  const { requestCode, signUp } = useAccountActions();
  const [code, setCodeValue] = useState('');
  const [sent, setSent] = useState<Sent | null>(null);
  // What the code step says went wrong: about the code itself (under it), or about the tries.
  const [codeError, setCodeError] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [resendHeld, setResendHeld] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

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
    setResendHeld(seconds > 0);
    if (seconds > 0) holdTimer.current = setTimeout(() => setResendHeld(false), seconds * 1000);
  }

  /** A code is on its way for `who`: what was typed of an earlier one is no use now. */
  function codeSent(who: CodeOwner) {
    setSent({ ...who, at: Date.now() });
    setCodeValue('');
    setCodeError(undefined);
    setProblem(undefined);
    holdResend(RESEND_SECONDS);
  }

  /** Whether the last code went to `who`'s address and still works. */
  const liveFor = (who: CodeOwner) =>
    sent !== null && sent.email === who.email && Date.now() - sent.at < CODE_LIFETIME_MS;

  const retryAfter = (err: unknown) =>
    (err instanceof AccountError ? err.retryAfter : null) ?? RESEND_SECONDS;

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
        if (reason === 'limited' && liveFor(key)) {
          // Only the name changed, too soon for another mail: the code sent to this address works.
          setSent((last) => last && { ...last, username: key.username });
          holdResend(retryAfter(err));
          return { kind: 'ok' };
        }
        return failed(err);
      }
    });
  }

  /** Send a new code, for `who`. */
  async function resend(who: CodeOwner): Promise<CodeOutcome | null> {
    if (resendHeld || running.current) return null;
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
          if (reason === 'limited') holdResend(retryAfter(err));
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
      setCodeError(new AccountError('code').message);
      return { kind: 'incomplete' };
    }
    return alone(setSigningUp, async () => {
      try {
        await signUp({ ...who, code });
        setCodeValue('');
        setSent(null);
        return { kind: 'ok' };
      } catch (err) {
        switch (reasonOf(err)) {
          case 'code':
            setCodeError(errorMessage(err));
            return { kind: 'shown' };
          case 'expired':
            // Gone: the next request asks for a new one, and Send a new code may at once.
            setSent(null);
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
    resendHeld,
    request,
    resend,
    verify,
  };
}
