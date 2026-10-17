import * as copy from './_account/copy.js';
import * as forgot from './_account/forgot.js';
import * as login from './_account/login.js';
import * as password from './_account/password.js';
import * as reset from './_account/reset.js';
import * as signup from './_account/signup.js';

type Handler = (req: Request) => Response | Promise<Response>;

// Vercel's free plan allows 12 functions and every file in api/ is one, so the six account routes
// share this one. A static file (quote, fx, ...) still takes its own path before this catch-all.
const routes: Record<string, Partial<Record<string, Handler>>> = {
  signup,
  login,
  copy,
  password,
  forgot,
  reset,
};

const dispatch =
  (method: string) =>
  (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url);
    // Own keys only, so __proto__ and constructor are no route.
    const own = (name: string | null) => (name && Object.hasOwn(routes, name) ? name : null);
    // The path names the route; Vercel's `op` parameter covers a function handed its rewritten path.
    const name = own(url.pathname.split('/').pop() ?? null) ?? own(url.searchParams.get('op'));
    const route = name ? routes[name] : undefined;
    if (!route) return new Response(null, { status: 404 });
    const handler = Object.hasOwn(route, method) ? route[method] : undefined;
    return handler ? handler(req) : new Response(null, { status: 405 });
  };

export const GET = dispatch('GET');
export const POST = dispatch('POST');
export const PUT = dispatch('PUT');
export const DELETE = dispatch('DELETE');
export const OPTIONS = dispatch('OPTIONS');
