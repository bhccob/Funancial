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

// Where a page's Product can sit: in an @graph or an array, in a list (itemListElement, item) or
// as a variant of a group, and an offer is a node of its own.
const LINKS = ['@graph', 'itemListElement', 'item', 'hasVariant', 'offers'];
const MAX_DEPTH = 8;
const MAX_NODES = 500;

/**
 * The objects a JSON-LD value reaches through LINKS, in document order. The root is level 0 and
 * each nested object or array is one more; it stops at 8 levels or 500 objects, so a hostile page
 * cannot make it run long.
 */
function walk(root: unknown): Obj[] {
  const nodes: Obj[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth >= MAX_DEPTH || nodes.length >= MAX_NODES) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (isObj(value)) {
      nodes.push(value);
      for (const link of LINKS) visit(value[link], depth + 1);
    }
  };
  visit(root, 0);
  return nodes;
}

const isProduct = (node: Obj) =>
  [node['@type']].flat().some((type) => /Product(Group)?$/.test(String(type)));

type Quote = { price: number | null; currency: string | null };

/** What one offer asks: `price`, else `priceSpecification.price` (an object or an array), else `lowPrice`. */
function quoteOf(offer: Obj): Quote | null {
  const spec = [offer.priceSpecification]
    .flat()
    .filter(isObj)
    .find((s) => parsePrice(s.price) !== null);
  const price = parsePrice(offer.price) ?? parsePrice(spec?.price) ?? parsePrice(offer.lowPrice);
  if (price === null) return null;
  return {
    price,
    currency: parseCurrency(offer.priceCurrency) ?? parseCurrency(spec?.priceCurrency),
  };
}

const firstQuote = (offers: unknown): Quote | null =>
  [offers]
    .flat()
    .filter(isObj)
    .map(quoteOf)
    .find((q) => q !== null) ?? null;

/** A product's own offers first, then those of its first variant that has a usable price. */
const productQuote = (product: Obj): Quote | null =>
  firstQuote(product.offers) ??
  [product.hasVariant]
    .flat()
    .filter(isObj)
    .map((v) => firstQuote(v.offers))
    .find((q) => q !== null) ??
  null;

// The patterns below are bounded, and the scan skips what it has read, so a hostile page
// (the whole page is the other party's) cannot make them backtrack for long.
function jsonLdProduct(html: string): Obj | undefined {
  const open = /<script\b[^>]{0,500}>/gi;
  const close = /<\/script/gi;
  let tag: RegExpExecArray | null;
  while ((tag = open.exec(html))) {
    if (!/application\/ld\+json/i.test(tag[0])) continue;
    close.lastIndex = open.lastIndex;
    const end = close.exec(html);
    if (!end) break;
    try {
      const product = walk(JSON.parse(html.slice(open.lastIndex, end.index))).find(isProduct);
      if (product) return product;
    } catch {
      // Malformed JSON-LD is common; the page's other sources are still read.
    }
    open.lastIndex = end.index;
  }
  return undefined;
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
  const product = jsonLdProduct(html);
  const meta = metaContent(html);
  const title = /<title\b[^>]{0,200}>([\s\S]{0,1000}?)<\/title>/i.exec(html)?.[1];

  // The name and the price come from the first Product, and a price keeps the currency of its own
  // source, so a name or a currency is never paired with another source's price.
  // `og:price:*` is the older spelling of `product:price:*`; Shopify stores still use it.
  const { price, currency } = (product && productQuote(product)) || {
    price: parsePrice(meta.get('product:price:amount') ?? meta.get('og:price:amount')),
    currency: parseCurrency(meta.get('product:price:currency') ?? meta.get('og:price:currency')),
  };

  const names = [product?.name, meta.get('og:title'), title];
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
