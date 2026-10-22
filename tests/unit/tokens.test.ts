import { readFileSync } from 'node:fs';
const css = readFileSync('src/styles/tokens.css', 'utf8');
import { describe, expect, it } from 'vitest';

/** The declarations of the one rule whose selector is exactly `selector`. */
function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (body === undefined) throw new Error(`No rule for ${selector}`);
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value!.trim()]),
  );
}

/** Every color the Midnight Glass table sets, as [light, dark]. A token that is the same in both is listed twice. */
const MIDNIGHT_GLASS = {
  bg: ['#f2f2f5', '#0b0b10'],
  surface: ['#ffffff', '#15151d'],
  overlay: ['#ffffff', '#15151d'],
  'surface-2': ['#ebebf0', '#1c1c26'],
  text: ['#0b0b12', '#f4f4f8'],
  'text-muted': ['#66667a', '#a0a0b2'],
  border: ['#e6e6ec', '#24242e'],
  'border-strong': ['#d2d2db', '#30303c'],
  track: ['#ececf1', '#24242e'],
  primary: ['#0b0b12', '#f4f4f8'],
  'primary-contrast': ['#ffffff', '#0b0b10'],
  accent: ['#7c5cff', '#9d85ff'],
  'accent-contrast': ['#ffffff', '#0b0b10'],
  'accent-text': ['#5b3fe0', '#9d85ff'],
  xp: ['#7c5cff', '#9d85ff'],
  'xp-text': ['#5b3fe0', '#9d85ff'],
  'xp-contrast': ['#ffffff', '#0b0b10'],
  success: ['#147a3a', '#4ade80'],
  warning: ['#9a5900', '#f2a93b'],
  danger: ['#ca2a31', '#ff6b6f'],
  'danger-contrast': ['#ffffff', '#0b0b10'],
  focus: ['#7c5cff', '#9d85ff'],
  glass: ['rgb(255 255 255 / 0.86)', 'rgb(28 28 38 / 0.82)'],
  'glass-line': ['rgb(10 10 20 / 0.06)', 'rgb(255 255 255 / 0.08)'],
  'chart-1': ['#7c5cff', '#7c5cff'],
  'chart-2': ['#22c55e', '#16a34a'],
  'chart-3': ['#3b82f6', '#3b82f6'],
  'chart-4': ['#ec4899', '#ec4899'],
  'chart-5': ['#f59e0b', '#d97706'],
  'chart-6': ['#14b8a6', '#0d9488'],
  'chart-other': ['#868b96', '#6b7080'],
} as const;

/** The header and the glass on it look the same in both themes, so the dark rule leaves them out. */
const HERO_COLORS = {
  'hero-from': '#14121f',
  'hero-to': '#0b0b12',
  'hero-glow': 'rgb(124 92 255 / 0.55)',
  'hero-glow-2': 'rgb(37 99 235 / 0.35)',
  'hero-text': '#ffffff',
  'hero-muted': 'rgb(255 255 255 / 0.66)',
  'glass-hero': 'rgb(255 255 255 / 0.08)',
  'glass-hero-line': 'rgb(255 255 255 / 0.12)',
  scrim: 'rgb(11 11 18 / 0.35)',
} as const;

it('defines the Midnight Glass tokens', () => {
  const light = declarations('@theme static');
  const dark = declarations(":root[data-theme='dark']");
  for (const [name, [lightValue, darkValue]] of Object.entries(MIDNIGHT_GLASS)) {
    expect(light[`--color-${name}`], `${name} in light`).toBe(lightValue);
    expect(dark[`--color-${name}`], `${name} in dark`).toBe(darkValue);
  }
  for (const [name, value] of Object.entries(HERO_COLORS)) {
    expect(light[`--color-${name}`], name).toBe(value);
    expect(dark, `${name} is not themed`).not.toHaveProperty(`--color-${name}`);
  }
});

