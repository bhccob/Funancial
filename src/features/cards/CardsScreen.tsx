import {
  Bus,
  Car,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  CreditCard,
  Ellipsis,
  HeartPulse,
  House,
  Plus,
  ScanLine,
  Settings,
  ShoppingBag,
  Snowflake,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { Rise } from '@/components/ui/Rise';
import type { AccountRow } from '@/domain/balances';
import { categoryLabel, nextDueDate } from '@/domain/budget';
import { categoryRows } from '@/domain/cardSpend';
import type { Account, Category, Subscription } from '@/domain/entities';
import type { FinanceView } from '@/domain/view';
import { AvailableSheet } from '@/features/dashboard/AvailableSheet';
import { CardSheet } from '@/features/goals/CardSheet';
import { BillRow } from '@/features/shared/BillRow';
import { SubscriptionDialog } from '@/features/subscriptions/SubscriptionDialog';
import { cn } from '@/lib/cn';
import { formatDay, relativeDays } from '@/lib/format';
import { useReducedMotion } from '@/lib/motion';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useFinanceActions, useFinanceView, useMoney, useToday } from '@/store/useFinance';
import { useSelectedAccount, useSelectedAccountRow } from '@/store/useSelectedAccount';
import { AccountCard } from './AccountCard';
import { AccountDialog, type AccountTarget } from './AccountDialog';
import { AccountSheet } from './AccountSheet';
import { PaySheet } from './PaySheet';
import { SpendChart } from './SpendChart';

/** A plain row's hairline above it, on the light page and the dark one. */
const ROWS = 'divide-y divide-black/7 dark:divide-white/8';

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  food: Utensils,
  transport: Bus,
  rent: House,
  utilities: Zap,
  entertainment: Clapperboard,
  health: HeartPulse,
  shopping: ShoppingBag,
  other: Ellipsis,
};

/**
 * The cards in a row that scrolls sideways, each snapping to the middle. The card in the middle is
 * the selected one: a card the person taps is selected and glides to the middle, and when the person
 * moves the row (a finger, a mouse or a wheel on it) the card that comes to rest in the middle is
 * selected (an IntersectionObserver watches a thin strip down the middle). Nothing is selected by
 * the row on its own: it opens on the selected card without selecting it again, so a card the store
 * falls back to never overwrites the one that was picked; and while the row glides to a card it
 * reports nothing.
 */
function Carousel({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AccountRow[];
  selectedId: string | null;
  onSelect(id: string): void;
}) {
  const money = useMoney();
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  // Whether the person is moving the row: set by their touch, cleared when the row moves itself.
  const driving = useRef(false);
  // The card in the middle strip, as last reported.
  const centred = useRef<string | null>(null);
  // The first move to the selected card is a jump; later ones glide.
  const placed = useRef(false);
  const pick = useRef(onSelect);
  useEffect(() => {
    pick.current = onSelect;
  }, [onSelect]);
  const ids = rows.map((r) => r.account.id).join(' ');

  useEffect(() => {
    const row = scroller.current;
    if (!row || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.accountId;
          if (!entry.isIntersecting || !id) continue;
          centred.current = id;
          if (driving.current) pick.current(id);
        }
      },
      // A strip 2% wide down the middle of the row.
      { root: row, rootMargin: '0px -49% 0px -49%' },
    );
    for (const card of cards.current.values()) observer.observe(card);
    return () => observer.disconnect();
  }, [ids]);

  // The selected card goes to the middle when it is not there: as the row opens, after a tap, and
  // when the store falls back to another card.
  useEffect(() => {
    const row = scroller.current;
    const card = selectedId === null ? undefined : cards.current.get(selectedId);
    if (!row || !card) return;
    if (placed.current && centred.current === selectedId) return;
    driving.current = false;
    const left = card.offsetLeft + card.offsetWidth / 2 - row.clientWidth / 2;
    row.scrollTo?.({ left, behavior: placed.current && !reduced ? 'smooth' : 'instant' });
    placed.current = true;
  }, [selectedId, ids, reduced]);

  const drive = () => {
    driving.current = true;
  };

  return (
    <div
      ref={scroller}
      role="group"
      aria-label="Your cards"
      onPointerDown={drive}
      onTouchStart={drive}
      onWheel={drive}
      // Out to the screen's edges, so a card can slide off them; from a tablet up the side room lets
      // the first and last card reach the middle too.
      className="-mx-5 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-5 pt-4 pb-1.5 sm:px-[calc(50%-135px)] [&::-webkit-scrollbar]:hidden"
    >
      {rows.map((row, i) => (
        <AccountCard
          key={row.account.id}
          ref={(el) => {
            if (el) cards.current.set(row.account.id, el);
            else cards.current.delete(row.account.id);
          }}
          row={row}
          index={i}
          money={money}
          selected={row.account.id === selectedId}
          onSelect={() => {
            driving.current = false;
            onSelect(row.account.id);
          }}
        />
      ))}
    </div>
  );
}

