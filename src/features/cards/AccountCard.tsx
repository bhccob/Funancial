import { Nfc, Snowflake, Wallet } from 'lucide-react';
import type { Ref } from 'react';
import { CountUp } from '@/components/ui/CountUp';
import { heroFigure, type AccountRow } from '@/domain/balances';
import type { AccountKind } from '@/domain/entities';
import { cn } from '@/lib/cn';
import { cardLabel, KIND_LABEL } from './cardText';

/** The line under a card's amount, by kind; a credit card's says what is free on it. */
const UNDER: Record<Exclude<AccountKind, 'credit'>, string> = {
  debit: 'Available',
  savings: 'Saved',
  cash: 'In your wallet',
};

/** The cards take the theme's three tints in turn, then plain white glass, as in the wireframe. */
const TINTS = [
  '',
  '[--tint:var(--card-tint-2)]',
  '[--tint:var(--card-tint-3)]',
  '[--tint:rgb(255_255_255/0.2)]',
];

/**
 * The "just now" badge on a card: a small piece of the page's thick glass, in the page's ink (the
 * card reads the block's, which is white on a dark block), where the card has room, under the
 * contactless mark. Its words are checked over every face a card can have in tests/unit/tokens.test.ts,
 * and it only slides under `motion-safe` (see `--animate-just-now`).
 */
const JUST_NOW_BADGE =
  'glass-strong page-ink text-text pointer-events-none absolute top-[50px] right-3.5 z-[2] rounded-full px-2.5 py-1 text-[12px] leading-none font-extrabold whitespace-nowrap tabular-nums motion-safe:animate-just-now motion-reduce:animate-just-now-fade';

/**
 * One account as a glass card on the theme's block, the carousel's `index`-th: its kind, the chip
 * and the contactless mark when it has a card number, what it holds (a credit card: what it owes,
 * and what is free on it), and its name and last 4 digits. The amount counts to a new value when it
 * changes. A frozen card is frosted over, the frost coming in over 380ms (only fading for reduced
 * motion). The whole card is the button that selects it; `selected` is said as pressed. `justNow` is
 * an amount just spent on it, which a badge says ("−$12.50 just now") for the Cards tab to take off
 * again; it is drawn for the eye only, as the screen's Pay already said it.
 */
export function AccountCard({
  row,
  index,
  selected,
  money,
  justNow,
  onSelect,
  ref,
}: {
  row: AccountRow;
  index: number;
  selected: boolean;
  money: (minor: number) => string;
  justNow?: number;
  onSelect(): void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const { account, balance } = row;
  const credit = account.kind === 'credit';
  const free = credit && account.credit?.limit ? heroFigure(row).amount : null;
  const under = credit
    ? free === null
      ? 'Owed'
      : `Owed · ${money(free)} free`
    : UNDER[account.kind as Exclude<AccountKind, 'credit'>];

  return (
    <button
      ref={ref}
      type="button"
      data-account-id={account.id}
      aria-label={cardLabel(row, money)}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'glass-card press text-text flex h-[186px] w-[300px] flex-none snap-center flex-col rounded-[22px] px-[18px] py-4 text-left',
        TINTS[index % TINTS.length],
      )}
    >
      <span className="flex items-center justify-between text-[12.5px] font-extrabold">
        <span className="bg-glass-hero border-glass-hero-line rounded-full border px-2 py-0.5">
          {KIND_LABEL[account.kind]}
        </span>
        {account.last4 ? (
          <Nfc aria-hidden="true" className="size-[18px]" />
        ) : (
          <Wallet aria-hidden="true" className="size-[18px]" />
        )}
      </span>
      {account.last4 && (
        <span
          aria-hidden="true"
          className="mt-3 block h-[25px] w-[34px] rounded-md bg-[linear-gradient(135deg,#f1e2b0,#c9a24a)]"
        />
      )}
      <CountUp
        value={balance}
        format={money}
        className="mt-auto text-[26px] leading-tight font-extrabold tracking-[-0.03em] whitespace-nowrap tabular-nums"
      />
      <span className="mt-0.5 min-w-0 truncate text-[12px] font-bold">
        {account.name}
        {account.last4 && ` · •••• ${account.last4}`}
      </span>
      <span className="truncate text-[12px] font-bold">{under}</span>
      {justNow !== undefined && (
        <span aria-hidden="true" className={JUST_NOW_BADGE}>
          {`−${money(justNow)} just now`}
        </span>
      )}
      <span
        aria-hidden="true"
        data-testid="frost"
        data-on={account.frozen}
        className={cn(
          'absolute inset-0 z-[1] grid place-items-center bg-[rgb(225_238_255/0.38)] bg-[radial-gradient(rgb(255_255_255/0.6)_1px,transparent_1.5px)] bg-size-[9px_9px] backdrop-blur-[7px]',
          'ease-glass pointer-events-none transition-[opacity,scale] duration-(--duration-standard) motion-reduce:transition-opacity',
          account.frozen
            ? 'scale-100 opacity-100'
            : 'scale-[1.06] opacity-0 motion-reduce:scale-100',
        )}
      >
        <span className="grid size-[60px] place-items-center content-center gap-0.5 rounded-full bg-white/94 text-[9px] font-extrabold tracking-[0.1em] text-[#2563eb]">
          <Snowflake aria-hidden="true" className="size-[22px]" />
          FROZEN
        </span>
      </span>
    </button>
  );
}
