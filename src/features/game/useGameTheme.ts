import { useEffect, useMemo } from 'react';
import { ledgerTotals } from '@/domain/game/ledger';
import { levelInfo } from '@/domain/game/levels';
import { equippedCosmetics, ownedItems, themeKind } from '@/domain/game/shop';
import { useApp } from '@/store/AppStoreProvider';

/** The theme worn, `theme-…`: the equipped one, or Black & White when none is or it is not owned. */
function useWornTheme(): string {
  const settings = useApp((s) => s.data.tables.settings[0]);
  const ledger = useApp((s) => s.data.tables.ledger);
  return useMemo(() => {
    const owned = ownedItems(ledger, levelInfo(ledgerTotals(ledger).xp).level);
    return equippedCosmetics(settings, owned).theme;
  }, [settings, ledger]);
}

/**
 * Puts the equipped game theme on <html data-game-theme> (the item id without its `theme-`) while the
 * app is unlocked, and takes it off otherwise. themes.css turns it into the game colors. With no theme
 * equipped, or one that is not owned, it is Black & White.
 */
export function useGameTheme(): void {
  const unlocked = useApp((s) => s.phase === 'unlocked');
  const theme = useWornTheme().replace(/^theme-/, '');

  useEffect(() => {
    if (!unlocked) return;
    const root = document.documentElement;
    root.dataset.gameTheme = theme;
    return () => {
      delete root.dataset.gameTheme;
    };
  }, [unlocked, theme]);
}

/**
 * What the worn theme's top block is: `'light'` for a light block, `'dark'` for a dark one, Black &
 * White's among them. The block keeps it in either mode, and the status-bar icons follow it there.
 */
export function useBlockTone(): 'dark' | 'light' {
  return themeKind(useWornTheme()) === 'light' ? 'light' : 'dark';
}
