import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Vercel serves get/index.html at /get, and reset/index.html at /reset (the emailed link adds
// #token=, or ?token= in links sent before), as well as with the slash. Vite's own servers only do the slash.
const PAGES = ['/get', '/reset'];
const servePagesWithoutSlash = (server: ViteDevServer | PreviewServer) => {
  server.middlewares.use((req, _res, next) => {
    const [path = '', query] = (req.url ?? '').split('?');
    if (PAGES.includes(path)) req.url = `${path}/${query === undefined ? '' : `?${query}`}`;
    next();
  });
};

const pagesWithoutSlash: Plugin = {
  name: 'funancial-pages-without-slash',
  configureServer: servePagesWithoutSlash,
  configurePreviewServer: servePagesWithoutSlash,
};

/*
 * The download page at /get and the password reset page at /reset are their own build, apart from the
 * app's. The app's `dist/` is packed into the APK by Capacitor, so nothing from here may land in it:
 * this writes to `site-dist/`, from `site/get/index.html` and `site/reset/index.html`, with
 * `site/public/` (robots.txt, the APK and latest.json) copied beside them.
 */
export default defineConfig({
  root: here('.'),
  // tailwindcss is only for src/styles/tokens.css, whose @theme block becomes the page's CSS variables.
  plugins: [tailwindcss(), pagesWithoutSlash],
  resolve: { alias: { '@': here('../src') } },
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
    rollupOptions: { input: { get: here('get/index.html'), reset: here('reset/index.html') } },
  },
  // `npm run site:dev` also serves the shared files under src/.
  server: { fs: { allow: [here('..')] } },
});