it('defines the radii, shadows, easing, type scale and font', () => {
  const light = declarations('@theme static');
  expect(light).toMatchObject({
    '--radius-tile': '24px',
    '--radius-key': '18px',
    '--radius-card': '24px',
    '--radius-sheet': '28px',
    '--radius-hero': '34px',
    '--shadow-tile': '0 1px 2px rgb(10 10 20 / 0.04)',
    '--shadow-glass': '0 12px 30px -12px rgb(10 10 20 / 0.35)',
    '--shadow-plus': '0 10px 24px -8px rgb(124 92 255 / 0.7)',
    '--ease-glass': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '--font-sans': "'Inter Tight Variable', system-ui, sans-serif",
  });
  // [size, line height, letter spacing, weight]. Body and small keep the font's own spacing.
  const type = {
    hero: ['46px', '1', '-0.045em', '800'],
    page: ['28px', '1.15', '-0.03em', '800'],
    section: ['17px', '1.25', '-0.015em', '800'],
    body: ['15px', '1.45', undefined, '500'],
    small: ['13px', '1.3', undefined, '700'],
  } as const;
  for (const [name, [size, lineHeight, letterSpacing, weight]] of Object.entries(type)) {
    expect(light[`--text-${name}`], `${name} size`).toBe(size);
    expect(light[`--text-${name}--line-height`], `${name} line height`).toBe(lineHeight);
    expect(light[`--text-${name}--letter-spacing`], `${name} letter spacing`).toBe(letterSpacing);
    expect(light[`--text-${name}--font-weight`], `${name} weight`).toBe(weight);
  }
});

it('no longer ships the pixel look', () => {
  expect(css).not.toMatch(/pixelify/i);
  expect(css).not.toContain('--color-texture');
});

it('defines the game themes', () => {
  expect(css).toContain('--color-xp-contrast: #ffffff');
  expect(css).toMatch(/\[data-game-theme='ocean'\][^}]*--color-xp: #1b5bc6/);
  expect(css).toMatch(
    /\[data-theme='dark'\]\[data-game-theme='orchid'\][^}]*--color-xp-text: #f08ae0/,
  );
});

