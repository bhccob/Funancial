import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Slice } from '@/domain/charts';
import { Donut, DonutLegend } from './Donut';
import { BADGE, badgeWidth, layoutBadges, type Box } from './labelLayout';

/** The pie's own size (HoldingsTab's), so that what is measured here is what is on the phone. */
const SIZE = 200;
const CENTRE = SIZE / 2;

const money = (minor: number) => `$${minor}`;
const sharesOf = (slices: Slice[]) => {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  return slices.map((s) => s.amount / total);
};
/** The share as the pie writes it, such as "27%". */
const textOf = (share: number) => `${Math.round(share * 100)}%`;
const labelsFor = (slices: Slice[]) =>
  sharesOf(slices).map((share, i) => ({
    key: slices[i]!.key,
    logo: <i data-logo={slices[i]!.key} />,
    text: textOf(share),
  }));

function donut(slices: Slice[], extra: Partial<React.ComponentProps<typeof Donut>> = {}) {
  return render(
    <Donut
      label="Value by holding"
      slices={slices}
      size={SIZE}
      thickness={22}
      formatAmount={money}
      idle={{ value: '$0', label: 'All' }}
      selected={null}
      onSelect={() => {}}
      outsideLabels={labelsFor(slices)}
      {...extra}
    />,
  );
}

/** The labels on the page, with the box each stands in (read from its style). */
function drawn(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-label]')].map((el) => ({
    key: el.dataset.label!,
    el,
    box: {
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    } satisfies Box,
  }));
}

/** Whether two boxes meet, or come within `gap` of meeting. */
const overlap = (a: Box, b: Box, gap = 0) =>
  a.left < b.left + b.width + gap &&
  b.left < a.left + a.width + gap &&
  a.top < b.top + b.height + gap &&
  b.top < a.top + a.height + gap;

const slice = (key: string, amount: number): Slice => ({ key, label: key.toUpperCase(), amount });
const FOUR = [slice('a', 42), slice('b', 27), slice('c', 20), slice('d', 11)];
/** Two big slices and ten thin ones: the thin ones' labels cannot all stand side by side. */
const TWELVE = [30, 22, 12, 6, 5, 4, 4, 4, 4, 3, 3, 3].map((n, i) => slice(`s${i}`, n));
const TEN = [24, 18, 12, 9, 8, 7, 6, 6, 5, 5].map((n, i) => slice(`h${i}`, n));

/** What the donut keeps clear around it for the pills; one outside it would be clipped. */
const ROOM = { x: BADGE.reach, y: BADGE.lead + BADGE.height };

const insideRoom = (box: Box, size = SIZE) =>
  box.left >= -ROOM.x - 1e-9 &&
  box.left + box.width <= size + ROOM.x + 1e-9 &&
  box.top >= -ROOM.y - 1e-9 &&
  box.top + box.height <= size + ROOM.y + 1e-9;

/** The least distance from the donut's centre to any corner of the box. */
const nearest = (box: Box) =>
  Math.min(
    ...[box.left, box.left + box.width].flatMap((x) =>
      [box.top, box.top + box.height].map((y) => Math.hypot(x - CENTRE, y - CENTRE)),
    ),
  );

/** The pills' widths for these shares, as the donut sizes them (or for these texts). */
const widthsOf = (shares: readonly number[], texts?: readonly string[]) =>
  shares.map((share, i) => badgeWidth(texts?.[i] ?? textOf(share)));

