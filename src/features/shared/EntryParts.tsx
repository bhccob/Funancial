import { useMoney } from '@/store/useFinance';
import type { EntryLine } from './entryLine';

/** The chip beside an entry's title for income not counted yet: "Expected" or "Didn't arrive". */
export function EntryChip({ line }: { line: EntryLine }) {
  if (!line.chip) return null;
  return (
    <span className="bg-surface-2 text-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
      {line.chip}
    </span>
  );
}

/**
 * The line under an entry's title: its detail, then a sale's profit with ▲ or ▼ in the success or
 * danger colour, then `day` in the lists that run days together (Home's Recent, the account sheet).
 */
export function EntryDetail({ line, day }: { line: EntryLine; day?: string }) {
  const money = useMoney();
  const { detail, profit } = line;
  if (profit === undefined) return <>{[detail, day].filter(Boolean).join(' · ')}</>;
  return (
    <>
      {detail ? `${detail} · profit ` : 'Profit '}
      <span className={profit < 0 ? 'text-danger' : 'text-success'}>
        {`${profit < 0 ? '▼' : '▲'} ${money(Math.abs(profit))}`}
      </span>
      {day && ` · ${day}`}
    </>
  );
}
