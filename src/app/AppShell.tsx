import { useEffect, useRef, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Celebrations } from '@/features/game/Celebrations';
import { BottomBar } from './BottomBar';
import { DemoBanner } from './DemoBanner';
import { MenuSheet } from './MenuSheet';
import { Sidebar } from './Sidebar';
import { UpdateBanner } from './UpdateBanner';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  // A link in the old page takes focus with it when the page changes, leaving Tab to start from
  // the top of the document. Put focus on the new screen's heading instead (its name, which a
  // screen reader then reads), or on the page when it has none. Not when the new screen focused a
  // field itself, or the link used is a bar link, which stays on screen with its focus. The Menu
  // button is the exception: a screen chosen in its sheet closes the sheet, which hands focus back
  // to the button, and that is not a place the person chose to stay.
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    const focused = document.activeElement;
    if (focused !== document.body && focused !== menuButton.current) return;
    const heading = main.current?.querySelector('h1');
    // Focusable by script only, as the page is.
    if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    (heading ?? main.current)?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[210px_minmax(0,1fr)]">
      <Sidebar className="hidden md:flex" />
      {/* Before the page in the Tab order, so Tab goes on into the page after a bar link; it is fixed to the bottom edge either way. */}
      <BottomBar
        className="md:hidden"
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen(true)}
        menuRef={menuButton}
      />
      <main
        ref={main}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-[22px] pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] focus:outline-none md:px-10 md:pt-6 md:pb-12 [&_h1:focus]:outline-none"
      >
        <UpdateBanner />
        <DemoBanner />
        <Outlet />
      </main>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Celebrations />
      {/* A new screen opens at the top and Back returns to where the last one was left. */}
      <ScrollRestoration />
    </div>
  );
}
