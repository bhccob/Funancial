import { describe, expect, it } from 'vitest';
import { makeDividend, makeHolding, makeProfile } from '@/test/fixtures';
import { addDays } from './dates';
import {
  dividendTotals,
  duePayouts,
  expectedPayouts,
  inferFrequency,
  monthlyIncome,
  projectedAnnual,
  settledPayouts,
  topPayers,
} from './dividends';
import type { Dividend, Holding } from './entities';
import { emptySnapshot } from './snapshot';

type Info = NonNullable<Holding['dividendInfo']>;

const TODAY = '2026-10-16';
const QUARTERLY = [
  { date: '2025-10-15', amount: 0.48 },
  { date: '2026-01-15', amount: 0.485 },
  { date: '2026-04-15', amount: 0.485 },
  { date: '2026-07-15', amount: 0.485 },
];

function info(extra: Partial<Info> = {}): Info {
  return {
    history: QUARTERLY,
    nextExDate: null,
    nextPayDate: null,
    nextAmount: null,
    fetchedAt: '2026-10-16T08:00:00.000Z',
    ...extra,
  };
}

function payer(extra: Partial<Info> = {}, over: Partial<Holding> = {}) {
  return makeHolding({
    symbol: 'KO',
    currency: 'USD',
    shares: 10,
    purchaseDate: '2025-01-01',
    withholdingPct: 0,
    dividendInfo: info(extra),
    ...over,
  });
}

function dataOf(holdings: Holding[], currency = 'USD') {
  const data = emptySnapshot();
  data.tables.profile = [makeProfile({ currency })];
  data.tables.holding = holdings;
  return data;
}

const dates = (xs: Array<{ exDate: string | null; payDate: string }>) =>
  xs.map((p) => [p.exDate, p.payDate]);

describe('inferFrequency', () => {
  const every = (days: number, count = 5) =>
    Array.from({ length: count }, (_, i) => ({ date: addDays('2024-01-01', i * days), amount: 1 }));

  it('reads the usual gap off the history', () => {
    expect(inferFrequency(every(30))).toBe('monthly');
    expect(inferFrequency(every(91))).toBe('quarterly');
    expect(inferFrequency(every(182))).toBe('semiannual');
    expect(inferFrequency(every(365))).toBe('annual');
    expect(inferFrequency(QUARTERLY)).toBe('quarterly');
  });

  it('draws its lines at 45, 120, 240 and 400 days', () => {
    expect(inferFrequency(every(45))).toBe('monthly');
    expect(inferFrequency(every(46))).toBe('quarterly');
    expect(inferFrequency(every(120))).toBe('quarterly');
    expect(inferFrequency(every(121))).toBe('semiannual');
    expect(inferFrequency(every(240))).toBe('semiannual');
    expect(inferFrequency(every(241))).toBe('annual');
    expect(inferFrequency(every(400))).toBe('annual');
    expect(inferFrequency(every(401))).toBeNull();
  });

  it('uses the median gap, so one odd gap does not decide it', () => {
    const history = [
      { date: '2025-01-01', amount: 1 },
      { date: '2025-04-02', amount: 1 },
      { date: '2025-07-02', amount: 1 },
      { date: '2026-08-06', amount: 1 }, // a missed year
    ];
    expect(inferFrequency(history)).toBe('quarterly');
  });

  it('needs two entries, and does not mind their order', () => {
    expect(inferFrequency([])).toBeNull();
    expect(inferFrequency([{ date: '2026-01-01', amount: 1 }])).toBeNull();
    expect(inferFrequency([...QUARTERLY].reverse())).toBe('quarterly');
  });
});

