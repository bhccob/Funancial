import { useId, useRef, type Ref, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { TextButton } from '@/components/ui/TextButton';
import { archivedBy } from '@/domain/accounts';
import { MAIN_ACCOUNT_ID } from '@/domain/upgrades/v10Accounts';
import { GlassTile } from '@/features/shared/PlainSection';
import { FIRST_BALANCE_KEY, FIRST_SUBSCRIPTIONS_KEY } from '@/lib/firstSteps';
import { useApp } from '@/store/AppStoreProvider';
import type { FirstStepAnswers } from './useFirstStepAnswers';

/** One quiet card: a title, a muted line, a solid action and a quiet way out. */
function FirstStepCard({
  title,
  line,
  action,
  actionRef,
  onAction,
  onNotNow,
}: {
  title: string;
  line: string;
  action: string;
  actionRef: Ref<HTMLButtonElement>;
  onAction(): void;
  onNotNow(): void;
}) {
  const titleId = useId();
  return (
    <GlassTile role="group" aria-labelledby={titleId}>
      <h3 id={titleId} className="text-[16px] font-extrabold tracking-[-0.015em]">
        {title}
      </h3>
      <p className="text-muted mt-1 text-[14px] font-semibold">{line}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button ref={actionRef} size="sm" onClick={onAction}>
          {action}
        </Button>
        <TextButton onClick={onNotNow}>Not now</TextButton>
      </div>
    </GlassTile>
  );
}

/**
 * The two first-time cards on Home, for real data only (the demo has its own). Setup asks for no
 * money, so Home asks once, softly:
 * - "What's in your Main account?" while Main account is in use, still opened at 0, and nothing has
 *   been logged on any account (no expense, no transaction, no income that arrived: a salary that is
 *   only expected has not changed the balance), so someone already using the app (an upgrade from
 *   0.13) never gets it. It goes when the balance is set, or answered (Not now, or a balance of 0).
 * - "Got subscriptions?" once set up, while there are none. It goes when one is added, or at Not now.
 *
 * What was answered is kept on this phone (`answers`), not in the data, as the account reminder is,
 * and Delete all data forgets it. `onSetBalance` and `onAddSubscription` open the sheet and the form,
 * which Home holds with its other dialogs. A card's own Not now takes its button with it, so the focus
 * goes to the other card's action while there is one, else to `after` (the heading that follows).
 */
export function FirstSteps({
  answers,
  onSetBalance,
  onAddSubscription,
  after,
}: {
  answers: FirstStepAnswers;
  onSetBalance(): void;
  onAddSubscription(): void;
  after: RefObject<HTMLElement | null>;
}) {
  const real = useApp((s) => s.namespace === 'real');
  const mainAtZero = useApp((s) => {
    const { account, expense, income, transaction } = s.data.tables;
    const main = account.find((a) => a.id === MAIN_ACCOUNT_ID);
    return (
      main !== undefined &&
      !archivedBy(main, s.today) &&
      main.openingBalance === 0 &&
      expense.length === 0 &&
      transaction.length === 0 &&
      // Only an income that arrived is in the balance: one expected, or marked as not arrived, is not.
      income.every((i) => i.status !== 'confirmed')
    );
  });
  // After setup (a profile), as the card says; Home before setup is not a screen anyone sees.
  const noSubscriptions = useApp(
    (s) => s.data.tables.profile.length > 0 && s.data.tables.subscription.length === 0,
  );
  const balanceAction = useRef<HTMLButtonElement>(null);
  const subscriptionsAction = useRef<HTMLButtonElement>(null);
  if (!real) return null;

  const showBalance = mainAtZero && !answers.has(FIRST_BALANCE_KEY);
  const showSubscriptions = noSubscriptions && !answers.has(FIRST_SUBSCRIPTIONS_KEY);
  return (
    <>
      {showBalance && (
        <FirstStepCard
          title="What's in your Main account?"
          line="Set its starting balance so Funcial starts from the right number."
          action="Set balance"
          actionRef={balanceAction}
          onAction={onSetBalance}
          onNotNow={() => {
            (showSubscriptions ? subscriptionsAction : after).current?.focus();
            answers.answer(FIRST_BALANCE_KEY);
          }}
        />
      )}
      {showSubscriptions && (
        <FirstStepCard
          title="Got subscriptions?"
          line="Add Netflix, Spotify and the rest. You pick the card each one is paid with right there."
          action="Add a subscription"
          actionRef={subscriptionsAction}
          onAction={onAddSubscription}
          onNotNow={() => {
            (showBalance ? balanceAction : after).current?.focus();
            answers.answer(FIRST_SUBSCRIPTIONS_KEY);
          }}
        />
      )}
    </>
  );
}
