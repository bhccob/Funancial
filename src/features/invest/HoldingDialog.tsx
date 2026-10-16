import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import type { Holding } from '@/domain/entities';
import { isAmbiguousDecimal, parseDecimal } from '@/domain/money';
import { marketConfigured } from '@/services/market';
import { useAction } from '@/lib/useAction';
import { FUTURE } from '@/store/financeActions';
import { UNKNOWN_SYMBOL, type HoldingInput, type HoldingPatch } from '@/store/investActions';
import { useCurrency, useToday } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';

type PaidFrom = HoldingInput['paidFrom'];

const SYMBOL = /^[A-Za-z0-9.^=-]{1,15}$/;
const CURRENCY = /^[A-Za-z]{3}$/;
const TYPE_OPTIONS = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'other', label: 'Other' },
];

/** What to say about a number that could not be read: "1,000" is a thousand or one, so say how to settle it. */
function unreadable(text: string, fallback: string): string {
  const t = text.trim();
  return isAmbiguousDecimal(t)
    ? `Is ${t} a thousand or a fraction? Write ${t.replace(/[.,]/, '')}, or ${t.replace(',', '.')}0 for the fraction`
    : fallback;
}

interface Form {
  symbol: string;
  shares: string;
  cost: number | null;
  date: string;
  paidFrom: PaidFrom;
  withholding: string;
  price: string;
  name: string;
  type: Holding['type'];
  currency: string;
}
type Errors = Partial<Record<keyof Form, string>>;

/** The friendly message for each field that is wrong, so the schema's own errors never show. */
function validate(f: Form, ctx: { today: string; editing: boolean; details: boolean }): Errors {
  const errors: Errors = {};
  const shares = parseDecimal(f.shares);
  const tax = parseDecimal(f.withholding);
  if (!ctx.editing && !SYMBOL.test(f.symbol.trim())) {
    errors.symbol = 'Use letters and numbers only, like KO or VWRL.L';
  }
  if (shares === null || shares <= 0) {
    errors.shares = unreadable(f.shares, 'Enter how many shares, like 2 or 0.5');
  }
  if (f.cost === null) errors.cost = 'Enter an amount like 12.50';
  // The purchase moves money, and a move of nothing is not one.
  else if (f.cost === 0 && f.paidFrom !== 'owned' && !ctx.editing) {
    errors.cost = 'Enter what you paid, or choose Already owned';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = 'Choose the day you bought it';
  else if (f.date > ctx.today) errors.date = FUTURE;
  if (tax === null || tax > 100) {
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
  const { addHolding, updateHolding, deleteHolding, markChecked } = useInvestActions();
  const currency = useCurrency();
  const today = useToday();
  const run = useAction();
  const editing = holding !== null;

  const [form, setForm] = useState<Form>({
    symbol: holding?.symbol ?? '',
    shares: holding ? String(holding.shares) : '',
    cost: holding?.costBasis ?? null,
    date: holding?.purchaseDate ?? today,
    paidFrom: 'owned',
    withholding: String(holding?.withholdingPct ?? 15),
    price: holding?.manualPrice != null ? String(holding.manualPrice) : '',
    name: holding?.name ?? '',
    type: holding?.type ?? 'stock',
    currency: holding?.currency ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [lookupFailed, setLookupFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Without the price service nothing can name the symbol, so the person does.
  const details = !marketConfigured() || lookupFailed;

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
    const found = validate(form, { today, editing, details });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const shares = parseDecimal(form.shares)!;
    const withholdingPct = parseDecimal(form.withholding)!;
    const named = details
      ? { name: form.name.trim(), type: form.type, currency: form.currency.trim().toUpperCase() }
      : {};

    if (holding) {
      const patch: HoldingPatch = {
        ...named,
        shares,
        costBasis: form.cost!,
        purchaseDate: form.date,
        withholdingPct,
        manualPrice: form.price.trim() === '' ? null : parseDecimal(form.price),
      };
      await perform(() => updateHolding(holding.id, patch), 'Holding updated.');
      return;
    }
    const input: HoldingInput = {
      ...named,
      symbol: form.symbol.trim(),
      shares,
      costBasis: form.cost!,
      purchaseDate: form.date,
      paidFrom: form.paidFrom,
      withholdingPct,
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

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <TextField
        label="Symbol"
        value={form.symbol}
        error={errors.symbol}
        disabled={editing}
        className={editing ? 'opacity-45' : undefined}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={15}
        onChange={(e) => set('symbol', e.target.value)}
      />
      {details && (
        <>
          <TextField
            label="Name"
            value={form.name}
            error={errors.name}
            autoComplete="off"
            onChange={(e) => set('name', e.target.value)}
          />
          <Select
            label="Type"
            value={form.type}
            options={TYPE_OPTIONS}
            onChange={(v) => set('type', v as Holding['type'])}
          />
          <TextField
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
      <TextField
        label="Shares"
        value={form.shares}
        error={errors.shares}
        inputMode="decimal"
        autoComplete="off"
        onChange={(e) => set('shares', e.target.value)}
      />
      <MoneyField
        label="What you paid in total"
        currency={currency}
        value={form.cost}
        error={errors.cost}
        onChange={(v) => set('cost', v)}
      />
      <TextField
        label="Purchase date"
        type="date"
        max={today}
        value={form.date}
        error={errors.date}
        onChange={(e) => set('date', e.target.value)}
      />
      {!editing && (
        <RadioGroup<PaidFrom>
          legend="Paid from"
          value={form.paidFrom}
          onChange={(v) => set('paidFrom', v)}
          options={[
            { value: 'owned', label: 'Already owned' },
            { value: 'cash', label: 'Cash' },
            { value: 'savings', label: 'Savings' },
          ]}
        />
      )}
      {holding && (
        <TextField
          label="Manual price"
          value={form.price}
          error={errors.price}
          hint={`In ${holding.currency}. Leave it empty to use the live price.`}
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => set('price', e.target.value)}
        />
      )}
      <TextField
        label="Tax withheld on dividends (%)"
        value={form.withholding}
        error={errors.withholding}
        inputMode="decimal"
        autoComplete="off"
        onChange={(e) => set('withholding', e.target.value)}
      />
      {holding && (
        <Button
          variant="secondary"
          className="self-start"
          disabled={busy}
          onClick={() => void perform(() => markChecked(holding.id), 'Marked as checked.')}
        >
          Mark as checked
        </Button>
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
