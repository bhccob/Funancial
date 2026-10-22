import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Celebrations } from '@/features/game/Celebrations';
import { AddFan, type AddKind } from './AddFan';
import { AddSheet } from './AddSheet';
import { DemoBanner } from './DemoBanner';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { UpdateBanner } from './UpdateBanner';

export function AppShell() {
  const [fanOpen, setFanOpen] = useState(false);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const main = useRef<HTMLElement>(null);
  const plus = useRef<HTMLButtonElement>(null);
  const { pathname, key } = useLocation();
  const shown = useRef(pathname);

  // Any move to another screen shuts the fan: a tab tapped while it is open, or a reminder opened
  // from its notification. Set while rendering, as React advises for state that follows a prop.
  const [fanScreen, setFanScreen] = useState(key);
  if (fanScreen !== key) {
    setFanScreen(key);
    setFanOpen(false);
  }
  const closeFan = useCallback(() => setFanOpen(false), []);
  const closeSheet = useCallback(() => setAdding(null), []);

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
      {/* Before the page in the Tab order, so Tab goes on into the page after a tab; it floats over the bottom edge either way. */}
      <TabBar fanOpen={fanOpen} onPlus={() => setFanOpen((open) => !open)} plusRef={plus} />
      <main
        ref={main}
        tabIndex={-1}
        // Under the fan's scrim the page can't be reached; the tab bar and the fan stay live.
        inert={fanOpen}
        // The bottom padding keeps the end of the page clear of the floating tab bar.
        className="mx-auto w-full max-w-6xl px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(110px+env(safe-area-inset-bottom))] focus:outline-none md:px-10 md:pt-6 md:pb-12 [&_h1:focus]:outline-none"
      >
        {/* Empty when neither banner shows, which lets the page's glass header reach the top edge (index.css). */}
        <div data-shell-banners className="flex flex-col gap-2 empty:hidden">
          <UpdateBanner />
          <DemoBanner />
        </div>
        <Outlet />
      </main>
      <AddFan open={fanOpen} onClose={closeFan} onPick={setAdding} plusRef={plus} />
      <AddSheet kind={adding} onClose={closeSheet} />
      <Celebrations />
      {/* A new screen opens at the top and Back returns to where the last one was left. */}
      <ScrollRestoration />
    </div>
  );
}
