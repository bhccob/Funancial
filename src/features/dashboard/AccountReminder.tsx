import { useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { Button, ButtonLink } from '@/components/ui/Button';
import { safeStorage } from '@/lib/safeStorage';
import { useApp } from '@/store/AppStoreProvider';
import { useAccount } from '@/store/useAccount';

const SEEN_KEY = 'funancial.account.reminded';

/**
 * The one-time nudge to make an account: for real data only (the demo has none), and only once the
 * account has been read and there is none, until the person has answered. "Not now" and "Set up"
 * both count; it is kept on this phone, not in the data, so a restored copy does not bring it back.
 * While the account is moved it says instead, every time, that this phone has stopped saving.
 */
export function AccountReminder() {
  const real = useApp((s) => s.namespace === 'real');
  const { loaded, status } = useAccount();
  const [seen, setSeen] = useState(() => safeStorage.get(SEEN_KEY) === '1');
  if (real && loaded && status === 'moved') {
    return (
      <Banner tone="warning" action={<ButtonLink to="/settings">Account settings</ButtonLink>}>
        This phone isn&apos;t saving its copy any more, because your account was opened on another
        phone.
      </Banner>
    );
  }
  if (!real || !loaded || status !== 'none' || seen) return null;

  const answer = () => {
    safeStorage.set(SEEN_KEY, '1');
    setSeen(true);
  };
  return (
    <Banner
      tone="info"
      action={
        <div className="flex gap-2">
          <Button variant="banner" onClick={answer}>
            Not now
          </Button>
          <ButtonLink to="/settings" onClick={answer}>
            Set up
          </ButtonLink>
        </div>
      }
    >
      Make an account so you can move to a new phone and keep everything.
    </Banner>
  );
}