describe('expectedPayouts', () => {
  it('infers quarterly from the history and steps the next payouts', () => {
    const data = dataOf([payer()]);
    const out = expectedPayouts(data, 'USD', '2026-07-01', '2027-04-30', TODAY);
    // The last history entry is a real ex-date, paid 14 days later with no pay date to go by; the
    // rest step forward three months at a time.
    expect(dates(out)).toEqual([
      ['2026-07-15', '2026-07-29'],
      ['2026-10-15', '2026-10-29'],
      ['2027-01-15', '2027-01-29'],
      ['2027-04-15', '2027-04-29'],
    ]);
    expect(out.every((p) => p.perShare === 0.485)).toBe(true);
    expect(out[0]!.holding.symbol).toBe('KO');
  });

  it('prefers Yahoo next dates, and drops payouts already confirmed or skipped', () => {
    const ko = payer({ nextExDate: '2026-10-20', nextPayDate: '2026-11-03', nextAmount: 0.5 });
    // A second KO lot, still held: its records are its own.
    const lot = makeHolding({ id: 'someone-else', symbol: 'KO' });
    const data = dataOf([ko, lot]);
    const window = ['2026-10-16', '2027-06-30', TODAY] as const;

    const all = expectedPayouts(data, 'USD', ...window);
    // The pay date follows the ex-date by the same 14 days each time.
    expect(dates(all)).toEqual([
      ['2026-10-20', '2026-11-03'],
      ['2027-01-20', '2027-02-03'],
      ['2027-04-20', '2027-05-04'],
    ]);
    expect(all.map((p) => p.perShare)).toEqual([0.5, 0.5, 0.5]);

    data.tables.dividend = [
      makeDividend({ holdingId: ko.id, expectedPayDate: '2026-11-03', status: 'confirmed' }),
      makeDividend({
        holdingId: ko.id,
        expectedPayDate: '2027-02-03',
        status: 'skipped',
        amount: 0,
        bucket: null,
      }),
      // Another holding's record with a matching date does not hide this one.
      makeDividend({ holdingId: 'someone-else', expectedPayDate: '2027-05-04' }),
    ];
    expect(expectedPayouts(data, 'USD', ...window).map((p) => p.payDate)).toEqual(['2027-05-04']);
  });

  it('shows a past Yahoo payout as due until it is confirmed', () => {
    // Yahoo reports the latest announced payout, which is often already behind us.
    const ko = payer({ nextExDate: '2026-09-15', nextPayDate: '2026-10-01', nextAmount: 0.51 });
    const data = dataOf([ko]);
    const due = duePayouts(data, 'USD', TODAY);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ exDate: '2026-09-15', payDate: '2026-10-01', perShare: 0.51 });
    expect(due[0]!.net).toBe(5_10);

    data.tables.dividend = [makeDividend({ holdingId: ko.id, expectedPayDate: '2026-10-01' })];
    expect(duePayouts(data, 'USD', TODAY)).toEqual([]);
  });

  it('keeps a payout due for 60 days after its pay date, and not a day longer', () => {
    const due = (payDate: string) =>
      duePayouts(
        dataOf([payer({ history: [], nextPayDate: payDate, nextAmount: 1 })]),
        'USD',
        TODAY,
      );
    expect(due('2026-10-16')).toHaveLength(1); // pays today
    expect(due('2026-08-17')).toHaveLength(1); // 60 days ago
    expect(due('2026-08-16')).toEqual([]); // 61 days ago
    expect(due('2026-10-17')).toEqual([]); // not paid yet
  });

  it('does not bring a confirmed payout back when its real date replaces the inferred one', () => {
    const history = [
      { date: '2025-09-12', amount: 0.485 },
      { date: '2025-12-12', amount: 0.485 },
      { date: '2026-03-12', amount: 0.485 },
      { date: '2026-06-12', amount: 0.485 },
    ];
    const ko = payer({ history });
    const data = dataOf([ko]);
    // Nothing is announced, so the next payout is inferred a quarter after the last one.
    expect(dates(duePayouts(data, 'USD', '2026-09-28'))).toEqual([['2026-09-12', '2026-09-26']]);

    data.tables.dividend = [makeDividend({ holdingId: ko.id, expectedPayDate: '2026-09-26' })];
    expect(duePayouts(data, 'USD', '2026-09-28')).toEqual([]);

    // The real ex-date lands in the history six days later and becomes the latest payout.
    const real = { date: '2026-09-18', amount: 0.485 };
    data.tables.holding = [{ ...ko, dividendInfo: info({ history: [...history, real] }) }];
    expect(duePayouts(data, 'USD', '2026-10-04')).toEqual([]);
    expect(expectedPayouts(data, 'USD', '2026-09-01', '2026-11-30', '2026-10-04')).toEqual([]);
    // The next quarter's payout is still expected.
    const next = expectedPayouts(data, 'USD', '2026-09-01', '2027-01-31', '2026-10-04');
    expect(dates(next)).toEqual([['2026-12-18', '2027-01-01']]);
  });

  it('settles a payout by a record within half a step of it, and not by a farther one', () => {
    // [days between payouts, the first distance in days that no longer settles]
    const cases = [
      [30, 15],
      [91, 45],
      [182, 90],
      [365, 180],
    ] as const;
    const skipped = { status: 'skipped', amount: 0, bucket: null } as const;
    const shown = (ko: Holding, daysAway: number) => {
      const data = dataOf([ko]);
      data.tables.dividend = [
        makeDividend({
          ...skipped,
          holdingId: ko.id,
          expectedPayDate: addDays('2026-09-12', -daysAway),
        }),
      ];
      return expectedPayouts(data, 'USD', '2026-09-01', '2026-09-30', '2026-09-30').length;
    };
    const announced = { nextExDate: '2026-09-05', nextPayDate: '2026-09-12', nextAmount: 1 };
    for (const [step, within] of cases) {
      const history = [-2 * step, -step, 0].map((d) => ({
        date: addDays('2026-01-01', d),
        amount: 1,
      }));
      const ko = payer({ history, ...announced });
      expect([step, shown(ko, within - 1), shown(ko, within)]).toEqual([step, 0, 1]);
      expect([step, shown(ko, -(within - 1)), shown(ko, -within)]).toEqual([step, 0, 1]);
    }
    // With no frequency to go by, half a quarter.
    const unknown = payer({ history: [], ...announced });
    expect([shown(unknown, 44), shown(unknown, 45)]).toEqual([0, 1]);
  });

  it('ignores a stale Yahoo pay date from before the ex-date', () => {
    // Yahoo can keep last cycle's pay date next to a newer ex-date, which would be a negative lag.
    const ko = payer({ nextExDate: '2026-10-20', nextPayDate: '2026-07-30', nextAmount: 0.5 });
    const out = expectedPayouts(dataOf([ko]), 'USD', '2026-10-16', '2027-02-28', TODAY);
    expect(dates(out)).toEqual([
      ['2026-10-20', '2026-11-03'],
      ['2027-01-20', '2027-02-03'],
    ]);
    // A pay date on the ex-date itself is not stale.
    const same = payer({ nextExDate: '2026-10-20', nextPayDate: '2026-10-20', nextAmount: 0.5 });
    expect(
      dates(expectedPayouts(dataOf([same]), 'USD', '2026-10-16', '2026-10-31', TODAY)),
    ).toEqual([['2026-10-20', '2026-10-20']]);
  });

  it('pays 14 days after the ex-date when Yahoo has no pay date', () => {
    const ko = payer({ nextExDate: '2026-10-30', nextPayDate: null, nextAmount: 0.5 });
    const out = expectedPayouts(dataOf([ko]), 'USD', '2026-10-16', '2027-02-28', TODAY);
    expect(dates(out)).toEqual([
      ['2026-10-30', '2026-11-13'],
      ['2027-01-30', '2027-02-13'],
    ]);
  });

  it('works from a pay date alone, with no ex-date to show', () => {
    const ko = payer({ nextExDate: null, nextPayDate: '2026-10-30', nextAmount: 0.5 });
    const out = expectedPayouts(dataOf([ko]), 'USD', '2026-10-16', '2027-02-28', TODAY);
    // Later payouts step from a guessed ex-date 14 days before that pay date.
    expect(dates(out)).toEqual([
      [null, '2026-10-30'],
      ['2027-01-16', '2027-01-30'],
    ]);
  });

  it('leaves out a payout whose ex-date is before the purchase date', () => {
    const ko = payer(
      { nextExDate: '2026-09-15', nextPayDate: '2026-10-01', nextAmount: 0.5 },
      { purchaseDate: '2026-09-20' },
    );
    // The first payout pays after the purchase, but the ex-date passed before it: not earned.
    const out = expectedPayouts(dataOf([ko]), 'USD', '2026-08-01', '2027-02-28', TODAY);
    expect(dates(out)).toEqual([['2026-12-15', '2026-12-31']]);
  });

  it('compares the pay date to the purchase date when there is no ex-date', () => {
    const early = payer(
      { nextExDate: null, nextPayDate: '2026-09-30', nextAmount: 0.5 },
      { purchaseDate: '2026-10-01' },
    );
    const out = expectedPayouts(dataOf([early]), 'USD', '2026-08-01', '2026-12-31', TODAY);
    expect(out.map((p) => p.payDate)).toEqual(['2026-12-30']);
    const same = payer(
      { nextExDate: '2026-10-01', nextAmount: 0.5 },
      { purchaseDate: '2026-10-01' },
    );
    expect(expectedPayouts(dataOf([same]), 'USD', '2026-08-01', '2026-10-31', TODAY)).toHaveLength(
      1,
    );
  });

  it('steps by the inferred frequency and keeps to the anchor day of the month', () => {
    const monthly = payer({
      history: [
        { date: '2026-06-30', amount: 0.1 },
        { date: '2026-07-31', amount: 0.1 },
      ],
      nextExDate: '2026-08-31',
    });
    const out = expectedPayouts(dataOf([monthly]), 'USD', '2026-08-15', '2027-01-15', TODAY);
    expect(out.map((p) => p.exDate)).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ]);

    // Seen from New Year's Day 2026, so neither has gone two steps without a payout.
    const newYear = '2026-01-01';
    const semiannual = payer({
      history: [
        { date: '2025-03-10', amount: 1 },
        { date: '2025-09-10', amount: 1 },
      ],
    });
    const half = expectedPayouts(dataOf([semiannual]), 'USD', newYear, '2027-12-31', newYear);
    expect(half.map((p) => p.exDate)).toEqual([
      '2026-03-10',
      '2026-09-10',
      '2027-03-10',
      '2027-09-10',
    ]);

    const annual = payer({
      history: [
        { date: '2024-12-01', amount: 2 },
        { date: '2025-12-01', amount: 2 },
      ],
    });
    const year = expectedPayouts(dataOf([annual]), 'USD', newYear, '2028-12-31', newYear);
    expect(year.map((p) => p.exDate)).toEqual(['2026-12-01', '2027-12-01', '2028-12-01']);
  });

  it('expects one payout and no more when the frequency is unknown', () => {
    const one = payer({ history: [{ date: '2026-12-01', amount: 2 }] });
    expect(
      expectedPayouts(dataOf([one]), 'USD', '2026-01-01', '2029-01-01', TODAY).map(
        (p) => p.payDate,
      ),
    ).toEqual(['2026-12-15']);
  });

  it('skips holdings with no dividend data or no amount to expect', () => {
    const none = makeHolding({ dividendInfo: null });
    const noAmount = payer({ history: [], nextExDate: '2026-11-01', nextAmount: null });
    const noDates = payer({ history: [], nextExDate: null, nextPayDate: null, nextAmount: 1 });
    expect(
      expectedPayouts(dataOf([none, noAmount, noDates]), 'USD', '2026-01-01', '2028-01-01', TODAY),
    ).toEqual([]);
  });

  it('sorts holdings’ payouts together by pay date', () => {
    const a = payer({ nextExDate: '2026-12-10', nextAmount: 1 }, { symbol: 'AAA' });
    const b = payer({ nextExDate: '2026-11-05', nextAmount: 1 }, { symbol: 'BBB' });
    const out = expectedPayouts(dataOf([a, b]), 'USD', '2026-10-16', '2026-12-31', TODAY);
    expect(out.map((p) => [p.payDate, p.holding.symbol])).toEqual([
      ['2026-11-19', 'BBB'],
      ['2026-12-24', 'AAA'],
    ]);
  });

  it('applies withholding and the rate to the net amount', () => {
    // 10 sh × 0.485 USD × 0.85 (15% withheld) × 0.92 EUR per USD = 3.79 EUR
    const ko = payer(
      { nextExDate: '2026-11-05', nextAmount: 0.485 },
      {
        withholdingPct: 15,
        quote: { price: 60, previousClose: null, fxRate: 0.92, asOf: '2026-10-16T08:00:00.000Z' },
      },
    );
    const [p] = expectedPayouts(dataOf([ko], 'EUR'), 'EUR', '2026-10-16', '2026-11-30', TODAY);
    expect(p!.net).toBe(379);
  });

  it('has no net amount when the rate is unknown, and needs none in the profile currency', () => {
    const noRate = payer({ nextExDate: '2026-11-05', nextAmount: 0.485 }, { withholdingPct: 15 });
    const net = (currency: string) =>
      expectedPayouts(dataOf([noRate], currency), currency, '2026-10-16', '2026-11-30', TODAY)[0]!
        .net;
    expect(net('EUR')).toBeNull();
    expect(net('USD')).toBe(412);
  });
});

