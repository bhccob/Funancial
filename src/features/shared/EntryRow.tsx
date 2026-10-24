import { ChevronRight, Trash2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMoney } from '@/store/useFinance';
import type { EntryLine } from './entryLine';
import { EntryChip, EntryDetail } from './EntryParts';

/**
 * An entry's amount, with its sign; money in reads in the success color, and with `danger` money
 * out reads in the danger color. `left` (what is left on the card) goes under it, small.
 */
function Amount({ line, danger, left }: { line: EntryLine; danger: boolean; left?: string }) {
  const money = useMoney();
  const amount = (
    <span
      className={cn(
        'shrink-0 text-[14.5px] font-extrabold whitespace-nowrap tabular-nums',
        line.tone === 'in' && 'text-success',
        danger && line.tone === 'out' && 'text-danger',
      )}
    >
      {`${line.sign}${money(line.amount)}`}
    </span>
  );
  if (!left) return amount;
  return (
    <span className="flex shrink-0 flex-col items-end">
      {amount}
      <small className="text-muted text-[11.5px] font-bold whitespace-nowrap">{left}</small>
    </span>
  );
}

/**
 * What an entry is called, a chip beside it for income not counted yet, and the line under it: its
 * detail and the card it moved money on (a mark and the card's name), then `day` where the list
 * runs days together. A long line wraps to a second and a third line rather than cut the card's name
 * off: with "Afl." amounts the words have 124px at 360px (139px at 375px), and "Food · Everyday
 * checking ·· 4312 · Today" takes three lines of the one and two of the other.
 */
function EntryText({ line, day }: { line: EntryLine; day?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-2">
        <b className="truncate text-[14.5px] font-extrabold">{line.title}</b>
        <EntryChip line={line} />
      </span>
      {(line.detail || line.profit !== undefined || day) && (
        <span className="text-muted line-clamp-3 text-[12px] font-semibold">
          <EntryDetail line={line} day={day} />
        </span>
      )}
    </span>
  );
}

export interface EntryRowProps {
  line: EntryLine;
  /** Makes the whole row the button that does it (an expense opens its edit form), with a chevron. */
  onOpen?(): void;
  /** Gives the row a delete button after the amount. */
  onDelete?(): void;
  /** Starts the row with a round glass chip holding this icon (Home's Recent). */
  icon?: LucideIcon;
  /** Said after the line under the title (Home's Recent runs days together). */
  day?: string;
  /** Said under the amount: what is left on the card. */
  left?: string;
  /** Money out reads in the danger color too (Home's Recent). */
  danger?: boolean;
  /** Written on the row as `data-entry`, for what finds a row by its entry. */
  entryId?: string;
}

/** The room between a row's parts: the wireframe draws 11px, and the words are what need the pixel. */
const GAP = 'gap-2.5';

/**
 * One entry as a plain row (under `ROWS`): its words and its amount, then a place for what can be
 * done with it. With `onOpen` the whole row is the button that does it and the place holds a 16px
 * chevron, a sign and not a target; with `onDelete` the place holds a 44px delete button, which
 * takes only 16px of the row too: it gives back the 28px its box is wider than the chevron's, 10px
 * of them the row's gap, so an amount ends at the same place whichever the row ends in, and the
 * button is still a whole 44px target (it reaches 18px past the row, into the page's gutter).
 * The row knows nothing of what opening or deleting does: that is the caller's
 * (`useEntryActions`, for History and Home's Recent).
 */
export function EntryRow({
  line,
  onOpen,
  onDelete,
  icon: Icon,
  day,
  left,
  danger = false,
  entryId,
}: EntryRowProps) {
  const tall = Icon !== undefined;
  const chip = Icon && (
    <span className="glass grid size-10 flex-none place-items-center rounded-full">
      <Icon aria-hidden="true" className="size-[19px]" />
    </span>
  );
  if (onOpen) {
    return (
      <li data-entry={entryId}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'hover:bg-surface-2 -mx-2 flex w-[calc(100%+1rem)] items-center rounded-xl px-2 text-left',
            GAP,
            tall ? 'min-h-[62px] py-[9px]' : 'min-h-[54px] py-2',
          )}
        >
          {chip}
          <EntryText line={line} day={day} />
          <Amount line={line} danger={danger} left={left} />
          {/* Only a sign that the row opens (the whole row is the tap target), so it is 16px wide:
              the words and the amount keep the room a 44px box would take. */}
          <span aria-hidden="true" className="text-muted grid h-11 w-4 shrink-0 place-items-center">
            <ChevronRight className="size-4" />
          </span>
        </button>
      </li>
    );
  }
  return (
    <li
      data-entry={entryId}
      className={cn('flex items-center', GAP, tall ? 'min-h-[62px] py-[9px]' : 'min-h-[54px] py-2')}
    >
      {chip}
      <EntryText line={line} day={day} />
      <Amount line={line} danger={danger} left={left} />
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${line.title}`}
          onClick={onDelete}
          className="text-muted hover:text-danger hover:bg-surface-2 press -mr-4.5 -ml-2.5 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      )}
    </li>
  );
}
