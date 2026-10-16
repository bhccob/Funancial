import type { BuyDecision, Verdict } from '@/domain/entities';
import { formatDay } from '@/lib/format';

/** What each verdict says. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  buy: 'Buy it',
  wait: 'Wait a few days',
  cheaper: 'Look for a cheaper one',
  skip: 'Skip it',
};

/** Where a decision stands once it is made, or null while it is still open. */
export function statusLine({ status, remindOn, boughtOn }: BuyDecision): string | null {
  if (status === 'waiting') return remindOn ? `Waiting until ${formatDay(remindOn)}` : 'Waiting';
  if (status === 'bought') return boughtOn ? `Bought ${formatDay(boughtOn)}` : 'Bought';
  return status === 'skipped' ? 'Skipped' : null;
}
