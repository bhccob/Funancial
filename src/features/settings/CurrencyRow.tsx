import { Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { minorDigits } from '@/domain/money';
import { currencyOptions } from '@/features/shared/currencies';
import { IconRow, ROW_SUB, ROW_TITLE } from '@/features/shared/IconRow';
import { useAction } from '@/lib/useAction';
import { useFinanceActions } from '@/store/useFinance';
import { useInvestActions } from '@/store/useInvest';

const CHOOSE = { value: '', label: 'Choose a currency' };

/**
 * The profile currency, with a way to change it that relabels amounts and never converts them.
 * Amounts are minor units, so only currencies with the same decimals are offered.
 */
export function CurrencyRow({ current }: { current: string }) {
  const { changeCurrency } = useFinanceActions();
  const { refreshMarket } = useInvestActions();
  const run = useAction();
  const [picking, setPicking] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const wasPicking = useRef(false);

  // Both dialogs close in one render, the list while the confirm is still modal, so the browser's
  // own focus return finds the Change button inert and focus drops to the page. A parent's effect
  // runs after its children's, so by now both are closed and the button can take focus.
  useEffect(() => {
    if (wasPicking.current && !picking) changeButton.current?.focus();
    wasPicking.current = picking;
  }, [picking]);

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
    if (ok) {
      // The change cleared every holding's rate; fetch the new ones now, without holding up the dialog.
      void refreshMarket();
      close();
    }
  }

  return (
    <div>
      <IconRow
        icon={Globe}
        end={
          <Button
            ref={changeButton}
            variant="secondary"
            size="sm"
            aria-label="Change currency"
            onClick={() => setPicking(true)}
          >
            Change
          </Button>
        }
      >
        <p className={ROW_TITLE}>Currency</p>
        <p className={`${ROW_SUB} truncate`}>{currentLabel}</p>
      </IconRow>
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
          variant="row"
          label="New currency"
          value=""
          onChange={(code) => code && setNext(code)}
          options={options}
          hint={`Only currencies with the same decimals as ${current} are listed. Your amounts keep their numbers; they are not converted.`}
        />
      </Dialog>
      {/* Opens over the list once a currency is picked; Cancel and a confirmed change close both. */}
      {next !== null && (
        <Dialog
          open
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
      )}
    </div>
  );
}
