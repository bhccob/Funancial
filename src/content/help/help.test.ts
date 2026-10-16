import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '@/domain/examples';
import { FAQ, GLOSSARY, HELP_PAGES, LEGAL, RESULT_ROWS, helpPage } from '.';

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
  'buy-it',
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
      'Funancial is not financial advice. It shows your own numbers so you can decide.',
      'Market prices are delayed and may be out of date.',
      "Headlines come from a third party. Funancial doesn't check them.",
    ]);
  });

  it('say what the app does with your data', () => {
    const privacy = LEGAL.privacy.join(' ');
    expect(privacy).toMatch(/on your phone, encrypted/i);
    expect(privacy).toMatch(/no account/i);
    expect(privacy).toMatch(/no analytics/i);
    expect(privacy).toMatch(/price service/i);
    expect(privacy).toMatch(/never your money data/i);
    expect(privacy).toMatch(/passphrase/i);
  });
});

describe('numbers in help prose', () => {
  it('come from the examples or the app, never typed in', () => {
    // The game and buy-it pages read theirs from the game rules and the meter's constants.
    const prose = [
      ...HELP_PAGES.filter((p) => p.id !== 'game' && p.id !== 'buy-it').flatMap((p) => p.body),
      ...GLOSSARY.flatMap((g) => [g.term, g.meaning]),
      ...FAQ.flatMap((f) => [f.q, f.a]),
      ...LEGAL.privacy,
      ...LEGAL.terms,
      ...LEGAL.disclaimers.flatMap((d) => [d.title, d.text]),
    ];
    expect(prose.filter((line) => /\d/.test(line))).toEqual([]);
  });
});
