import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { FAQ, GLOSSARY, HELP_PAGES, LEGAL, RESULT_ROWS, helpPage } from '.';

/** Every line of help prose, the game page included. */
const allProse = () => [
  ...HELP_PAGES.flatMap((p) => [p.summary, ...p.body]),
  ...GLOSSARY.flatMap((g) => [g.term, g.meaning]),
  ...FAQ.flatMap((f) => [f.q, f.a]),
  ...LEGAL.privacy,
  ...LEGAL.terms,
  ...LEGAL.disclaimers.flatMap((d) => [d.title, d.text]),
];
const page = (id: string) => helpPage(id)!.body.join(' ');

/** The ids the "?" tips link to; changing one breaks those links. */
const PAGE_IDS = [
  'available',
  'limits',
  'salary-freeze',
  'cards',
  'subscriptions',
  'net-worth',
  'investments',
  'dividends',
  'game',
  'glossary',
  'faq',
  'privacy',
  'terms',
];

describe('help pages', () => {
  it('have the ids the tips link to, once each', () => {
    expect(HELP_PAGES.map((p) => p.id).sort()).toEqual([...PAGE_IDS].sort());
  });

  it('are found by id', () => {
    expect(helpPage('available')?.title).toBe('Available to spend');
    expect(helpPage('nope')).toBeUndefined();
  });

  it('have no page about Should I buy it?, and nothing else explains its meter or guard', () => {
    expect(helpPage('buy-it')).toBeUndefined();
    expect(GLOSSARY.map((g) => g.term)).not.toContain('Guard');
    const prose = allProse();
    expect(prose.filter((line) => /buy it|buy check|buy meter/i.test(line))).toEqual([]);
    // Case-sensitive: the page was called About you, and 'nothing about you' is another matter.
    expect(prose.filter((line) => line.includes('About you'))).toEqual([]);
  });

  it('give each page a title, a summary and something to read', () => {
    for (const p of HELP_PAGES) {
      expect(p.title, p.id).not.toBe('');
      expect(p.summary, p.id).not.toBe('');
      expect(p.body.length, p.id).toBeGreaterThan(0);
    }
  });

  it('show the worked example of the rule each page explains', () => {
    const examples = (id: string) => [...(helpPage(id)?.exampleIds ?? [])].sort();
    expect(examples('available')).toEqual(['AVL-1']);
    expect(examples('limits')).toEqual(['LIM-1']);
    expect(examples('salary-freeze')).toEqual(['SAL-1']);
    expect(examples('cards')).toEqual(['BAL-1', 'EXP-1']);
    expect(examples('subscriptions')).toEqual(['SUB-1']);
    expect(examples('net-worth')).toEqual([]);
    expect(examples('investments')).toEqual([]);
  });

  it('name only examples that exist, and leave none out', () => {
    const known = new Set(EXAMPLES.map((e) => e.id));
    const shown = HELP_PAGES.flatMap((p) => p.exampleIds ?? []);
    expect(shown.filter((id) => !known.has(id))).toEqual([]);
    expect([...known].filter((id) => !shown.includes(id))).toEqual([]);
  });

  it('read the limit warnings off the example, not off the page', () => {
    const warnAt = EXAMPLES.find((e) => e.id === 'LIM-1')!.data.tables.budgetLimit[0]!.warnAt;
    for (const n of warnAt) expect(helpPage('limits')!.summary).toContain(`${n}%`);
  });
});

describe('worked example labels', () => {
  it('cover every result key of every example', () => {
    for (const ex of EXAMPLES) {
      for (const key of Object.keys(ex.result)) {
        expect(RESULT_ROWS[key], `${ex.id}.${key}`).toBeDefined();
        expect(RESULT_ROWS[key]!.label, `${ex.id}.${key}`).not.toBe('');
      }
    }
  });

  it('give each key of an example its own label', () => {
    for (const ex of EXAMPLES) {
      const labels = Object.keys(ex.result).map((k) => RESULT_ROWS[k]?.label);
      expect(new Set(labels).size, ex.id).toBe(labels.length);
    }
  });
});

