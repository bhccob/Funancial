import { Sheet } from '@/components/ui/Sheet';
import { MenuGroups } from './MenuGroups';

/** The phone's Menu: everything the bottom bar has no room for, grouped, with what is inside each. */
export function MenuSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} title="Menu" onClose={onClose}>
      {/* Mounted only while open, so the subtitles are not worked out for a closed sheet. */}
      {open && <MenuGroups onNavigate={onClose} />}
    </Sheet>
  );
}
