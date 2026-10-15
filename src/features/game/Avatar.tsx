import { Anchor, Cat, Crown, Gem, Mountain, Rocket, Sprout, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { frameRing } from './frameRing';

const ICONS: Record<string, LucideIcon> = {
  'avatar-sprout': Sprout,
  'avatar-rocket': Rocket,
  'avatar-cat': Cat,
  'avatar-mountain': Mountain,
  'avatar-anchor': Anchor,
  'avatar-crown': Crown,
  'avatar-gem': Gem,
};

export interface AvatarProps {
  /** A shop item id: `avatar-sprout`, `avatar-rocket`, … */
  item: string;
  /** A shop item id: `frame-none`, `frame-silver`, … */
  frame: string;
  /** Width and height in pixels. */
  size?: number;
}

/** The person's avatar: a lucide icon in a round chip, in the frame they wear. Decorative. */
export function Avatar({ item, frame, size = 32 }: AvatarProps) {
  const Icon = ICONS[item] ?? Sprout;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-surface-2 text-text grid shrink-0 place-items-center rounded-full',
        frameRing(frame),
      )}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.55)} />
    </span>
  );
}
