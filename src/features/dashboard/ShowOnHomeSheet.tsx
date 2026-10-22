import { Check, CreditCard, Wallet } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { heroFigure } from '@/domain/balances';
import { KIND_LABEL } from '@/features/cards/cardText';
import { ROWS } from '@/features/shared/PlainSection';
import { useFinanceView, useMoney } from '@/store/useFinance';
import { useSelectedAccount } from '@/store/useSelectedAccount';

/**
 * Show on Home: which account Home's hero is for. Every account in use, in carousel order, as a plain
 * row (its kind and last 4 digits, whether it is frozen, and the figure Home would show for it), the
 * one shown checked. Picking one selects it, for Home and the Cards tab alike, and closes the sheet.
 */
export function ShowOnHomeSheet({
  open,
  selectedId,
  onClose,
}: {
  open: boolean;
  selectedId: string | null;
  onClose(): void;
}) {
  const { accounts } = useFinanceView();
  const money = useMoney();
  const select = useSelectedAccount((s) => s.select);

  return (
    <Sheet open={open} title="Show on Home" showTitle onClose={onClose}>
      {open && (
        <>
          <ul className={ROWS}>
            {accounts.map((row) => {
              const { account } = row;
              const Icon = account.last4 ? CreditCard : Wallet;
              const shown = account.id === selectedId;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    aria-pressed={shown}
                    onClick={() => {
                      select(account.id);
                      onClose();
                    }}
                    className="press flex min-h-[62px] w-full items-center gap-3 py-[9px] text-left"
                  >
                    <span className="glass grid size-11 flex-none place-items-center rounded-full">
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14.5px] font-extrabold">{account.name}</b>
                      <span className="text-muted block truncate text-[12px] font-semibold">
                        {`${KIND_LABEL[account.kind]}${account.last4 ? ` ·· ${account.last4}` : ''}${account.frozen ? ' · frozen' : ''}`}
                      </span>
                    </span>
                    <span className="text-[14.5px] font-extrabold whitespace-nowrap tabular-nums">
                      {money(heroFigure(row).amount)}
                    </span>
                    <span className="text-accent ml-1 grid w-[22px] flex-none place-items-center">
                      {shown && <Check aria-hidden="true" className="size-[18px]" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-muted mx-1 mt-1.5 text-[12px] leading-[1.45] font-semibold">
            Swiping to a card on the Cards tab changes this too.
          </p>
        </>
      )}
    </Sheet>
  );
}
