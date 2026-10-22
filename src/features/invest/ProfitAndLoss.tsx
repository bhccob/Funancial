import { useId, useMemo, useState } from 'react';
import { sliceColors } from '@/components/charts/colors';
import { HelpTip } from '@/components/ui/HelpTip';
import { profitAndLoss } from '@/domain/sales';
import { GlassTile, PlainSection, ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { safeStorage } from '@/lib/safeStorage';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency } from '@/store/useFinance';
import { useInvestMoney } from '@/store/useInvest';
import { arrow, tone } from './gain';

/** Whether the block is open, kept on this device; open until the person hides it. */
const SHOW_KEY = 'funancial.invest.showPnl';

/**
 * Everything made on the investments, all time, in a glass tile: the total and its three parts, with
 * a thin bar of their sizes and the parts as plain rows. Each part is converted once and the total is
 * the sum of the converted parts, so the rows add up on the screen. Hiding it (kept per device)
 * leaves only its header.
 */
export function ProfitAndLoss() {
  const data = useApp((s) => s.data);
  const profile = useCurrency();
  const { convert, formatConverted } = useInvestMoney();
  const [shown, setShown] = useState(() => safeStorage.get(SHOW_KEY) !== 'false');
  const bodyId = useId();

  const parts = useMemo(() => {
    const p = profitAndLoss(data, profile);
    return [
      { key: 'held', label: 'On what you hold', amount: convert(p.held) },
      { key: 'sales', label: 'From sales', amount: convert(p.sales) },
      { key: 'dividends', label: 'Dividends', amount: convert(p.dividends) },
    ];
  }, [data, profile, convert]);
  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  const colors = sliceColors(parts);
  const money = (n: number) => `${arrow(n)} ${formatConverted(Math.abs(n))}`;

  function toggle() {
    setShown(!shown);
    safeStorage.set(SHOW_KEY, String(!shown));
  }

  return (
    <PlainSection
      title="Profit & loss · all time"
      help={<HelpTip pageId="investments" label="profit & loss" />}
      action={
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={bodyId}
          onClick={toggle}
          className="text-muted hover:text-text -my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-[13.5px] font-bold"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      }
    >
      <div id={bodyId} hidden={!shown}>
        <GlassTile>
          <p
            className={cn(
              'text-[26px] leading-tight font-extrabold tracking-[-0.03em] tabular-nums',
              tone(total),
            )}
          >
            {money(total)}
          </p>
          <div aria-hidden="true" className="mt-3 flex h-2.5 gap-0.5">
            {parts.map(
              (p, i) =>
                p.amount !== 0 && (
                  <span
                    key={p.key}
                    data-part={p.key}
                    className="min-w-0.5 rounded-[3px]"
                    style={{ flexGrow: Math.abs(p.amount), backgroundColor: colors[i] }}
                  />
                ),
            )}
          </div>
          <ul className={cn('mt-2', ROWS)}>
            {parts.map((p, i) => (
              <li key={p.key} className="flex min-h-11 items-center gap-2.5 py-1.5 text-[13.5px]">
                <span
                  aria-hidden="true"
                  className="size-[9px] flex-none rounded-full"
                  style={{ backgroundColor: colors[i] }}
                />
                <span className="min-w-0 flex-1 font-bold">{p.label}</span>
                <span className={cn('flex-none font-extrabold tabular-nums', tone(p.amount))}>
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </GlassTile>
      </div>
    </PlainSection>
  );
}
