import { Check, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { COMMON_CURRENCIES, currencyOptions } from '@/features/shared/currencies';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';

const ROW = 'flex min-h-14 w-full items-center gap-3 py-3 text-left text-[15.5px] font-extrabold';

function CurrencyList({ onClose }: { onClose(): void }) {
  const profile = useCurrency();
  const chosen = useApp((s) => s.data.tables.settings[0]?.investCurrency) ?? profile;
  const { setInvestCurrency } = useInvestActions();
  const run = useAction();
  const [all, setAll] = useState(false);
  // The common ones, and the two the person already has in mind even if they are not common.
  const options = useMemo(
    () =>
      currencyOptions(
        (code) => all || COMMON_CURRENCIES.includes(code) || code === profile || code === chosen,
      ),
    [all, profile, chosen],
  );

  function pick(code: string) {
    onClose();
    void run(() => setInvestCurrency(code));
  }

  return (
    <div>
      <h3 aria-hidden className="mt-1 mb-1.5 text-[21px] font-extrabold tracking-[-0.02em]">
        Show Invest in
      </h3>
      <ul>
        {options.map(({ value, label }) => (
          <li key={value} className="border-border border-t first:border-t-0">
            <button
              type="button"
              aria-pressed={value === chosen}
              onClick={() => pick(value)}
              className={ROW}
            >
              <span className="flex-1">
                {value === profile ? `${label} (your app currency)` : label}
              </span>
              {value === chosen && <Check aria-hidden className="size-5 shrink-0" />}
            </button>
          </li>
        ))}
        {!all && (
          <li className="border-border border-t">
            <button type="button" onClick={() => setAll(true)} className={ROW}>
              <span className="flex-1">All currencies…</span>
              <ChevronRight aria-hidden className="text-muted size-[18px] shrink-0" />
            </button>
          </li>
        )}
      </ul>
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
