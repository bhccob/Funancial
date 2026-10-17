import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { forgotProblem } from '@/store/accountActions';
import { useAccountActions } from '@/store/useAccount';
import { BackButton, Problem, ScreenHeader } from './parts';
import { errorMessage, FORGOT_LEAD, useBusy } from './shared';

/** The same line whether or not there is such an account, and for a username or an email alike. */
const SENT = "If that account exists, we've emailed a link. It works for 30 minutes.";

/**
 * Asks for a username or an email, then says a link is on its way: always the same line, so it tells
 * nothing about who has an account. Used by the Forgot password screen and by Settings' log-in dialog.
 */
export function ForgotForm({
  doneLabel,
  onDone,
  onCancel,
}: {
  doneLabel: string;
  onDone(): void;
  /** Where the form is not a screen of its own (a dialog) there is no arrow to go back with. */
  onCancel?(): void;
}) {
  const { forgot } = useAccountActions();
  const [who, setWho] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const { busy, guard } = useBusy();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = forgotProblem(who) ?? undefined;
    setFieldError(found);
    if (found) return;
    setError(undefined);
    await guard(async () => {
      try {
        await forgot(who);
        setSent(true);
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {!sent && (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <TextField
            variant="line"
            label="Username or email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={who}
            error={fieldError}
            onChange={(e) => setWho(e.target.value)}
          />
          <Problem>{error}</Problem>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a link'}
          </Button>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </form>
      )}
      {/* Always on the page, so the line is announced when it fills. */}
      <div role="status">{sent && <p className="font-bold">{SENT}</p>}</div>
      {sent && (
        // The form, with the button that had focus, is gone: carry focus on rather than drop it.
        <Button variant="secondary" autoFocus onClick={onDone}>
          {doneLabel}
        </Button>
      )}
    </div>
  );
}

/** Forgot password, as a screen of the welcome flow: the arrow goes back to log in. */
export function ForgotScreen({ onBack }: { onBack(): void }) {
  return (
    <>
      <div>
        <BackButton onClick={onBack} />
      </div>
      <ScreenHeader eyebrow="No problem" title="Forgot password?" lead={FORGOT_LEAD} />
      <ForgotForm doneLabel="Back to log in" onDone={onBack} />
    </>
  );
}
