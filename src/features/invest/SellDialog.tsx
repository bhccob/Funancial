import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { ShareStepper } from '@/components/ui/ShareStepper';
import { underlineTab } from '@/components/ui/underlineTab';
import type { Holding, Sale } from '@/domain/entities';
import { formatDecimal, parseDecimal } from '@/domain/money';
import { holdingPrice, holdingRate, toMinor } from '@/domain/portfolio';
import { NO_PROCEEDS, planSale, type SalePlan } from '@/domain/sales';
import { DateField } from '@/features/add/DateField';
import { formatShares, sharesText } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { FUTURE } from '@/store/financeActions';
import { saleBeforePurchase } from '@/store/investActions';
import { useCurrency, useMoney, useToday } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';
import { arrow, tone } from './gain';
import { SummaryLine } from './SummaryLine';
import { unreadable } from './unreadable';

type To = Sale['to'];

interface Errors {
  shares?: string;
  price?: string;
  date?: string;
}

function SellForm({ holding, onDone }: { holding: Holding; onDone(): void }) {
  const { sellHolding } = useInvestActions();
  const currency = useCurrency();
  const money = useMoney();
  const today = useToday();
  const run = useAction();

  const held = holding.shares;
  const price = holdingPrice(holding);
  const rate = holdingRate(holding, currency);
  const [shares, setShares] = useState(formatDecimal(Math.min(1, held)));
  // Today's price in the profile currency, to the cent; empty when there is none to start from.
  const [perShare, setPerShare] = useState<number | null>(
    price !== null && rate !== null ? toMinor(price, rate, currency) : null,
  );
  const [date, setDate] = useState(today);
  const [to, setTo] = useState<To>('cash');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const n = parseDecimal(shares);
  // What these shares come to; none while the shares or the price cannot make a sale.
  let plan: SalePlan | null = null;
  if (n !== null && perShare !== null) {
    try {
      plan = planSale(holding, n, perShare);
    } catch {
      // The message is for Sell to show, at the field it is about.
    }
  }
  const all = plan ? plan.all : n === held;
  // Said only for a part of them; all of them, or none that make sense, say what selling all does.
  const left = n !== null && n > 0 && n < held ? held - n : null;

  function clear(key: keyof Errors) {
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    if (n === null) found.shares = unreadable(shares, 'Enter how many shares, like 2 or 0.5');
    if (perShare === null) found.price = 'Enter an amount like 12.50';
    if (n !== null) {
      try {
        planSale(holding, n, perShare ?? 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Check the shares and the price.';
        if (message !== NO_PROCEEDS) found.shares = message;
        else if (perShare !== null) found.price = message;
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = 'Choose the day you sold it';
    else if (date > today) found.date = FUTURE;
    else if (date < holding.purchaseDate) found.date = saleBeforePurchase(holding.purchaseDate);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    const ok = await run(
      () =>
        sellHolding(holding.id, { shares: n!, pricePerShareMinor: perShare!, soldOn: date, to }),
      { success: `Sold ${formatShares(n!)} ${holding.symbol}.` },
    );
    setBusy(false);
    if (ok) onDone();
  }

  const shortcut = (label: string, value: number) => (
    <button
      type="button"
      aria-pressed={n === value}
      onClick={() => {
        setShares(formatDecimal(value));
        clear('shares');
      }}
      className={underlineTab(n === value)}
    >
      {label}
    </button>
  );

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <div>
        <ShareStepper
          label={`Shares to sell · of ${formatShares(held)}`}
          value={shares}
          error={errors.shares}
          onChange={(text) => {
            setShares(text);
            clear('shares');
          }}
        />
        <div className="mt-1 flex gap-5">
          {shortcut('Half', held / 2)}
          {shortcut(`All ${formatShares(held)}`, held)}
        </div>
      </div>
      <MoneyField
        variant="line"
        label="Sold at (per share)"
        currency={currency}
        value={perShare}
        error={errors.price}
        onChange={(v) => {
          setPerShare(v);
          clear('price');
        }}
      />
      <DateField
        variant="line"
        label="Sale date"
        today={today}
        value={date}
        error={errors.date}
        onChange={(d) => {
          setDate(d);
          clear('date');
        }}
      />
      <RadioGroup<To>
        variant="underline"
        legend="Money goes to"
        value={to}
        onChange={setTo}
        options={[
          { value: 'cash', label: 'Cash' },
          { value: 'savings', label: 'Savings' },
        ]}
      />
      <div className="flex flex-col gap-1">
        <SummaryLine label="You get">{plan ? money(plan.proceeds) : '—'}</SummaryLine>
        <SummaryLine
          label="Profit on these shares"
          className={plan ? tone(plan.profit) : undefined}
        >
          {plan ? `${arrow(plan.profit)} ${money(Math.abs(plan.profit))}` : '—'}
        </SummaryLine>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={busy}>
          {n === null ? 'Sell shares' : `Sell ${all ? 'all ' : ''}${sharesText(n)}`}
        </Button>
      </div>
      <p className="text-muted -mt-2 text-[13px] font-semibold">
        {left !== null && `${formatShares(left)} ${left === 1 ? 'share stays' : 'shares stay'}. `}
        {`Selling all ${formatShares(held)} moves ${holding.symbol} to "Sold" with its result kept.`}
      </p>
    </form>
  );
}

/** Sell shares of a holding: how many, at what price, when, and where the money goes. `holding` null = closed. */
export function SellDialog({ holding, onClose }: { holding: Holding | null; onClose(): void }) {
  return (
    <Dialog
      open={holding !== null}
      title={holding ? `Sell ${holding.symbol}` : 'Sell'}
      description={holding?.name}
      onClose={onClose}
    >
      {holding && <SellForm key={holding.id} holding={holding} onDone={onClose} />}
    </Dialog>
  );
}