describe('layoutBadges', () => {
  it('stands each pill at the middle of its slice, clear of the ring, when there is room', () => {
    // A quarter then three quarters: 45 degrees (up and right), then 225 (down and left).
    const shares = [0.25, 0.75];
    const [first, second] = layoutBadges(shares, SIZE, widthsOf(shares));
    const mid = (box: Box) => [
      box.left + box.width / 2 - CENTRE,
      box.top + box.height / 2 - CENTRE,
    ];
    const [x1, y1] = mid(first!.box);
    expect(x1).toBeGreaterThan(0);
    expect(y1).toBeLessThan(0);
    const [x2, y2] = mid(second!.box);
    expect(x2).toBeLessThan(0);
    expect(y2).toBeGreaterThan(0);
    for (const { box } of [first!, second!]) {
      expect(box.height).toBe(BADGE.height);
      expect(nearest(box)).toBeGreaterThanOrEqual(CENTRE + BADGE.lead - 1e-9);
    }
    // A slice's pill has no leader line to go with it.
    expect(first).not.toHaveProperty('line');
  });

  it('is as wide as its badge and its share need: a longer share is a wider pill', () => {
    expect(badgeWidth('4%')).toBeLessThan(badgeWidth('27%'));
    expect(badgeWidth('27%')).toBeLessThan(badgeWidth('100%'));
    // The disc, its padding and the share's digits and sign are all in it.
    expect(badgeWidth('27%')).toBeGreaterThan(BADGE.disc + 14);
    const [only] = layoutBadges([1], SIZE, widthsOf([1], ['100%']));
    expect(only!.box.width).toBe(badgeWidth('100%'));
  });

  it('keeps every slice a pill, and no two meet, however many slices crowd the ring', () => {
    for (const slices of [TEN, TWELVE, FOUR]) {
      const shares = sharesOf(slices);
      const placed = layoutBadges(shares, SIZE, widthsOf(shares));
      expect(placed.map((p) => p.index)).toEqual(slices.map((_, i) => i));
      for (const [i, a] of placed.entries()) {
        expect(insideRoom(a.box), `slice ${a.index} inside the room`).toBe(true);
        expect(nearest(a.box), `slice ${a.index} clear of the ring`).toBeGreaterThanOrEqual(
          CENTRE + BADGE.lead - 1e-9,
        );
        for (const b of placed.slice(i + 1)) {
          expect(overlap(a.box, b.box, BADGE.space), `${a.index} and ${b.index}`).toBe(false);
        }
      }
    }
  });

  describe('at the production size: a 200px pie of five holdings and Other', () => {
    /** What the pie draws for these six amounts: shares, each pill as wide as its written share needs. */
    const six = (amounts: readonly number[]) => {
      const total = amounts.reduce((sum, a) => sum + a, 0);
      const shares = amounts.map((a) => a / total);
      return { shares, placed: layoutBadges(shares, SIZE, widthsOf(shares)) };
    };

    /** Every pill is there, clear of the ring and of each other, inside the chart's box. */
    const expectFits = (amounts: readonly number[]) => {
      const { shares, placed } = six(amounts);
      expect(
        placed.map((p) => p.index),
        amounts.join(','),
      ).toEqual(shares.map((_, i) => i));
      for (const [i, a] of placed.entries()) {
        expect(insideRoom(a.box), `${amounts.join(',')}: slice ${a.index} in the chart's box`).toBe(
          true,
        );
        expect(nearest(a.box), `slice ${a.index} clear of the ring`).toBeGreaterThanOrEqual(
          CENTRE + BADGE.lead - 1e-9,
        );
        for (const b of placed.slice(i + 1)) {
          expect(
            overlap(a.box, b.box, BADGE.space),
            `${amounts.join(',')}: ${a.index} and ${b.index}`,
          ).toBe(false);
        }
      }
    };

    it('fits the shares of the demo, a pie with two thin slices, and one with a big slice and five thin', () => {
      // Demo-like: 28, 23, 22, 9, 5 and Other 13.
      expectFits([28, 23, 22, 9, 5, 13]);
      // Two thin slices side by side, then a long run of 1-digit shares.
      expectFits([34, 28, 20, 9, 5, 4]);
      expectFits([40, 30, 15, 5, 5, 5]);
      expectFits([90, 4, 2, 2, 1, 1]);
      expectFits([60, 10, 10, 10, 5, 5]);
    });

    it('fits an equal split, where six pills are the same width and meet at the top and bottom', () => {
      expectFits([1, 1, 1, 1, 1, 1]);
    });

    it('fits any of 400 shares of six, however thin or lopsided', () => {
      // A fixed pseudo-random sequence, so a failure names the shares that broke it.
      let seed = 20261023;
      const next = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
      for (let n = 0; n < 400; n++) {
        expectFits(Array.from({ length: 6 }, () => 1 + Math.round(next() ** 2 * 100)));
      }
    });

    it('fits the widest pills, a three-digit share on one slice, anywhere on the ring', () => {
      // 100% is a lone slice (below the ring); 6 of "100%" cannot be, so the widest real case is 99%.
      expectFits([99, 1, 1, 1, 1, 1]);
      const [only] = layoutBadges([1], SIZE, widthsOf([1], ['100%']));
      expect(insideRoom(only!.box)).toBe(true);
    });
  });

  it('moves only the slice that is in the way, the thinner one, and only along the ring', () => {
    // Two thin slices side by side at the bottom, between a big one each side: both cannot stand at their middles.
    const shares = [0.4, 0.04, 0.04, 0.52];
    const widths = widthsOf(shares);
    const alone = (i: number) => layoutBadges(shares, SIZE, widths, new Set([i]))[0]!.box;
    const placed = layoutBadges(shares, SIZE, widths);
    // The big slices keep their middles.
    expect(placed[0]!.box).toEqual(alone(0));
    expect(placed[3]!.box).toEqual(alone(3));
    // At least one of the thin pair had to move, and each is as near the ring as it can be.
    const moved = [1, 2].filter((i) => placed[i]!.box.left !== alone(i).left);
    expect(moved.length).toBeGreaterThan(0);
    for (const i of [1, 2]) {
      expect(nearest(placed[i]!.box)).toBeGreaterThanOrEqual(CENTRE + BADGE.lead - 1e-9);
    }
  });

  it('keeps a pill that is too wide for the side its slice points to inside the room, by sliding it along the ring', () => {
    // A slice centred on three o'clock: its pill, standing straight out, would reach past the room.
    const shares = [0.125, 0.25, 0.625];
    const widths = widthsOf(shares, ['12%', '25%', '62%']);
    widths[1] = ROOM.x + 20;
    const [, right] = layoutBadges(shares, SIZE, widths);
    expect(insideRoom(right!.box)).toBe(true);
    expect(nearest(right!.box)).toBeGreaterThanOrEqual(CENTRE + BADGE.lead - 1e-9);
  });

  it('never drops a pill, even when the ring is too full for them all to stand apart', () => {
    const shares = Array.from({ length: 40 }, () => 1 / 40);
    const placed = layoutBadges(shares, SIZE, widthsOf(shares));
    expect(placed.map((p) => p.index)).toEqual(shares.map((_, i) => i));
  });

  it('leaves out a slice with nothing to show, or not asked for', () => {
    const shares = [0.5, 0, 0.5];
    expect(layoutBadges(shares, SIZE, widthsOf(shares)).map((p) => p.index)).toEqual([0, 2]);
    expect(
      layoutBadges([0.5, 0.25, 0.25], SIZE, widthsOf([0.5, 0.25, 0.25]), new Set([1])).map(
        (p) => p.index,
      ),
    ).toEqual([1]);
    expect(layoutBadges([], SIZE, [])).toEqual([]);
  });
});

