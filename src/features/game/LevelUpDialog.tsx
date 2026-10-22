import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { newBorders, tierOf } from '@/domain/game/levels';

export interface LevelUpDialogProps {
  open: boolean;
  /** The level reached. */
  level: number;
  /** The level before the gain, so every border passed on the way is named. */
  levelBefore: number;
  /** Whether `level` starts a new tier. */
  tierChanged: boolean;
  onClose(): void;
}

/** "New border: Silver. Pick it on your Profile.", or the borders, when one gain opens several. */
function bordersLine(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `New border: ${names[0]}. Pick it on your Profile.`;
  return `New borders: ${names.join(', ')}. Pick them on your Profile.`;
}

/**
 * The one dialog the game raises: the level just reached, the tier it belongs to, and, when the gain
 * opens profile borders, which ones and where to pick them.
 */
export function LevelUpDialog({
  open,
  level,
  levelBefore,
  tierChanged,
  onClose,
}: LevelUpDialogProps) {
  const tier = tierOf(level);
  const borders = bordersLine(newBorders(levelBefore, level).map((b) => b.name));
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
      {borders && <p className="font-semibold">{borders}</p>}
    </Dialog>
  );
}
