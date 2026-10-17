import { badRequest, guard, image, json, parseSymbol, preflight, upstream } from './_lib/http.js';
import { safeFetchImage } from './_lib/safeFetch.js';
import { getProfile } from './_lib/yahoo.js';

export const OPTIONS = preflight;

// A dotted public name whose last label starts with a letter: no IP address, no `localhost`, and
// nothing that could add a parameter to the favicon link.
const HOST =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** The host of the profile's website, as Yahoo spells it (with or without https://), or null. */
function siteHost(website: string | undefined): string | null {
  const text = website?.trim();
  if (!text) return null;
  try {
    const { hostname } = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return HOST.test(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

const notFound = (req: Request) => json(req, { error: 'not found' }, 'no-store', 404);

/** The company's site icon, found from its profile's website through Google's favicon service. */
export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const symbol = parseSymbol(new URL(req.url).searchParams.get('symbol'));
  if (!symbol) return badRequest(req);

  let host: string | null;
  try {
    host = siteHost((await getProfile(symbol)).website);
  } catch (err) {
    return upstream(req, err);
  }
  if (!host) return notFound(req);

  try {
    const { type, bytes } = await safeFetchImage(
      `https://www.google.com/s2/favicons?${new URLSearchParams({ domain: host, sz: '64' })}`,
    );
    return image(req, bytes, type, 'public, s-maxage=604800');
  } catch (err) {
    // No icon is a normal answer; the reason stays in the server log.
    console.error('[api] no logo:', err instanceof Error ? err.message : err);
    return notFound(req);
  }
}
