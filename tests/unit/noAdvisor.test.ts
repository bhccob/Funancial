import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = (file: string) => new URL(`../../${file}`, import.meta.url);
const text = (file: string) => readFileSync(path(file), 'utf8');

// The owner chose no AI: there is no advisor route, no Claude client and no model setting anywhere.
describe('no AI advisor', () => {
  it('has no Anthropic SDK, in the manifest or the lockfile', () => {
    const pkg = JSON.parse(text('package.json')) as Record<string, Record<string, string>>;
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('@anthropic-ai/sdk');
    expect(text('package-lock.json')).not.toContain('@anthropic-ai');
  });

  it('has no advisor route or Claude client', () => {
    for (const file of [
      'api/advisor.ts',
      'api/_lib/claude.ts',
      'api/_lib/claude.test.ts',
      'api/_lib/advisorSchema.ts',
    ]) {
      expect(existsSync(path(file)), file).toBe(false);
    }
  });

  it('leaves no advisor setting in the config the routes run under', () => {
    for (const file of ['vercel.json', '.env.example', 'vite.config.ts', 'api/_lib/http.ts']) {
      expect(text(file), file).not.toMatch(/anthropic|advisor|claude/i);
    }
  });

  it('serves no POST from the dev server', () => {
    expect(text('vite.config.ts')).not.toMatch(/POST|chunks/);
  });
});
