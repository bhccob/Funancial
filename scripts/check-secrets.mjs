// `node scripts/check-secrets.mjs --staged`: the pre-commit check (.githooks/pre-commit, turned on with
// `npm run hooks:install`). It refuses a commit that stages a file named like a secret, or adds a line
// shaped like a key or a secret assignment. It prints each hit as `file:line` and never the line, so a
// real value that gets this far does not also land in a terminal log. `git commit --no-verify` skips it;
// the gitleaks job in .github/workflows/security.yml is the check that cannot be skipped.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Written so that none of these matches its own source (`sk-an[t]-`): this file is committed too.
const KEY_SHAPES = [
  /sk-an[t]-/,
  /AKI[A][0-9A-Z]{16}/,
  /[-]{5}BEGIN .*PRIVATE KEY/,
  /ghp_[A-Za-z0-9]{36}/,
  /xox[baprs]-/,
];
const SECRET_ASSIGNMENT = /(TOKEN|SECRET|PASSWORD|MASTER_KEY|API_KEY)\s*=\s*\S{12,}/;

/** The same names .gitignore keeps out, for a file someone staged with `git add -f`. */
export function isSecretFileName(path) {
  const name = path.split('/').pop() ?? '';
  if (name === '.env.example') return false;
  return (
    /^\.env(\..+)?$/.test(name) ||
    /\.(pem|p12|jks|keystore)$/.test(name) ||
    name === 'google-services.json' ||
    name === 'keystore.properties' ||
    /(^|\/)\.superpowers\//.test(path) ||
    path.startsWith('android/.idea/')
  );
}

/** Whether an added line looks like a secret. `.env.example` is where the variable names live. */
export function isSecretLine(text, path) {
  if (KEY_SHAPES.some((shape) => shape.test(text))) return true;
  return path.split('/').pop() !== '.env.example' && SECRET_ASSIGNMENT.test(text);
}

/**
 * The added lines of a `git diff -U0` that look like a secret, as `{ file, line }` (the line number
 * in the new file). Never the text.
 * @param {string} diff
 * @returns {{ file: string, line: number }[]}
 */
export function scanDiff(diff) {
  const hits = [];
  let file = '';
  let line = 0;
  let inHunk = false;
  for (const text of diff.split('\n')) {
    if (text.startsWith('diff --git ')) inHunk = false;
    else if (!inHunk && text.startsWith('+++ ')) {
      file = text
        .slice(4)
        .replace(/\t.*$/, '')
        .replace(/^"?b\//, '')
        .replace(/"$/, '');
    } else if (text.startsWith('@@ ')) {
      inHunk = true;
      line = Number(/\+(\d+)/.exec(text)?.[1] ?? 0);
    } else if (inHunk && text.startsWith('+')) {
      if (isSecretLine(text.slice(1), file)) hits.push({ file, line });
      line += 1;
    }
  }
  return hits;
}

function git(args) {
  const run = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`git ${args[0]} failed (${run.status ?? run.error})`);
  return run.stdout;
}

/** What the index adds to HEAD that looks like a secret: the file names, then the lines. */
export function checkStaged() {
  const only = ['--cached', '--diff-filter=ACMR'];
  const names = git(['diff', ...only, '--name-only', '-z'])
    .split('\0')
    .filter(Boolean);
  const diff = git([
    '-c',
    'core.quotepath=off',
    'diff',
    ...only,
    '-U0',
    '--no-color',
    '--no-textconv',
  ]);
  return { files: names.filter(isSecretFileName), lines: scanDiff(diff) };
}

function main(argv) {
  if (!argv.includes('--staged')) {
    console.error('Usage: node scripts/check-secrets.mjs --staged');
    return 2;
  }
  let found;
  try {
    found = checkStaged();
  } catch (error) {
    // Failing closed: a commit that could not be checked is not let through.
    console.error(`check-secrets: could not read the staged changes: ${error.message}`);
    return 2;
  }
  if (found.files.length === 0 && found.lines.length === 0) return 0;
  console.error(
    'check-secrets: this commit stages what looks like a secret. Nothing is committed.',
  );
  for (const file of found.files) console.error(`  ${file}  (a file name that is never committed)`);
  for (const { file, line } of found.lines) console.error(`  ${file}:${line}`);
  console.error('Unstage it (git restore --staged <file>). If it was a real secret, rotate it.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
