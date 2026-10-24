/** A rectangle in px from the donut's top-left corner. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The measures of a donut's outside labels, in px: a glass pill with a 24px round badge (a logo, or
 * a ticker on the slice's colour) and the slice's share after it.
 */
export const BADGE = {
  /** The round badge. */
  disc: 24,
  /** The pill: the badge with 3px round it (its 1px glass edge and 2px of padding). */
  height: 30,
  /** From the ring's edge to the nearest side of a pill: it stands just outside, with no leader line. */
  lead: 3,
  /** The least space left between two pills. */
  space: 4,
  /**
   * How far past the ring a pill may reach sideways. The donut keeps this much clear at each side,
   * which is what must fit between the ring and the screen's edge (a 200px ring and 60px at each
   * side is the 320px of a 360px phone's page); a pill whose slice points sideways and is wider than
   * this slides along the ring until it fits.
   */
  reach: 60,
} as const;

/**
 * The pill's left padding (1px glass edge and 2px), the gap between the badge and the share, and the
 * padding after it (1px edge and 7px): the `pl-0.5`, `ml-1` and `pr-[7px]` of Donut's `PILL`.
 */
const PILL = { before: 3, between: 4, after: 8 } as const;
/**
 * The width of the share's digits (7.8px) and its percent sign (9.9px) at 12px, bold and tabular,
 * measured in the app's font (Inter Tight) and rounded up so that the text never meets the pill's edge.
 */
const GLYPH = { digit: 8, percent: 10 } as const;

/** How wide the pill for a share such as "27%" is, in px: its badge, its padding and the text. */
export function badgeWidth(text: string): number {
  const glyphs = [...text].reduce((sum, c) => sum + (c === '%' ? GLYPH.percent : GLYPH.digit), 0);
  return PILL.before + BADGE.disc + PILL.between + glyphs + PILL.after;
}

/** A pill placed: the slice's position in the list of shares, and the box it stands in. */
export interface PlacedBadge {
  index: number;
  box: Box;
}

/** How far a pill is slid along the ring each time it is in the way, and how far in all. */
const SLIDE = Math.PI / 180;
const SLIDES = 180;

const near = (a: Box, b: Box, gap: number) =>
  a.left < b.left + b.width + gap &&
  b.left < a.left + a.width + gap &&
  a.top < b.top + b.height + gap &&
  b.top < a.top + a.height + gap;

/**
 * Where the pills of a donut of `size` stand (`shares` are fractions of the whole, clockwise from the
 * top; `widths` are the pills' widths by slice, from `badgeWidth`). Each is at the middle of its
 * slice, just outside the ring, pushed out along its slice's direction until its nearest side clears
 * the ring by `BADGE.lead`; there is no leader line. The biggest slices are placed first. A pill that
 * meets one already placed, or reaches past the room the donut keeps at its sides (`BADGE.reach`, and
 * above and below), is slid along the ring a degree at a time, clockwise first, to the nearest spot
 * where it does not. None is dropped: only if the whole ring is full does a pill stand over another,
 * at its slice's middle. `only` limits which slices are asked for; the rest take no room. Returns the
 * pills in slice order.
 */
export function layoutBadges(
  shares: readonly number[],
  size: number,
  widths: readonly number[],
  only?: ReadonlySet<number>,
): PlacedBadge[] {
  const centre = size / 2;
  const { height, lead, space, reach } = BADGE;
  const room = lead + height;
  let before = 0;
  const asked = shares.flatMap((share, index) => {
    const mid = (before + share / 2) * 2 * Math.PI;
    before += share;
    if (share <= 0 || (only && !only.has(index))) return [];
    return [{ index, share, mid, width: widths[index] ?? 0 }];
  });

  /** The box, `width` wide, standing on the ring in the direction `angle`, clockwise from the top. */
  const boxAt = (angle: number, width: number): Box => {
    const [x, y] = [Math.sin(angle), -Math.cos(angle)];
    // The distance at which a box centred on the direction just clears the ring by `lead`.
    const out = centre + lead + (width / 2) * Math.abs(x) + (height / 2) * Math.abs(y);
    return {
      left: centre + out * x - width / 2,
      top: centre + out * y - height / 2,
      width,
      height,
    };
  };
  const inside = (b: Box) =>
    b.left >= -reach &&
    b.left + b.width <= size + reach &&
    b.top >= -room &&
    b.top + b.height <= size + room;

  const placed: PlacedBadge[] = [];
  for (const c of [...asked].sort((a, b) => b.share - a.share || a.index - b.index)) {
    let box: Box | undefined;
    for (let step = 0; step <= SLIDES && !box; step++) {
      for (const sign of step === 0 ? [1] : [1, -1]) {
        const candidate = boxAt(c.mid + sign * step * SLIDE, c.width);
        if (inside(candidate) && !placed.some((p) => near(candidate, p.box, space))) {
          box = candidate;
          break;
        }
      }
    }
    placed.push({ index: c.index, box: box ?? boxAt(c.mid, c.width) });
  }
  return placed.sort((a, b) => a.index - b.index);
}
