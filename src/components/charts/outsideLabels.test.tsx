import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Slice } from '@/domain/charts';
import { Donut, DonutLegend } from './Donut';
import { BADGE, badgeWidth, LABEL, layoutLabels, type Box } from './labelLayout';

const SIZE = 220;
const CENTRE = SIZE / 2;

const money = (minor: number) => `$${minor}`;
const sharesOf = (slices: Slice[]) => {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  return slices.map((s) => s.amount / total);
};
const labelsFor = (slices: Slice[]) =>
  slices.map((s) => ({
    key: s.key,
    logo: <i data-logo={s.key} />,
    text: `${Math.round((s.amount / slices.reduce((sum, o) => sum + o.amount, 0)) * 100)}%`,
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

describe('layoutLabels', () => {
  it('stands each box clear of the ring, whichever way its slice points', () => {
    const shares = Array.from({ length: 12 }, () => 1 / 12);
    const placed = layoutLabels(shares, SIZE);
    expect(placed).toHaveLength(12);
    for (const { box } of placed) {
      const corners = [
        [box.left, box.top],
        [box.left + box.width, box.top],
        [box.left, box.top + box.height],
        [box.left + box.width, box.top + box.height],
      ] as const;
      for (const [x, y] of corners) {
        expect(Math.hypot(x - CENTRE, y - CENTRE)).toBeGreaterThanOrEqual(
          CENTRE + LABEL.lead - 1e-9,
        );
      }
      expect(box.width).toBe(LABEL.width);
      expect(box.height).toBe(LABEL.height);
    }
  });

  it('points each label along the middle of its slice, clockwise from the top', () => {
    // A quarter, then three quarters: the first points at 45 degrees (up and right), the second at 225.
    const [first, second] = layoutLabels([0.25, 0.75], SIZE);
    const mid = (box: Box) => [
      box.left + box.width / 2 - CENTRE,
      box.top + box.height / 2 - CENTRE,
    ];
    const [x1, y1] = mid(first!.box);
    expect(x1).toBeGreaterThan(0);
    expect(y1).toBeLessThan(0);
    expect(x1).toBeCloseTo(-y1!, 5);
    const [x2, y2] = mid(second!.box);
    expect(x2).toBeLessThan(0);
    expect(y2).toBeGreaterThan(0);
    expect(x2).toBeCloseTo(-y2!, 5);
    expect(first!.above).toBe(true);
    expect(second!.above).toBe(false);
  });

  it('draws a leader from the ring edge to the box', () => {
    for (const { box, line } of layoutLabels(sharesOf(TWELVE), SIZE, new Set([0, 1, 2, 3]))) {
      expect(Math.hypot(line.x1 - CENTRE, line.y1 - CENTRE)).toBeCloseTo(CENTRE, 5);
      expect(line.x2).toBeGreaterThanOrEqual(box.left - 1e-9);
      expect(line.x2).toBeLessThanOrEqual(box.left + box.width + 1e-9);
      expect(line.y2).toBeGreaterThanOrEqual(box.top - 1e-9);
      expect(line.y2).toBeLessThanOrEqual(box.top + box.height + 1e-9);
      // Short: the ring to the box is the lead plus at most a box's corner.
      expect(Math.hypot(line.x2 - line.x1, line.y2 - line.y1)).toBeLessThan(
        LABEL.lead + LABEL.height,
      );
    }
  });

  it('keeps no two boxes touching, dropping a label only for a bigger slice, and the smallest first', () => {
    const shares = sharesOf(TWELVE);
    const kept = layoutLabels(shares, SIZE);
    const keptIndexes = kept.map((p) => p.index);
    expect(kept.length).toBeGreaterThan(3);
    expect(kept.length).toBeLessThan(TWELVE.length);
    for (const [i, a] of kept.entries()) {
      for (const b of kept.slice(i + 1))
        expect(overlap(a.box, b.box), `${a.index} ${b.index}`).toBe(false);
    }
    // The biggest slices always keep theirs.
    expect(keptIndexes.slice(0, 3)).toEqual([0, 1, 2]);
    // A dropped label is dropped because its box meets (or crowds) one of a slice at least as big.
    for (let i = 0; i < shares.length; i++) {
      if (keptIndexes.includes(i)) continue;
      const [alone] = layoutLabels(shares, SIZE, new Set([i]));
      const blocker = kept.find(
        (p) => overlap(alone!.box, p.box, LABEL.gap) && shares[p.index]! >= shares[i]!,
      );
      expect(blocker, `slice ${i} dropped with nothing bigger in its way`).toBeDefined();
    }
  });

  it('leaves out a slice with nothing to show, or not asked for', () => {
    expect(layoutLabels([0.5, 0, 0.5], SIZE).map((p) => p.index)).toEqual([0, 2]);
    expect(layoutLabels([0.5, 0.25, 0.25], SIZE, new Set([1])).map((p) => p.index)).toEqual([1]);
    expect(layoutLabels([], SIZE)).toEqual([]);
  });
});

describe('Donut outside labels', () => {
  it('shows a label for each of four slices, at the box the geometry gives', () => {
    const { container } = donut(FOUR);
    const labels = drawn(container);
    expect(labels.map((l) => l.key)).toEqual(['a', 'b', 'c', 'd']);
    const placed = layoutLabels(sharesOf(FOUR), SIZE);
    labels.forEach((label, i) => {
      expect(label.box).toEqual(placed[i]!.box);
      // The logo and the share, in the text colour and hidden from a screen reader.
      expect(label.el.querySelector(`[data-logo="${label.key}"]`)).not.toBeNull();
      expect(label.el).toHaveTextContent(/^\d+%$/);
      expect(label.el).toHaveClass('text-text');
      expect(label.el).toHaveAttribute('aria-hidden', 'true');
    });
    expect(labels.map((l) => l.el.textContent)).toEqual(['42%', '27%', '20%', '11%']);
  });

  it('joins each label to the ring with a leader line, in the same space as the box', () => {
    const { container } = donut(FOUR);
    const lines = [...container.querySelectorAll('line')];
    const placed = layoutLabels(sharesOf(FOUR), SIZE);
    expect(lines).toHaveLength(4);
    lines.forEach((line, i) => {
      const want = placed[i]!.line;
      for (const end of ['x1', 'y1', 'x2', 'y2'] as const) {
        expect(parseFloat(line.getAttribute(end)!)).toBeCloseTo(want[end], 5);
      }
      // Not under the rotation the arcs are drawn with.
      expect(line.closest('svg')).not.toHaveClass('-rotate-90');
      expect(line.closest('svg')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('puts the logo nearest the ring: under a label above it, over a label below it', () => {
    const { container } = donut(FOUR);
    const placed = layoutLabels(sharesOf(FOUR), SIZE);
    for (const [i, label] of drawn(container).entries()) {
      const logoFirst = label.el.firstElementChild!.hasAttribute('data-logo');
      expect(logoFirst, label.key).toBe(!placed[i]!.above);
    }
  });

  it('keeps room around the ring for the labels', () => {
    const { container } = donut(FOUR);
    expect(container.firstElementChild).toHaveStyle({
      margin: `${LABEL.lead + LABEL.height}px ${LABEL.lead + LABEL.width}px`,
    });
  });

  it('drops the labels that would overlap, so that no two boxes on the page meet', () => {
    const { container } = donut(TWELVE);
    const labels = drawn(container);
    const kept = layoutLabels(sharesOf(TWELVE), SIZE);
    expect(labels.map((l) => l.key)).toEqual(kept.map((p) => TWELVE[p.index]!.key));
    expect(labels.length).toBeLessThan(TWELVE.length);
    for (const [i, a] of labels.entries()) {
      for (const b of labels.slice(i + 1)) {
        expect(overlap(a.box, b.box), `${a.key} and ${b.key}`).toBe(false);
      }
    }
    // A dropped slice is still there to tap and read, and the leaders go with their labels only.
    expect(container.querySelectorAll('button')).toHaveLength(TWELVE.length);
    expect(container.querySelectorAll('line')).toHaveLength(labels.length);
  });

  it('labels a lone slice below the ring, as 100%', () => {
    const { container } = donut([slice('ko', 500)]);
    const [only] = drawn(container);
    expect(only!.el).toHaveTextContent('100%');
    expect(only!.box.top).toBeGreaterThan(SIZE);
    expect(only!.box.left + only!.box.width / 2).toBeCloseTo(CENTRE, 5);
  });

  it('writes nothing, and keeps no room, unless asked', () => {
    const { container } = donut(FOUR, { outsideLabels: undefined });
    expect(drawn(container)).toEqual([]);
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect((container.firstElementChild as HTMLElement).style.margin).toBe('');
  });

  it('writes none on an empty donut, and ignores a label whose key is no slice', () => {
    const empty = donut([]);
    expect(drawn(empty.container)).toEqual([]);
    empty.unmount();
    const { container } = donut(FOUR, {
      outsideLabels: [...labelsFor(FOUR), { key: 'ghost', logo: null, text: '0%' }],
    });
    expect(drawn(container).map((l) => l.key)).toEqual(['a', 'b', 'c', 'd']);
  });
});

/*
 * The badge style (`labelStyle="badge"`): a glass pill with a 24px round badge and the share after
 * it, standing just outside its slice with no leader line. Pills that would meet are nudged apart
 * along the ring, and none is dropped.
 */
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

const badged = (slices: Slice[], extra: Partial<React.ComponentProps<typeof Donut>> = {}) =>
  donut(slices, { labelStyle: 'badge', ...extra });

describe('layoutLabels, badge style', () => {
  const fit = (shares: number[], texts?: string[]) => ({
    widths: shares.map((share, i) => badgeWidth(texts?.[i] ?? `${Math.round(share * 100)}%`)),
  });

  it('stands each pill at the middle of its slice, clear of the ring, when there is room', () => {
    // A quarter then three quarters: 45 degrees (up and right), then 225 (down and left).
    const shares = [0.25, 0.75];
    const [first, second] = layoutLabels(shares, SIZE, undefined, fit(shares));
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
    const [only] = layoutLabels([1], SIZE, undefined, fit([1], ['100%']));
    expect(only!.box.width).toBe(badgeWidth('100%'));
  });

  it('keeps every slice a pill, and no two meet, however many slices crowd the ring', () => {
    for (const slices of [TEN, TWELVE, FOUR]) {
      const shares = sharesOf(slices);
      const placed = layoutLabels(shares, SIZE, undefined, fit(shares));
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

  it('moves only the slice that is in the way, the thinner one, and only along the ring', () => {
    // Two thin slices side by side at the top, between a big one each side: both cannot stand at their middles.
    const shares = [0.4, 0.04, 0.04, 0.52];
    const alone = (i: number) => layoutLabels(shares, SIZE, new Set([i]), fit(shares))[0]!.box;
    const placed = layoutLabels(shares, SIZE, undefined, fit(shares));
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
    const wide = fit(shares, ['12%', '25%', '62%']);
    wide.widths[1] = ROOM.x + 20;
    const [, right] = layoutLabels(shares, SIZE, undefined, wide);
    expect(insideRoom(right!.box)).toBe(true);
    expect(nearest(right!.box)).toBeGreaterThanOrEqual(CENTRE + BADGE.lead - 1e-9);
  });

  it('never drops a pill, even when the ring is too full for them all to stand apart', () => {
    const shares = Array.from({ length: 40 }, () => 1 / 40);
    const placed = layoutLabels(shares, SIZE, undefined, fit(shares));
    expect(placed.map((p) => p.index)).toEqual(shares.map((_, i) => i));
  });

  it('leaves out a slice with nothing to show, or not asked for', () => {
    const shares = [0.5, 0, 0.5];
    expect(layoutLabels(shares, SIZE, undefined, fit(shares)).map((p) => p.index)).toEqual([0, 2]);
    expect(
      layoutLabels([0.5, 0.25, 0.25], SIZE, new Set([1]), fit([0.5, 0.25, 0.25])).map(
        (p) => p.index,
      ),
    ).toEqual([1]);
    expect(layoutLabels([], SIZE, undefined, { widths: [] })).toEqual([]);
  });
});

describe('Donut badge labels', () => {
  it('has ten holdings keep every label apart: one pill each, none meeting another', () => {
    const { container } = badged(TEN);
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

  it('keeps all twelve of a crowded ring, where the default style drops labels', () => {
    const { container } = badged(TWELVE);
    expect(drawn(container)).toHaveLength(TWELVE.length);
    expect(layoutLabels(sharesOf(TWELVE), SIZE).length).toBeLessThan(TWELVE.length);
  });

  it('draws a pill: the badge first, then the share, in glass and the text colour, with no leader line', () => {
    const { container } = badged(FOUR);
    const labels = drawn(container);
    expect(labels.map((l) => l.el.textContent)).toEqual(['42%', '27%', '20%', '11%']);
    for (const { key, el, box } of labels) {
      expect(el.firstElementChild).toHaveAttribute('data-logo', key);
      expect(el).toHaveClass('glass-strong', 'text-text', 'rounded-full', 'text-xs');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(box.height).toBe(BADGE.height);
      expect(box.width).toBe(badgeWidth(el.textContent!));
    }
    // Not the default style's leaders, nor its margin.
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.firstElementChild).toHaveStyle({ margin: `${ROOM.y}px ${ROOM.x}px` });
  });

  it('puts each pill where the geometry says', () => {
    const { container } = badged(FOUR);
    const shares = sharesOf(FOUR);
    const placed = layoutLabels(shares, SIZE, undefined, {
      widths: shares.map((share) => badgeWidth(`${Math.round(share * 100)}%`)),
    });
    drawn(container).forEach((label, i) => expect(label.box).toEqual(placed[i]!.box));
  });

  it('labels a lone slice below the ring, as 100%', () => {
    const { container } = badged([slice('ko', 500)]);
    const [only] = drawn(container);
    expect(only!.el).toHaveTextContent('100%');
    expect(only!.box.top).toBeGreaterThan(SIZE);
    expect(only!.box.left + only!.box.width / 2).toBeCloseTo(CENTRE, 5);
    expect(insideRoom(only!.box)).toBe(true);
  });

  it('writes none on an empty donut, ignores a label whose key is no slice, and keeps no room unless asked', () => {
    const empty = badged([]);
    expect(drawn(empty.container)).toEqual([]);
    empty.unmount();
    const ghost = badged(FOUR, {
      outsideLabels: [...labelsFor(FOUR), { key: 'ghost', logo: null, text: '0%' }],
    });
    expect(drawn(ghost.container).map((l) => l.key)).toEqual(['a', 'b', 'c', 'd']);
    ghost.unmount();
    const none = badged(FOUR, { outsideLabels: undefined });
    expect(drawn(none.container)).toEqual([]);
    expect((none.container.firstElementChild as HTMLElement).style.margin).toBe('');
  });

  it('colours the arcs from `colors` when given, and from the chart series when not', () => {
    const colors = ['#0f3e99', '#c8102e', '#22c55e', '#ec4899'];
    const arcs = (el: HTMLElement) =>
      [...el.querySelectorAll('svg > circle')].slice(1).map((c) => c.getAttribute('stroke'));
    const given = badged(FOUR, { colors });
    expect(arcs(given.container)).toEqual(colors);
    given.unmount();
    const none = badged(FOUR);
    expect(arcs(none.container)).toEqual([1, 2, 3, 4].map((n) => `var(--color-chart-${n})`));
  });

  it('leaves the default style as it was, for anything that does not ask for the badge', () => {
    const { container } = donut(FOUR);
    expect(container.querySelectorAll('line')).toHaveLength(4);
    expect(drawn(container)[0]!.el).not.toHaveClass('glass-strong');
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