describe('Donut outside labels', () => {
  it('has ten holdings keep every label apart: one pill each, none meeting another', () => {
    const { container } = donut(TEN);
    const labels = drawn(container);
    expect(labels).toHaveLength(TEN.length);
    expect(labels.map((l) => l.key)).toEqual(TEN.map((s) => s.key));
    for (const [i, a] of labels.entries()) {
      expect(insideRoom(a.box), `${a.key} inside the room`).toBe(true);
      for (const b of labels.slice(i + 1)) {
        expect(overlap(a.box, b.box), `${a.key} and ${b.key}`).toBe(false);
      }
    }
    // Every slice is still there to tap and read.
    expect(container.querySelectorAll('button')).toHaveLength(TEN.length);
  });

  it('keeps all twelve of a crowded ring', () => {
    const { container } = donut(TWELVE);
    expect(drawn(container)).toHaveLength(TWELVE.length);
  });

  it('draws a pill: the badge first, then the share, in glass and the text colour, with no leader line', () => {
    const { container } = donut(FOUR);
    const labels = drawn(container);
    expect(labels.map((l) => l.el.textContent)).toEqual(['42%', '27%', '20%', '11%']);
    for (const { key, el, box } of labels) {
      expect(el.firstElementChild).toHaveAttribute('data-logo', key);
      expect(el).toHaveClass('glass-strong', 'text-text', 'rounded-full', 'text-xs');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(box.height).toBe(BADGE.height);
      expect(box.width).toBe(badgeWidth(el.textContent!));
    }
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.firstElementChild).toHaveStyle({ margin: `${ROOM.y}px ${ROOM.x}px` });
  });

  it('puts each pill where the geometry says', () => {
    const { container } = donut(FOUR);
    const shares = sharesOf(FOUR);
    const placed = layoutBadges(shares, SIZE, widthsOf(shares));
    drawn(container).forEach((label, i) => expect(label.box).toEqual(placed[i]!.box));
  });

  it('labels a lone slice below the ring, as 100%', () => {
    const { container } = donut([slice('ko', 500)]);
    const [only] = drawn(container);
    expect(only!.el).toHaveTextContent('100%');
    expect(only!.box.top).toBeGreaterThan(SIZE);
    expect(only!.box.left + only!.box.width / 2).toBeCloseTo(CENTRE, 5);
    expect(insideRoom(only!.box)).toBe(true);
  });

  it('writes none on an empty donut, ignores a label whose key is no slice, and keeps no room unless asked', () => {
    const empty = donut([]);
    expect(drawn(empty.container)).toEqual([]);
    empty.unmount();
    const ghost = donut(FOUR, {
      outsideLabels: [...labelsFor(FOUR), { key: 'ghost', logo: null, text: '0%' }],
    });
    expect(drawn(ghost.container).map((l) => l.key)).toEqual(['a', 'b', 'c', 'd']);
    ghost.unmount();
    const none = donut(FOUR, { outsideLabels: undefined });
    expect(drawn(none.container)).toEqual([]);
    expect((none.container.firstElementChild as HTMLElement).style.margin).toBe('');
  });

  it('colours the arcs from `colors` when given, and from the chart series when not', () => {
    const colors = ['#0f3e99', '#c8102e', '#22c55e', '#ec4899'];
    const arcs = (el: HTMLElement) =>
      [...el.querySelectorAll('svg > circle')].map((c) => c.getAttribute('stroke'));
    const given = donut(FOUR, { colors });
    expect(arcs(given.container)).toEqual(colors);
    given.unmount();
    const none = donut(FOUR);
    expect(arcs(none.container)).toEqual([1, 2, 3, 4].map((n) => `var(--color-chart-${n})`));
  });
});

