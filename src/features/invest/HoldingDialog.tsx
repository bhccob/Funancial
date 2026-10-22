import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { Select } from '@/components/ui/Select';
import { ShareStepper } from '@/components/ui/ShareStepper';
import { TextField } from '@/components/ui/TextField';
import type { Holding } from '@/domain/entities';
import { formatDecimal, parseDecimal } from '@/domain/money';
import { costForShares, costPerShare } from '@/domain/portfolio';
import { firstSoldOn } from '@/domain/sales';
import { DateField } from '@/features/add/DateField';
import { NOT_CREDIT, useAccountOptions } from '@/features/shared/AccountField';
import { formatShares } from '@/lib/format';
import { marketConfigured } from '@/services/market';
import { useAction } from '@/lib/useAction';
import { FUTURE } from '@/store/financeActions';
import { useApp } from '@/store/AppStoreProvider';
import {
  purchaseAfterSale,
  UNKNOWN_SYMBOL,
  type HoldingInput,
  type HoldingPatch,
} from '@/store/investActions';
import { useCurrency, useMoney, useToday } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';
import { SummaryLine } from './SummaryLine';
import { SymbolSearchField } from './SymbolSearchField';
import { unreadable } from './unreadable';

type PaidFrom = HoldingInput['paidFrom'];
/** Bought before using the app: no money moves. Any other value is the id of the account that paid. */
const OWNED = 'owned';

const SYMBOL = /^[A-Za-z0-9.^=-]{1,15}$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const TYPE_OPTIONS = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'other', label: 'Other' },
];

interface Form {
  symbol: string;
  shares: string;
  /** What one share cost on average, in minor units of the profile currency. */
  perShare: number | null;
  date: string;
  paidFrom: PaidFrom;
  withholding: string;
  price: string;
  name: string;
  type: Holding['type'];
  currency: string;
}
type Errors = Partial<Record<keyof Form, string>>;

/** The price per share an edit starts from: the holding's average, to the cent. */
const startingPrice = (h: Holding) => Math.round(costPerShare(h));

/**
 * What the holding cost in all, in minor units, or null until the shares and the price are
 * readable. A holding whose price is as it was shown keeps its cost per share exactly (no drift from
 * the rounded price shown); a new price is multiplied by the shares and rounded once.
 */
function totalCost(f: Form, holding: Holding | null): number | null {
  const shares = parseDecimal(f.shares);
  if (shares === null || shares <= 0 || f.perShare === null) return null;
  return holding && f.perShare === startingPrice(holding)
    ? costForShares(holding, shares)
    : Math.round(shares * f.perShare);
}

