import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DB_PREFIX, dbName } from '@/data/db';

// The app is called Funcial, but these names are what stored data, accounts, the service
// and installed updates are keyed on. Changing one strands them, so a rename that reaches one fails
// here. (The known-answer tests in src/data/accountCrypto.test.ts and api/_lib/accounts.test.ts
// pin what the crypto strings derive to; this pins the strings themselves, with a clear message.)

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const PINNED: Array<[file: string, why: string, literals: string[]]> = [
  [
    'src/data/accountCrypto.ts',
    'the account key derivation: the salt prefix and the HKDF infos',
    ['`funancial-account:${', "'funancial auth'", "'funancial enc'"],
  ],
  [
    'api/_lib/accounts.ts',
    'the service: the key id and the reset tag HKDF infos',
    ["'funancial key id'", "'funancial reset tag'"],
  ],
  ['src/data/db.ts', 'the IndexedDB and SQLite names', ["DEFAULT_DB_PREFIX = 'funancial'"]],
  [
    'src/store/appStore.ts',
    'the safeStorage keys for the namespace and the biometric slot',
    ["'funancial.namespace'", '`funancial.${ns}.unlock`'],
  ],
  ['src/store/accountActions.ts', 'the private slot an account lives in', ["'funancial.account'"]],
  ['src/lib/theme.ts', 'the saved theme', ["'funancial.theme'"]],
  ['src/store/useAmountsHidden.ts', 'the hide-amounts eye', ["'funancial.hideAmounts'"]],
  ['src/app/useUpdateOffer.ts', 'the dismissed update', ["'funancial.update.dismissed'"]],
  [
    'src/features/dashboard/AccountReminder.tsx',
    'the account reminder',
    ["'funancial.account.reminded'"],
  ],
  ['src/features/invest/ProfitAndLoss.tsx', 'the profit toggle', ["'funancial.invest.showPnl'"]],
  ['src/lib/broadcast.ts', 'the tab channel', ["name = 'funancial'"]],
  [
    'src/services/account.ts',
    'the header and env names the app sends and reads',
    ["'X-Funancial-Token'", 'VITE_FUNANCIAL_API_TOKEN', 'VITE_FUNANCIAL_API_URL'],
  ],
  [
    'api/_lib/http.ts',
    'the header and env names the service reads',
    ["'X-Funancial-Token'", 'FUNANCIAL_ACCESS_TOKEN', 'FUNANCIAL_APP_ORIGIN'],
  ],
  [
    'capacitor.config.ts',
    'the Android application id (a new one is a different app)',
    ["appId: 'io.github.bhccob.funancial'"],
  ],
  [
    'android/app/build.gradle',
    'the Android application id (a new one is a different app)',
    ['applicationId "io.github.bhccob.funancial"', 'namespace = "io.github.bhccob.funancial"'],
  ],
];

describe('internal names that must keep the old spelling', () => {
  it.each(PINNED)('%s: %s', (file, _why, literals) => {
    const source = read(file);
    for (const literal of literals) expect(source, `${file} lost ${literal}`).toContain(literal);
  });

  it('keeps the database names', () => {
    expect(DEFAULT_DB_PREFIX).toBe('funancial');
    expect(dbName('real')).toBe('funancial-real');
    expect(dbName('demo')).toBe('funancial-demo');
  });
});
