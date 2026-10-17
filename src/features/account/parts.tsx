import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { TextField, type TextFieldProps } from '@/components/ui/TextField';

export function Problem({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="text-danger text-sm font-bold">
      {children}
    </p>
  ) : null;
}

/** The round 44px arrow at the top left of a screen that has a step before it. */
export function BackButton({ onClick, disabled }: { onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={onClick}
      disabled={disabled}
      className="border-border bg-bg/80 text-text hover:bg-surface-2 grid size-11 shrink-0 place-items-center rounded-full border disabled:pointer-events-none disabled:opacity-45 motion-safe:transition-transform motion-safe:active:scale-95"
    >
      <ChevronLeft aria-hidden className="size-5" />
    </button>
  );
}

/** A password line field with a Show toggle under it, to check what was typed on a small keyboard. */
export function PasswordField({
  label = 'Password',
  ...rest
}: Omit<TextFieldProps, 'variant' | 'type' | 'label'> & { label?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col">
      <TextField
        variant="line"
        label={label}
        type={shown ? 'text' : 'password'}
        autoCapitalize="none"
        spellCheck={false}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        className="text-accent-text -mb-1 inline-flex min-h-11 items-center self-end text-sm font-bold underline underline-offset-4"
      >
        {shown ? 'Hide password' : 'Show password'}
      </button>
    </div>
  );
}

/** What heads a screen of welcome and setup: a small violet word, the 34px title, and a muted line. */
export function ScreenHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow && (
        <p className="text-xp-text text-xs font-extrabold tracking-[0.12em] uppercase">{eyebrow}</p>
      )}
      <h1
        tabIndex={-1}
        className="text-[34px] leading-tight font-extrabold tracking-[-0.035em] outline-none"
      >
        {title}
      </h1>
      {lead && <p className="text-muted font-semibold">{lead}</p>}
    </header>
  );
}
