import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Celebrations } from '@/features/game/Celebrations';
import { AddSheet, type AddKind } from './AddSheet';
import { DemoBanner } from './DemoBanner';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { UpdateBanner } from './UpdateBanner';
import type { ShellContext } from './useAddSheet';

export function AppShell() {
  const [adding, setAdding] = useState<AddKind | null>(null);
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  const closeSheet = useCallback(() => setAdding(null), []);
  const context = useMemo<ShellContext>(() => ({ openAdd: setAdding }), []);

  // The soft shapes behind the page, which the glass blurs, are on the body (index.css) for as long
  // as the app's screens are up.
  useEffect(() => {
    document.body.classList.add('page-blobs');
    return () => document.body.classList.remove('page-blobs');
  }, []);

  // A link in the old page takes focus with it when the page changes, leaving Tab to start from
  // the top of the document. Put focus on the new screen's heading instead (its name, which a
  // screen reader then reads), or on the page when it has none. Not when the new screen focused a
  // field itself, or the link used is a tab, which stays on screen with its focus.
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (document.activeElement !== document.body) return;
    const heading = main.current?.querySelector('h1');
    // Focusable by script only, as the page is.
    if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    (heading ?? main.current)?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[210px_minmax(0,1fr)]">
      <Sidebar className="hidden md:flex" />
      {/* Before the page in the Tab order, so Tab goes on into the page after a tab; it is fixed to the bottom edge either way. */}
      <TabBar />
      <main
        ref={main}
        tabIndex={-1}
        // The bottom padding keeps the end of the page clear of the tab bar.
        className="mx-auto w-full max-w-6xl px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(var(--tab-bar)+24px)] focus:outline-none md:px-10 md:pt-6 md:pb-12 [&_h1:focus]:outline-none"
      >
        {/* Empty when neither banner shows, which lets the page's top block reach the top edge (index.css). */}
        <div data-shell-banners className="flex flex-col gap-2 empty:hidden">
          <UpdateBanner />
          <DemoBanner />
        </div>
        <Outlet context={context} />
      </main>
      <AddSheet kind={adding} onClose={closeSheet} />
      <Celebrations />
      {/* A new screen opens at the top and Back returns to where the last one was left. */}
      <ScrollRestoration />
    </div>
  );
}
