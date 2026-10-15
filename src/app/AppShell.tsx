import { useState } from 'react';
import { Outlet } from 'react-router';
import { Celebrations } from '@/features/game/Celebrations';
import { BottomBar } from './BottomBar';
import { DemoBanner } from './DemoBanner';
import { MenuSheet } from './MenuSheet';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[210px_minmax(0,1fr)]">
      <Sidebar className="hidden md:flex" />
      <main className="mx-auto w-full max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-9 md:pt-6 md:pb-12">
        <DemoBanner />
        <Outlet />
      </main>
      <BottomBar className="md:hidden" onMenu={() => setMenuOpen(true)} />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Celebrations />
    </div>
  );
}
