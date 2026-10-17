import { MarketError, marketConfigured, serviceFetch, serviceUrl } from './market';

/** The price service's address for a company's logo. An `<img>` cannot send the token, so use `loadLogo`. */
export const logoUrl = (symbol: string): string =>
  serviceUrl('logo', { symbol: symbol.toUpperCase() });

// One request per symbol for the session, however many places show the logo.
const logos = new Map<string, Promise<Blob | null>>();

async function fetchLogo(symbol: string): Promise<Blob | null> {
  try {
    const res = await serviceFetch(logoUrl(symbol));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`The price service answered ${res.status}`);
    return await res.blob();
  } catch {
    throw new MarketError();
  }
}

/**
 * The logo's image, or null where the service has none. It is fetched with the token, once per
 * symbol, and kept in memory; each user makes its own object URL from the blob and frees it. A failure
 * throws and is not kept, so the next call asks again. Without a token the app never asks.
 */
export function loadLogo(symbol: string): Promise<Blob | null> {
  if (!marketConfigured()) return Promise.resolve(null);
  const key = symbol.toUpperCase();
  let logo = logos.get(key);
  if (!logo) {
    logo = fetchLogo(key);
    logos.set(key, logo);
    logo.catch(() => logos.delete(key));
  }
  return logo;
}
