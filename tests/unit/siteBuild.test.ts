import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import appConfig from '../../vite.config';
import siteConfig from '../../site/vite.config';

const root = resolve(import.meta.dirname, '../..');

describe('the two builds', () => {
  // Capacitor packs dist/ into the APK, so nothing of the download page may be built into it.
  // The build itself is checked by hand: after `npm run build`, dist/ holds no get/, .apk or latest.json.
  it('keep the app build blind to site/', () => {
    expect(readFileSync(resolve(root, 'vite.config.ts'), 'utf8')).not.toMatch(/site/i);
    expect(appConfig.root).toBeUndefined();
    expect(appConfig.publicDir).toBeUndefined();
    expect(appConfig.build?.outDir).toBeUndefined();
    expect(appConfig.build?.rollupOptions?.input).toBeUndefined();
  });

  it('write the download page and the reset page to site-dist, from site/get and site/reset', () => {
    expect(resolve(String(siteConfig.root))).toBe(resolve(root, 'site'));
    expect(resolve(String(siteConfig.root), String(siteConfig.build?.outDir))).toBe(
      resolve(root, 'site-dist'),
    );
    expect(siteConfig.build?.rollupOptions?.input).toEqual({
      get: resolve(root, 'site/get/index.html'),
      reset: resolve(root, 'site/reset/index.html'),
    });
    expect(siteConfig.resolve?.alias).toEqual({ '@': resolve(root, 'src') });
  });
});
