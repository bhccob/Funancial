import { Banner } from '@/components/ui/Banner';
import { useApp } from '@/store/AppStoreProvider';
import { LeaveDemoButton } from './LeaveDemoButton';

/** A soft gradient card, shown only with demo money: what it is, and the way out. */
export function DemoBanner() {
  const namespace = useApp((s) => s.namespace);
  if (namespace !== 'demo') return null;
  return (
    <Banner
      tone="demo"
      title="You're exploring with demo money"
      action={<LeaveDemoButton label="Start for real" variant="primary" />}
      className="mb-4"
    >
      Nothing here is real yet.
    </Banner>
  );
}