describe('expectedPayouts from history, Yahoo next and forward steps', () => {
  const O_HISTORY = [
    '2025-10-31',
    '2025-11-28',
    '2025-12-31',
    '2026-01-30',
    '2026-02-27',
    '2026-03-31',
    '2026-04-30',
    '2026-05-29',
    '2026-06-30',
    '2026-07-31',
    '2026-08-29',
    '2026-09-30',
  ].map((date) => ({ date, amount: 0.2695 }));

  it('keeps the past payouts of a monthly payer due while Yahoo shows the next one', () => {
    // O: Yahoo already announces ex 30 Oct / pay 13 Nov; its 14-day gap dates the past payouts.
    const o = payer(
      {
        history: O_HISTORY,
        nextExDate: '2026-10-30',
        nextPayDate: '2026-11-13',
        nextAmount: 0.2695,
      },
      { symbol: 'O' },
    );
    const data = dataOf([o]);
    expect(dates(duePayouts(data, 'USD', TODAY))).toEqual([
      ['2026-08-29', '2026-09-12'],
      ['2026-09-30', '2026-10-14'],
    ]);
    expect(dates(expectedPayouts(data, 'USD', '2026-06-01', TODAY, TODAY))).toEqual([
      ['2026-05-29', '2026-06-12'],
      ['2026-06-30', '2026-07-14'],
      ['2026-07-31', '2026-08-14'],
      ['2026-08-29', '2026-09-12'],
      ['2026-09-30', '2026-10-14'],
    ]);
  });

  it('keeps a quarterly payout due after Yahoo moves on to the next one', () => {
    const history = [
      { date: '2025-11-28', amount: 0.51 },
      { date: '2026-03-13', amount: 0.51 },
      { date: '2026-06-13', amount: 0.51 },
      { date: '2026-09-15', amount: 0.51 },
    ];
    // KO while Yahoo still shows the October payout, and once it shows December's.
    const before = payer({
      history,
      nextExDate: '2026-09-15',
      nextPayDate: '2026-10-01',
      nextAmount: 0.51,
    });
    const after = payer({
      history,
      nextExDate: '2026-11-29',
      nextPayDate: '2026-12-15',
      nextAmount: 0.53,
    });
    for (const ko of [before, after]) {
      const data = dataOf([ko]);
      expect(dates(duePayouts(data, 'USD', TODAY))).toEqual([['2026-09-15', '2026-10-01']]);
      expect(duePayouts(data, 'USD', TODAY)[0]!.perShare).toBe(0.51);
      data.tables.dividend = [makeDividend({ holdingId: ko.id, expectedPayDate: '2026-10-01' })];
      expect(duePayouts(data, 'USD', TODAY)).toEqual([]);
    }
  });

  it('takes a history entry on Yahoo’s next ex-date as that payout, not a second one', () => {
    const ko = payer(
      {
        history: [{ date: '2026-10-10', amount: 0.53 }],
        nextExDate: '2026-10-10',
        nextPayDate: '2026-10-13',
        nextAmount: 0.53,
      },
      { purchaseDate: '2026-09-16' },
    );
    const data = dataOf([ko]);
    expect(duePayouts(data, 'USD', TODAY)).toMatchObject([
      {
        exDate: '2026-10-10',
        payDate: '2026-10-13',
        exDateKnown: true,
        payDateKnown: true,
        perShare: 0.53,
      },
    ]);
    expect(expectedPayouts(data, 'USD', '2026-01-01', '2027-12-31', TODAY)).toHaveLength(1);
  });

  it('expects no more payouts once a dividend has been missed for over two steps', () => {
    // Quarterly payouts ending on `last`: two quarters before today is 2026-04-16.
    const endingOn = (last: string) =>
      payer({ history: [-273, -182, -91, 0].map((d) => ({ date: addDays(last, d), amount: 1 })) });
    const ahead = (ko: Holding) =>
      expectedPayouts(dataOf([ko]), 'USD', TODAY, addDays(TODAY, 364), TODAY).map((p) => p.payDate);
    expect(ahead(endingOn('2026-04-16'))).toEqual([
      '2026-10-30',
      '2027-01-30',
      '2027-04-30',
      '2027-07-30',
    ]);
    expect(ahead(endingOn('2026-04-15'))).toEqual([]);
    // Yahoo's next ex-date counts as the latest payout too.
    expect(ahead(payer({ history: endingOn('2026-01-15').dividendInfo!.history }))).toEqual([]);
    expect(
      ahead(
        payer({
          history: endingOn('2026-01-15').dividendInfo!.history,
          nextExDate: '2026-04-20',
          nextAmount: 1,
        }),
      ),
    ).toEqual(['2026-11-03', '2027-02-03', '2027-05-04', '2027-08-03']);
    // With no frequency there is no step to take, recent or not: only the payout that is known.
    for (const date of ['2025-09-10', '2026-09-10']) {
      const once = payer({ history: [{ date, amount: 1 }] });
      expect(
        expectedPayouts(dataOf([once]), 'USD', '2025-01-01', '2028-12-31', TODAY).map(
          (p) => p.exDate,
        ),
      ).toEqual([date]);
    }
  });

  it('pays 14 days after the ex-date when Yahoo gives no gap to go by', () => {
    // History alone, Yahoo's ex-date alone, and a stale Yahoo pay date.
    expect(
      dates(expectedPayouts(dataOf([payer()]), 'USD', '2026-07-01', '2026-11-30', TODAY)),
    ).toEqual([
      ['2026-07-15', '2026-07-29'],
      ['2026-10-15', '2026-10-29'],
    ]);
    for (const nextPayDate of [null, '2026-07-30']) {
      const ko = payer({ nextExDate: '2026-10-20', nextPayDate, nextAmount: 0.5 });
      expect(dates(expectedPayouts(dataOf([ko]), 'USD', TODAY, '2026-11-30', TODAY))).toEqual([
        ['2026-10-20', '2026-11-03'],
      ]);
    }
    // Yahoo's own gap dates the history payouts as well.
    const known = payer({ nextExDate: '2026-10-20', nextPayDate: '2026-10-23', nextAmount: 0.5 });
    expect(
      dates(expectedPayouts(dataOf([known]), 'USD', '2026-07-01', '2026-10-31', TODAY)),
    ).toEqual([
      ['2026-07-15', '2026-07-18'],
      ['2026-10-20', '2026-10-23'],
    ]);
  });

  it('says which dates are real and which are guessed', () => {
    const ko = payer({ nextExDate: '2026-10-20', nextPayDate: '2026-11-03', nextAmount: 0.5 });
    const out = expectedPayouts(dataOf([ko]), 'USD', '2026-07-01', '2027-02-28', TODAY);
    expect(out.map((p) => [p.exDate, p.exDateKnown, p.payDate, p.payDateKnown])).toEqual([
      ['2026-07-15', true, '2026-07-29', false], // history: a real ex-date, paid after the gap
      ['2026-10-20', true, '2026-11-03', true], // Yahoo's next
      ['2027-01-20', false, '2027-02-03', false], // a step forward
    ]);
    const only = (extra: Partial<Info>) =>
      expectedPayouts(
        dataOf([payer({ history: [], nextAmount: 0.5, ...extra })]),
        'USD',
        TODAY,
        '2026-12-31',
        TODAY,
      );
    expect(only({ nextExDate: '2026-10-20' })).toMatchObject([
      { exDate: '2026-10-20', exDateKnown: true, payDate: '2026-11-03', payDateKnown: false },
    ]);
    expect(only({ nextExDate: '2026-10-20', nextPayDate: '2026-07-30' })).toMatchObject([
      { exDateKnown: true, payDateKnown: false },
    ]);
    expect(only({ nextPayDate: '2026-11-03' })).toMatchObject([
      { exDate: null, exDateKnown: false, payDate: '2026-11-03', payDateKnown: true },
    ]);
  });

  it('settles by symbol a record whose holding was deleted, and by holding otherwise', () => {
    const announced = { nextExDate: '2026-09-15', nextPayDate: '2026-10-01', nextAmount: 0.51 };
    const ko = payer(announced);
    const data = dataOf([ko]);
    // Confirmed on a KO holding that was then deleted and added again.
    data.tables.dividend = [
      makeDividend({ holdingId: 'deleted', symbol: 'KO', expectedPayDate: '2026-10-01' }),
    ];
    expect(duePayouts(data, 'USD', TODAY)).toEqual([]);
    // A deleted holding of another symbol settles nothing here.
    data.tables.dividend = [
      makeDividend({ holdingId: 'deleted', symbol: 'PEP', expectedPayDate: '2026-10-01' }),
    ];
    expect(duePayouts(data, 'USD', TODAY)).toHaveLength(1);
    // A second KO lot that is still held keeps its records to itself.
    const lot = payer(announced);
    data.tables.holding = [ko, lot];
    data.tables.dividend = [
      makeDividend({ holdingId: lot.id, symbol: 'KO', expectedPayDate: '2026-10-01' }),
    ];
    expect(duePayouts(data, 'USD', TODAY).map((p) => p.holding.id)).toEqual([ko.id]);
  });
});