describe('DonutLegend logos', () => {
  const legend = (logos?: Record<string, React.ReactNode>) =>
    render(
      <DonutLegend
        slices={FOUR}
        formatAmount={money}
        selected={null}
        onSelect={() => {}}
        showPercent
        logos={logos}
      />,
    );

  it('starts a row with its logo, in place of the colour dot', () => {
    const { container } = legend({ a: <i data-logo="a" />, b: <i data-logo="b" /> });
    const rows = [...container.querySelectorAll('button')];
    expect(rows[0]!.firstElementChild).toHaveAttribute('data-logo', 'a');
    expect(rows[1]!.firstElementChild).toHaveAttribute('data-logo', 'b');
    // A row with no logo keeps its colour dot.
    expect(rows[2]!.firstElementChild).toHaveClass('rounded-full');
    expect(rows[2]!.firstElementChild!.getAttribute('style')).toContain('--color-chart-3');
    expect(rows[0]!.querySelector('.rounded-full')).toBeNull();
    // The rows are as tall as ever.
    for (const row of rows) expect(row).toHaveClass('min-h-11');
  });

  it('keeps the colour dots when there are no logos', () => {
    const { container } = legend();
    for (const row of container.querySelectorAll('button')) {
      expect(row.firstElementChild).toHaveClass('rounded-full');
    }
  });
});
