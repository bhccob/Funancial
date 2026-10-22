import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import type { Ref } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { MOTION } from '@/lib/motion';
import { TABS, type NavTarget } from './menu';

/** A tab: its icon alone, or, for the current one, the icon and its name in the ink pill. */
function Tab({ path, label, icon: Icon }: NavTarget) {
  return (
    <NavLink
      to={path}
      end={path === '/'}
      className={({ isActive }) =>
        cn(
          'press relative flex h-[50px] min-w-11 items-center justify-center gap-1.5 rounded-full',
          // The current tab takes 2.2 shares of the row, so "Spending" fits beside its icon at 360px.
          isActive ? 'text-primary-contrast flex-[2.2] px-2.5' : 'text-muted flex-1',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="tab-pill"
              aria-hidden="true"
              transition={{ duration: MOTION.standard, ease: MOTION.ease }}
              // In `style`, not a class: only that radius stays round while motion stretches the pill.
              style={{ borderRadius: 9999 }}
              className="bg-primary absolute inset-0"
            />
          )}
          {/* z-10: above the pill however far it sweeps across this tab on its way to another. */}
          <Icon aria-hidden className="relative z-10 size-[21px] shrink-0" />
          <span
            className={
              isActive ? 'relative z-10 text-[12px] font-extrabold whitespace-nowrap' : 'sr-only'
            }
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

/**
 * The phone's floating glass bar: Home, Cards, the ＋, Spending and Invest. The current tab shows
 * its name in an ink pill, which glides to the tab tapped (it jumps for reduced motion). The ＋
 * opens the fan of Expense and Income (`AddFan`) and turns into an × while it is open; the bar
 * stays above the fan's scrim, so the × closes it again.
 */
export function TabBar({
  fanOpen,
  onPlus,
  plusRef,
  className,
}: {
  fanOpen: boolean;
  onPlus(): void;
  plusRef?: Ref<HTMLButtonElement>;
  className?: string;
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'bg-glass ring-glass-line shadow-glass fixed inset-x-3.5 bottom-[calc(22px+env(safe-area-inset-bottom))] z-30 flex h-[66px] items-center gap-1 rounded-full px-1.5 ring-1 backdrop-blur-[20px] backdrop-saturate-[1.6] ring-inset md:hidden',
        className,
      )}
    >
      {TABS.slice(0, 2).map((tab) => (
        <Tab key={tab.path} {...tab} />
      ))}
      <button
        ref={plusRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={fanOpen}
        aria-label={fanOpen ? 'Close' : 'Add'}
        onClick={onPlus}
        className="press bg-accent text-accent-contrast shadow-plus grid size-[54px] shrink-0 place-items-center rounded-full"
      >
        {/* The glyph turns, not the button, so the glow under it stays put. */}
        <Plus
          aria-hidden
          className={cn(
            'motion-safe:ease-glass size-[26px] motion-safe:transition-transform motion-safe:duration-(--duration-standard)',
            fanOpen && 'rotate-[135deg]',
          )}
        />
      </button>
      {TABS.slice(2).map((tab) => (
        <Tab key={tab.path} {...tab} />
      ))}
    </nav>
  );
}
