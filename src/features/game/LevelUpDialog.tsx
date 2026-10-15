import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { tierOf } from '@/domain/game/levels';

export interface LevelUpDialogProps {
  open: boolean;
  /** The level reached. */
  level: number;
  /** Whether `level` starts a new tier. */
  tierChanged: boolean;
  onClose(): void;
}

/** The one dialog the game raises: the level just reached, and the tier it belongs to. */
export function LevelUpDialog({ open, level, tierChanged, onClose }: LevelUpDialogProps) {
  const tier = tierOf(level);
  return (
    <Dialog
      open={open}
      title={`Level ${level}`}
      description={tierChanged ? `You're now a ${tier}.` : `${tier} · keep it up.`}
      onClose={onClose}
      actions={<Button onClick={onClose}>Nice</Button>}
    >
      {/* Keyed by level, so a second level-up while the dialog is open pops again. */}
      <span
        key={level}
        className="bg-xp-text text-xp-contrast motion-safe:animate-pop w-fit rounded-[8px] px-3 py-1 text-sm font-extrabold"
      >
        LV {level}
      </span>
    </Dialog>
  );
}
