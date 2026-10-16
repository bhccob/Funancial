import { badRequest, guard, json, preflight, upstream } from './_lib/http.js';
import { BlockedUrlError, safeFetch } from './_lib/safeFetch.js';

export const OPTIONS = preflight;

const MAX_NAME = 200;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function decode(s: string): string {
  return s.replace(
    /&(?:#(x[\da-f]{1,6}|\d{1,7})|(amp|lt|gt|quot|apos|nbsp));/gi,
    (m, num, name) => {
      if (name) return NAMED[name.toLowerCase()] ?? m;
      const code = num[0].toLowerCase() === 'x' ? parseInt(num.slice(1), 16) : Number(num);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    },
  );
}

/** A page's name as one tidy line, or null. */
function tidy(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return decode(v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || null;
}

/** A price in major units: a number or one figure in a string ("1,299.00", "19,99"), above zero. */
function parsePrice(v: unknown): number | null {
  let n = Number.NaN;
  if (typeof v === 'number') n = v;
  if (typeof v === 'string') {
    const figures = v.match(/[.,]?\d[\d.,]*/g);
    const figure = figures?.length === 1 ? figures[0] : undefined;
    // A comma before the last one or two digits is the decimal mark; any other comma groups thousands.
    if (figure) {
      n = Number(
        /,\d{1,2}$/.test(figure)
          ? figure.replace(/\./g, '').replace(',', '.')
          : figure.replace(/,/g, ''),
      );
    }
  }
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCurrency(v: unknown): string | null {
  const code = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Every Product in a JSON-LD value, whether it stands alone, in an array or in an @graph. */
function productsIn(node: unknown): Obj[] {
  if (Array.isArray(node)) return node.flatMap(productsIn);
  if (!isObj(node)) return [];
  const isProduct = [node['@type']].flat().some((type) => /Product$/.test(String(type)));
  return [...(isProduct ? [node] : []), ...productsIn(node['@graph'])];
}

// The patterns below are bounded, and the scan skips what it has read, so a hostile page
// (the whole page is the other party's) cannot make them backtrack for long.
function jsonLdProducts(html: string): Obj[] {
  const found: Obj[] = [];
  const open = /<script\b[^>]{0,500}>/gi;
  const close = /<\/script/gi;
  let tag: RegExpExecArray | null;
  while ((tag = open.exec(html))) {
    if (!/application\/ld\+json/i.test(tag[0])) continue;
    close.lastIndex = open.lastIndex;
    const end = close.exec(html);
    if (!end) break;
    try {
      found.push(...productsIn(JSON.parse(html.slice(open.lastIndex, end.index))));
    } catch {
      // Malformed JSON-LD is common; the page's other sources are still read.
    }
    open.lastIndex = end.index;
  }
  return found;
}

function metaContent(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]{0,1000}>/gi)) {
    const key = /\s(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\scontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (key && content && !meta.has(key)) meta.set(key, content[1] ?? content[2] ?? '');
  }
  return meta;
}

function readProduct(html: string) {
  const products = jsonLdProducts(html);
  const meta = metaContent(html);
  const title = /<title\b[^>]{0,200}>([\s\S]{0,1000}?)<\/title>/i.exec(html)?.[1];

  // A price and its currency come from one source, so a currency is never paired with another's price.
  const offer = products
    .flatMap((product) => [product.offers].flat())
    .filter(isObj)
    .map((o) => ({ price: parsePrice(o.price), currency: parseCurrency(o.priceCurrency) }))
    .find((o) => o.price !== null);
  // `og:price:*` is the older spelling of `product:price:*`; Shopify stores still use it.
  const { price, currency } = offer ?? {
    price: parsePrice(meta.get('product:price:amount') ?? meta.get('og:price:amount')),
    currency: parseCurrency(meta.get('product:price:currency') ?? meta.get('og:price:currency')),
  };

  const names = [...products.map((p) => p.name), meta.get('og:title'), title];
  return { name: names.map(tidy).find((n) => n !== null) ?? null, price, currency };
}

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const html = await safeFetch(new URL(req.url).searchParams.get('url') ?? '');
    return json(req, readProduct(html), 's-maxage=3600');
  } catch (err) {
    return err instanceof BlockedUrlError ? badRequest(req) : upstream(req, err);
  }
}