/** The friendly message for each field that is wrong, so the schema's own errors never show. */
function validate(
  f: Form,
  ctx: {
    today: string;
    editing: boolean;
    details: boolean;
    cost: number | null;
    /** The day some of the shares were first sold, if any were. */
    firstSale: string | undefined;
  },
): Errors {
  const errors: Errors = {};
  const shares = parseDecimal(f.shares);
  if (!ctx.editing && !SYMBOL.test(f.symbol.trim())) {
    errors.symbol = 'Use letters and numbers only, like KO or VWRL.L';
  }
  if (shares === null || shares <= 0) {
    errors.shares = unreadable(f.shares, 'Enter how many shares, like 2 or 0.5');
  }
  if (f.perShare === null) errors.perShare = 'Enter an amount like 12.50';
  // The purchase moves money, and a move of nothing is not one.
  else if (ctx.cost === 0 && f.paidFrom !== OWNED && !ctx.editing) {
    errors.perShare = 'Enter what you paid, or choose Already owned';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = 'Choose the day you bought it';
  else if (f.date > ctx.today) errors.date = FUTURE;
  else if (ctx.firstSale && f.date > ctx.firstSale) errors.date = purchaseAfterSale(ctx.firstSale);
  // Adding asks nothing about tax: a new holding starts at 0%, and Edit is where it is set.
  const tax = parseDecimal(f.withholding);
  if (ctx.editing && (tax === null || tax > 100)) {
    errors.withholding = unreadable(f.withholding, 'Enter a percentage from 0 to 100');
  }
  if (f.price.trim() !== '' && parseDecimal(f.price) === null) {
    errors.price = unreadable(f.price, 'Enter a price like 12.50, or leave it empty');
  }
  if (ctx.details) {
    if (f.name.trim() === '') errors.name = 'Enter the name';
    if (!CURRENCY.test(f.currency.trim())) errors.currency = 'Use a 3-letter code, like USD';
  }
  return errors;
}

function HoldingForm({
  holding,
  onDone,
  onAdded,
}: {
  holding: Holding | null;
  onDone(): void;
  onAdded(): void;
}) {
  const { addHolding, updateHolding, deleteHolding } = useInvestActions();
  const currency = useCurrency();
  const money = useMoney();
  const today = useToday();
  const run = useAction();
  const editing = holding !== null;
  const firstSale = useApp((s) => (holding ? firstSoldOn(s.data, holding.id) : undefined));
  // A bank account, cash or savings in use can pay; a credit card never does.
  const payers = useAccountOptions(NOT_CREDIT);

  const [form, setForm] = useState<Form>({
    symbol: holding?.symbol ?? '',
    shares: holding ? formatDecimal(holding.shares) : '',
    perShare: holding ? startingPrice(holding) : null,
    date: holding?.purchaseDate ?? today,
    paidFrom: OWNED,
    withholding: formatDecimal(holding?.withholdingPct ?? 0),
    price: holding?.manualPrice != null ? formatDecimal(holding.manualPrice) : '',
    name: holding?.name ?? '',
    type: holding?.type ?? 'stock',
    currency: holding?.currency ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [lookupFailed, setLookupFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Without the price service nothing can name the symbol, so the person does.
  const details = !marketConfigured() || lookupFailed;
  const cost = totalCost(form, holding);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  /** Runs a save or delete; the dialog closes only when it worked. */
  async function perform(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    const ok = await run(fn, { success });
    setBusy(false);
    if (ok) onDone();
    return ok;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form, { today, editing, details, cost, firstSale });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const shares = parseDecimal(form.shares)!;
    const named = details
      ? { name: form.name.trim(), type: form.type, currency: form.currency.trim().toUpperCase() }
      : {};

    if (holding) {
      const patch: HoldingPatch = {
        ...named,
        shares,
        costBasis: cost!,
        purchaseDate: form.date,
        withholdingPct: parseDecimal(form.withholding)!,
        manualPrice: form.price.trim() === '' ? null : parseDecimal(form.price),
      };
      await perform(() => updateHolding(holding.id, patch), 'Holding updated.');
      return;
    }
    const input: HoldingInput = {
      ...named,
      symbol: form.symbol.trim(),
      shares,
      costBasis: cost!,
      purchaseDate: form.date,
      paidFrom: form.paidFrom,
      withholdingPct: 0,
    };
    const added = await perform(async () => {
      try {
        await addHolding(input);
      } catch (err) {
        // The service could not name it: ask for the name, type and currency instead.
        if (err instanceof Error && err.message === UNKNOWN_SYMBOL) setLookupFailed(true);
        throw err;
      }
    }, 'Holding added.');
    // `addHolding` fetches no quote, so ask for one now that the holding exists.
    if (added) onAdded();
  }

  const symbolField = {
    label: 'Symbol',
    variant: 'line' as const,
    value: form.symbol,
    error: errors.symbol,
    autoCapitalize: 'characters',
    autoComplete: 'off',
    spellCheck: false,
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {editing || !marketConfigured() ? (
        <TextField
          {...symbolField}
          maxLength={15}
          disabled={editing}
          className={editing ? 'opacity-45' : undefined}
          onChange={(e) => set('symbol', e.target.value)}
        />
      ) : (
        // With the price service, the symbol is searched for and picked from a list. A name is
        // searched as typed, so the field has no length cap; Save still checks the symbol.
        <SymbolSearchField {...symbolField} onChange={(symbol) => set('symbol', symbol)} />
      )}
      {details && (
        <>
          <TextField
            variant="line"
            label="Name"
            value={form.name}
            error={errors.name}
            autoComplete="off"
            onChange={(e) => set('name', e.target.value)}
          />
          <Select
            variant="line"
            label="Type"
            value={form.type}
            options={TYPE_OPTIONS}
            onChange={(v) => set('type', v as Holding['type'])}
          />
          <TextField
            variant="line"
            label="Currency"
            value={form.currency}
            error={errors.currency}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={3}
            onChange={(e) => set('currency', e.target.value)}
          />
        </>
      )}
      <ShareStepper
        label="Shares"
        value={form.shares}
        error={errors.shares}
        onChange={(text) => set('shares', text)}
      />
      <MoneyField
        variant="line"
        label="Price per share (your average)"
        currency={currency}
        value={form.perShare}
        error={errors.perShare}
        onChange={(v) => set('perShare', v)}
      />
      <SummaryLine label="Total paid">
        {cost === null
          ? '—'
          : `${formatShares(parseDecimal(form.shares)!)} × ${money(form.perShare!)} = ${money(cost)}`}
      </SummaryLine>
      <DateField
        variant="line"
        label="Purchase date"
        today={today}
        value={form.date}
        error={errors.date}
        onChange={(date) => set('date', date)}
      />
      {!editing && (
        <Select
          variant="line"
          label="Paid from"
          value={form.paidFrom}
          onChange={(v) => set('paidFrom', v)}
          options={[{ value: OWNED, label: 'Already owned' }, ...payers]}
        />
      )}
      {holding && (
        <TextField
          variant="line"
          label="Manual price"
          value={form.price}
          error={errors.price}
          hint={`In ${holding.currency}. Leave it empty to use the live price.`}
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => set('price', e.target.value)}
        />
      )}
      {editing && (
        <TextField
          variant="line"
          label="Tax withheld on dividends (%)"
          value={form.withholding}
          error={errors.withholding}
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => set('withholding', e.target.value)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {holding ? (
          <Button
            variant="danger-ghost"
            disabled={busy}
            onClick={() => void perform(() => deleteHolding(holding.id), 'Holding deleted.')}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Add or edit a holding. `holding` undefined = closed, null = a new one. `onAdded` runs after a
 * new holding is saved, for the caller to fetch its price.
 */
export function HoldingDialog({
  holding,
  onClose,
  onAdded,
}: {
  holding: Holding | null | undefined;
  onClose(): void;
  onAdded(): void;
}) {
  return (
    <Dialog
      open={holding !== undefined}
      title={holding ? `Edit ${holding.symbol}` : 'Add a holding'}
      description={holding?.name}
      onClose={onClose}
    >
      {holding !== undefined && (
        <HoldingForm
          key={holding?.id ?? 'new'}
          holding={holding}
          onDone={onClose}
          onAdded={onAdded}
        />
      )}
    </Dialog>
  );
}
