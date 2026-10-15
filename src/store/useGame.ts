import { useMemo } from 'react';
import { computeGameView, type GameView } from '@/domain/game/engine';
import type { GameContext } from '@/domain/game/types';
import { nowIso } from '@/domain/ids';
import { useApp, useAppStore } from './AppStoreProvider';
import { createGameActions, type GameActions } from './gameActions';
import { useToday } from './useFinance';

/** What the game runs in now. `now` is only the stamp for entries made from it, so it is not a dependency. */
export function useGameContext(): GameContext {
  const today = useToday();
  const weekStartsOn = useApp((s) => s.data.tables.settings[0]?.weekStartsOn ?? 1);
  const canBackUp = useApp((s) => s.namespace === 'real');
  return useMemo(
    () => ({ today, now: nowIso(), weekStartsOn, canBackUp }),
    [today, weekStartsOn, canBackUp],
  );
}

export function useGameView(): GameView {
  const data = useApp((s) => s.data);
  const today = useToday();
  const weekStartsOn = useApp((s) => s.data.tables.settings[0]?.weekStartsOn ?? 1);
  const namespace = useApp((s) => s.namespace);
  return useMemo(
    () =>
      computeGameView(data, {
        today,
        now: nowIso(),
        weekStartsOn,
        canBackUp: namespace === 'real',
      }),
    [data, today, weekStartsOn, namespace],
  );
}

export function useGameActions(): GameActions {
  const store = useAppStore();
  return useMemo(() => createGameActions(store), [store]);
}
