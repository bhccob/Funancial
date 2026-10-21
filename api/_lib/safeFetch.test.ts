import { lookup } from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, RequestOptions } from 'node:http';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { BlockedUrlError, checkedLookup, safeFetch, safeFetchImage } from './safeFetch.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

// safeFetch connects with node:http(s). Both are one mock here, which is told which module it is;
// an Agent made by either remembers it, as the real ones refuse the other module's requests.
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('node:http', () => ({
  request: (...args: unknown[]) => requestMock('http:', ...args),
  Agent: class {
    via = 'http:';
  },
}));
vi.mock('node:https', () => ({
  request: (...args: unknown[]) => requestMock('https:', ...args),
  Agent: class {
    via = 'https:';
  },
}));

// The network edge of the favicon route: it refuses what is not a public address, checks every
// redirect hop, and reads under one time budget. These tests drove it through the product-link
// route before that route went; they now drive it directly, through the page reader and the icon one.
describe('safeFetch', () => {
  type Found = { address: string; family: number };
  const dns = vi.mocked(lookup) as unknown as Mock<
    (host: string, options: { all: true }) => Promise<Found[]>
  >;
  // The "network": what the page at a URL answers, as a Response, and the options it was asked with.
  const serve = vi.fn<(href: string, options: RequestOptions) => Response | Promise<Response>>();
  // What `checkedLookup` handed each socket: [error, addresses or address, family].
  const handed: unknown[][] = [];
  const PUBLIC: Found[] = [{ address: '93.184.216.34', family: 4 }];
  const HTML = { 'Content-Type': 'text/html; charset=utf-8' };
  const page = (body: BodyInit | null, headers: Record<string, string> = HTML) =>
    new Response(body, { headers });
  const redirect = (to: string, status = 302) =>
    new Response(null, { status, headers: { Location: to } });
  const fetched = () => serve.mock.calls.map(([href]) => href);

  // A stand-in for node:http's request. Like the real one it asks the `lookup` option for the
  // address to connect to (unless the host is a literal address), honours `signal`, never
  // follows a redirect, and answers with a stream carrying statusCode and headers.
  function fakeRequest(
    via: string,
    url: URL,
    options: RequestOptions,
    onResponse: (res: IncomingMessage) => void,
  ) {
    // As the real ones do, node:http takes only http: and node:https only https:.
    if (url.protocol !== via) throw new TypeError(`Protocol "${url.protocol}" not supported`);
    const agent = options.agent as { via: string } | undefined;
    if (agent && agent.via !== via) throw new TypeError(`Protocol "${via}" not supported by agent`);
    const req = new EventEmitter();
    let failed = false;
    const fail = (err: unknown) => {
      if (failed) return;
      failed = true;
      queueMicrotask(() => req.emit('error', err));
    };
    let body: Readable | undefined;
    const abort = () => {
      fail(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
          code: 'ABORT_ERR',
          cause: options.signal?.reason,
        }),
      );
      // A body being read fails too, with a reset.
      body?.destroy(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }));
    };
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });

    const connect = async () => {
      try {
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (!isIP(host)) {
          await new Promise<void>((resolve, reject) => {
            (options.lookup as LookupFunction)(host, { all: true }, (err, ...answer) => {
              handed.push([err, ...answer]);
              if (err) reject(err);
              else resolve();
            });
          });
        }
        const res = await serve(url.href, options);
        if (failed) return;
        body = res.body ? Readable.fromWeb(res.body as WebReadableStream) : Readable.from([]);
        onResponse(
          Object.assign(body, {
            statusCode: res.status,
            headers: Object.fromEntries(res.headers),
          }) as unknown as IncomingMessage,
        );
      } catch (err) {
        fail(err);
      }
    };
    return Object.assign(req, {
      end() {
        setImmediate(connect);
        return req;
      },
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    dns.mockResolvedValue(PUBLIC);
    requestMock.mockImplementation(fakeRequest);
    handed.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The link itself is refused: bad input, or aimed inside a network. */
  const refused = async (url: string) => {
    await expect(safeFetch(url), url).rejects.toBeInstanceOf(BlockedUrlError);
  };
  /** The link is allowed but the page cannot be read: any other failure. */
  const unreadable = async (read: Promise<unknown>) => {
    const err = await read.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BlockedUrlError);
  };

  it('refuses a missing, malformed or non-http(s) link without looking it up', async () => {
    const bad = [
      '',
      'not a url',
      '/relative/path',
      'ftp://shop.example/p',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<title>x</title>',
      'gopher://shop.example/',
      'https://user:secret@shop.example/p',
    ];
    for (const url of bad) await refused(url);
    expect(dns).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('refuses localhost and private, loopback, link-local, ULA and unspecified addresses', async () => {
    const hosts = [
      'localhost',
      'LOCALHOST',
      'localhost.',
      'foo.localhost',
      'a.b.localhost.',
      '0.0.0.0',
      '0.1.2.3',
      '10.0.0.1',
      '10.255.255.255',
      '100.64.0.1',
      '100.127.255.255',
      '127.0.0.1',
      '127.255.255.254',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.0.1',
      '192.168.255.255',
      '224.0.0.1',
      '239.255.255.255',
      '255.255.255.255',
      // The URL parser turns these spellings into 127.0.0.1 before they reach the check.
      '127.1',
      '2130706433',
      '0x7f.0.0.1',
      '0177.0.0.1',
      '[::]',
      '[::1]',
      '[fc00::1]',
      '[fd12:3456:789a::1]',
      '[fdff:ffff::1]',
      '[fe80::1]',
      '[febf::1]',
      '[ff02::1]',
      '[::ffff:127.0.0.1]',
      '[::ffff:10.1.2.3]',
      '[::ffff:a9fe:a9fe]',
      '[::ffff:c0a8:1]',
      // More spellings of loopback: another number base, a short form, a trailing dot, percent
      // escapes, fullwidth digits and an IPv4-compatible IPv6 address.
      '0x7f000001',
      '017700000001',
      '127.0.1',
      '127.0.0.1.',
      '%31%32%37.0.0.1',
      '１２７.０.０.１',
      '[::127.0.0.1]',
      // A zone id is not a valid host at all.
      '[fe80::1%25eth0]',
      // Benchmarking and IETF protocol ranges, and the IPv6 ranges that carry an IPv4 address.
      '192.0.0.1',
      '192.0.0.255',
      '198.18.0.1',
      '198.19.255.255',
      '[::ffff:c612:1]',
      '[::ffff:c000:1]',
      '[64:ff9b::7f00:1]',
      '[64:ff9b::a00:1]',
      '[64:ff9b:1::1]',
      '[64:ff9b:1:ffff::1]',
      '[2002::1]',
      '[2002:7f00:1::1]',
      '[2002:ffff:ffff::1]',
      '[fec0::1]',
      '[feff::1]',
      // Mapped IPv4 as a whole (public ones too), Teredo and the discard-only prefix.
      '[::ffff:808:808]',
      '[::ffff:0:1]',
      '[::ffff:ffff:ffff]',
      '[2001::1]',
      '[2001:0:4136:e378:8000:63bf:3fff:fdd2]',
      '[2001:0:ffff:ffff:ffff:ffff:ffff:ffff]',
      '[100::1]',
      '[100::ffff:ffff:ffff:ffff]',
    ];
    for (const host of hosts) {
      await refused(`http://${host}/`);
      await refused(`https://${host}:8443/admin?x=1`);
    }
    // Refused before any connection, and without a lookup either.
    expect(requestMock).not.toHaveBeenCalled();
    expect(dns).not.toHaveBeenCalled();
  });

  it('lets public literal addresses next to the private ranges through', async () => {
    serve.mockImplementation(async () => page('<title>x</title>'));
    const hosts = [
      '8.8.8.8',
      '11.0.0.1',
      '100.63.255.255',
      '100.128.0.1',
      '126.255.255.255',
      '128.0.0.1',
      '169.253.0.1',
      '172.15.255.255',
      '172.32.0.1',
      '192.167.255.255',
      '192.169.0.1',
      '223.255.255.255',
      '191.255.255.255',
      '192.0.1.1',
      '198.17.255.255',
      '198.20.0.1',
      '[2606:4700::1111]',
      '[2001:1::1]',
      '[2001:4860:4860::8888]',
      '[100:0:0:1::1]',
      '[64:ff9a::1]',
      '[64:ff9b:2::1]',
      '[2003::1]',
      '[fbff::1]',
    ];
    for (const host of hosts) {
      await expect(safeFetch(`https://${host}/p`), host).resolves.toBe('<title>x</title>');
    }
    expect(serve).toHaveBeenCalledTimes(hosts.length);
  });

  it('refuses a hostname when any address it resolves to is private', async () => {
    const answers: string[][] = [
      ['127.0.0.1'],
      ['10.1.2.3'],
      ['172.16.5.5'],
      ['192.168.1.20'],
      ['169.254.169.254'],
      ['100.100.100.200'],
      ['0.0.0.0'],
      ['::1'],
      ['::'],
      ['fc00::5'],
      ['fd00:ec2::254'],
      ['fe80::1'],
      ['::ffff:127.0.0.1'],
      ['::ffff:192.168.0.9'],
      ['::ffff:8.8.8.8'],
      ['2001:0:4136:e378:8000:63bf:3fff:fdd2'],
      ['100::2'],
      // One public answer does not excuse a private one beside it, in either order.
      ['93.184.216.34', '10.0.0.1'],
      ['10.0.0.1', '93.184.216.34'],
      ['93.184.216.34', '2606:2800:220:1::1', '::1'],
      // Nothing resolved, or something that is not an address, is no answer to trust.
      [],
      ['not-an-ip'],
    ];
    for (const addresses of answers) {
      dns.mockResolvedValue(
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
      );
      await refused('https://evil.example/p');
    }
    expect(dns).toHaveBeenCalledWith('evil.example', { all: true });
    expect(serve).not.toHaveBeenCalled();
  });

  it('lets a hostname that resolves only to public addresses through', async () => {
    dns.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ]);
    serve.mockImplementation(async () => page('<title>Chair</title>'));
    expect(await safeFetch('https://shop.example/chair?id=7')).toBe('<title>Chair</title>');
    expect(dns).toHaveBeenCalledWith('shop.example', { all: true });
    expect(fetched()).toEqual(['https://shop.example/chair?id=7']);
    // Sent through the checked lookup, naming what it takes and no encoding but identity.
    expect(serve.mock.calls[0]![1]).toMatchObject({
      lookup: checkedLookup,
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
    });
  });

  it('refuses a redirect to a private address, a private hostname or a non-http scheme', async () => {
    dns.mockImplementation(async (host) =>
      host === 'internal.example' ? [{ address: '10.0.0.5', family: 4 }] : PUBLIC,
    );
    const targets = [
      'http://127.0.0.1/admin',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:8080/',
      'http://[::1]/',
      'http://[::ffff:7f00:1]/',
      'http://[fd00::1]/',
      'http://192.168.0.1/',
      'https://internal.example/secret',
      'ftp://shop.example/file',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:secret@shop.example/',
    ];
    for (const to of targets) {
      for (const status of [301, 302, 303, 307, 308]) {
        serve.mockReset();
        serve.mockImplementation(async () => redirect(to, status));
        await refused('https://shop.example/short');
        // The public first hop was fetched; the target never was.
        expect(fetched(), to).toEqual(['https://shop.example/short']);
      }
    }
  });

  it('re-checks every hop, resolves relative redirects and allows three', async () => {
    dns.mockImplementation(async (host) =>
      host === 'internal.example' ? [{ address: '10.0.0.5', family: 4 }] : PUBLIC,
    );
    const hops: Record<string, () => Response> = {
      'https://a.example/1': () => redirect('/2'),
      'https://a.example/2': () => redirect('https://b.example/3?x=1'),
      'https://b.example/3?x=1': () => redirect('//c.example/4'),
      'https://c.example/4': () => page('<title>Landed</title>'),
    };
    serve.mockImplementation(async (url) => hops[String(url)]!());
    expect(await safeFetch('https://a.example/1')).toBe('<title>Landed</title>');
    expect(fetched()).toEqual(Object.keys(hops));
    for (const [, options] of serve.mock.calls) expect(options.lookup).toBe(checkedLookup);
    expect(dns.mock.calls.map(([host]) => host)).toEqual([
      'a.example',
      'a.example',
      'b.example',
      'c.example',
    ]);

    // A public first hop that bounces to a private hostname is stopped at that hop.
    serve.mockReset();
    serve.mockImplementation(async () => redirect('https://internal.example/'));
    await refused('https://a.example/1');
    expect(fetched()).toEqual(['https://a.example/1']);
  });

  it('gives up on a fourth redirect, and on a loop, as a page that cannot be read', async () => {
    serve.mockImplementation(async (url) => redirect(`${String(url)}x`));
    await unreadable(safeFetch('https://a.example/'));
    // The first request plus three redirects.
    expect(serve).toHaveBeenCalledTimes(4);
  });

  it('follows a redirect that switches protocol, using the matching module and agent per hop', async () => {
    const hops: Record<string, () => Response> = {
      'http://a.example/1': () => redirect('https://a.example/2'),
      'https://a.example/2': () => redirect('http://b.example/3'),
      'http://b.example/3': () => redirect('https://c.example/4'),
      'https://c.example/4': () => page('<title>Landed</title>'),
    };
    serve.mockImplementation(async (url) => hops[String(url)]!());
    expect(await safeFetch('http://a.example/1')).toBe('<title>Landed</title>');
    expect(fetched()).toEqual(Object.keys(hops));
    expect(requestMock.mock.calls.map(([via]) => via)).toEqual([
      'http:',
      'https:',
      'http:',
      'https:',
    ]);
  });

  it('connects through an Agent of its own for each protocol, not the global agents', async () => {
    // The global agents share a socket pool and, under NODE_USE_ENV_PROXY, route through a proxy
    // that checkedLookup would never see; a fresh Agent does neither.
    serve.mockImplementation(async () => page('<title>x</title>'));
    for (const url of ['https://a.example/', 'http://a.example/', 'https://b.example/']) {
      await expect(safeFetch(url)).resolves.toBe('<title>x</title>');
    }
    const [first, second, third] = serve.mock.calls.map(([, options]) => options.agent);
    expect(first).toMatchObject({ via: 'https:' });
    expect(second).toMatchObject({ via: 'http:' });
    expect(third).toBe(first);
  });

  it('treats a redirect with no Location as a failure', async () => {
    serve.mockImplementation(async () => new Response(null, { status: 302 }));
    await unreadable(safeFetch('https://a.example/'));
  });

  it('reads a page of exactly 2 MiB whole, and only the first 2 MiB of a bigger one', async () => {
    const cap = 2 * 1024 * 1024;
    const head = '<title>Big</title>';
    const tag = '<meta property="og:price:amount" content="7">';
    const room = cap - head.length - tag.length;

    serve.mockImplementation(async () => page(head + ' '.repeat(room) + tag));
    const whole = await safeFetch('https://shop.example/p');
    expect(whole).toHaveLength(cap);
    expect(whole.endsWith(tag)).toBe(true);

    // One byte further and the tag is cut off at the cap: the page is read, not refused.
    serve.mockImplementation(async () => page(head + ' '.repeat(room + 1) + tag));
    const cut = await safeFetch('https://shop.example/p');
    expect(cut).toHaveLength(cap);
    expect(cut).not.toContain(tag);

    // Whatever follows the cap is never read.
    serve.mockImplementation(async () => page(head + ' '.repeat(cap) + tag));
    const bigger = await safeFetch('https://shop.example/p');
    expect(bigger).toHaveLength(cap);
    expect(bigger.startsWith(head)).toBe(true);
    expect(bigger).not.toContain(tag);
  });

  it('stops reading a body that never ends instead of draining it, and answers from what it read', async () => {
    let pulls = 0;
    const first = new TextEncoder().encode('<title>Endless</title>'.padEnd(256 * 1024, ' '));
    const chunk = new Uint8Array(256 * 1024).fill(32);
    serve.mockImplementation(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(pulls === 1 ? first : chunk);
        },
      });
      return page(body);
    });
    const read = await safeFetch('https://shop.example/p');
    expect(read.startsWith('<title>Endless</title>')).toBe(true);
    expect(read).toHaveLength(2 * 1024 * 1024);
    // Eight 256 KiB chunks make 2 MiB; the stream is cancelled there, not read on.
    expect(pulls).toBeGreaterThan(7);
    expect(pulls).toBeLessThan(16);
  });

  it('gives up after 5 seconds, as one budget for the whole chain', async () => {
    const clock = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);
    serve.mockImplementation(() => new Promise<Response>(() => {}));
    const pending = safeFetch('https://shop.example/p');
    await vi.waitFor(() => expect(serve).toHaveBeenCalled());
    expect(serve.mock.calls[0]![1].signal).toBe(clock.signal);
    clock.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    await unreadable(pending);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it('sends the same timeout signal on every hop', async () => {
    serve
      .mockImplementationOnce(async () => redirect('/next'))
      .mockImplementationOnce(async () => page('<title>x</title>'));
    await safeFetch('https://shop.example/p');
    const [first, second] = serve.mock.calls.map(([, options]) => options.signal);
    expect(first).toBeInstanceOf(AbortSignal);
    expect(second).toBe(first);
  });

  it('does not start a hop once the budget is spent', async () => {
    const spent = AbortSignal.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(spent);
    await unreadable(safeFetch('https://shop.example/p'));
    expect(requestMock).not.toHaveBeenCalled();
    expect(dns).not.toHaveBeenCalled();
  });

  it('ends a body that stalls when the budget runs out', async () => {
    const clock = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);
    let pulls = 0;
    serve.mockImplementation(async () =>
      page(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls += 1;
            if (pulls === 1) controller.enqueue(new TextEncoder().encode('<title>Half</title>'));
            else return new Promise<void>(() => {});
          },
        }),
      ),
    );
    const pending = safeFetch('https://shop.example/p');
    // The second pull means the first chunk was read and the body has gone quiet.
    await vi.waitFor(() => expect(pulls).toBeGreaterThan(1));
    clock.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    await unreadable(pending);
  });

  // Sends through node:http itself; its own Agent stands in for the mock one safeFetch passed.
  const useRealHttp = async () => {
    const http = await vi.importActual<typeof import('node:http')>('node:http');
    requestMock.mockImplementation((_via, url, options, onResponse) =>
      http.request(url, { ...options, agent: new http.Agent() }, onResponse),
    );
  };

  it('counts the DNS lookup in the 5 seconds, through the real http client', async () => {
    // The real request with a lookup that never answers: nothing connects, and the signal ends it.
    await useRealHttp();
    dns.mockImplementation(() => new Promise(() => {}));
    const clock = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(clock.signal);
    const pending = safeFetch('http://slow-dns.example/p');
    await vi.waitFor(() => expect(dns).toHaveBeenCalled());
    clock.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    await unreadable(pending);
    expect(serve).not.toHaveBeenCalled();
  });

  it('refuses a private answer through the real http client too', async () => {
    await useRealHttp();
    dns.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await refused('http://internal.example/p');
    expect(dns).toHaveBeenCalledTimes(1);
  });

  it('connects with the addresses it checked, never a second answer (DNS rebinding)', async () => {
    const checked = [{ address: '93.184.216.34', family: 4 }];
    dns.mockResolvedValueOnce(checked).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    serve.mockImplementation(async () => page('<title>Ok</title>'));
    await expect(safeFetch('https://rebind.example/p')).resolves.toBe('<title>Ok</title>');
    // One lookup serves both the check and the connection, and the socket gets that answer.
    expect(dns).toHaveBeenCalledTimes(1);
    expect(handed).toEqual([[null, checked]]);
    expect(serve.mock.calls[0]![1].lookup).toBe(checkedLookup);

    // A name that answers private is refused before anything is sent, whatever it says next.
    dns.mockReset();
    dns
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
      .mockResolvedValue(checked);
    handed.length = 0;
    serve.mockClear();
    await refused('https://rebind.example/p');
    expect(serve).not.toHaveBeenCalled();
    expect(dns).toHaveBeenCalledTimes(1);
    expect(handed).toHaveLength(1);
    expect(handed[0]![0]).toBeInstanceOf(BlockedUrlError);
  });

  describe('checkedLookup', () => {
    const ask = (host: string, options: { all?: boolean; family?: number } = {}) =>
      new Promise<unknown[]>((resolve) => {
        checkedLookup(host, options, (...answer) => resolve(answer));
      });
    const v4 = (address: string) => ({ address, family: 4 });

    it('hands the socket every checked address under all, and the first one otherwise', async () => {
      const answer = [v4('93.184.216.34'), { address: '2606:2800:220:1::1', family: 6 }];
      dns.mockResolvedValue(answer);
      expect(await ask('a.example', { all: true })).toEqual([null, answer]);
      expect(await ask('a.example')).toEqual([null, '93.184.216.34', 4]);
      expect(await ask('a.example', { all: false })).toEqual([null, '93.184.216.34', 4]);
    });

    it('asks the resolver for every address, passing the socket’s other options on', async () => {
      await ask('a.example', { family: 4 });
      expect(dns).toHaveBeenCalledWith('a.example', { family: 4, all: true });
      await ask('b.example', { all: false });
      expect(dns).toHaveBeenLastCalledWith('b.example', { all: true });
    });

    it('refuses a name with any private address, or none, in either answer shape', async () => {
      const refusals: Found[][] = [
        [v4('10.0.0.1')],
        [v4('93.184.216.34'), v4('127.0.0.1')],
        [v4('127.0.0.1'), v4('93.184.216.34')],
        [{ address: '::ffff:169.254.169.254', family: 6 }],
        [{ address: '64:ff9b::7f00:1', family: 6 }],
        [{ address: '::ffff:8.8.8.8', family: 6 }],
        [{ address: '2001::5', family: 6 }],
        [{ address: '100::1', family: 6 }],
        [v4('not-an-ip')],
        [],
      ];
      for (const answer of refusals) {
        dns.mockResolvedValue(answer);
        for (const options of [{ all: true }, {}]) {
          const [err, address] = await ask('evil.example', options);
          expect(err, JSON.stringify(answer)).toBeInstanceOf(BlockedUrlError);
          expect(address).toEqual([]);
        }
      }
    });

    it('passes a resolver error on unchanged', async () => {
      const boom = Object.assign(new Error('getaddrinfo ENOTFOUND a.example'), {
        code: 'ENOTFOUND',
      });
      dns.mockRejectedValue(boom);
      const [err] = await ask('a.example', { all: true });
      expect(err).toBe(boom);
    });
  });

  it('takes only text/html and application/xhtml+xml', async () => {
    const wrong = ['application/json', 'image/png', 'text/plain', 'application/pdf', 'text/htmlx'];
    for (const type of wrong) {
      serve.mockImplementation(async () => page('<title>x</title>', { 'Content-Type': type }));
      await unreadable(safeFetch('https://shop.example/p'));
    }
    // Bytes carry no default type, unlike a string body.
    serve.mockImplementation(async () => new Response(new Uint8Array([60, 62])));
    await unreadable(safeFetch('https://shop.example/p'));

    const right = [
      'text/html',
      'TEXT/HTML; charset=ISO-8859-1',
      'application/xhtml+xml',
      'application/xhtml+xml; charset=utf-8',
    ];
    for (const type of right) {
      serve.mockImplementation(async () => page('<title>x</title>', { 'Content-Type': type }));
      await expect(safeFetch('https://shop.example/p'), type).resolves.toBe('<title>x</title>');
    }
  });

  it('fails on an error status, a network error or a DNS failure', async () => {
    serve.mockImplementation(
      async () => new Response('<title>Gone</title>', { status: 404, headers: HTML }),
    );
    await unreadable(safeFetch('https://shop.example/p'));

    serve.mockImplementation(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED 10.1.2.3:443 /secret/path');
    });
    await unreadable(safeFetch('https://shop.example/p'));

    dns.mockRejectedValue(new Error('getaddrinfo ENOTFOUND shop.example'));
    await unreadable(safeFetch('https://shop.example/p'));
  });

  describe('safeFetchImage', () => {
    // Bytes that are not valid UTF-8, so a body read as text would come back changed.
    const BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
    const PNG = { 'Content-Type': 'image/png' };
    const icon = (body: BodyInit | null = BYTES, headers: Record<string, string> = PNG) =>
      new Response(body, { headers });
    const FAVICON = 'https://www.google.com/s2/favicons?domain=apple.com&sz=64';

    it('hands back the bytes untouched and the type, asking for an image', async () => {
      serve.mockImplementation(async () => icon());
      const got = await safeFetchImage(FAVICON);
      expect(got.type).toBe('image/png');
      expect(new Uint8Array(got.bytes)).toEqual(BYTES);
      expect(serve.mock.calls[0]![1]).toMatchObject({
        lookup: checkedLookup,
        headers: { Accept: 'image/*', 'Accept-Encoding': 'identity' },
      });
    });

    it("follows the favicon service's redirect to the image, checking every hop", async () => {
      const hops: Record<string, () => Response> = {
        [FAVICON]: () => redirect('https://t3.gstatic.com/faviconV2?client=SOCIAL&size=64'),
        'https://t3.gstatic.com/faviconV2?client=SOCIAL&size=64': () => icon(),
      };
      serve.mockImplementation(async (url) => hops[String(url)]!());
      expect((await safeFetchImage(FAVICON)).type).toBe('image/png');
      expect(fetched()).toEqual(Object.keys(hops));
      for (const [, options] of serve.mock.calls) expect(options.lookup).toBe(checkedLookup);

      serve.mockReset();
      serve.mockImplementation(async () => redirect('http://169.254.169.254/latest/meta-data/'));
      await expect(safeFetchImage(FAVICON)).rejects.toBeInstanceOf(BlockedUrlError);
      expect(fetched()).toEqual([FAVICON]);
    });

    it('takes pictures a browser draws as plain bitmaps, and nothing else', async () => {
      for (const type of [
        'image/png',
        'IMAGE/PNG; charset=binary',
        'image/jpeg',
        'image/gif',
        'image/webp',
        'image/x-icon',
        'image/vnd.microsoft.icon',
      ]) {
        serve.mockImplementation(async () => icon(BYTES, { 'Content-Type': type }));
        expect((await safeFetchImage(FAVICON)).type, type).toBe(type);
      }
      // SVG can carry script, and a page, JSON or a missing type is no icon at all.
      for (const type of ['image/svg+xml', 'text/html', 'application/json', 'image/pngx']) {
        serve.mockImplementation(async () => icon(BYTES, { 'Content-Type': type }));
        await expect(safeFetchImage(FAVICON), type).rejects.toThrow('unreadable');
      }
      serve.mockImplementation(async () => new Response(BYTES));
      await expect(safeFetchImage(FAVICON)).rejects.toThrow('unreadable');
    });

    it('fails on an error status, and on an icon over 256 KiB, which it never cuts short', async () => {
      serve.mockImplementation(async () => new Response('gone', { status: 404, headers: PNG }));
      await expect(safeFetchImage(FAVICON)).rejects.toThrow('unreadable');

      const cap = 256 * 1024;
      serve.mockImplementation(async () => icon(new Uint8Array(cap - 1)));
      expect((await safeFetchImage(FAVICON)).bytes.byteLength).toBe(cap - 1);
      serve.mockImplementation(async () => icon(new Uint8Array(cap + 1)));
      await expect(safeFetchImage(FAVICON)).rejects.toThrow('too large');
    });
  });
});
