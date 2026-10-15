import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import type { LedgerEntry } from '@/domain/entities';
import { localDay } from '@/domain/game/activity';
import { LOG_XP } from '@/domain/game/rules';
import { formatDate } from '@/lib/format';

/** "+10" or "−10" (a true minus sign); 0 has none. */
function signed(n: number): string {
  if (n === 0) return '0';
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}`;
}

function HistoryRow({ entry }: { entry: LedgerEntry }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{entry.label}</p>
        <p className="text-muted text-[12.5px]">{formatDate(localDay(entry.createdAt))}</p>
      </div>
      <div className="shrink-0 text-right text-xs font-bold tabular-nums">
        <p className={entry.xp > 0 ? 'text-xp-text' : 'text-muted'}>{`${signed(entry.xp)} XP`}</p>
        {entry.coins !== 0 && (
          <p className="text-muted">
            {`${signed(entry.coins)} ${Math.abs(entry.coins) === 1 ? 'coin' : 'coins'}`}
          </p>
        )}
      </div>
    </li>
  );
}

/** The latest ledger entries, newest first: what earned XP and coins, and what spent coins. */
export function XpHistory({ history }: { history: readonly LedgerEntry[] }) {
  return (
    <Section title="Recent XP">
      {history.length > 0 ? (
        <ul className="divide-border -my-3 divide-y">
          {history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No XP yet">{`Log an expense to earn your first ${LOG_XP} XP.`}</EmptyState>
      )}
    </Section>
  );
}
