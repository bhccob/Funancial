import { Banner } from '@/components/ui/Banner';
import { useApp } from '@/store/AppStoreProvider';
import { LeaveDemoButton } from './LeaveDemoButton';

export function DemoBanner() {
  const namespace = useApp((s) => s.namespace);
  if (namespace !== 'demo') return null;
  return (
    <Banner tone="demo" className="mb-4" action={<LeaveDemoButton />}>
      You're using demo money.
    </Banner>
  );
}
