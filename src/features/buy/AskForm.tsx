import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { ShareStepper } from '@/components/ui/ShareStepper';
import { TextField } from '@/components/ui/TextField';
import { BuyAskSchema, MAX_ASK_PRICE, type BuyAsk, type Category } from '@/domain/entities';
import { minorDigits, parseDecimal } from '@/domain/money';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { parsePaidWith, usePaidWithOptions } from '@/features/shared/paidWith';
import { useAction } from '@/lib/useAction';
import type { ExtractResponse } from '@/services/market';
import { BUY_MESSAGES } from '@/store/buyActions';
import { useBuyActions } from '@/store/useBuy';
import { useCurrency } from '@/store/useFinance';

const COULDNT_READ = "Couldn't read that link. Fill it in yourself.";
const READING = 'Reading the link…';

const URGENCY_OPTIONS: Array<{ value: BuyAsk['urgency']; label: string }> = [
  { value: 'need', label: 'Need' },
  { value: 'want', label: 'Want' },
  { value: 'treat', label: 'Treat' },
];
const HOW_SOON_OPTIONS: Array<{ value: BuyAsk['howSoon']; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'This month' },
  { value: 'norush', label: 'No rush' },
];

const field = BuyAskSchema.shape;

interface Form {
  link: string;
  item: string;
  /** For one, in minor units of the profile currency. */
  price: number | null;
  /** Typed, so a half-written number is not lost; it is read when the form is sent. */
  quantity: string;
  category: Category;
  paidWith: string;
  why: string;
  urgency: BuyAsk['urgency'];
  howSoon: BuyAsk['howSoon'];
  /** Counts the prices filled in from a link: `MoneyField` shows a new value only when re-keyed. */
  priceFills: number;
  /** Said under Price, when the link gave a price it could not fill. */
  priceNote: string | null;
}
type Errors = Partial<Record<'link' | 'item' | 'price' | 'quantity' | 'why', string>>;

/** The friendly message for each field that is wrong, so the schema's own errors never show. */
function validate(f: Form, currency: string): Errors {
  const errors: Errors = {};
  if (!field.item.safeParse(f.item.trim()).success) errors.item = BUY_MESSAGES.item;
  if (f.price === null || !field.price.safeParse(f.price).success) {
    errors.price =
      f.price !== null && f.price > MAX_ASK_PRICE
        ? BUY_MESSAGES.priceTooHigh(currency)
        : BUY_MESSAGES.price;
  }
  if (!field.quantity.safeParse(parseDecimal(f.quantity)).success) {
    errors.quantity = BUY_MESSAGES.quantity;
  }
  if (!field.why.safeParse(f.why.trim() || null).success) errors.why = BUY_MESSAGES.why;
  if (!field.link.safeParse(f.link.trim() || null).success) errors.link = BUY_MESSAGES.link;
  return errors;
}

/**
 * Asks whether to buy something. The optional link fills the name and price from the page when the
 * price service can read it; when it cannot (offline, no service, nothing on the page) a quiet line
 * says so and the rest of the form works as ever. The answer itself never needs the network.
 */
