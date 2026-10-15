import { useEffect, useMemo } from 'react';
import { equippedCosmetics, ownedItems } from '@/domain/game/shop';
import { useApp } from '@/store/AppStoreProvider';

/**
 * Puts the equipped game theme on <html data-game-theme> (the item id without its `theme-`) while the
 * app is unlocked, and takes it off otherwise. tokens.css turns it into the game colors.
 */
export function useGameTheme(): void {
  const unlocked = useApp((s) => s.phase === 'unlocked');
  const settings = useApp((s) => s.data.tables.settings[0]);
  const ledger = useApp((s) => s.data.tables.ledger);
  const theme = useMemo(
    () => equippedCosmetics(settings, ownedItems(ledger)).theme.replace(/^theme-/, ''),
    [settings, ledger],
  );

  useEffect(() => {
    if (!unlocked) return;
    const root = document.documentElement;
    root.dataset.gameTheme = theme;
    return () => {
      delete root.dataset.gameTheme;
    };
  }, [unlocked, theme]);
}
