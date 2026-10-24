import { cardLabel } from '@/domain/cardMark';
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
 * The card mark: a tiny card, 18 by 12, in its account's colour, with a 1px outline of the ink at
 * 35% (a border, painted over the colour). The outline is what holds it against the dark page; the
 * colour holds it on the light one (tests/unit/tokens.test.ts). It is only a help: the account's
 * name beside it says which card it is, so it is hidden from a screen reader.
 */
function CardMarkChip({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      data-card-mark
      className="border-text/35 mr-[5px] inline-block h-3 w-[18px] rounded-[3px] border align-[-2px]"
      style={{ backgroundColor: color }}
    />
  );
}

/**
 * The line under an entry's title: its detail, with the account it moved money on drawn as a card
 * mark before its name and last 4 digits; then a sale's profit with ▲ or ▼ in the success or danger
 * colour, then `day` in the lists that run days together (Home's Recent, the account sheet).
 */
export function EntryDetail({ line, day }: { line: EntryLine; day?: string }) {
  const money = useMoney();
  const { detail, mark, profit } = line;
  const words = mark ? (
    <>
      {mark.before}
      <CardMarkChip color={mark.color} />
      {cardLabel(mark)}
      {mark.after}
    </>
  ) : (
    detail
  );
  if (profit === undefined) {
    return (
      <>
        {words}
        {day && `${detail ? ' · ' : ''}${day}`}
      </>
    );
  }
  return (
    <>
      {detail ? (
        <>
          {words}
          {' · profit '}
        </>
      ) : (
        'Profit '
      )}
      <span className={profit < 0 ? 'text-danger' : 'text-success'}>
        {`${profit < 0 ? '▼' : '▲'} ${money(Math.abs(profit))}`}
      </span>
      {day && ` · ${day}`}
    </>
  );
}
