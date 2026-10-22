import { ChevronDown, CreditCard, Nfc, Wallet } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { CountUp } from '@/components/ui/CountUp';
import { Menu } from '@/components/ui/Menu';
import { heroFigure, type AccountRow } from '@/domain/balances';
import { moneyParts } from '@/domain/money';
import { cn } from '@/lib/cn';
import { HIDDEN_AMOUNT, useAmountsHidden } from '@/store/useAmountsHidden';
import { useCurrency } from '@/store/useFinance';
import { HideAmountsButton } from './HideAmountsButton';

/** "Main account ·· 4312": an account by its name and, when it has them, its last 4 digits. */
const accountTitle = ({ name, last4 }: AccountRow['account']) =>
  last4 ? `${name} ·· ${last4}` : name;

/**
 * The big amount as the wireframe writes it: the currency small, raised and dimmed beside the whole
 * units, and the cents dimmed further (head-dim and head-faint, the least shares of the ink that hold
 * on every block). One flex row, so it stays whole while CountUp moves the number.
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
    <span className="inline-flex items-baseline">
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
        className="mt-1 text-[42px] leading-[1.05] font-bold tracking-[-0.04em] tabular-nums"
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
        {accountTitle(account)}
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
