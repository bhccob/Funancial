import {
  Car,
  ChevronDown,
  CreditCard,
  Plus,
  ScanLine,
  Settings,
  Snowflake,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { Rise } from '@/components/ui/Rise';
import type { AccountRow } from '@/domain/balances';
import { categoryLabel, nextDueDate } from '@/domain/budget';
import { categoryRows } from '@/domain/cardSpend';
import type { Account, Subscription } from '@/domain/entities';
import type { FinanceView } from '@/domain/view';
import { AvailableSheet } from '@/features/dashboard/AvailableSheet';
import { CardSheet } from '@/features/goals/CardSheet';
import { BillRow } from '@/features/shared/BillRow';
import { CATEGORY_ICONS } from '@/features/shared/categories';
import { EmptyRows as Empty, PlainSection, ROWS } from '@/features/shared/PlainSection';
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

/** How long after the row comes to rest the person's slide is over (see `driving`). */
const REST_MS = 150;

/**
 * The cards in a row that scrolls sideways, each snapping to the middle. The card in the middle is
 * the selected one: a card the person taps is selected and glides to the middle, and while the person
 * slides the row (a finger, a mouse or a wheel on it) the card that comes to the middle is selected
 * (an IntersectionObserver watches a thin strip down the middle). Nothing is selected by the row on
 * its own: it opens on the selected card without selecting it again, so a card the store falls back
 * to never overwrites the one that was picked; while the row glides to a card it reports nothing; and
 * once a slide has come to rest, a scroll the person did not make (Tab bringing a card into view, a
 * turned phone snapping the row again) selects nothing.
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
  // Whether the person is moving the row: set by their touch, cleared when the row comes to rest, when
  // a press moved nothing, and when the row moves itself.
  const driving = useRef(false);
  // Whether the row has scrolled since the person's touch began.
  const moved = useRef(false);
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    // Measured against the row on screen, so it holds whatever the cards' offsetParent is (the page
    // with the sidebar beside it, or a block still rising in).
    const offset = card.getBoundingClientRect().left - row.getBoundingClientRect().left;
    const left = row.scrollLeft + offset + card.offsetWidth / 2 - row.clientWidth / 2;
    row.scrollTo?.({ left, behavior: placed.current && !reduced ? 'smooth' : 'instant' });
    placed.current = true;
  }, [selectedId, ids, reduced]);

  // The slide is over a little after the row comes to rest (`scrollend`, or with no such event the
  // last scroll), so the observer's report of the card that came to rest still counts.
  useEffect(() => {
    const row = scroller.current;
    if (!row) return;
    const ends = 'onscrollend' in window;
    const rest = () => {
      clearTimeout(resting.current);
      resting.current = setTimeout(() => {
        driving.current = false;
      }, REST_MS);
    };
    const scrolled = () => {
      moved.current = true;
      if (!ends) rest();
    };
    row.addEventListener('scroll', scrolled, { passive: true });
    row.addEventListener('scrollend', rest);
    return () => {
      clearTimeout(resting.current);
      row.removeEventListener('scroll', scrolled);
      row.removeEventListener('scrollend', rest);
    };
  }, []);

  const drive = () => {
    clearTimeout(resting.current);
    driving.current = true;
    moved.current = false;
  };
  // A press that moved nothing (a tap, the row already at its end) leaves nothing driving.
  const unlessMoved = () => {
    if (!moved.current) driving.current = false;
  };

  return (
    <div
      ref={scroller}
      role="group"
      aria-label="Your cards"
      onPointerDown={drive}
      onTouchStart={drive}
      onPointerUp={unlessMoved}
      onTouchEnd={unlessMoved}
      onWheel={() => {
        drive();
        clearTimeout(resting.current);
        resting.current = setTimeout(unlessMoved, REST_MS);
      }}
      // Out to the screen's edges, so a card can slide off them. From a tablet up the side room lets
      // the first and last card reach the middle too: half the row less half a card (135px), where the
      // 50% is of the box the row stands out of by 20px a side, so it is 115px.
      className="relative -mx-5 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-5 pt-4 pb-1.5 sm:px-[calc(50%-115px)] [&::-webkit-scrollbar]:hidden"
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