export function AskForm() {
  const actions = useBuyActions();
  const currency = useCurrency();
  const navigate = useNavigate();
  const run = useAction();
  const paidWithOptions = usePaidWithOptions();

  const [form, setForm] = useState<Form>({
    link: '',
    item: '',
    price: null,
    quantity: '1',
    category: 'shopping',
    paidWith: 'cash',
    why: '',
    urgency: 'want',
    howSoon: 'month',
    priceFills: 0,
    priceNote: null,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The link last sent off to be read, so pasting and then leaving the field reads it once. */
  const read = useRef('');

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({
      ...f,
      [key]: value,
      // Whatever was said about the price no longer holds once it is typed.
      ...(key === 'price' && value !== null ? { priceNote: null } : {}),
    }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  /** Fills what is still empty from what the page gave. A price in another currency is not filled. */
  function fill({ name, price, currency: pageCurrency }: ExtractResponse) {
    setForm((f) => {
      const next = { ...f };
      if (name && f.item.trim() === '') next.item = name.trim().slice(0, 80).trim();
      if (price !== null && price > 0 && f.price === null) {
        if (pageCurrency && pageCurrency !== currency) {
          next.priceNote = `The page lists ${pageCurrency}. Enter the price in ${currency}.`;
        } else {
          next.price = Math.round(price * 10 ** minorDigits(currency));
          next.priceFills = f.priceFills + 1;
        }
      }
      return next;
    });
  }

  async function lookup(text: string) {
    const url = text.trim();
    // A link too long to ask with is not sent anywhere; the Ask says so.
    if (!url || url === read.current || !field.link.safeParse(url).success) return;
    read.current = url;
    setLinkNote(READING);
    const found = await actions.extract(url);
    if (read.current !== url) return; // the link was changed while this one was out
    setLinkNote(found ? null : COULDNT_READ);
    if (found) fill(found);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form, currency);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const { paymentMethod, cardId } = parsePaidWith(form.paidWith);
    const ask: BuyAsk = {
      item: form.item,
      price: form.price!,
      quantity: parseDecimal(form.quantity)!,
      category: form.category,
      urgency: form.urgency,
      howSoon: form.howSoon,
      payWith: paymentMethod,
      cardId,
      link: form.link,
      why: form.why,
    };
    setBusy(true);
    let id = '';
    const asked = await run(async () => {
      id = await actions.ask(ask);
    });
    setBusy(false);
    if (asked) void navigate(`/buy/${id}`);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void submit(e)} noValidate>
      <TextField
        variant="line"
        label="Paste a link (fills name and price)"
        value={form.link}
        error={errors.link}
        hint={linkNote ?? undefined}
        inputMode="url"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const link = e.target.value;
          set('link', link);
          if (link.trim() !== read.current) {
            read.current = '';
            setLinkNote(null);
          }
        }}
        onPaste={(e) => void lookup(e.clipboardData.getData('text'))}
        onBlur={(e) => void lookup(e.target.value)}
      />
      <TextField
        variant="line"
        label="What is it?"
        value={form.item}
        error={errors.item}
        autoComplete="off"
        onChange={(e) => set('item', e.target.value)}
      />
      <MoneyField
        key={form.priceFills}
        variant="line"
        label="Price"
        currency={currency}
        value={form.price}
        error={errors.price}
        hint={form.priceNote ?? undefined}
        onChange={(v) => set('price', v)}
      />
      <ShareStepper
        label="Quantity"
        unit="items"
        value={form.quantity}
        error={errors.quantity}
        onChange={(text) => set('quantity', text)}
      />
      <Select
        variant="line"
        label="Category"
        value={form.category}
        options={CATEGORY_OPTIONS}
        onChange={(v) => set('category', v as Category)}
      />
      <Select
        variant="line"
        label="Pay with"
        value={form.paidWith}
        options={paidWithOptions}
        onChange={(v) => set('paidWith', v)}
      />
      <TextField
        variant="line"
        label="Why do you want it? (optional)"
        value={form.why}
        error={errors.why}
        autoComplete="off"
        onChange={(e) => set('why', e.target.value)}
      />
      <RadioGroup
        variant="underline"
        legend="Need, want or treat?"
        value={form.urgency}
        options={URGENCY_OPTIONS}
        onChange={(v) => set('urgency', v)}
      />
      <RadioGroup
        variant="underline"
        legend="How soon?"
        value={form.howSoon}
        options={HOW_SOON_OPTIONS}
        onChange={(v) => set('howSoon', v)}
      />
      <div className="flex flex-col items-start gap-3 pt-2">
        <Button type="submit" size="lg" disabled={busy}>
          Ask
        </Button>
        <p className="text-muted text-sm font-semibold">Your numbers stay on your phone.</p>
      </div>
    </form>
  );
}
