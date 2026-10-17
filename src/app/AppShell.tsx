import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Celebrations } from '@/features/game/Celebrations';
import { BottomBar } from './BottomBar';
import { DemoBanner } from './DemoBanner';
import { MenuSheet } from './MenuSheet';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  // A link in the old page takes focus with it when the page changes, leaving Tab to start from
  // the top of the document. Put focus on the new page instead, unless it focused a field itself
  // (focus is then inside it) or the link used is a bar link, which stays on screen with its focus.
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (document.activeElement === document.body) main.current?.focus();
  }, [pathname]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[210px_minmax(0,1fr)]">
      <Sidebar className="hidden md:flex" />
      {/* Before the page in the Tab order, so Tab goes on into the page after a bar link; it is fixed to the bottom edge either way. */}
      <BottomBar className="md:hidden" menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} />
      <main
        ref={main}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-[22px] pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] focus:outline-none md:px-10 md:pt-6 md:pb-12"
      >
        <DemoBanner />
        <Outlet />
      </main>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Celebrations />
    </div>
  );
}