describe('settledPayouts', () => {
  it('lists the payouts that records settle, by the rule that hides them from the expected', () => {
    const ko = payer({ nextExDate: '2026-09-15', nextPayDate: '2026-10-01', nextAmount: 0.51 });
    const data = dataOf([ko]);
    // Recorded at the end of September, for the payout that paid on 1 October.
    data.tables.dividend = [makeDividend({ holdingId: ko.id, expectedPayDate: '2026-09-28' })];
    expect(dates(settledPayouts(data, 'USD', '2026-10-01', '2026-10-31', TODAY))).toEqual([
      ['2026-09-15', '2026-10-01'],
    ]);
    expect(expectedPayouts(data, 'USD', '2026-10-01', '2026-10-31', TODAY)).toEqual([]);
    expect(settledPayouts(data, 'USD', '2026-09-01', '2026-09-30', TODAY)).toEqual([]);
  });
});

describe('dividendTotals', () => {
  it('totals confirmed dividends by month, quarter and year, reinvest included', () => {
    const data = dataOf([]);
    const paid = (paidOn: string, amount: number, over: Partial<Dividend> = {}) =>
      makeDividend({ paidOn, amount, ...over });
    data.tables.dividend = [
      paid('2026-11-05', 10_00),
      paid('2026-10-12', 20_00, { bucket: 'reinvest', sharesAdded: 0.3 }),
      paid('2026-09-30', 40_00, { bucket: 'savings' }),
      paid('2025-12-31', 80_00),
      paid('2026-11-06', 0, { status: 'skipped', bucket: null }),
    ];
    expect(dividendTotals(data, '2026-11-20')).toEqual({
      month: 10_00,
      quarter: 30_00,
      year: 70_00,
    });
    expect(dividendTotals(data, '2027-02-01')).toEqual({ month: 0, quarter: 0, year: 0 });
  });
});

