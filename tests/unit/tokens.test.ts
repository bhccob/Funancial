import { readFileSync } from 'node:fs';
const css = readFileSync('src/styles/tokens.css', 'utf8');
import { expect, it } from 'vitest';

it('defines the Pro Ledger tokens', () => {
  expect(css).toContain('--color-accent-text: #007a55');
  expect(css).toContain('--color-chart-6: #008300');
  expect(css).toContain('--color-overlay: #ffffff');
});

it('defines the Other chart colour', () => {
  expect(css).toContain('--color-chart-other: #868b96');
  expect(css).toContain('--color-chart-other: #6b7080');
});

it('no longer ships the pixel look', () => {
  expect(css).not.toMatch(/pixelify/i);
  expect(css).not.toContain('--color-texture');
});

/** The declarations of the one rule whose selector is exactly `selector`. */
function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (body === undefined) throw new Error(`No rule for ${selector}`);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value!.trim()]),
  );
}

it('defines the game themes', () => {
  expect(css).toContain('--color-xp-contrast: #ffffff');
  expect(css).toMatch(/\[data-game-theme='ocean'\][^}]*--color-xp: #1f63d6/);
  expect(css).toMatch(
    /\[data-theme='dark'\]\[data-game-theme='orchid'\][^}]*--color-xp-text: #f08ae0/,
  );
});

const GAME_THEMES = {
  ocean: { light: '#1f63d6', dark: '#6aa6ff' },
  orchid: { light: '#a8189a', dark: '#f08ae0' },
  graphite: { light: '#4a4f5c', dark: '#c3c8d4' },
} as const;

it('gives each game theme one color for the fill and the text, light and dark', () => {
  for (const [name, color] of Object.entries(GAME_THEMES)) {
    expect(declarations(`:root[data-game-theme='${name}']`)).toEqual({
      '--color-xp': color.light,
      '--color-xp-text': color.light,
    });
    expect(declarations(`:root[data-theme='dark'][data-game-theme='${name}']`)).toEqual({
      '--color-xp': color.dark,
      '--color-xp-text': color.dark,
    });
  }
});

it('leaves violet to the base tokens and gives the chip text its own color', () => {
  expect(css).not.toContain("data-game-theme='violet'");
  expect(declarations('@theme static')['--color-xp-contrast']).toBe('#ffffff');
  expect(declarations(":root[data-theme='dark']")['--color-xp-contrast']).toBe('#0c0c0e');
});

/** WCAG contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, blue] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * blue!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

it('keeps every game theme readable on the page, on its chip and on the progress track', () => {
  const modes = [
    { base: declarations('@theme static'), pick: 'light' as const },
    { base: declarations(":root[data-theme='dark']"), pick: 'dark' as const },
  ];
  for (const { base, pick } of modes) {
    for (const color of Object.values(GAME_THEMES)) {
      const xp = color[pick];
      expect(contrast(xp, base['--color-bg']!)).toBeGreaterThanOrEqual(5.5);
      expect(contrast(xp, base['--color-xp-contrast']!)).toBeGreaterThanOrEqual(5.5);
      expect(contrast(xp, base['--color-track']!)).toBeGreaterThanOrEqual(4.6);
    }
  }
});

it('keeps the Other chart colour at 3:1 or better against the page, light and dark', () => {
  const light = declarations('@theme static');
  const dark = declarations(":root[data-theme='dark']");
  expect(contrast(light['--color-chart-other']!, light['--color-bg']!)).toBeGreaterThanOrEqual(3);
  expect(contrast(dark['--color-chart-other']!, dark['--color-bg']!)).toBeGreaterThanOrEqual(3);
});
