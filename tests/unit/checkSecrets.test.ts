import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isSecretFileName, scanDiff } from '../../scripts/check-secrets.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-secrets.mjs', import.meta.url));

// Made up, and built in pieces so that this file does not trip the hook it tests.
const KEYS = {
  'an Anthropic key': 'sk-' + 'ant-' + 'api03-madeupmadeup',
  'an AWS access key id': 'AK' + 'IA' + 'MADEUPMADEUP1234',
  'a private key header': '-----' + 'BEGIN RSA PRIVATE KEY-----',
  'a GitHub token': 'gh' + 'p_' + 'a1B2'.repeat(9),
  'a Slack token': 'xo' + 'xb-' + '1234-madeup',
};
const NAME = 'SERVER_MASTER_' + 'KEY';
const LONG = 'q9Zr' + 'x7Lm' + 'T4vK' + 'w2Hs'; // 16 characters

/** The diff `git diff -U0` writes for `added` lines starting at line `from` of a new file. */
const diffOf = (file: string, added: string[], from = 1) =>
  [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -0,0 +${from},${added.length} @@`,
    ...added.map((line) => `+${line}`),
  ].join('\n');

describe('scanDiff', () => {
  it.each(Object.entries(KEYS))('catches %s, by file and line', (_name, key) => {
    expect(scanDiff(diffOf('src/a.ts', ['const a = 1;', `const k = '${key}';`], 10))).toEqual([
      { file: 'src/a.ts', line: 11 },
    ]);
  });

  it.each(['TOKEN', 'SECRET', 'PASSWORD', 'MASTER_KEY', 'API_KEY'])(
    'catches a %s assignment of 12 or more characters, spaced or not',
    (name) => {
      expect(scanDiff(diffOf('a.sh', [`export SERVICE_${name}=${LONG}`]))).toHaveLength(1);
      expect(scanDiff(diffOf('a.py', [`${name} = "${LONG}"`]))).toHaveLength(1);
    },
  );

  it('lets a short value, and a name that only starts with one, through', () => {
    const lines = [
      'PASSWORD=short',
      'const PASSWORD_MIN = 10;',
      'SECRET_THING = 1',
      'if (TOKEN) go();',
    ];
    expect(scanDiff(diffOf('src/a.ts', lines))).toEqual([]);
  });

  it('numbers lines in the new file across hunks, and skips removed lines', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -3,2 +3,1 @@',
      '-removed one',
      '-removed two',
      '+ok',
      '@@ -20,0 +21,3 @@',
      '+fine',
      `+API_KEY=${LONG}`,
      `+${KEYS['a GitHub token']}`,
    ].join('\n');
    expect(scanDiff(diff)).toEqual([
      { file: 'a.ts', line: 22 },
      { file: 'a.ts', line: 23 },
    ]);
  });

  it('reads an added line that starts with ++ as a line, not as the next file', () => {
    const diff = [
      diffOf('a.ts', ['one']),
      '@@ -0,0 +2,1 @@',
      `+++ ${KEYS['an Anthropic key']}`,
    ].join('\n');
    expect(scanDiff(diff)).toEqual([{ file: 'a.ts', line: 2 }]);
  });

  it('reports each file it finds one in', () => {
    const diff = [
      diffOf('a.ts', [`x ${KEYS['a Slack token']}`]),
      diffOf('b/c d.ts', ['ok', `x ${KEYS['a Slack token']}`]),
    ].join('\n');
    expect(scanDiff(diff)).toEqual([
      { file: 'a.ts', line: 1 },
      { file: 'b/c d.ts', line: 2 },
    ]);
  });

  it('passes a clean diff', () => {
    const lines = [
      'import { z } from "zod";',
      'export const PORT = 4173;',
      'const token = readToken();',
    ];
    expect(scanDiff(diffOf('src/a.ts', lines))).toEqual([]);
    expect(scanDiff('')).toEqual([]);
  });

  it('allows an assignment in .env.example, where the names live, but not a key in it', () => {
    expect(scanDiff(diffOf('.env.example', [`${NAME}=${LONG}`]))).toEqual([]);
    expect(scanDiff(diffOf('api/.env.example', [`${NAME}=${LONG}`]))).toEqual([]);
    expect(scanDiff(diffOf('.env.example', [`X=${KEYS['an AWS access key id']}`]))).toHaveLength(1);
  });
});

describe('isSecretFileName', () => {
  it.each([
    '.env',
    '.env.production',
    'api/.env.local',
    'deploy/server.pem',
    'cert.p12',
    'release.jks',
    'upload.keystore',
    'google-services.json',
    'android/app/google-services.json',
    'keystore.properties',
    'android/keystore.properties',
    '.superpowers/sdd/notes.md',
    'android/.idea/workspace.xml',
  ])('refuses %s', (path) => {
    expect(isSecretFileName(path)).toBe(true);
  });

  it.each([
    '.env.example',
    'api/.env.example',
    'src/env.ts',
    'README.md',
    'docs/superpowers/plans/plan.md',
    'android/app/build.gradle',
    'src/pemFile.ts',
  ])('lets %s through', (path) => {
    expect(isSecretFileName(path)).toBe(false);
  });
});

describe('the --staged command', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  /** A scratch repository. Files go straight into its index, so no file named like a secret exists. */
  function scratchRepo(staged: Record<string, string>) {
    const cwd = mkdtempSync(join(tmpdir(), 'check-secrets-'));
    dirs.push(cwd);
    const git = (args: string[], input?: string) => {
      const run = spawnSync('git', args, { cwd, input, encoding: 'utf8' });
      expect(run.status).toBe(0);
      return run.stdout.trim();
    };
    git(['init', '-q']);
    for (const [path, content] of Object.entries(staged)) {
      const blob = git(['hash-object', '-w', '--stdin'], content);
      git(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    }
    return cwd;
  }
  const run = (cwd: string, ...args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

  it('lets a clean commit through, silently', () => {
    const result = run(scratchRepo({ 'src/a.ts': 'export const a = 1;\n' }), '--staged');
    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });

  it('refuses a staged secret, naming the file and line and never the value', () => {
    const value = KEYS['an Anthropic key'];
    const cwd = scratchRepo({ 'src/config.ts': `// one\nconst key = '${value}';\n` });
    const result = run(cwd, '--staged');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/config.ts:2');
    for (const text of [result.stdout, result.stderr]) {
      expect(text).not.toContain(value);
      expect(text).not.toContain('api03');
    }
  });

  it('refuses a staged file named like a secret, and does not print its content', () => {
    const cwd = scratchRepo({ 'deploy/server.pem': 'made-up-content-for-the-test\n' });
    const result = run(cwd, '--staged');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('deploy/server.pem');
    expect(result.stderr).not.toContain('made-up-content');
  });

  it('allows .env.example with its variable names and a long placeholder', () => {
    const cwd = scratchRepo({ '.env.example': `${NAME}=${LONG}\n` });
    expect(run(cwd, '--staged').status).toBe(0);
  });

  it('needs --staged, and does not let a commit through that it could not read', () => {
    const cwd = scratchRepo({});
    expect(run(cwd).status).toBe(2);
    const outside = mkdtempSync(join(tmpdir(), 'check-secrets-none-'));
    dirs.push(outside);
    expect(run(outside, '--staged').status).toBe(2);
  });
});
