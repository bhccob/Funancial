import { useEffect, useMemo } from 'react';
import { ledgerTotals } from '@/domain/game/ledger';
import { levelInfo } from '@/domain/game/levels';
import { equippedCosmetics, ownedItems } from '@/domain/game/shop';
import { useApp } from '@/store/AppStoreProvider';

/**
 * Puts the equipped game theme on <html data-game-theme> (the item id without its `theme-`) while the
 * app is unlocked, and takes it off otherwise. themes.css turns it into the game colors. With no theme
 * equipped, or one that is not owned, it is Black & White.
 */
export function useGameTheme(): void {
  const unlocked = useApp((s) => s.phase === 'unlocked');
  const settings = useApp((s) => s.data.tables.settings[0]);
  const ledger = useApp((s) => s.data.tables.ledger);
  const theme = useMemo(() => {
    const owned = ownedItems(ledger, levelInfo(ledgerTotals(ledger).xp).level);
    return equippedCosmetics(settings, owned).theme.replace(/^theme-/, '');
  }, [settings, ledger]);

  useEffect(() => {
    if (!unlocked) return;
    const root = document.documentElement;
    root.dataset.gameTheme = theme;
    return () => {
      delete root.dataset.gameTheme;
    };
  }, [unlocked, theme]);
}
