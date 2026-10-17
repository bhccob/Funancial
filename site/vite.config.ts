import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Vercel serves get/index.html at /get as well as /get/. Vite's own servers only do /get/.
const serveGetWithoutSlash = (server: ViteDevServer | PreviewServer) => {
  server.middlewares.use((req, _res, next) => {
    if (req.url === '/get') req.url = '/get/';
    next();
  });
};

const getWithoutSlash: Plugin = {
  name: 'funancial-get-without-slash',
  configureServer: serveGetWithoutSlash,
  configurePreviewServer: serveGetWithoutSlash,
};

/*
 * The download page at /get is its own build, apart from the app's. The app's `dist/` is packed into
 * the APK by Capacitor, so nothing from here may land in it: this writes to `site-dist/`, from
 * `site/get/index.html`, with `site/public/` (robots.txt, the APK and latest.json) copied beside it.
 */
export default defineConfig({
  root: here('.'),
  // tailwindcss is only for src/styles/tokens.css, whose @theme block becomes the page's CSS variables.
  plugins: [tailwindcss(), getWithoutSlash],
  resolve: { alias: { '@': here('../src') } },
  build: {
    outDir: '../site-dist',
    emptyOutDir: true,
    rollupOptions: { input: here('get/index.html') },
  },
  // `npm run site:dev` also serves the shared files under src/.
  server: { fs: { allow: [here('..')] } },
});
