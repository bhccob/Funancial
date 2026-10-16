import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { minorDigits } from '@/domain/money';
import { breakEven, holdingPrice, holdingRate } from '@/domain/portfolio';
import { formatDate, formatPercent, formatShares, relativeDays } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useToday } from '@/store/useFinance';
import { useGameView } from '@/store/useGame';
import { useInvestActions, useInvestMoney, useInvestPortfolio } from '@/store/useInvest';
import { BreakEven } from './BreakEven';
import { arrow, tone } from './gain';
import { HoldingChart } from './HoldingChart';
import { HoldingDialog } from './HoldingDialog';
import { SellDialog } from './SellDialog';

function Fact({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted text-[13px] font-bold">{label}</dt>
      <dd className="text-[15px] font-extrabold tabular-nums">{children}</dd>
      {note && <dd className="text-muted text-[13px] font-semibold">{note}</dd>}
    </div>
  );
}

/**
 * One holding: what it is worth and how far it has moved since it was bought, its price chart, where
 * its break-even stands against the price, the facts of the purchase, and Edit and Sell. A holding
 * that is not there (deleted or sold in full from here, or a bad link) sends the person back to Invest.
 */
export function HoldingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const data = useApp((s) => s.data);
  const holding = data.tables.holding.find((h) => h.id === id);
  const row = useInvestPortfolio().rows.find((r) => r.holding.id === id);
  // `formatConverted` writes what the portfolio row already converted, so the value and the gain add
  // up with the amount paid below; `format` converts a figure from its unrounded profile amount.
  const { format, formatConverted } = useInvestMoney();
  const currency = useCurrency();
  const today = useToday();
  const { markChecked } = useInvestActions();
  const run = useAction();
  const checkUp = useGameView().challenges.some(
    (v) => v.challenge.kind === 'portfolio-checkup' && v.outcome === 'active',
  );
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);

  if (!holding || !row) return <Navigate to="/invest" replace />;

  const { value, gain, gainPct } = row;
  const price = holdingPrice(holding);
  const rate = holdingRate(holding, currency);
  // A share's price now in minor units of the profile currency, unrounded; null without a price or a rate.
  const now = price === null || rate === null ? null : price * rate * 10 ** minorDigits(currency);
  const received = data.tables.dividend
    .filter((d) => d.holdingId === holding.id && d.status === 'confirmed')
    .reduce((sum, d) => sum + d.amount, 0);
  const even = breakEven(data, holding);

  return (
    <div>
      <Link
        to="/invest?tab=holdings"
        // Opened from inside the app, Back is a step back to the Invest it came from, as it was.
        // Opened directly there is nothing to go back to: Holdings takes the holding's place.
        replace
        onClick={(e) => {
          if (location.key === 'default') return;
          e.preventDefault();
          void navigate(-1);
        }}
        aria-label="Back to Invest"
        className="text-muted -mb-1 inline-flex min-h-11 items-center text-[15px] font-extrabold"
      >
        ‹ Invest
      </Link>
      <PageHeader title={holding.symbol}>
        {holding.exchange ? `${holding.name} · ${holding.exchange}` : holding.name}
      </PageHeader>

      <Section>
        <p className="text-[34px] leading-tight font-extrabold tracking-[-0.035em] tabular-nums">
          {value === null ? '—' : formatConverted(value)}
        </p>
        <p className="mt-1 text-[13.5px] font-extrabold tabular-nums">
          {gain === null ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              <span
                className={tone(gain)}
              >{`${arrow(gain)} ${formatConverted(Math.abs(gain))}`}</span>
              {gainPct !== null && (
                <>
                  <span className="text-muted"> · </span>
                  <span
                    className={tone(gainPct)}
                  >{`${arrow(gainPct)} ${formatPercent(gainPct)}`}</span>
                </>
              )}
              <span className="text-muted"> since you bought</span>
            </>
          )}
        </p>
        <HoldingChart holding={holding} rate={rate} today={today} />
        <BreakEven
          perShare={even.perShare}
          now={now}
          afterDividends={received > 0 ? even.afterDividends : null}
        />
      </Section>

      <Section>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Fact label="Bought on" note={relativeDays(today, holding.purchaseDate)}>
            {formatDate(holding.purchaseDate)}
          </Fact>
          <Fact label="Shares">{formatShares(holding.shares)}</Fact>
          <Fact label="You paid per share">{format(holding.costBasis / holding.shares)}</Fact>
          <Fact label="Price now">{now === null ? '—' : format(now)}</Fact>
          <Fact label="You paid in total">{format(holding.costBasis)}</Fact>
          <Fact label="Dividends received">{format(received)}</Fact>
        </dl>
        <div className="mt-7 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button className="flex-1" onClick={() => setSelling(true)}>
            Sell
          </Button>
        </div>
        {checkUp && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                void run(() => markChecked(holding.id), { success: 'Marked as reviewed.' })
              }
            >
              Mark as reviewed
            </Button>
            <p className="text-muted text-[13px] font-semibold">
              Counts toward your Portfolio Check-Up.
            </p>
          </div>
        )}
      </Section>
      <p className="text-muted pt-1 text-[12.5px] font-bold">
        Prices delayed · not financial advice
      </p>

      <HoldingDialog
        holding={editing ? holding : undefined}
        onClose={() => setEditing(false)}
        onAdded={() => {}}
      />
      <SellDialog holding={selling ? holding : null} onClose={() => setSelling(false)} />
    </div>
  );
}
