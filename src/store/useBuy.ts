import { useMemo } from 'react';
import type { AboutYou, BuyDecision } from '@/domain/entities';
import { market } from '@/services/market';
import { useApp, useAppStore } from './AppStoreProvider';
import { createBuyActions, type BuyActions } from './buyActions';

export function useBuyActions(): BuyActions {
  const store = useAppStore();
  return useMemo(() => createBuyActions(store, market), [store]);
}

/** Every decision, newest first; two saved in the same instant keep the later one on top. */
export function useDecisions(): BuyDecision[] {
  const decisions = useApp((s) => s.data.tables.buyDecision);
  return useMemo(
    () => [...decisions].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [decisions],
  );
}

export function useDecision(id: string): BuyDecision | undefined {
  return useApp((s) => s.data.tables.buyDecision.find((d) => d.id === id));
}

/** The About-you record, or undefined until the person has saved something. */
export function useAboutYou(): AboutYou | undefined {
  return useApp((s) => s.data.tables.aboutYou[0]);
}