describe('glossary, FAQ and legal text', () => {
  it('are filled in', () => {
    expect(GLOSSARY.length).toBeGreaterThan(10);
    expect(FAQ.length).toBeGreaterThan(5);
    expect(LEGAL.privacy.length).toBeGreaterThan(0);
    expect(LEGAL.terms.length).toBeGreaterThan(0);
    expect(new Set(GLOSSARY.map((g) => g.term)).size).toBe(GLOSSARY.length);
  });

  it('carry the three disclaimers', () => {
    expect(LEGAL.disclaimers.map((d) => d.text)).toEqual([
      'Funcial is not financial advice. It shows your own numbers so you can decide.',
      'Market prices are delayed and may be out of date.',
      "Headlines come from a third party. Funcial doesn't check them.",
    ]);
  });

  it('say what the app does with your data', () => {
    const privacy = LEGAL.privacy.join(' ');
    expect(privacy).toMatch(/on your phone, encrypted/i);
    expect(privacy).toMatch(/no analytics/i);
    expect(privacy).toMatch(/doesn't track how you use it/i);
    expect(privacy).toMatch(/the app's own service/i);
  });

  it('say what an account keeps, who can open it and what the email is for', () => {
    const privacy = LEGAL.privacy.join(' ');
    // Setup asks for an account unless the phone is offline, so neither "no account" nor "optional" is true.
    expect(privacy).not.toMatch(/no account|optional/i);
    expect(privacy).not.toMatch(/does not know who you are/i);
    expect(privacy).toMatch(
      /If you have an account, the app also sends a locked copy of your data to that service, and keeps it there/,
    );
    expect(privacy).toMatch(/so you can move to a new phone/i);
    expect(privacy).toMatch(/email is used only for "forgot password"/i);
    // Plain that the owner could read the money data, not only that the owner runs the service.
    expect(privacy).toMatch(
      /the service can unlock the copy, so the app's owner, who runs it, and anyone who got into the owner's Vercel account could read it/,
    );
  });

  it("calls the server the app's own service on the Privacy page, never the price service", () => {
    expect(LEGAL.privacy.join(' ')).not.toMatch(/price service/i);
  });

  it('says the lookups also fetch company logos, by symbol, and promises only for the lookups', () => {
    const line = LEGAL.privacy.find((l) => /company logos/.test(l))!;
    expect(line).toMatch(/the only network calls go to the app's own service/);
    expect(line).toMatch(/company logos \(by symbol\)/);
    // Account calls carry the locked copy, so the promise is the lookups', not every call's.
    expect(line).toMatch(/A lookup carries only what is needed to look something up/);
    expect(line).toMatch(/Never your amounts, balances or notes\./);
  });

  it('says Delete all data starts the account copy over too, and how the account goes', () => {
    const line = LEGAL.privacy.find((l) => /Delete all data/.test(l))!;
    expect(line).toMatch(/erases everything you added/);
    expect(line).toMatch(
      /With an account, its locked copy starts over with the phone, keeping only your name, currency and settings\./,
    );
    expect(line).toMatch(/stay on the service until you delete them/);
    // Only the phone that holds the account can delete it; a phone the account moved from cannot.
    expect(line).toMatch(/delete them from the phone you use it on/);
    expect(line).toContain('Turn off and delete my copy');
    expect(line).toMatch(/ask the app's owner to remove them/);
  });

  it('warns in the terms that an account copy is as is, with no promise it will always be there', () => {
    const line = LEGAL.terms.find((l) => /account/.test(l))!;
    expect(line).toBe(
      'If you make an account, its locked copy is kept on a service one person runs, as is, with no promise it will always be there.',
    );
  });

  it('has no help, FAQ, privacy or terms line about backups, files or exports', () => {
    // The account's copy is the backup now; the app no longer makes or restores files.
    expect(allProse().filter((line) => /backup|back up|funbak|export/i.test(line))).toEqual([]);
    expect(FAQ.some((f) => /passphrase/i.test(f.q))).toBe(false);
  });

  it('names where your data lives as the summary of the Privacy page', () => {
    expect(helpPage('privacy')!.summary).toBe('Where your data lives');
  });

  it('answers how to move phones with log in, and a forgotten password with the emailed link', () => {
    const move = FAQ.find((f) => f.q === 'How do I move to a new phone?')!.a;
    expect(move).toMatch(/log in/i);
    expect(move).toContain('made an account on the old phone');
    const forgot = FAQ.find((f) => f.q === 'I forgot my password')!.a;
    expect(forgot).toContain('Forgot password?');
    expect(forgot).toMatch(/emails? you a link/);
  });

  it('answers where the data goes without the old stays-on-your-phone claim', () => {
    const answer = FAQ.find((f) => /sent anywhere/.test(f.q))!.a;
    expect(answer).toMatch(/lives on your phone, encrypted/);
    expect(answer).toMatch(/account keeps a locked copy/);
    expect(allProse().join(' ')).not.toMatch(/stays on your phone|no account/i);
  });
});

describe('help copy says what the code does', () => {
  it('names the card payment wherever it names the bills still to come', () => {
    const mentions = allProse().filter((line) => /bills still to come/.test(line));
    expect(mentions.length).toBeGreaterThanOrEqual(3);
    for (const line of mentions) {
      expect(line).toMatch(
        /bills still to come this month, plus the next payment due on each credit card/,
      );
    }
    expect(allProse().filter((line) => /due this month/.test(line))).toEqual([]);
    expect(GLOSSARY.find((g) => g.term === 'Upcoming bill')!.meaning).toMatch(
      /renewal still to come this month, or the next payment due on a credit card/,
    );
  });

  it('says a subscription is an upcoming bill once its renewal is in the current month', () => {
    expect(page('subscriptions')).toMatch(/renewal falls in the current month/);
  });

  it('lists what a lookup carries on the Privacy page, and the FAQ points there', () => {
    const privacy = LEGAL.privacy.join(' ');
    const carried = ['a symbol', 'the text you type in search', 'a currency pair', 'a start date'];
    for (const item of carried) expect(privacy).toContain(item);
    // The product-link fill is gone, so the page must not describe it.
    expect(privacy).not.toMatch(/pasted link|product link/);
    expect(privacy).toMatch(/never your amounts, balances or notes/i);
    expect(privacy).not.toMatch(/money data/i);

    const answer = FAQ.find((f) => /sent anywhere/.test(f.q))!.a;
    expect(answer).toContain('Privacy page');
    expect(answer).not.toMatch(/exchange rates|symbol/);
  });

  it('opens the service line by setting the update check apart from it', () => {
    expect(LEGAL.privacy.join(' ')).toContain(
      "Apart from the update check below, the only network calls go to the app's own service.",
    );
  });

  it('says an app installed from the download page checks it for a newer version, and sends nothing', () => {
    expect(LEGAL.privacy).toContain(
      'An app installed from the download page also checks that page for a newer version. That check carries nothing about you.',
    );
  });

  it('counts streaks in days, weeks or months', () => {
    expect(GLOSSARY.find((g) => g.term === 'Streak')!.meaning).toContain('days, weeks or months');
    expect(page('game')).toContain('days, weeks or months');
  });

  it('says what each streak freeze covers: a day, or a week', () => {
    expect(page('game')).toMatch(/logging freeze covers one missed day/);
    expect(page('game')).toMatch(/check-in freeze covers one missed week/);
  });

  it('compares available to spend with cash plus savings, not cash', () => {
    expect(FAQ[0]!.q).toContain('cash plus savings');
    expect(page('available')).toContain('lower than your cash plus savings');
  });

  it('names the glossary in the summary of Words, so a search for it finds the page', () => {
    expect(helpPage('glossary')!.summary.toLowerCase()).toContain('glossary');
  });
});

describe('numbers in help prose', () => {
  it('come from the examples or the app, never typed in', () => {
    // The game page reads its numbers from the game rules.
    const prose = [
      ...HELP_PAGES.filter((p) => p.id !== 'game').flatMap((p) => p.body),
      ...GLOSSARY.flatMap((g) => [g.term, g.meaning]),
      ...FAQ.flatMap((f) => [f.q, f.a]),
      ...LEGAL.privacy,
      ...LEGAL.terms,
      ...LEGAL.disclaimers.flatMap((d) => [d.title, d.text]),
    ];
    expect(prose.filter((line) => /\d/.test(line))).toEqual([]);
  });
});
