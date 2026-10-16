import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

type Handler = (req: Request) => Response | Promise<Response>;

// Serves api/<name>.ts at /api/<name> under `npm run dev`, the way Vercel serves it deployed.
function priceServiceDev(): Plugin {
  return {
    name: 'funancial-price-service',
    // Vitest runs Vite in serve mode too, and its api tests set their own environment.
    apply: (_config, { command }) => command === 'serve' && !process.env.VITEST,
    configResolved(config) {
      // The routes read process.env, as they do on Vercel; .env.local only fills it in here.
      for (const [key, value] of Object.entries(loadEnv(config.mode, config.root, ''))) {
        if (key.startsWith('FUNANCIAL_')) process.env[key] = value;
      }
    },
    configureServer(server) {
      server.middlewares.use(async (incoming, res, next) => {
        const url = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? 'localhost'}`);
        const name = /^\/api\/([a-z]+)$/.exec(url.pathname)?.[1];
        if (!name || !existsSync(join(server.config.root, 'api', `${name}.ts`))) return next();
        try {
          const method = incoming.method ?? 'GET';
          const handler: Handler | undefined =
            method === 'GET' || method === 'OPTIONS'
              ? (await server.ssrLoadModule(`/api/${name}.ts`))[method]
              : undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          const response = await handler(new Request(url, { method, headers }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), priceServiceDev()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
