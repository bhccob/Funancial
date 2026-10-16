import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { COMMON_CURRENCIES, currencyOptions } from '@/features/shared/currencies';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';

const ROW =
  'border-border flex min-h-14 w-full items-center gap-3 border-t py-3 text-left text-[15.5px] font-extrabold first:border-t-0';

function CurrencyList({ onClose }: { onClose(): void }) {
  const profile = useCurrency();
  const chosen = useApp((s) => s.data.tables.settings[0]?.investCurrency) ?? profile;
  const { setInvestCurrency } = useInvestActions();
  const run = useAction();
  const [all, setAll] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    // The common ones, and the two the person already has in mind even if they are not common.
    const short = (code: string) =>
      COMMON_CURRENCIES.includes(code) || code === profile || code === chosen;
    return currencyOptions((code) => all || short(code)).map((o) => ({
      ...o,
      added: !short(o.value),
    }));
  }, [all, profile, chosen]);

  // The button that opened the rest has gone, so focus goes to the first row it added.
  useEffect(() => {
    if (all) group.current?.querySelector<HTMLElement>('[data-added]')?.focus();
  }, [all]);

  function pick(code: string) {
    onClose();
    void run(() => setInvestCurrency(code));
  }

  // Arrow keys only move focus: choosing closes the sheet and fetches a rate, so it takes Enter.
  function move(e: KeyboardEvent<HTMLDivElement>) {
    const step = (
      { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>
    )[e.key];
    if (!step) return;
    e.preventDefault();
    const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    radios[
      (radios.indexOf(e.target as HTMLElement) + step + radios.length) % radios.length
    ]?.focus();
  }

  return (
    <div>
      <h3 aria-hidden className="mt-1 mb-1.5 text-[21px] font-extrabold tracking-[-0.02em]">
        Show Invest in
      </h3>
      {/* The choice is the one tab stop; the arrows walk the rest, as a long list needs. */}
      <div role="radiogroup" aria-label="Invest currency" ref={group} onKeyDown={move}>
        {options.map(({ value, label, added }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === chosen}
            tabIndex={value === chosen ? 0 : -1}
            data-added={all && added ? '' : undefined}
            onClick={() => pick(value)}
            className={ROW}
          >
            <span className="flex-1">
              {value === profile ? `${label} (your app currency)` : label}
            </span>
            {value === chosen && <Check aria-hidden className="size-5 shrink-0" />}
          </button>
        ))}
      </div>
      {!all && (
        <button type="button" onClick={() => setAll(true)} className={ROW}>
          <span className="flex-1">All currencies…</span>
          <ChevronRight aria-hidden className="text-muted size-[18px] shrink-0" />
        </button>
      )}
      <p className="text-muted mt-3 text-[13px] font-semibold">
        {`Only Invest changes. Home, Budget and your balances stay in ${profile}. Invest converts at today's rate, so your gain % stays the same.`}
      </p>
    </div>
  );
}

/** Where Invest picks the currency it is shown in: the common ones, then every other. */
export function InvestCurrencySheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} title="Show Invest in" onClose={onClose}>
      {/* Mounted only while open, so it starts on the short list each time. */}
      {open && <CurrencyList onClose={onClose} />}
    </Sheet>
  );
}
