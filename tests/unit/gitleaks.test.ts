import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** The `'''…'''` entries of the `paths = [ … ]` array, as written (regex source). */
const allowedPaths = [
  ...(/paths = \[([^\]]*)\]/.exec(read('.gitleaks.toml'))?.[1] ?? '').matchAll(/'''(.+?)'''/g),
].map((m) => m[1] ?? '');

describe('.gitleaks.toml', () => {
  it('extends the default rules, so only what it lists is let through', () => {
    expect(read('.gitleaks.toml')).toMatch(/\[extend\]\s+useDefault = true/);
  });

  // Never a directory or a pattern: `^src/`, `^api/` or `\.test\.ts$` would hide a real leak too.
  it('lets through single files that exist, and nothing wider', () => {
    expect(allowedPaths.length).toBeGreaterThan(0);
    for (const entry of allowedPaths) {
      const file = /^\^([\w./\\-]+)\$$/.exec(entry)?.[1]?.replaceAll('\\.', '.');
      expect(file, entry).toMatch(/^[\w/.-]+$/);
      expect(existsSync(new URL(file ?? '', root)), entry).toBe(true);
    }
  });

  it('is the config the workflow scans with', () => {
    expect(read('.github/workflows/security.yml')).toContain(
      'GITLEAKS_CONFIG: ${{ github.workspace }}/.gitleaks.toml',
    );
  });
});
