import { Button, ButtonLink } from '@/components/ui/Button';

/** A button on a row; with `to` it is a link to another screen instead. */
export interface RowAction {
  label: string;
  onClick(): void;
  to?: string;
}

/**
 * One line of a breakdown: what it is, a button when it can be fixed or looked at, and its amount
 * (already written by `useMoney`, so it follows the hide-amounts eye). A button reads "Correct
 * Cash" or "Edit Visa" aloud, so the buttons of one sheet are told apart, and its drawn word stays
 * the first part of that name. A link to another screen keeps its own words.
 */
export function Row({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: RowAction;
}) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-1">
      <span className="min-w-0 flex-1 text-[15px] font-bold">{label}</span>
      {action &&
        (action.to ? (
          <ButtonLink to={action.to} variant="secondary" size="sm" onClick={action.onClick}>
            {action.label}
          </ButtonLink>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`${action.label} ${label}`}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      <span className="flex-none text-[15px] font-extrabold tabular-nums">{value}</span>
    </li>
  );
}

/** The line the rows add up to, under a hairline: "= Available to spend". */
export function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border mt-1 flex items-center gap-3 border-t pt-3 pb-2 text-[17px] font-extrabold">
      <span className="min-w-0 flex-1">{label}</span>
      <span className="flex-none tabular-nums">{value}</span>
    </div>
  );
}
