import { ChevronDown, CreditCard, Nfc, Wallet } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { CountUp } from '@/components/ui/CountUp';
import { Menu } from '@/components/ui/Menu';
import { heroFigure, type AccountRow } from '@/domain/balances';
import { markLabel } from '@/domain/cardMark';
import { moneyParts } from '@/domain/money';
import { cn } from '@/lib/cn';
import { HIDDEN_AMOUNT, useAmountsHidden } from '@/store/useAmountsHidden';
import { useCurrency } from '@/store/useFinance';
import { HideAmountsButton } from './HideAmountsButton';

/**
 * The sizes the big amount steps down through, in px: 52 for an amount that fits, 40 at the least.
 * Written out whole, as Tailwind finds a class only by its full name.
 */
const SIZES = [
  [52, 'text-[52px]'],
  [48, 'text-[48px]'],
  [44, 'text-[44px]'],
  [40, 'text-[40px]'],
] as const;

/**
 * The room the amount has, in px: a 360px phone less the page's 20px on each side. Every phone the
 * app runs on is at least that wide, so an amount that fits here fits on all of them.
 */
const ROOM = 320;

/**
 * How wide the amount's characters are, in em of its size, as Inter Tight Bold measures them with the
 * hero's tracking and tabular digits: a digit .61, a comma or a point .23, a minus .4. The currency
 * is written at .38em, so a character of it is .23, and it keeps 5px (.1em at 52px) from the number.
 */
const EM = { digit: 0.61, mark: 0.23, minus: 0.4, symbol: 0.23, gap: 0.1 };

/**
 * The size of the big amount: 52px, or the largest step down to 40px at which the amount, written
 * out, fits in `ROOM`. It is worked out from the amount the number arrives at, not from the number
 * counting up to it, so the size never changes while it counts. Hidden amounts are four bullets, so
 * they keep 52px. Past 40px the cents may wrap under the whole number (see `Amount`).
 */
function sizeOf(minor: number, currency: string, hidden: boolean): string {
  if (hidden) return SIZES[0][1];
  const { lead, currency: symbol, units, cents } = moneyParts(minor, currency);
  let em = symbol.length * EM.symbol + EM.gap;
  for (const ch of `${lead}${units}${cents}`) {
    em += /\d/.test(ch) ? EM.digit : /[-−]/.test(ch) ? EM.minus : EM.mark;
  }
  return (SIZES.find(([px]) => em * px <= ROOM) ?? SIZES[SIZES.length - 1]!)[1];
}

/**
 * The big amount as the wireframe writes it: the currency small, raised and dimmed beside the whole
 * units, and the cents dimmed further (head-dim and head-faint, the least shares of the ink that hold
 * on every block). One flex row, so it stays whole while CountUp moves the number; it wraps only when
 * even the smallest size is too wide for the screen, and then the cents drop under the whole number.
 */
function Amount({ minor, currency }: { minor: number; currency: string }) {
  const { lead, currency: symbol, units, cents, currencyFirst } = moneyParts(minor, currency);
  const mark = (
    <span
      className={cn(
        'text-head-dim mt-[.45em] self-start text-[.38em] tracking-normal',
        currencyFirst ? 'mr-[5px]' : 'ml-[5px]',
      )}
    >
      {symbol}
    </span>
  );
  return (
    <span className="inline-flex flex-wrap items-baseline justify-center">
      {lead}
      {currencyFirst && mark}
      {units}
      {cents && <span className="text-head-faint">{cents}</span>}
      {!currencyFirst && mark}
    </span>
  );
}

export interface HomeHeroProps {
  /** The account Home shows (`useSelectedAccountRow`), or `null` with no account in use. */
  row: AccountRow | null;
  /** Whether to say the account shown is frozen, after Pay was tapped on it. */
  frozenNote: boolean;
  onPick(): void;
  onPay(): void;
  onMove(): void;
  onCorrect(): void;
}

/**
 * Home's hero, straight on the block with no box: what the account shown has (`heroFigure`: a bank
 * account's balance, a card's credit left or what it owes) under its label and the eye, the account
 * itself as plain text that opens Show on Home, then Pay with it and a ⋯ with Move money and Correct
 * a balance. Pay on a frozen card says where to unfreeze it instead.
 */
export function HomeHero({ row, frozenNote, onPick, onPay, onMove, onCorrect }: HomeHeroProps) {
  const labelId = useId();
  const currency = useCurrency();
  const hidden = useAmountsHidden((s) => s.hidden);

  if (!row) {
    return (
      <div className="pt-[22px] pb-1 text-center">
        {/* The eye stays: hidden amounts stay hidden, and it is the one way to show them again. */}
        <div className="flex items-center justify-center gap-0.5">
          <p className="text-[15px] font-semibold">No account yet.</p>
          <HideAmountsButton className="-my-[15px] -mr-[15px] -ml-2" />
        </div>
        <Link
          to="/cards"
          className="mt-1 inline-flex min-h-11 items-center text-[14px] font-extrabold underline underline-offset-2"
        >
          Add one on the Cards tab
        </Link>
      </div>
    );
  }

  const { account } = row;
  const figure = heroFigure(row);
  const Icon = account.last4 ? CreditCard : Wallet;

  return (
    <section aria-labelledby={labelId} className="pt-[22px] pb-1 text-center">
      <div className="text-head-dim flex items-center justify-center gap-0.5 text-[13px] font-semibold">
        <h2 id={labelId}>{figure.label}</h2>
        {/* The 44px target overhangs the row, so the eye sits beside the words as a 14px icon. */}
        <HideAmountsButton className="-my-[15px] -mr-[15px] -ml-2" />
      </div>
      <p
        data-testid="hero-amount"
        className={cn(
          'mt-1 leading-[1.05] font-bold tracking-[-0.04em] tabular-nums',
          sizeOf(figure.amount, currency, hidden),
        )}
      >
        <CountUp
          value={figure.amount}
          format={(n) => (hidden ? HIDDEN_AMOUNT : <Amount minor={n} currency={currency} />)}
        />
      </p>
      <button
        type="button"
        onClick={onPick}
        className="press hit-44 text-head-dim mt-0.5 inline-flex min-h-8 items-center gap-[5px] px-1 text-[13px] font-semibold"
      >
        <Icon aria-hidden="true" className="size-[15px]" />
        {markLabel(account)}
        <ChevronDown aria-hidden="true" className="size-[13px]" />
        <span className="sr-only">, change account</span>
      </button>
      {/* Small and equal, so neither shouts: 34px to see, 44px to tap. */}
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={onPay}
          className="btn-head press hit-44 inline-flex h-[34px] items-center gap-[5px] rounded-full px-3.5 text-[13px] font-bold"
        >
          <Nfc aria-hidden="true" className="size-[15px]" />
          Pay
        </button>
        <Menu
          label="More"
          triggerClassName="glass-head press hit-44 size-[34px]"
          items={[
            { label: 'Move money', onSelect: onMove },
            { label: 'Correct a balance', onSelect: onCorrect },
          ]}
        />
      </div>
      <div role="status">
        {frozenNote && (
          <p className="mt-3 text-[13px] font-semibold">
            This card is frozen.{' '}
            <Link to="/cards" className="hit-44 font-extrabold underline underline-offset-2">
              Unfreeze it on the Cards tab.
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
