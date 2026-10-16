import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { minorDigits } from '@/domain/money';
import { currencyOptions } from '@/features/shared/currencies';
import { useAction } from '@/lib/useAction';
import { useFinanceActions } from '@/store/useFinance';

const CHOOSE = { value: '', label: 'Choose a currency' };

/**
 * The profile currency, with a way to change it that relabels amounts and never converts them.
 * Amounts are minor units, so only currencies with the same decimals are offered.
 */
export function CurrencyRow({ current }: { current: string }) {
  const { changeCurrency } = useFinanceActions();
  const run = useAction();
  const [picking, setPicking] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const currentLabel = currencyOptions((c) => c === current)[0]?.label ?? current;
  const options = [
    CHOOSE,
    ...currencyOptions((c) => c !== current && minorDigits(c) === minorDigits(current)),
  ];
  const close = () => {
    setNext(null);
    setPicking(false);
  };

  async function confirm() {
    if (!next) return;
    setBusy(true);
    const ok = await run(() => changeCurrency(next), { success: `Currency changed to ${next}.` });
    setBusy(false);
    if (ok) close();
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold">Currency</p>
        <p className="text-muted truncate">{currentLabel}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Change currency"
        onClick={() => setPicking(true)}
      >
        Change
      </Button>
      <Dialog
        open={picking}
        title="Change currency"
        onClose={close}
        actions={
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
        }
      >
        <Select
          label="New currency"
          value=""
          onChange={(code) => code && setNext(code)}
          options={options}
          hint={`Only currencies with the same decimals as ${current} are listed. Your amounts keep their numbers; they are not converted.`}
        />
      </Dialog>
      {/* Opens over the list, so closing both returns focus to the Change button. */}
      <Dialog
        open={next !== null}
        title={`Change your currency to ${next}?`}
        description={`Every amount keeps its number. 1,200 ${current} becomes 1,200 ${next}.`}
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void confirm()}>
              Change currency
            </Button>
          </>
        }
      />
    </div>
  );
}
