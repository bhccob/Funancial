import { useRef, useState, type FormEvent } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Section } from '@/components/ui/Section';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/lib/toast';
import { useAction } from '@/lib/useAction';
import { emailProblem, passwordProblem, usernameProblem } from '@/store/accountActions';
import { useAccount, useAccountActions } from '@/store/useAccount';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const errorMessage = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'Something went wrong.';

const SaveNote = () => (
  <p className="text-muted text-sm">
    A locked copy of your data is kept so you can move to a new phone.
  </p>
);

/** `busy` while a job runs. A second tap before it ends does nothing: state would still read idle in it. */
function useBusy() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  async function guard(job: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await job();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return { busy, guard };
}

function Problem({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="text-danger text-sm font-bold">
      {children}
    </p>
  ) : null;
}

function CreateAccountDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { signUp } = useAccountActions();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    other?: string;
  }>({});
  const { busy, guard } = useBusy();

  const close = () => {
    setPassword('');
    setErrors({});
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = {
      username: usernameProblem(username) ?? undefined,
      email: emailProblem(email) ?? undefined,
      password: passwordProblem(password) ?? undefined,
    };
    if (found.username || found.email || found.password) return setErrors(found);
    setErrors({});
    await guard(async () => {
      try {
        await signUp({ username, email, password });
        toast('success', 'Your account is ready.');
        close();
      } catch (err) {
        setErrors({ other: errorMessage(err) });
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Create your account"
      description="So you can move to a new phone and keep everything."
      onClose={close}
    >
      {open && (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <TextField
            variant="line"
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={username}
            error={errors.username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            variant="line"
            label={'Email (for "forgot password")'}
            type="email"
            autoComplete="email"
            value={email}
            error={errors.email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            variant="line"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters"
            value={password}
            error={errors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <SaveNote />
          <Problem>{errors.other}</Problem>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function LogInDialog({
  open,
  defaultUsername = '',
  onClose,
}: {
  open: boolean;
  defaultUsername?: string;
  onClose(): void;
}) {
  const { logIn } = useAccountActions();
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const { busy, guard } = useBusy();

  const close = () => {
    setPassword('');
    setConfirming(false);
    setError(undefined);
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    await guard(async () => {
      try {
        // Without `replace` a phone that has data is not touched: the person is asked first.
        const outcome = await logIn({ username, password }, { replace: confirming });
        if (outcome === 'needs-confirm') return setConfirming(true);
        toast('success', "You're logged in. This phone now has your account's copy.");
        close();
      } catch (err) {
        setConfirming(false);
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Log in"
      description={
        confirming
          ? "Replace this phone's data with your account's copy?"
          : "Get your account's data on this phone."
      }
      onClose={close}
    >
      {open && (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          {confirming ? (
            <p className="text-muted text-sm">
              What is on this phone now is replaced. Make an encrypted backup first if you might
              want it back.
            </p>
          ) : (
            <>
              <TextField
                variant="line"
                label="Username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <TextField
                variant="line"
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          )}
          <Problem>{error}</Problem>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !username || !password}>
              {busy ? 'Logging in…' : confirming ? 'Replace' : 'Log in'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { changePassword } = useAccountActions();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ next?: string; again?: string; other?: string }>({});
  const { busy, guard } = useBusy();

  const close = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setErrors({});
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(next);
    if (problem) return setErrors({ next: problem });
    if (next !== again) return setErrors({ again: "Those don't match." });
    setErrors({});
    await guard(async () => {
      try {
        await changePassword(current, next);
        toast('success', 'Password changed.');
        close();
      } catch (err) {
        setErrors({ other: errorMessage(err) });
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Change password"
      description="You need the new password only to log in on another phone."
      onClose={close}
    >
      {open && (
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <TextField
            variant="line"
            label="Current password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <TextField
            variant="line"
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters"
            value={next}
            error={errors.next}
            onChange={(e) => setNext(e.target.value)}
          />
          <TextField
            variant="line"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={again}
            error={errors.again}
            onChange={(e) => setAgain(e.target.value)}
          />
          <Problem>{errors.other}</Problem>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !current || !next}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function DeleteCopyDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { deleteAccount } = useAccountActions();
  const [error, setError] = useState<string>();
  const { busy, guard } = useBusy();

  const close = () => {
    setError(undefined);
    onClose();
  };

  async function confirm() {
    setError(undefined);
    await guard(async () => {
      try {
        await deleteAccount();
        toast('success', 'Your account and its copy are deleted.');
        close();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      title="Turn off and delete my copy?"
      description="Your account and its locked copy are removed from Funancial's service, and this phone stops saving. The data on this phone stays."
      onClose={close}
      actions={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Deleting…' : 'Delete my copy'}
          </Button>
        </>
      }
    >
      <Problem>{error}</Problem>
    </Dialog>
  );
}

type Opened = 'create' | 'login' | 'password' | 'delete' | null;

function Loaded() {
  const { state, status, lastSaved, offline } = useAccount();
  const { unlink } = useAccountActions();
  const run = useAction();
  const [opened, setOpened] = useState<Opened>(null);
  const close = () => setOpened(null);

  return (
    <div className="flex flex-col gap-5">
      {state === null && (
        <>
          <p>Make an account so you can move to a new phone and keep everything.</p>
          <SaveNote />
          {offline && (
            <p className="text-muted text-sm">
              You&apos;re offline. Connect to the internet to create an account or log in.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setOpened('create')}>Create account</Button>
            <Button variant="secondary" onClick={() => setOpened('login')}>
              Log in
            </Button>
          </div>
        </>
      )}

      {state !== null && status === 'linked' && (
        <>
          <div className="flex flex-col gap-1">
            <p className="font-bold">{state.username}</p>
            {state.email && <p className="text-muted text-sm">{state.email}</p>}
            <p className="text-muted text-sm">
              {lastSaved
                ? `Last copy saved ${dateTime.format(new Date(lastSaved))}`
                : 'No copy saved yet.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setOpened('password')}>
              Change password
            </Button>
            <Button variant="danger-ghost" onClick={() => setOpened('delete')}>
              Turn off and delete my copy
            </Button>
          </div>
        </>
      )}

      {state !== null && status === 'moved' && (
        <>
          <Banner tone="warning" title="Your account moved to another phone">
            This phone&apos;s data is still here. It is no longer saved to your account.
          </Banner>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setOpened('login')}>Log in again</Button>
            <Button variant="secondary" onClick={() => void run(unlink)}>
              Keep using without an account
            </Button>
          </div>
        </>
      )}

      <CreateAccountDialog open={opened === 'create'} onClose={close} />
      <LogInDialog open={opened === 'login'} defaultUsername={state?.username} onClose={close} />
      <ChangePasswordDialog open={opened === 'password'} onClose={close} />
      <DeleteCopyDialog open={opened === 'delete'} onClose={close} />
    </div>
  );
}

/**
 * Settings → Account: make an account or log in, then see it and change its password or turn it off;
 * or, after another phone logged in, choose between logging in again and carrying on without one.
 * Nothing shows until the account has been read for the open data, and the demo has none.
 */
export function AccountSection() {
  const { loaded } = useAccount();
  if (!loaded) return null;
  return (
    <Section title="Account">
      <Loaded />
    </Section>
  );
}