/** One round action under the carousel: a 54px button on the block with its word under it. */
function CardAction({
  icon: Icon,
  label,
  main = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  main?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="press flex min-w-0 flex-col items-center gap-1.5 text-center text-[12px] leading-tight font-extrabold select-none disabled:pointer-events-none disabled:opacity-45"
    >
      <span
        className={cn(
          'grid size-[54px] place-items-center rounded-full',
          main ? 'btn-head' : 'glass-head',
        )}
      >
        <Icon aria-hidden="true" className="size-[22px]" />
      </span>
      {label}
    </button>
  );
}

/** A section below the block: a title, a "View all" pill when it leads somewhere, then plain rows. */
function PlainSection({
  title,
  to,
  children,
}: {
  title: string;
  to?: LinkProps['to'];
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="pt-[22px]">
      <div className="mx-1 mb-3 flex items-center justify-between">
        <h2 id={headingId} className="text-section">
          {title}
        </h2>
        {to !== undefined && (
          <Link
            to={to}
            className="glass press hit-44 inline-flex h-8 items-center gap-0.5 rounded-full pr-2.5 pl-3 text-[12.5px] font-extrabold"
          >
            View all
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted mx-1 py-2 text-[14px] font-semibold">{children}</p>;
}

/** What one account spent this month by category, biggest first, as plain rows. */
function CategoriesSection({ account }: { account: Account }) {
  const data = useApp((s) => s.data);
  const today = useToday();
  const money = useMoney();
  const rows = useMemo(() => categoryRows(data, account.id, today), [data, account.id, today]);
  return (
    <PlainSection title="Categories">
      {rows.length > 0 ? (
        <ul className={cn('px-1', ROWS)}>
          {rows.map((row) => {
            const Icon = CATEGORY_ICONS[row.category];
            return (
              <li key={row.category} className="flex min-h-[62px] items-center gap-3 py-[9px]">
                <span className="glass grid size-11 flex-none place-items-center rounded-full">
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px] font-extrabold">
                    {categoryLabel(row.category)}
                  </b>
                  <span className="text-muted text-[12px] font-semibold">
                    {`${row.count} ${row.count === 1 ? 'transaction' : 'transactions'}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[14.5px] font-extrabold tabular-nums">
                    {money(row.amount)}
                  </span>
                  <span className="text-muted block text-[11.5px] font-bold">{`${row.percent}%`}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{`Nothing spent with ${account.name} this month.`}</Empty>
      )}
    </PlainSection>
  );
}

/**
 * The next three bills, of every account, as Home's rows: a subscription opens its dialog and a card
 * payment the card's sheet. View all leads to the bills page.
 */
function BillsSection({ view }: { view: FinanceView }) {
  const money = useMoney();
  const today = useToday();
  const subscriptions = useApp((s) => s.data.tables.subscription);
  const [editing, setEditing] = useState<Subscription>();
  const [cardId, setCardId] = useState<string | null>(null);
  const bills = view.bills.slice(0, 3);
  return (
    <PlainSection title="Bills" to="/subscriptions">
      {bills.length > 0 ? (
        <ul className={cn('px-1', ROWS)}>
          {bills.map((bill) => {
            const card = bill.kind === 'card';
            const when = relativeDays(today, bill.date);
            return (
              <BillRow
                key={`${bill.refId}-${bill.date}`}
                date={bill.date}
                due={card}
                title={card ? `${bill.name} card payment` : bill.name}
                subline={
                  card
                    ? `${bill.inFull ? 'Pay the full balance' : 'Minimum payment'} · ${when}`
                    : `Subscription · ${when}`
                }
                amount={money(bill.amount)}
                onOpen={() =>
                  card
                    ? setCardId(bill.refId)
                    : setEditing(subscriptions.find((s) => s.id === bill.refId))
                }
              />
            );
          })}
        </ul>
      ) : (
        <Empty>Nothing due this month.</Empty>
      )}
      <CardSheet accountId={cardId} onClose={() => setCardId(null)} />
      <SubscriptionDialog sub={editing} onClose={() => setEditing(undefined)} />
    </PlainSection>
  );
}

/** The loans, each with what is left on it and its next payment day. View all leads to Debts. */
function LoansSection({ view }: { view: FinanceView }) {
  const money = useMoney();
  const today = useToday();
  return (
    <PlainSection title="Loans" to="/debts">
      {view.loans.length > 0 ? (
        <ul className={cn('px-1', ROWS)}>
          {view.loans.map(({ debt, balance }) => (
            <li key={debt.id} className="flex min-h-[62px] items-center gap-3 py-[9px]">
              <span className="glass grid size-11 flex-none place-items-center rounded-full">
                <Car aria-hidden="true" className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-extrabold">{debt.name}</b>
                <span className="text-muted text-[12px] font-semibold">
                  {debt.dueDay === null
                    ? 'Loan'
                    : `Next payment ${formatDay(nextDueDate(today, debt.dueDay))}`}
                </span>
              </span>
              <span className="text-[14.5px] font-extrabold tabular-nums">{money(balance)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No loans.</Empty>
      )}
    </PlainSection>
  );
}

/**
 * The Cards tab, as in the glass wireframe. On the theme's block: the title with ＋ (a new account
 * of any kind), the accounts in use as a carousel of glass cards with dots under it, and four
 * actions for the selected card: Pay, Freeze, View card and Settings. The selected card is the one
 * Home shows too (`useSelectedAccount`). Under the block: Available to spend over the block's edge,
 * then what the selected card spent (the chart and its categories), the next bills and the loans.
 */
export function CardsScreen() {
  const view = useFinanceView();
  const money = useMoney();
  const selected = useSelectedAccountRow()?.account ?? null;
  const select = useSelectedAccount((s) => s.select);
  const { setAccountFrozen } = useFinanceActions();
  const run = useAction();
  const [editing, setEditing] = useState<AccountTarget | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const rows = view.accounts;

  function toggleFrozen(account: Account) {
    const frozen = !account.frozen;
    void run(() => setAccountFrozen(account.id, frozen), {
      success: `${account.name} ${frozen ? 'frozen' : 'unfrozen'}.`,
    });
  }

  return (
    <>
      {/* The block must be the first thing on the page, so it can run up behind the status bar. */}
      <Rise index={0}>
        <HeadBlock>
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between">
              <h1 className="text-page">Cards</h1>
              <button
                type="button"
                aria-label="Add a card"
                onClick={() => setEditing({ account: null })}
                className="glass-head press grid size-11 place-items-center rounded-full"
              >
                <Plus aria-hidden="true" className="size-5" />
              </button>
            </div>
            {selected ? (
              <>
                <Carousel rows={rows} selectedId={selected.id} onSelect={select} />
                <div
                  data-testid="card-dots"
                  aria-hidden="true"
                  className="flex justify-center gap-[5px] pt-1.5"
                >
                  {rows.map(({ account }) => {
                    const on = account.id === selected.id;
                    return (
                      <i
                        key={account.id}
                        data-on={on}
                        className={cn(
                          'block h-1.5 rounded-[3px] bg-current motion-safe:transition-all motion-safe:duration-(--duration-small)',
                          on ? 'w-4 opacity-90' : 'w-1.5 opacity-30',
                        )}
                      />
                    );
                  })}
                </div>
                <div role="group" aria-label="Card actions" className="grid grid-cols-4 pt-3.5">
                  <CardAction
                    icon={CreditCard}
                    main
                    label={selected.frozen ? 'Unfreeze to pay' : 'Pay'}
                    disabled={selected.frozen}
                    onClick={() => setPaying(selected.id)}
                  />
                  <CardAction
                    icon={Snowflake}
                    label={selected.frozen ? 'Unfreeze' : 'Freeze'}
                    onClick={() => toggleFrozen(selected)}
                  />
                  <CardAction
                    icon={ScanLine}
                    label="View card"
                    onClick={() => setViewing(selected.id)}
                  />
                  <CardAction
                    icon={Settings}
                    label="Settings"
                    onClick={() => setEditing({ account: selected })}
                  />
                </div>
              </>
            ) : (
              <p className="pt-6 pb-2 text-[15px] font-semibold">No cards yet. Add one with ＋.</p>
            )}
          </div>
        </HeadBlock>
      </Rise>

      <div className="mx-auto max-w-3xl">
        <Rise index={1}>
          {/* It hangs over the block's edge, so its ring has to show on both (focus-edge). */}
          <button
            type="button"
            onClick={() => setAvailable(true)}
            className="glass-strong focus-edge press relative -mt-7 flex w-full items-center gap-2.5 rounded-full px-3.5 py-[13px] text-left"
          >
            <Wallet aria-hidden="true" className="size-[18px] flex-none" />
            <span className="text-text text-[12px] font-bold">Available to spend</span>{' '}
            <b className="ml-auto text-[15px] font-extrabold whitespace-nowrap tabular-nums">
              {money(view.available)}
            </b>
            <ChevronDown aria-hidden="true" className="size-4 flex-none" />
          </button>
        </Rise>
        {selected && (
          <Rise index={2} className="pt-[22px]">
            <SpendChart account={selected} />
          </Rise>
        )}
        <Rise index={3}>
          {selected && <CategoriesSection account={selected} />}
          <BillsSection view={view} />
          <LoansSection view={view} />
        </Rise>
      </div>

      <AvailableSheet open={available} view={view} onClose={() => setAvailable(false)} />
      <PaySheet accountId={paying} onClose={() => setPaying(null)} />
      <AccountSheet accountId={viewing} onClose={() => setViewing(null)} />
      <AccountDialog target={editing} onClose={() => setEditing(null)} />
    </>
  );
}