describe('projections', () => {
  const ko = payer({ nextExDate: '2026-11-10', nextPayDate: '2026-11-25', nextAmount: 0.5 });

  it('projects the net of the next 365 days', () => {
    // 25 Nov, 25 Feb, 25 May and 25 Aug at 5.00 each; the next one, 25 Nov 2027, is out of reach.
    expect(projectedAnnual(dataOf([ko]), 'USD', TODAY)).toBe(20_00);
  });

  it('counts a payout 364 days out but not 365', () => {
    const edge = payer({ history: [], nextPayDate: '2027-10-15', nextAmount: 1 });
    expect(projectedAnnual(dataOf([edge]), 'USD', TODAY)).toBe(10_00);
    const past = payer({ history: [], nextPayDate: '2027-10-16', nextAmount: 1 });
    expect(projectedAnnual(dataOf([past]), 'USD', TODAY)).toBe(0);
  });

  it('does not project a payout that has no rate', () => {
    const noRate = payer({ nextExDate: '2026-11-10', nextAmount: 1 }, { currency: 'GBP' });
    expect(projectedAnnual(dataOf([noRate]), 'USD', TODAY)).toBe(0);
  });

  it('lists the next 12 months of expected income, this month first', () => {
    const next = monthlyIncome(dataOf([ko]), 'USD', TODAY, 'next');
    expect(next).toHaveLength(12);
    expect(next[0]).toEqual({ month: '2026-10', amount: 0 });
    expect(next[11]!.month).toBe('2027-09');
    expect(next.filter((m) => m.amount > 0)).toEqual([
      { month: '2026-11', amount: 5_00 },
      { month: '2027-02', amount: 5_00 },
      { month: '2027-05', amount: 5_00 },
      { month: '2027-08', amount: 5_00 },
    ]);
  });

  it('lists the last 12 months of confirmed income, this month last', () => {
    const data = dataOf([ko]);
    const paid = (paidOn: string, amount: number, over: Partial<Dividend> = {}) =>
      makeDividend({ paidOn, amount, ...over });
    data.tables.dividend = [
      paid('2026-10-05', 11_20),
      paid('2026-10-14', 1_00),
      paid('2026-09-20', 5_00, { bucket: 'reinvest', sharesAdded: 0.1 }),
      paid('2025-11-01', 3_00),
      paid('2025-10-31', 9_99), // 13 months back
      paid('2026-08-10', 0, { status: 'skipped', bucket: null }),
    ];
    const past = monthlyIncome(data, 'USD', TODAY, 'past');
    expect(past).toHaveLength(12);
    expect(past[0]).toEqual({ month: '2025-11', amount: 3_00 });
    expect(past[10]).toEqual({ month: '2026-09', amount: 5_00 });
    expect(past[11]).toEqual({ month: '2026-10', amount: 12_20 });
    expect(past.reduce((s, m) => s + m.amount, 0)).toBe(20_20);
  });

  it('ranks the holdings by what they are expected to pay in a year', () => {
    const big = payer({ nextExDate: '2026-11-10', nextAmount: 2 }, { symbol: 'BIG' });
    const mid = payer({ nextExDate: '2026-11-10', nextAmount: 1 }, { symbol: 'MID' });
    const small = payer({ nextExDate: '2026-11-10', nextAmount: 0.5 }, { symbol: 'SML' });
    const tiny = payer({ nextExDate: '2026-11-10', nextAmount: 0.1 }, { symbol: 'TNY' });
    const none = makeHolding({ symbol: 'NONE', dividendInfo: null });
    const data = dataOf([small, none, big, tiny, mid]);

    expect(topPayers(data, 'USD', TODAY).map((p) => [p.holding.symbol, p.annual])).toEqual([
      ['BIG', 80_00],
      ['MID', 40_00],
      ['SML', 20_00],
    ]);
    expect(topPayers(data, 'USD', TODAY, 1)).toHaveLength(1);
    expect(topPayers(dataOf([none]), 'USD', TODAY)).toEqual([]);
  });
});
