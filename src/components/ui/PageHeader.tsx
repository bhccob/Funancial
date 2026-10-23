import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  /** A round glass back button before the title, for a screen opened from another screen. */
  back?: boolean;
  /**
   * Where Back goes when the app has no history to go back through (a link opened first thing, or a
   * reload), instead of Home: the list a page belongs to. Back in history is still what it does first.
   */
  backTo?: string;
}

/**
 * The round glass button before a title: back in history, or `to` (Home unless the header names
 * another place) when the app has none (a link opened first thing, or a reload: the router calls that
 * first entry `default`). Only a header that asks for it renders this, so the others need no router.
 */
function BackButton({ to = '/' }: { to?: string }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => void (key === 'default' ? navigate(to) : navigate(-1))}
      className="glass press text-text grid size-11 shrink-0 place-items-center rounded-full"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
    </button>
  );
}

/** A page's 28px title, an optional line under it and an optional action. No rule below. */
export function PageHeader({ title, action, children, back = false, backTo }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {back && <BackButton to={backTo} />}
          <h1 className="text-page">{title}</h1>
        </div>
        {children && (
          <div className={cn('text-muted text-sm font-semibold', back && 'ml-14')}>{children}</div>
        )}
      </div>
      {action}
    </header>
  );
}
