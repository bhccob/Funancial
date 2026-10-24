import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TextField, type TextFieldProps } from '@/components/ui/TextField';
import {
  passwordStrength,
  type PasswordOwner,
  type PasswordStrength,
} from '@/domain/passwordRules';
import { cn } from '@/lib/cn';
import { SAVE_NOTE } from './shared';

export function Problem({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="text-danger text-sm font-bold">
      {children}
    </p>
  ) : null;
}

/** Where a friend agrees to an account being made: said under its fields, in setup and in Settings. */
export function SaveNote() {
  return <p className="text-muted text-sm">{SAVE_NOTE}</p>;
}

/**
 * The round 44px arrow at the top left of a screen that has a step before it: a piece of the page's
 * glass, as `PageHeader`'s Back is.
 */
export function BackButton({ onClick, disabled }: { onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onClick}
      disabled={disabled}
      className="glass press text-text grid size-11 shrink-0 place-items-center rounded-full disabled:pointer-events-none disabled:opacity-45"
    >
      <ChevronLeft aria-hidden className="size-5" />
    </button>
  );
}

/**
 * Under the code field: Send a new code (held, while the last one was just sent, by `disabled`) and
 * how long a code works. Setup and Settings' Create account say it the same.
 */
export function ResendCode({ onResend, disabled }: { onResend(): void; disabled?: boolean }) {
  return (
    <div className="-mt-2 flex flex-col items-center gap-1 text-center">
      <button
        type="button"
        onClick={onResend}
        disabled={disabled}
        className="text-accent-text inline-flex min-h-11 items-center font-bold underline underline-offset-4 disabled:pointer-events-none disabled:opacity-45"
      >
        Send a new code
      </button>
      <p className="text-muted text-sm">
        The code works for 10 minutes. Wrong email? Go back and fix it.
      </p>
    </div>
  );
}

const STRENGTH: Record<PasswordStrength, { word: string; marks: number; fill: string }> = {
  weak: { word: 'Weak', marks: 1, fill: 'bg-danger' },
  okay: { word: 'Okay', marks: 2, fill: 'bg-warning' },
  strong: { word: 'Strong', marks: 3, fill: 'bg-success' },
};

/**
 * Three marks and a word for how strong a password is: one mark in danger for weak, two in warning
 * for okay, three in success for strong, the rest in the page's track. The marks are drawn only; the
 * word says it, politely and whole ("Password strength: Weak"), so a screen reader hears it change as
 * the password is typed. Nothing shows while nothing is typed. `who` is whose password it is: one that
 * is their username or email is weak here, as submitting it is refused.
 */
function StrengthBar({ password, who }: { password: string; who: PasswordOwner }) {
  const level = password === '' ? null : passwordStrength(password, who);
  const strength = level && STRENGTH[level];
  return (
    <div className="flex items-center gap-2.5" data-strength={level ?? 'none'}>
      <div aria-hidden="true" className="flex gap-1">
        {[1, 2, 3].map((mark) => {
          const on = strength !== null && mark <= strength.marks;
          return (
            <i
              key={mark}
              data-strength-mark={on ? 'on' : 'off'}
              className={cn('block h-1.5 w-7 rounded-full', on ? strength.fill : 'bg-track')}
            />
          );
        })}
      </div>
      <span aria-live="polite" aria-atomic="true" className="min-w-12">
        {strength && (
          <>
            <span className="sr-only">Password strength: </span>
            <span className="text-muted text-sm font-bold">{strength.word}</span>
          </>
        )}
      </span>
    </div>
  );
}

/**
 * A password field with a Show toggle under it, to check what was typed on a small keyboard: the line
 * field of the setup and log-in screens, or with `variant="row"` the plain row of Settings. With
 * `strength` a bar and a word beside the toggle say how strong the typed password is, for a field that
 * chooses one (`passwordStrength`); it reads the field's `value`, so the field is controlled. Give it the
 * username and email the password is for (`strength={{ username, email }}`) so the bar agrees with the
 * check that refuses a password that is one of them; `true` is the bar with no names.
 */
export function PasswordField({
  label = 'Password',
  variant = 'line',
  strength = false,
  ...rest
}: Omit<TextFieldProps, 'variant' | 'type' | 'label'> & {
  label?: string;
  variant?: 'line' | 'row';
  strength?: boolean | PasswordOwner;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col">
      <TextField
        variant={variant}
        label={label}
        type={shown ? 'text' : 'password'}
        autoCapitalize="none"
        spellCheck={false}
        {...rest}
      />
      <div className="-mb-1 flex items-center justify-between gap-3">
        {strength && (
          <StrengthBar
            password={typeof rest.value === 'string' ? rest.value : ''}
            who={strength === true ? {} : strength}
          />
        )}
        <button
          type="button"
          onClick={() => setShown(!shown)}
          className="text-accent-text ml-auto inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4"
        >
          {shown ? 'Hide password' : 'Show password'}
        </button>
      </div>
    </div>
  );
}

/** What heads a screen of welcome and setup: a small violet word, the page's title, and a muted line. */
export function ScreenHeader({
  eyebrow,
  title,
  lead,
  leadId,
  focus,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  /** The lead's id, for a field the lead tells about (`aria-describedby`). */
  leadId?: string;
  /** Takes focus as it appears, for a screen that changes inside another (a screen reader hears it). */
  focus?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus({ preventScroll: true });
  }, [focus]);
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && (
        <p className="text-xp-text text-xs font-extrabold tracking-[0.12em] uppercase">{eyebrow}</p>
      )}
      <h1 ref={heading} tabIndex={-1} className="text-page outline-none">
        {title}
      </h1>
      {lead && (
        <p id={leadId} className="text-muted font-semibold">
          {lead}
        </p>
      )}
    </header>
  );
}
