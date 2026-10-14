import { useState } from 'react';
import { Outlet } from 'react-router';
import { BottomTabs } from './BottomTabs';
import { DemoBanner } from './DemoBanner';
import { MoreSheet } from './MoreSheet';
import { QuickAddButton } from './QuickAddButton';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar className="hidden md:flex" />
      <main className="mx-auto w-full max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(9rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-12">
        <DemoBanner />
        <Outlet />
      </main>
      <QuickAddButton />
      <BottomTabs className="md:hidden" onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
