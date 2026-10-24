import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextButton } from '@/components/ui/TextButton';
import { archivedBy } from '@/domain/accounts';
import { MAIN_ACCOUNT_ID } from '@/domain/upgrades/v10Accounts';
import { GlassTile } from '@/features/shared/PlainSection';
import { safeStorage } from '@/lib/safeStorage';
import { useApp } from '@/store/AppStoreProvider';

const BALANCE_KEY = 'funancial.first.balance';
const SUBSCRIPTIONS_KEY = 'funancial.first.subscriptions';

/** One quiet card: a title, a muted line, a solid action and a quiet way out. */
function FirstStepCard({
  title,
  line,
  action,
  onAction,
  onNotNow,
}: {
  title: string;
  line: string;
  action: string;
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
        <Button size="sm" onClick={onAction}>
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
 *   been logged on any account (no expense, income or transaction), so someone already using the
 *   app (an upgrade from 0.13) never gets it. It goes when the balance is set, or at Not now.
 * - "Got subscriptions?" once set up, while there are none. It goes when one is added, or at Not now.
 *
 * Not now is kept on this phone, not in the data, as the account reminder is: a restored copy does
 * not bring a card back. `onSetBalance` and `onAddSubscription` open the sheet and the form, which
 * Home holds with its other dialogs.
 */
export function FirstSteps({
  onSetBalance,
  onAddSubscription,
}: {
  onSetBalance(): void;
  onAddSubscription(): void;
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
      income.length === 0 &&
      transaction.length === 0
    );
  });
  // After setup (a profile), as the card says; Home before setup is not a screen anyone sees.
  const noSubscriptions = useApp(
    (s) => s.data.tables.profile.length > 0 && s.data.tables.subscription.length === 0,
  );
  const [balanceDone, setBalanceDone] = useState(() => safeStorage.get(BALANCE_KEY) === '1');
  const [subscriptionsDone, setSubscriptionsDone] = useState(
    () => safeStorage.get(SUBSCRIPTIONS_KEY) === '1',
  );
  if (!real) return null;

  return (
    <>
      {mainAtZero && !balanceDone && (
        <FirstStepCard
          title="What's in your Main account?"
          line="Set its starting balance so Funcial starts from the right number."
          action="Set balance"
          onAction={onSetBalance}
          onNotNow={() => {
            safeStorage.set(BALANCE_KEY, '1');
            setBalanceDone(true);
          }}
        />
      )}
      {noSubscriptions && !subscriptionsDone && (
        <FirstStepCard
          title="Got subscriptions?"
          line="Add Netflix, Spotify and the rest. You pick the card each one is paid with right there."
          action="Add a subscription"
          onAction={onAddSubscription}
          onNotNow={() => {
            safeStorage.set(SUBSCRIPTIONS_KEY, '1');
            setSubscriptionsDone(true);
          }}
        />
      )}
    </>
  );
}
