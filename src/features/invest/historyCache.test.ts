import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';
import { market, MarketError, type HistoryResponse, type Market } from '@/services/market';
import { clearHistoryCache, loadHistory } from './historyCache';

const answer = (symbol: string): HistoryResponse => ({
  symbol,
  currency: 'USD',
  points: [{ date: '2025-03-03', close: 100 }],
});

let fetchHistory: MockInstance<Market['fetchHistory']>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  fetchHistory = vi.spyOn(market, 'fetchHistory').mockImplementation(async (s) => answer(s));
  clearHistoryCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('asks once an hour per symbol and day, whatever the case of the symbol', async () => {
  await loadHistory('VUSA.AS', '2025-03-03');
  await loadHistory('vusa.as', '2025-03-03');
  expect(fetchHistory).toHaveBeenCalledTimes(1);

  await loadHistory('VUSA.AS', '2026-01-02');
  await loadHistory('KO', '2025-03-03');
  expect(fetchHistory).toHaveBeenCalledTimes(3);

  vi.advanceTimersByTime(3_599_000);
  await loadHistory('VUSA.AS', '2025-03-03');
  expect(fetchHistory).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(2_000);
  await loadHistory('VUSA.AS', '2025-03-03');
  expect(fetchHistory).toHaveBeenCalledTimes(4);
});

it('shares one request between callers that ask at the same time', async () => {
  await Promise.all([loadHistory('KO', '2025-03-03'), loadHistory('KO', '2025-03-03')]);
  expect(fetchHistory).toHaveBeenCalledTimes(1);
});

it('forgets a request that failed, so the next ask tries again', async () => {
  fetchHistory.mockRejectedValueOnce(new MarketError());
  await expect(loadHistory('KO', '2025-03-03')).rejects.toBeInstanceOf(MarketError);
  await expect(loadHistory('KO', '2025-03-03')).resolves.toEqual(answer('KO'));
  expect(fetchHistory).toHaveBeenCalledTimes(2);
});
