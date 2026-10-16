import { lookup } from 'node:dns/promises';
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const TIMEOUT_MS = 5000;
// 2 MiB, not 1: IKEA product pages put their JSON-LD, and so the price, at about 1.1 MB. The 5 s
// timeout still bounds the time, and a bigger page is cut here, so the memory is bounded too.
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const HTML = /^(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i;

/** The link itself is refused (bad input, or aimed inside a network). Any other failure is the page's. */
export class BlockedUrlError extends Error {}

// Where a product page is never served from: this host's own network and what shares it.
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, which holds cloud metadata services
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 3], // multicast and reserved, up to the broadcast address
] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [
  ['::', 96], // unspecified, loopback and the old IPv4-compatible range
  ['64:ff9b::', 96], // NAT64, which carries an IPv4 address in its last 32 bits
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo, which carries an IPv4 address in its last 32 bits
  ['2002::', 16], // 6to4, which carries an IPv4 address after the prefix
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local, the deprecated private range
  ['ff00::', 8], // multicast
] as const) {
  PRIVATE.addSubnet(net, bits, 'ipv6');
}

// An IPv4-mapped IPv6 address (::ffff:10.0.0.1) is refused whole, public ones too: nothing legitimate
// is served from one, and it is a spelling of an IPv4 address. It has its own list because a
// BlockList reads every IPv4 address as a mapped one, so this rule in PRIVATE would block them all.
const MAPPED = new BlockList();
MAPPED.addSubnet('::ffff:0:0', 96, 'ipv6');

function isPrivate(address: string): boolean {
  const family = isIP(address);
  // Anything that is not an address cannot be shown safe.
  if (family === 0) return true;
  if (family === 4) return PRIVATE.check(address, 'ipv4');
  return MAPPED.check(address, 'ipv6') || PRIVATE.check(address, 'ipv6');
}

/**
 * The lookup every socket connects through. It refuses a name that has any private address, and
 * hands the socket the very addresses it checked, so the check and the connection are one answer:
 * a second lookup, by the socket or anything else, is where DNS rebinding would swap in a private
 * one. It answers in the shape the socket asked for: an array under `all`, else one address.
 */
export const checkedLookup: LookupFunction = (host, options, callback) => {
  lookup(host, { ...options, all: true }).then(
    (addresses) => {
      const [first] = addresses;
      if (!first || addresses.some(({ address }) => isPrivate(address))) {
        callback(new BlockedUrlError('not a public address'), []);
      } else if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, first.address, first.family);
      }
    },
    (err: NodeJS.ErrnoException) => callback(err, []),
  );
};

// An Agent of their own, not the global ones: those share a socket pool, and under
// NODE_USE_ENV_PROXY they send the request through a proxy, which would resolve the name itself
// instead of asking checkedLookup. A new Agent does neither, and keeps no socket after a request.
const AGENTS = { 'http:': new HttpAgent(), 'https:': new HttpsAgent() };

// What can be judged before connecting. A literal address never reaches the lookup, so it is
// judged here; a name is judged by checkedLookup, in the one lookup that connects.
function assertAllowed(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('only http and https');
  }
  if (url.username || url.password) throw new BlockedUrlError('credentials in the link');
  // Square brackets frame an IPv6 literal, a trailing dot is the same host ("localhost.").
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) throw new BlockedUrlError('localhost');
  if (isIP(host) && isPrivate(host)) throw new BlockedUrlError('not a public address');
}

// node:http never follows a redirect, so every hop is the caller's to check. The signal covers the
// lookup, the connection, the headers and the body.
function send(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const https = url.protocol === 'https:';
    const request = https ? httpsRequest : httpRequest;
    request(
      url,
      {
        agent: https ? AGENTS['https:'] : AGENTS['http:'],
        lookup: checkedLookup,
        signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          // Left out, a server may choose any encoding, and the body is read as it comes.
          'Accept-Encoding': 'identity',
          'User-Agent': 'Mozilla/5.0 (compatible; Funancial/1.0)',
        },
      },
      resolve,
    )
      .on('error', reject)
      .end();
  });
}

// A bigger page is cut at the cap, not refused: a product's name and price sit well inside it.
async function readCapped(res: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  // An abort, the 5 s timeout included, also fails this stream (ECONNRESET), so a body that
  // stalls cannot outlast the budget. Leaving the loop early destroys the stream and its socket.
  for await (const chunk of res as AsyncIterable<Buffer>) {
    chunks.push(chunk.subarray(0, MAX_BYTES - size));
    size += chunk.byteLength;
    if (size >= MAX_BYTES) break;
  }
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
  // One budget for every hop, the lookup and the body.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let redirects = 0; ; redirects += 1) {
    signal.throwIfAborted();
    assertAllowed(url);
    const res = await send(url, signal);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      res.destroy();
      const location = res.headers.location;
      if (!location || redirects === MAX_REDIRECTS) throw new Error(`redirect ${status} stops`);
      url = new URL(location, url);
      continue;
    }
    const type = res.headers['content-type'] ?? '';
    if (status < 200 || status >= 300 || !HTML.test(type)) {
      res.destroy();
      throw new Error(`unreadable page: ${status} ${type}`);
    }
    return readCapped(res);
  }
}
