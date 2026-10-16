import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { minorDigits } from '@/domain/money';
import { holdingPrice, holdingRate } from '@/domain/portfolio';
import { formatDate, formatPercent, formatShares, relativeDays } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency, useToday } from '@/store/useFinance';
import { useInvestActions, useInvestMoney, useInvestPortfolio } from '@/store/useInvest';
import { HoldingChart } from './HoldingChart';
import { HoldingDialog } from './HoldingDialog';

const tone = (n: number) => (n < 0 ? 'text-danger' : 'text-accent-text');
const arrow = (n: number) => (n < 0 ? '▼' : '▲');

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
 * One holding: what it is worth and how far it has moved since it was bought, its price chart, the
 * facts of the purchase, and Edit. A holding that is not there (deleted from here, or a bad link)
 * sends the person back to Invest.
 */
export function HoldingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const holding = useApp((s) => s.data.tables.holding.find((h) => h.id === id));
  const dividends = useApp((s) => s.data.tables.dividend);
  const row = useInvestPortfolio().rows.find((r) => r.holding.id === id);
  // `formatConverted` writes what the portfolio row already converted, so the value and the gain add
  // up with the amount paid below; `format` converts a figure from its unrounded profile amount.
  const { format, formatConverted } = useInvestMoney();
  const currency = useCurrency();
  const today = useToday();
  const { markChecked } = useInvestActions();
  const run = useAction();
  const [editing, setEditing] = useState(false);

  if (!holding || !row) return <Navigate to="/invest" replace />;

  const { value, gain, gainPct } = row;
  const price = holdingPrice(holding);
  const rate = holdingRate(holding, currency);
  const received = dividends
    .filter((d) => d.holdingId === holding.id && d.status === 'confirmed')
    .reduce((sum, d) => sum + d.amount, 0);

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
      </Section>

      <Section>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Fact label="Bought on" note={relativeDays(today, holding.purchaseDate)}>
            {formatDate(holding.purchaseDate)}
          </Fact>
          <Fact label="Shares">{formatShares(holding.shares)}</Fact>
          <Fact label="You paid per share">{format(holding.costBasis / holding.shares)}</Fact>
          <Fact label="Price now">
            {price === null || rate === null
              ? '—'
              : format(price * rate * 10 ** minorDigits(currency))}
          </Fact>
          <Fact label="You paid in total">{format(holding.costBasis)}</Fact>
          <Fact label="Dividends received">{format(received)}</Fact>
        </dl>
        <div className="mt-7 flex gap-2">
          <Button className="flex-1" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() =>
              void run(() => markChecked(holding.id), { success: 'Marked as checked.' })
            }
          >
            Mark as checked
          </Button>
        </div>
      </Section>
      <p className="text-muted pt-1 text-[12.5px] font-bold">
        Prices delayed · not financial advice
      </p>

      <HoldingDialog
        holding={editing ? holding : undefined}
        onClose={() => setEditing(false)}
        onAdded={() => {}}
      />
    </div>
  );
}
