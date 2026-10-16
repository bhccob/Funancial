import { useApp } from '@/store/AppStoreProvider';
import { LeaveDemoButton } from './LeaveDemoButton';

/** A soft gradient card, shown only with demo money: what it is, and the way out. */
export function DemoBanner() {
  const namespace = useApp((s) => s.namespace);
  if (namespace !== 'demo') return null;
  return (
    <div
      role="status"
      className="from-demo-from to-demo-to mb-4 flex items-center gap-2.5 rounded-lg bg-linear-120/srgb px-3.5 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold">You're exploring with demo money</p>
        <p className="text-demo-muted mt-0.5 text-[11px] font-bold">Nothing here is real yet.</p>
      </div>
      <LeaveDemoButton label="Start for real" variant="primary" />
    </div>
  );
}
