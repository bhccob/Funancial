import { describe, expect, it, vi } from 'vitest';
import { DELETE, GET, OPTIONS, POST, PUT } from '../[op].js';

const METHODS = { GET, POST, PUT, DELETE, OPTIONS };

// What each account module exports: the dispatcher's whole contract with them.
const modules = vi.hoisted(() => ({
  signup: ['OPTIONS', 'POST'],
  login: ['OPTIONS', 'POST'],
  copy: ['DELETE', 'OPTIONS', 'PUT'],
  password: ['OPTIONS', 'POST'],
  forgot: ['OPTIONS', 'POST'],
  reset: ['GET', 'POST'],
}));

// Each stub answers with who was reached and what query came with it.
const stub = vi.hoisted(
  () => (name: keyof typeof modules) =>
    Object.fromEntries(
      modules[name].map((method) => [
        method,
        (req: Request) => new Response(`${name} ${method}${new URL(req.url).search}`),
      ]),
    ),
);
vi.mock('../_account/signup.js', () => stub('signup'));
vi.mock('../_account/login.js', () => stub('login'));
vi.mock('../_account/copy.js', () => stub('copy'));
vi.mock('../_account/password.js', () => stub('password'));
vi.mock('../_account/forgot.js', () => stub('forgot'));
vi.mock('../_account/reset.js', () => stub('reset'));

const send = (method: keyof typeof METHODS, path: string) =>
  METHODS[method](new Request(`http://localhost${path}`, { method }));

const names = Object.keys(modules) as Array<keyof typeof modules>;

describe('api/[op].ts', () => {
  it('lists what the account modules really export', async () => {
    for (const name of names) {
      const real = await vi.importActual<object>(`../_account/${name}.js`);
      expect(Object.keys(real).sort(), name).toEqual(modules[name]);
    }
  });

  it('sends each name to its module, for each method the module exports', async () => {
    for (const name of names) {
      for (const method of modules[name]) {
        const res = await send(method as keyof typeof METHODS, `/api/${name}`);
        expect(res.status, `${method} ${name}`).toBe(200);
        expect(await res.text()).toBe(`${name} ${method}`);
      }
    }
  });

  it('still dispatches with a query string, and hands the module the whole request', async () => {
    const res = await send('GET', '/api/reset?token=x');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('reset GET?token=x');
  });

  it("reads Vercel's op parameter when the function sees its rewritten path", async () => {
    for (const path of ['/api/[op]?op=signup', '/api/%5Bop%5D?op=signup']) {
      const res = await send('POST', path);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toBe('signup POST?op=signup');
    }
    // The path wins when it names a route, and op still can't reach a name the map doesn't own.
    expect(await (await send('POST', '/api/signup?op=login')).text()).toBe('signup POST?op=login');
    expect((await send('POST', '/api/[op]?op=__proto__')).status).toBe(404);
  });

  it('answers 404 with no body for a name it does not own', async () => {
    for (const name of [
      'quote',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'SIGNUP',
      '',
    ]) {
      for (const method of Object.keys(METHODS) as Array<keyof typeof METHODS>) {
        const res = await send(method, `/api/${name}`);
        expect(res.status, `${method} /api/${name}`).toBe(404);
        expect(await res.text()).toBe('');
      }
    }
  });

  it('answers 405 with no body for a method the module does not export', async () => {
    for (const name of names) {
      for (const method of Object.keys(METHODS) as Array<keyof typeof METHODS>) {
        if (modules[name].includes(method)) continue;
        const res = await send(method, `/api/${name}`);
        expect(res.status, `${method} /api/${name}`).toBe(405);
        expect(await res.text()).toBe('');
      }
    }
  });
});
