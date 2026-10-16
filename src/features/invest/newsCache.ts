import { market, type NewsItem } from '@/services/market';

const MAX_AGE_MS = 3_600_000;

const cache = new Map<string, { at: number; items: Promise<NewsItem[]> }>();

/**
 * The headlines for these symbols, asked for at most once an hour per set of symbols (in any
 * order), kept in memory only. A request that fails is forgotten, so the next ask tries again.
 */
export function loadNews(symbols: string[]): Promise<NewsItem[]> {
  const key = [...symbols].sort().join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.items;

  const items = market.fetchNews(symbols).then((r) => r.items);
  const entry = { at: Date.now(), items };
  cache.set(key, entry);
  items.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return items;
}

/** For tests: forget every cached answer. */
export function clearNewsCache() {
  cache.clear();
}