const GAME_THEMES = {
  // Ocean's light blue is a step darker than it was, so it holds 5.5:1 on the mist page (#f2f2f5).
  ocean: { light: '#1b5bc6', dark: '#6aa6ff' },
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
  expect(declarations(":root[data-theme='dark']")['--color-xp-contrast']).toBe('#0b0b10');
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

/** Banner tone gradients: [light from, light to, light muted, dark from, dark to, dark muted]. */
const BANNER_TONES = {
  demo: ['#ede7ff', '#e3ecff', '#5b5670', '#3b2a6b', '#1e2a4a', '#c9c3e6'],
  info: ['#e2efff', '#e2f7f1', '#4a5a6b', '#1b2f4d', '#163836', '#bcd3e6'],
  warning: ['#fff0d4', '#ffe6dc', '#6b5634', '#45310f', '#3b2317', '#e8d2b0'],
  danger: ['#ffe2e2', '#ffe8f0', '#6b3a44', '#4a1b22', '#3a172e', '#f0c4cc'],
} as const;

it('defines each banner tone as a gradient and a muted line, light and dark', () => {
  const light = declarations('@theme static');
  const dark = declarations(":root[data-theme='dark']");
  for (const [tone, [lf, lt, lm, df, dt, dm]] of Object.entries(BANNER_TONES)) {
    expect([
      light[`--color-${tone}-from`],
      light[`--color-${tone}-to`],
      light[`--color-${tone}-muted`],
      dark[`--color-${tone}-from`],
      dark[`--color-${tone}-to`],
      dark[`--color-${tone}-muted`],
    ]).toEqual([lf, lt, lm, df, dt, dm]);
  }
});

it('keeps every banner tone readable on both ends of its gradient, light and dark', () => {
  for (const base of [declarations('@theme static'), declarations(":root[data-theme='dark']")]) {
    for (const tone of Object.keys(BANNER_TONES)) {
      for (const end of [base[`--color-${tone}-from`]!, base[`--color-${tone}-to`]!]) {
        // The title and the sentence use the page text colour; the second line is muted.
        expect(contrast(base['--color-text']!, end)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(base[`--color-${tone}-muted`]!, end)).toBeGreaterThanOrEqual(4.5);
        // The primary button sits on the card.
        expect(contrast(base['--color-primary']!, end)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(
      contrast(base['--color-primary-contrast']!, base['--color-primary']!),
    ).toBeGreaterThanOrEqual(4.5);
  }
});

it('leaves the danger colour off the danger banner: it is under 4.5:1 on the light gradient', () => {
  const light = declarations('@theme static');
  expect(contrast(light['--color-danger']!, light['--color-danger-from']!)).toBeLessThan(4.5);
});

/** Light, and dark (which overrides only the tokens it lists), as the app resolves them. */
const MODES = (() => {
  const light = declarations('@theme static');
  return [
    { name: 'light', t: light },
    { name: 'dark', t: { ...light, ...declarations(":root[data-theme='dark']") } },
  ] as const;
})();

/** Every background text sits on: the page, a section, a chip or card well, a dialog or toast. */
const SURFACES = ['--color-bg', '--color-surface', '--color-surface-2', '--color-overlay'] as const;

/** Tokens used for text on a surface. Body-size text needs 4.5:1 (WCAG 1.4.3). */
const TEXT_TOKENS = [
  '--color-text',
  '--color-text-muted',
  '--color-accent-text',
  '--color-xp-text',
  '--color-success',
  '--color-warning',
  '--color-danger',
] as const;

describe.each(MODES)('contrast in the $name theme', ({ t }) => {
  const token = (name: string) => {
    const value = t[name];
    if (value === undefined) throw new Error(`No ${name}`);
    return value;
  };

  it.each(TEXT_TOKENS)('keeps %s at 4.5:1 or better on every surface it sits on', (fg) => {
    for (const surface of SURFACES) {
      expect(contrast(token(fg), token(surface)), `${fg} on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it.each([
    ['--color-primary-contrast', '--color-primary'],
    ['--color-xp-contrast', '--color-xp-text'],
    // The danger button's label: white is under 3:1 on the light red of the dark theme.
    ['--color-danger-contrast', '--color-danger'],
  ])('keeps the text %s at 4.5:1 or better on its fill %s', (fg, fill) => {
    expect(contrast(token(fg), token(fill))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus ring and the XP bar at 3:1 or better (UI marks, WCAG 1.4.11)', () => {
    for (const surface of SURFACES) {
      expect(contrast(token('--color-focus'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(token('--color-xp'), token('--color-bg'))).toBeGreaterThanOrEqual(3);
    expect(contrast(token('--color-xp'), token('--color-track'))).toBeGreaterThanOrEqual(3);
  });

  it('keeps the accent icon readable on the accent fill', () => {
    // The plus button's icon is a mark, not text, so 3:1 is the bar (WCAG 1.4.11).
    expect(
      contrast(token('--color-accent-contrast'), token('--color-accent')),
    ).toBeGreaterThanOrEqual(3);
  });

  it('keeps an off switch visible: its track on the page, and its knob on the track, at 3:1', () => {
    // The track is the muted text colour, the knob the colour of text on a primary button.
    expect(contrast(token('--color-text-muted'), token('--color-bg'))).toBeGreaterThanOrEqual(3);
    expect(
      contrast(token('--color-primary-contrast'), token('--color-text-muted')),
    ).toBeGreaterThanOrEqual(3);
  });
});

it('keeps the white icon on each Menu row colour at 3:1 or better, in both themes', async () => {
  const { MENU_GROUPS } = await import('../../src/app/menu');
  for (const { title, items } of MENU_GROUPS) {
    for (const { label, color } of items) {
      expect(contrast('#ffffff', color), `${title} / ${label}`).toBeGreaterThanOrEqual(3);
    }
  }
});

it('gives the danger button a label colour of its own, white on light and ink on dark', () => {
  expect(declarations('@theme static')['--color-danger-contrast']).toBe('#ffffff');
  expect(declarations(":root[data-theme='dark']")['--color-danger-contrast']).toBe('#0b0b10');
});

/** A `#rrggbb` or `rgb(r g b / a)` color as [r, g, b, alpha], the channels 0-255. */
function parseColor(value: string): [number, number, number, number] {
  if (value.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
    return [r!, g!, b!, 1];
  }
  const match = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (!match) throw new Error(`Not a color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
}

/** `top` painted over the opaque `bottom`, as the #rrggbb the eye sees. */
function composite(top: string, bottom: string): string {
  const [tr, tg, tb, alpha] = parseColor(top);
  const [br, bg, bb] = parseColor(bottom);
  const mix = (t: number, b: number) =>
    Math.round(t * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(tr, br)}${mix(tg, bg)}${mix(tb, bb)}`;
}

it('keeps header text readable on the brightest point of the header', () => {
  const t = declarations('@theme static');
  // The violet glow at its strongest, on the header's top color: the lightest the header gets.
  const brightest = composite(t['--color-hero-glow']!, t['--color-hero-from']!);
  expect(brightest).toBe('#4d3b9a');
  expect(contrast(t['--color-hero-text']!, brightest)).toBeGreaterThanOrEqual(4.5);
  // The muted line is white at 66%, so what the eye sees is that white over the same point.
  const muted = composite(t['--color-hero-muted']!, brightest);
  expect(contrast(muted, brightest)).toBeGreaterThanOrEqual(4.5);
});

/*
 * The chart series, held to the same four gates as the data-viz palette validator: each color's
 * lightness (OKLCH L) inside the theme's band, its chroma above the floor where a hue reads as grey,
 * and every neighbour apart by OKLab ΔE (×100) under protan and deutan vision and under normal vision.
 * The CVD simulation is Machado, Oliveira and Fernandes (2009) at severity 1.0, which the thresholds
 * are calibrated to. Neighbours are slots 1-2 up to 5-6 and the donut's wraps, 5 to 1 (a five-slice
 * donut) and 6 to 1.
 */
const L_BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] } as const;
const CHROMA_FLOOR = 0.1;
const CVD_MIN = 8;
const NORMAL_MIN = 15;

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

type Rgb = [number, number, number];

/** The linear-light channels of a #rrggbb color. */
function linear(hex: string): Rgb {
  const [r, g, b] = parseColor(hex);
  return [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
}

/** Linear-light RGB to OKLab [L, a, b]. */
function oklabOf([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** What a viewer with `kind` of color blindness sees, in linear-light RGB; no kind is normal vision. */
function seen(hex: string, kind?: keyof typeof MACHADO): Rgb {
  const rgb = linear(hex);
  if (!kind) return rgb;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return MACHADO[kind].map((row) =>
    clamp(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]),
  ) as Rgb;
}

/** Euclidean distance in OKLab, ×100. */
function deltaE(a: string, b: string, kind?: keyof typeof MACHADO): number {
  const [l1, a1, b1] = oklabOf(seen(a, kind));
  const [l2, a2, b2] = oklabOf(seen(b, kind));
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe.each(MODES)(
  'validates the chart series like the palette validator in the $name theme',
  ({ name, t }) => {
    const series = [1, 2, 3, 4, 5, 6].map((n) => t[`--color-chart-${n}`]!);
    // Zero-based pairs of neighbours: 1-2, 2-3, 3-4, 4-5, 5-6, then 5-1 and 6-1.
    const neighbours = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [4, 0],
      [5, 0],
    ] as const;

    it('keeps every color inside the lightness band and above the chroma floor', () => {
      const [low, high] = L_BAND[name];
      for (const color of series) {
        const [lightness, a, b] = oklabOf(linear(color));
        expect(lightness, `${color} lightness`).toBeGreaterThanOrEqual(low);
        expect(lightness, `${color} lightness`).toBeLessThanOrEqual(high);
        expect(Math.hypot(a, b), `${color} chroma`).toBeGreaterThanOrEqual(CHROMA_FLOOR);
      }
    });

    it.each(['protan', 'deutan'] as const)(
      'keeps neighbours apart for %s vision (ΔE×100 of 8 or more)',
      (kind) => {
        for (const [i, j] of neighbours) {
          const distance = deltaE(series[i]!, series[j]!, kind);
          expect(distance, `${series[i]} and ${series[j]}`).toBeGreaterThanOrEqual(CVD_MIN);
        }
      },
    );

    it('keeps neighbours apart for normal vision (ΔE×100 of 15 or more)', () => {
      for (const [i, j] of neighbours) {
        const distance = deltaE(series[i]!, series[j]!);
        expect(distance, `${series[i]} and ${series[j]}`).toBeGreaterThanOrEqual(NORMAL_MIN);
      }
    });
  },
);
