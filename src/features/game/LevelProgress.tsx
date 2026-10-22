import type { LevelInfo } from '@/domain/game/levels';
import { cn } from '@/lib/cn';

export interface LevelProgressProps {
  level: LevelInfo;
  /**
   * `hero` draws the track in glass and the fill in the header's white, for the dark header: the XP
   * color of a light theme (violet, or a game theme's) is too faint on the glass there.
   */
  tone?: 'page' | 'hero';
}

/** The way to the next level: a bar that is read out as "150 of 264 XP", and the XP beside it. */
export function LevelProgress({ level, tone = 'page' }: LevelProgressProps) {
  const needed = level.xpForNext;
  const into = level.xpIntoLevel.toLocaleString();
  const xpText = needed === null ? 'Max level' : `${into} / ${needed.toLocaleString()} XP`;
  const xpSpoken = needed === null ? 'Max level' : `${into} of ${needed.toLocaleString()} XP`;

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Level progress"
        aria-valuemin={0}
        aria-valuemax={needed ?? 1}
        aria-valuenow={needed === null ? 1 : level.xpIntoLevel}
        aria-valuetext={xpSpoken}
        className={cn(
          'h-1.5 min-w-0 flex-1 overflow-hidden rounded-full',
          tone === 'hero' ? 'bg-white/15' : 'bg-track',
        )}
      >
        <div
          className={cn(
            'h-full rounded-full motion-safe:transition-[width]',
            tone === 'hero' ? 'bg-hero-text' : 'bg-xp',
          )}
          style={{ width: `${level.progress * 100}%` }}
        />
      </div>
      <span className="text-muted shrink-0 text-xs font-semibold tabular-nums">{xpText}</span>
    </div>
  );
}
