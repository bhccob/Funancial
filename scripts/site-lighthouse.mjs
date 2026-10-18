// Lighthouse on the download page, as a phone sees it: `npm run site:lighthouse`.
//
// Builds the page and serves it the way `npm run site:preview` does (the same Vite config and port,
// started in this process so it stops cleanly on Windows). Then it runs Lighthouse's mobile audit in
// Playwright's Chromium, which Lighthouse finds through CHROME_PATH, and exits non-zero when
// performance is under 80 or accessibility under 95.
//
// The page asks for /get/latest.json. A made-up one is written into the build for the run, so the
// audit sees the download button and the size line, and it is removed again afterwards.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const PORT = 4174;
const MIN = { performance: 80, accessibility: 95 };
const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

const chrome = chromium.executablePath();
if (!existsSync(chrome)) {
  console.error(
    `Playwright's Chromium is not installed (looked for ${chrome}). Run \`npx playwright install chromium\`.`,
  );
  process.exit(1);
}

const madeUpLatest = join(root('site-dist'), 'get', 'latest.json');
const scratch = mkdtempSync(join(tmpdir(), 'funancial-lighthouse-'));
let server;
let scores;
try {
  await build({ configFile: root('site/vite.config.ts'), logLevel: 'warn' });
  writeFileSync(
    madeUpLatest,
    JSON.stringify({
      versionCode: 1,
      versionName: '0.1',
      notes: 'A made-up release for the Lighthouse run.',
      apkUrl: 'https://funcial.vercel.app/get/funcial-0.1.apk',
      sha256: '0'.repeat(64),
      size: 9_437_184,
    }),
  );
  server = await preview({
    configFile: root('site/vite.config.ts'),
    logLevel: 'warn',
    preview: { port: PORT, strictPort: true },
  });

  const report = join(scratch, 'report.json');
  // Not spawnSync: the server above lives in this process and has to keep answering.
  const run = spawn(
    process.execPath,
    [
      root('node_modules/lighthouse/cli/index.js'),
      `http://localhost:${PORT}/get`,
      '--form-factor=mobile',
      '--only-categories=performance,accessibility',
      '--output=json',
      `--output-path=${report}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--quiet',
    ],
    { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chrome } },
  );
  const [status] = await once(run, 'exit');
  if (status !== 0) throw new Error(`Lighthouse failed (exit ${status}).`);

  const { categories, audits } = JSON.parse(readFileSync(report, 'utf8'));
  scores = Object.fromEntries(
    Object.keys(MIN).map((name) => [name, Math.round(categories[name].score * 100)]),
  );
  for (const id of [
    'first-contentful-paint',
    'largest-contentful-paint',
    'total-blocking-time',
    'cumulative-layout-shift',
  ]) {
    console.log(`${audits[id].title}: ${audits[id].displayValue}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await server?.close();
  rmSync(madeUpLatest, { force: true });
  rmSync(scratch, { recursive: true, force: true });
}

if (scores) {
  let failed = false;
  for (const [name, min] of Object.entries(MIN)) {
    const ok = scores[name] >= min;
    failed ||= !ok;
    console.log(`${name}: ${scores[name]} (needs ${min}) ${ok ? 'ok' : 'TOO LOW'}`);
  }
  if (failed) process.exitCode = 1;
}
