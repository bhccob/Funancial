import type { LocalDate } from '@/domain/dates';
import { market, type HistoryResponse } from '@/services/market';

const MAX_AGE_MS = 3_600_000;

const cache = new Map<string, { at: number; history: Promise<HistoryResponse> }>();

/**
 * A symbol's closes since a day, asked for at most once an hour per symbol and day, kept in memory
 * only. A request that fails is forgotten, so the next ask tries again.
 */
export function loadHistory(symbol: string, from: LocalDate): Promise<HistoryResponse> {
  const key = `${symbol.toUpperCase()} ${from}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.history;

  const history = market.fetchHistory(symbol, from);
  const entry = { at: Date.now(), history };
  cache.set(key, entry);
  history.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return history;
}

/** For tests: forget every cached answer. */
export function clearHistoryCache() {
  cache.clear();
}
