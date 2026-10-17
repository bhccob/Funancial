/** A label's size and how it stands off the ring, in px. A logo disc over a share, such as "27%". */
export const LABEL = {
  width: 32,
  height: 34,
  /** From the ring's edge to the nearest side of the box: the room for the leader line. */
  lead: 12,
  /** The least space left between two boxes. */
  gap: 2,
} as const;

/** A rectangle in px from the donut's top-left corner. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PlacedLabel {
  /** The slice's position in the list of shares. */
  index: number;
  box: Box;
  /** From the ring's edge to the box, in the same px. */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** The label stands over the middle of its slice, so its logo (the part the line meets) goes under its text. */
  above: boolean;
}

const near = (a: Box, b: Box) =>
  a.left < b.left + b.width + LABEL.gap &&
  b.left < a.left + a.width + LABEL.gap &&
  a.top < b.top + b.height + LABEL.gap &&
  b.top < a.top + a.height + LABEL.gap;

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/**
 * Where the labels of a donut of `size` stand: at the middle of each slice (`shares` are fractions of
 * the whole, clockwise from the top), just outside the ring. A box is pushed out along its slice's
 * direction until its nearest side clears the ring by `LABEL.lead`. Labels that would meet are
 * dropped, the smallest slice's first: slices are taken biggest first and one whose box meets one
 * already kept is left out. `only` limits which slices are asked for; the rest take no room.
 * Returns the kept labels in slice order.
 */
export function layoutLabels(
  shares: readonly number[],
  size: number,
  only?: ReadonlySet<number>,
): PlacedLabel[] {
  const centre = size / 2;
  const { width, height, lead } = LABEL;
  let before = 0;
  const candidates = shares.flatMap((share, index) => {
    const mid = (before + share / 2) * 2 * Math.PI;
    before += share;
    if (share <= 0 || (only && !only.has(index))) return [];
    const [x, y] = [Math.sin(mid), -Math.cos(mid)];
    // The distance at which a box of this size, centred on the direction, just clears the circle.
    const reach = centre + lead + (width / 2) * Math.abs(x) + (height / 2) * Math.abs(y);
    const box = {
      left: centre + reach * x - width / 2,
      top: centre + reach * y - height / 2,
      width,
      height,
    };
    const line = {
      x1: centre + centre * x,
      y1: centre + centre * y,
      // The end of the line is the point of the box nearest the spot `lead` out from the ring.
      x2: clamp(centre + (centre + lead) * x, box.left, box.left + width),
      y2: clamp(centre + (centre + lead) * y, box.top, box.top + height),
    };
    return [{ index, share, box, line, above: y < 0 }];
  });

  const kept: typeof candidates = [];
  for (const c of [...candidates].sort((a, b) => b.share - a.share || a.index - b.index)) {
    if (!kept.some((k) => near(c.box, k.box))) kept.push(c);
  }
  return kept
    .sort((a, b) => a.index - b.index)
    .map(({ index, box, line, above }) => ({ index, box, line, above }));
}
