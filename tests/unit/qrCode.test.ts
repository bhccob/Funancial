import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// site/get/qr.svg is an image of the download page's address, so no search for the address finds it
// when the address changes. This reads the symbol back out of the file, with no QR library: the
// only one on hand would be a dependency just for this test. See "Releasing" in docs/release.md.

const svg = readFileSync(new URL('../../site/get/qr.svg', import.meta.url), 'utf8');

const SIZE = 29; // version 3
const DATA_CODEWORDS = 44; // version 3, ECC M: one block of 44 data codewords (and 26 for repair)
const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The dark modules of the symbol, from the path's `M x y h n m dx dy …` runs. */
function darkModules(): Uint8Array {
  const width = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)?.[1]);
  const quiet = (width - SIZE) / 2;
  const path = /stroke="#0d0d0f" d="([^"]+)"/.exec(svg)?.[1] ?? '';
  const grid = new Uint8Array(SIZE * SIZE);
  const tokens = path.match(/[Mmh]|\d+(?:\.\d+)?/g) ?? [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === 'M' || command === 'm') {
      const dx = Number(tokens[i++]);
      const dy = Number(tokens[i++]);
      x = command === 'M' ? dx : x + dx;
      y = command === 'M' ? dy : y + dy;
    } else if (command === 'h') {
      const run = Number(tokens[i++]);
      for (let k = 0; k < run; k++) grid[(Math.floor(y) - quiet) * SIZE + (x + k - quiet)] = 1;
      x += run;
    } else {
      throw new Error(`Unexpected path command ${command}`);
    }
  }
  return grid;
}

/** The error correction level, mask and text of a version 3 symbol in byte mode. */
function read(grid: Uint8Array): { ecc: string; text: string } {
  const at = (x: number, y: number) => grid[y * SIZE + x] ?? 0;
  let format = 0;
  for (let i = 0; i <= 5; i++) format |= at(8, i) << i;
  format |= (at(8, 7) << 6) | (at(8, 8) << 7) | (at(7, 8) << 8);
  for (let i = 9; i < 15; i++) format |= at(14 - i, 8) << i;
  const data = (format ^ 0x5412) >>> 10;
  const mask = MASKS[data & 7];

  // Everything that is not data: the three finders with their separators and format strips, the
  // timing lines and the one alignment pattern.
  const fixed = new Uint8Array(SIZE * SIZE);
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fixed[y * SIZE + x] = 1;
  };
  mark(0, 0, 8, 8);
  mark(SIZE - 8, 0, SIZE - 1, 8);
  mark(0, SIZE - 8, 8, SIZE - 1);
  mark(6, 0, 6, SIZE - 1);
  mark(0, 6, SIZE - 1, 6);
  mark(20, 20, 24, 24);

  // Data runs up and down two-module columns from the right edge, skipping the timing column.
  const bits: number[] = [];
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < SIZE; step++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? SIZE - 1 - step : step;
        if (fixed[y * SIZE + x]) continue;
        bits.push(at(x, y) ^ (mask?.(x, y) ? 1 : 0));
      }
    }
  }
  const stream = bits.slice(0, DATA_CODEWORDS * 8).join('');
  expect(stream.slice(0, 4), 'byte mode').toBe('0100');
  const count = parseInt(stream.slice(4, 12), 2);
  let text = '';
  for (let i = 0; i < count; i++) {
    text += String.fromCharCode(parseInt(stream.slice(12 + 8 * i, 20 + 8 * i), 2));
  }
  return { ecc: ['M', 'L', 'H', 'Q'][data >>> 3] ?? '?', text };
}

describe('the download page QR code (site/get/qr.svg)', () => {
  it('encodes the download page at the address people use', () => {
    expect(read(darkModules()).text).toBe('https://funcial.vercel.app/get');
  });

  it('keeps its size, error correction and colours', () => {
    expect(read(darkModules()).ecc).toBe('M');
    expect(svg).toContain('viewBox="0 0 33 33"');
    expect(svg).toContain('<path fill="#ffffff" d="M0 0h33v33H0z"/>');
    expect(svg).toContain('stroke="#0d0d0f"');
  });
});
