import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const TIMEOUT_MS = 5000;
// 2 MiB, not 1: IKEA product pages put their JSON-LD, and so the price, at about 1.1 MB. The 5 s
// timeout still bounds the time, and a bigger page is cut here, so the memory is bounded too.
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const HTML = /^(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i;

/** The link itself is refused (bad input, or aimed inside a network). Any other failure is the page's. */
export class BlockedUrlError extends Error {}

// Where a product page is never served from: this host's own network and what shares it.
// An IPv4-mapped IPv6 address (::ffff:10.0.0.1) is judged by its IPv4 address.
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, which holds cloud metadata services
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 3], // multicast and reserved, up to the broadcast address
] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 96], // unspecified, loopback and the old IPv4-compatible range
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv6');
}

function isPrivate(address: string): boolean {
  const family = isIP(address);
  // Anything that is not an address cannot be shown safe.
  return family === 0 || PRIVATE.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('only http and https');
  }
  if (url.username || url.password) throw new BlockedUrlError('credentials in the link');
  // Square brackets frame an IPv6 literal, a trailing dot is the same host ("localhost.").
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) throw new BlockedUrlError('localhost');
  // shortcut: fetch resolves the name again after this check, so a hostile DNS server can answer
  // differently the second time (DNS rebinding), and the lookup itself ignores the timeout.
  // Pinning the checked address with a custom undici dispatcher closes both; do that before this
  // route serves anyone but its owner.
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivate(address))) {
    throw new BlockedUrlError('not a public address');
  }
}

// A bigger page is cut at the cap, not refused: a product's name and price sit well inside it.
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks).toString('utf8');
    chunks.push(value.subarray(0, MAX_BYTES - size));
    size += value.byteLength;
  }
  await reader.cancel();
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The first 2 MiB of the HTML at a public http(s) link, or a throw: BlockedUrlError for a link
 * that is refused, anything else for a page that cannot be read. Every redirect hop is checked again.
 */
export async function safeFetch(link: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new BlockedUrlError('not a link');
  }
  // One budget for every hop and the body.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let redirects = 0; ; redirects += 1) {
    await assertPublic(url);
    const res = await fetch(url.href, {
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; Funancial/1.0)',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      const location = res.headers.get('Location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error(`redirect ${res.status} stops`);
      url = new URL(location, url);
      continue;
    }
    const type = res.headers.get('Content-Type') ?? '';
    if (!res.ok || !HTML.test(type)) {
      await res.body?.cancel();
      throw new Error(`unreadable page: ${res.status} ${type}`);
    }
    return readCapped(res);
  }
}
