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

  // The pinned action runs 8.24.3 unless told otherwise, and that one ignores [[allowlists]].
  it('runs a gitleaks that reads [[allowlists]] with targetRules, 8.25 or newer', () => {
    const [, major, minor] = /GITLEAKS_VERSION: (\d+)\.(\d+)\.\d+\s/.exec(
      read('.github/workflows/security.yml'),
    ) ?? [undefined, '0', '0'];
    expect(Number(major) * 1000 + Number(minor)).toBeGreaterThanOrEqual(8 * 1000 + 25);
  });
});
