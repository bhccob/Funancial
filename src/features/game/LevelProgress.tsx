import type { LevelInfo } from '@/domain/game/levels';
import { cn } from '@/lib/cn';

export interface LevelProgressProps {
  level: LevelInfo;
  /**
   * `hero` is for the theme's block, as Profile draws it: a 10px track of the block's own glass with
   * the block's XP color as the fill (the page's XP color can be as dark as the block), and under it
   * the XP on the left and the way to the next level on the right.
   */
  tone?: 'page' | 'hero';
}

/** The way to the next level: a bar that is read out as "150 of 264 XP", and the XP beside it. */
export function LevelProgress({ level, tone = 'page' }: LevelProgressProps) {
  const needed = level.xpForNext;
  const into = level.xpIntoLevel.toLocaleString();
  const xpText = needed === null ? 'Max level' : `${into} / ${needed.toLocaleString()} XP`;
  const xpSpoken = needed === null ? 'Max level' : `${into} of ${needed.toLocaleString()} XP`;
  const hero = tone === 'hero';

  const bar = (
    <div
      role="progressbar"
      aria-label="Level progress"
      aria-valuemin={0}
      aria-valuemax={needed ?? 1}
      aria-valuenow={needed === null ? 1 : level.xpIntoLevel}
      aria-valuetext={xpSpoken}
      className={cn(
        'overflow-hidden rounded-full',
        hero ? 'glass-head h-2.5 p-0.5' : 'bg-track h-1.5 min-w-0 flex-1',
      )}
    >
      <div
        className={cn(
          'h-full rounded-full motion-safe:transition-[width]',
          hero ? 'bg-hero-xp' : 'bg-xp',
        )}
        style={{ width: `${level.progress * 100}%` }}
      />
    </div>
  );

  if (hero) {
    return (
      <div>
        {bar}
        <div className="text-head-ink mt-1.5 flex justify-between gap-3 text-[11.5px] font-bold tabular-nums">
          <span>{xpText}</span>
          {needed !== null && (
            <span>{`${(needed - level.xpIntoLevel).toLocaleString()} to level ${level.level + 1}`}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {bar}
      <span className="text-muted shrink-0 text-xs font-semibold tabular-nums">{xpText}</span>
    </div>
  );
}
