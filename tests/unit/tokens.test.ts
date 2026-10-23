import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declarations, resolve, themesCss, tokensCss, varsOn } from './cssTokens';

const indexCss = readFileSync('src/styles/index.css', 'utf8');

/** The twelve shop themes, in the order of the shop. Black & White is the default. */
const THEMES = [
  'mono',
  'sky',
  'lemon',
  'pastel',
  'daisy',
  'peach',
  'powder',
  'seafoam',
  'navy',
  'forest',
  'plum',
  'espresso',
] as const;

/** Black & White and the four dark themes have a dark top block; the other seven have a light one. */
const DARK_BLOCK = new Set<string>(['mono', 'navy', 'forest', 'plum', 'espresso']);

const MODES = ['light', 'dark'] as const;

/** One theme in one mode, as the app resolves its tokens: `t('--color-bg')`, with every `var()` followed. */
function tokensFor(theme: string, mode: (typeof MODES)[number]): (name: string) => string {
  const vars = varsOn({
    ...(mode === 'dark' ? { 'data-theme': 'dark' } : {}),
    'data-game-theme': theme,
  });
  return (name) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`No ${name} for ${theme} in ${mode}`);
    return resolve(value, vars);
  };
}

/** WCAG contrast ratio of two opaque colors. */
function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, blue] = parseColor(color)
      .slice(0, 3)
      .map((channel) => {
        const v = channel / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * blue!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A `#rgb`, `#rrggbb`, `rgb(r g b / a)` or `rgba(r, g, b, a)` color as [r, g, b, alpha], the channels 0-255. */
function parseColor(value: string): [number, number, number, number] {
  if (value.startsWith('#')) {
    const hex =
      value.length === 4 ? [...value.slice(1)].map((c) => c + c) : value.slice(1).match(/../g)!;
    const [r, g, b] = hex.map((pair) => parseInt(pair, 16));
    return [r!, g!, b!, 1];
  }
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
    value,
  );
  if (!match) throw new Error(`Not a color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)];
}

/** `top` (its alpha scaled by `strength`) painted over the opaque `bottom`, as the #rrggbb the eye sees. */
function composite(top: string, bottom: string, strength = 1): string {
  const [tr, tg, tb, topAlpha] = parseColor(top);
  const alpha = topAlpha * strength;
  const [br, bg, bb] = parseColor(bottom);
  const mix = (t: number, b: number) =>
    Math.round(t * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  return `#${mix(tr, br)}${mix(tg, bg)}${mix(tb, bb)}`;
}

/**
 * The text, surface, status and chart colors, as [light, dark]. In dark mode they are 0.11's. In light
 * mode four text colors are darker than 0.11's so they hold 4.5:1 on a shape behind the page (muted
 * #66667a, success #147a3a, warning #9a5900, danger #ca2a31), and the grey of "Other" is a step darker
 * than 0.11's #868b96, which was 2.95:1 on the Black & White page.
 */
const BASE_COLORS = {
  surface: ['#ffffff', '#15151d'],
  overlay: ['#ffffff', '#15151d'],
  'surface-2': ['#ebebf0', '#1c1c26'],
  text: ['#0b0b12', '#f4f4f8'],
  'text-muted': ['#5a5a6c', '#a0a0b2'],
  border: ['#e6e6ec', '#24242e'],
  'border-strong': ['#d2d2db', '#30303c'],
  track: ['#ececf1', '#24242e'],
  primary: ['#0b0b12', '#f4f4f8'],
  'primary-contrast': ['#ffffff', '#0b0b10'],
  success: ['#116a33', '#4ade80'],
  warning: ['#874e00', '#f2a93b'],
  danger: ['#af242b', '#ff6b6f'],
  'danger-contrast': ['#ffffff', '#0b0b10'],
  'chart-1': ['#7c5cff', '#7c5cff'],
  'chart-2': ['#22c55e', '#16a34a'],
  'chart-3': ['#3b82f6', '#3b82f6'],
  'chart-4': ['#ec4899', '#ec4899'],
  'chart-5': ['#f59e0b', '#d97706'],
  'chart-6': ['#14b8a6', '#0d9488'],
  'chart-other': ['#838893', '#6b7080'],
} as const;

it('keeps the surface, text, status and chart tokens', () => {
  const light = declarations('@theme static');
  const dark = declarations(":root[data-theme='dark']");
  for (const [name, [lightValue, darkValue]] of Object.entries(BASE_COLORS)) {
    expect(light[`--color-${name}`], `${name} in light`).toBe(lightValue);
    // A token that is the same in both is only written once, in the light block.
    expect(dark[`--color-${name}`] ?? light[`--color-${name}`], `${name} in dark`).toBe(darkValue);
  }
});

/**
 * The theme variables the page colors read. The accent, the page and the top block are the theme's;
 * these tokens only point at them, so the theme set on <html> is all it takes.
 */
const MAPPING = {
  '--color-bg': 'var(--page)',
  '--color-accent': 'var(--accent)',
  '--color-accent-contrast': 'var(--accent-ink)',
  // The accent is already dark enough to be text on the page, so these are the same color.
  '--color-accent-text': 'var(--accent)',
  '--color-xp': 'var(--accent)',
  '--color-xp-text': 'var(--accent)',
  '--color-xp-contrast': 'var(--accent-ink)',
  '--color-focus': 'var(--accent)',
  '--color-head-ink': 'var(--head-ink)',
  '--color-hmain': 'var(--hmain)',
  '--color-hmain-ink': 'var(--hmain-ink)',
  '--color-ring': 'var(--ring)',
  '--color-hero-xp': 'var(--xp)',
  // 0.11's names for the top block, until the screens that use them are rebuilt.
  '--color-hero-text': 'var(--head-ink)',
  '--color-hero-to': 'var(--av-ink)',
  '--color-glass-hero': 'var(--hg-bg)',
  '--color-glass-hero-line': 'var(--hg-line)',
} as const;

it('points the color tokens at the theme', () => {
  expect(declarations('@theme static')).toMatchObject(MAPPING);
});

it('keeps the muted header line of 0.11 as the block ink at 88%', () => {
  expect(declarations('@theme static')['--color-hero-muted']).toBe(
    'color-mix(in srgb, var(--head-ink) 88%, transparent)',
  );
});

it('defines the glass colors and the dark page', () => {
  const light = declarations('@theme static');
  const dark = declarations(":root[data-theme='dark']");
  expect(light).toMatchObject({
    // The glass on the page, the thicker glass for pieces that hang over the block, and the tab bar.
    '--color-glass': 'rgb(255 255 255 / 0.48)',
    '--color-glass-line': 'rgb(255 255 255 / 0.85)',
    '--color-glass-hi': '#ffffff',
    '--color-glass-strong': 'rgb(255 255 255 / 0.66)',
    '--color-glass-bar': 'rgb(255 255 255 / 0.78)',
    '--color-glass-bar-line': 'rgb(0 0 0 / 0.07)',
    // The frosted surface of a sheet and a dialog: the overlay colour at 90%.
    '--color-glass-sheet': 'rgb(255 255 255 / 0.9)',
    '--color-scrim': 'rgb(11 11 18 / 0.35)',
  });
  expect(dark).toMatchObject({
    '--color-bg': '#0b0b10',
    '--color-glass': 'rgb(28 28 38 / 0.55)',
    '--color-glass-line': 'rgb(255 255 255 / 0.08)',
    '--color-glass-hi': 'rgb(255 255 255 / 0.08)',
    '--color-glass-strong': 'rgb(28 28 38 / 0.82)',
    '--color-glass-bar': 'rgb(28 28 38 / 0.78)',
    '--color-glass-bar-line': 'rgb(255 255 255 / 0.08)',
    '--color-glass-sheet': 'rgb(21 21 29 / 0.9)',
  });
  // The shapes behind the page are 40% as strong on the dark page.
  expect(declarations(':root')).toMatchObject({ '--page-blobs-strength': '1' });
  expect(dark['--page-blobs-strength']).toBe('0.4');
  // The top block is the theme's in both modes, so dark leaves it alone.
  for (const name of Object.keys(MAPPING)) {
    if (name !== '--color-bg') expect(dark, name).not.toHaveProperty(name);
  }
});

it('defines the radii, shadows, easing, type scale and font', () => {
  const light = declarations('@theme static');
  expect(light).toMatchObject({
    '--radius-tile': '24px',
    '--radius-key': '18px',
    '--radius-card': '24px',
    '--radius-sheet': '28px',
    '--radius-hero': '36px',
    '--shadow-tile': '0 1px 2px rgb(10 10 20 / 0.04)',
    '--shadow-glass': '0 12px 28px -18px var(--shadow-tint)',
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

it('holds src/lib/motion.ts to the motion variables: the :root timings in seconds, and the easing', async () => {
  const { MOTION } = await import('../../src/lib/motion');
  const inMs = (seconds: number) => `${Math.round(seconds * 1000)}ms`;
  expect(declarations(':root')).toMatchObject({
    '--duration-press': inMs(MOTION.press),
    '--duration-small': inMs(MOTION.small),
    '--duration-standard': inMs(MOTION.standard),
    '--stagger-rise': inMs(MOTION.stagger),
    '--duration-count': inMs(MOTION.countUp),
    '--press-scale': String(MOTION.pressScale),
  });
  expect(declarations('@theme static')['--ease-glass']).toBe(
    `cubic-bezier(${MOTION.ease.join(', ')})`,
  );
});

it('no longer ships the pixel look, the violet accent or the 0.11 game themes', () => {
  expect(tokensCss).not.toMatch(/pixelify/i);
  expect(tokensCss).not.toContain('--color-texture');
  for (const old of ['ocean', 'orchid', 'graphite', 'violet']) {
    expect(tokensCss, old).not.toContain(`data-game-theme='${old}'`);
    expect(themesCss, old).not.toContain(`data-game-theme='${old}'`);
  }
  expect(tokensCss).not.toContain('--color-hero-from');
  expect(tokensCss).not.toContain('--color-hero-glow');
  // The ＋ and its fan are gone, and their glow and stagger with them.
  expect(tokensCss).not.toContain('--shadow-plus');
  expect(tokensCss).not.toContain('--stagger-fan');
});

/*
 * The themes. Each is one rule in themes.css under :root[data-game-theme='<id>'] (what <html> gets
 * from the equipped shop theme) and [data-theme-preview='<id>'] (a Shop card showing the theme), and
 * each sets all twenty variables: the top block and its glass, the page and its shapes, the buttons,
 * the XP bar, the avatar and the cards.
 */
const THEME_VARS = [
  '--head',
  '--head-blobs',
  '--head-ink',
  '--page',
  '--page-blobs',
  '--hg-bg',
  '--hg-line',
  '--hg-hi',
  '--hmain',
  '--hmain-ink',
  '--accent',
  '--accent-ink',
  '--ring',
  '--xp',
  '--av',
  '--av-ink',
  '--card-tint',
  '--card-tint-2',
  '--card-tint-3',
  '--shadow-tint',
] as const;

/** The accent on the dark page: the light accent lightened to about 5.7:1 on surface-2, as 0.11's violet was. */
const DARK_ACCENT = {
  mono: '#f4f4f8',
  sky: '#6594fe',
  lemon: '#46a977',
  pastel: '#a381fe',
  daisy: '#839f6b',
  peach: '#ea7642',
  powder: '#748fff',
  seafoam: '#3ea696',
  navy: '#6393fe',
  forest: '#48a97e',
  plum: '#b878ff',
  espresso: '#d88044',
} as const;

describe.each(THEMES)('the %s theme', (id) => {
  it('sets every theme variable, for the app and for a Shop preview', () => {
    const rule = declarations(`:root[data-game-theme='${id}']`, themesCss);
    expect(Object.keys(rule).sort()).toEqual([...THEME_VARS].sort());
    expect(declarations(`[data-theme-preview='${id}']`, themesCss)).toEqual(rule);
  });

  it('has the glass and the ink of its kind of top block', () => {
    const rule = declarations(`:root[data-game-theme='${id}']`, themesCss);
    const glass = [rule['--hg-bg']!, rule['--hg-line']!, rule['--hg-hi']!].map(parseColor);
    if (DARK_BLOCK.has(id)) {
      expect(glass).toEqual([
        [255, 255, 255, 0.1],
        [255, 255, 255, 0.2],
        [255, 255, 255, 0.22],
      ]);
      expect(rule).toMatchObject({ '--head-ink': '#fff', '--av-ink': '#0b0b0c' });
    } else {
      expect(glass).toEqual([
        [255, 255, 255, 0.42],
        [255, 255, 255, 0.85],
        [255, 255, 255, 1],
      ]);
      expect(rule['--av-ink']).toBe('#fff');
      expect(rule['--head-ink'], 'a light block has its own dark ink').toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has a dark-mode accent of its own, with dark ink on it', () => {
    const rule = declarations(`:root[data-theme='dark'][data-game-theme='${id}']`, themesCss);
    expect(rule['--accent']).toBe(DARK_ACCENT[id]);
    expect(rule['--accent-ink']).toBe('#0b0b10');
  });
});

/**
 * Where a value in design/redesign-v3/glass-themes.html failed a check below, the one token was
 * darkened to the value here: [wireframe, built]. Every other value is the wireframe's. The accents
 * are darkened until they hold 4.5:1 on the page and on the darkest shape behind it (plain rows sit
 * there), and on the tab bar and surface-2; the block's own colors only where their label or mark failed.
 */
const FROM_THE_WIREFRAME = {
  sky: { '--accent': ['#2f5fe0', '#2b56cc'] },
  lemon: { '--hmain': ['#1f8a5a', '#198657'], '--accent': ['#1f8a5a', '#007448'] },
  pastel: { '--accent': ['#7c4ddb', '#7346cc'] },
  daisy: { '--accent': ['#56703f', '#4f673a'] },
  peach: {
    '--hmain': ['#d2602a', '#c4531a'],
    '--accent': ['#d2602a', '#af4301'],
    '--xp': ['#d2602a', '#cd5c25'],
  },
  powder: { '--accent': ['#4a5fd6', '#4457c5'] },
  seafoam: { '--hmain': ['#13897a', '#068476'], '--accent': ['#13897a', '#007367'] },
  navy: { '--accent': ['#2557d6', '#2352cb'] },
  forest: { '--accent': ['#0f7f57', '#006f4b'] },
  plum: { '--accent': ['#8a2fd6', '#812cc8'] },
  espresso: { '--accent': ['#a65308', '#994c07'] },
} as const;

it('changes only the listed values from the wireframe', () => {
  for (const [id, changes] of Object.entries(FROM_THE_WIREFRAME)) {
    const rule = declarations(`:root[data-game-theme='${id}']`, themesCss);
    for (const [name, [wireframe, built]] of Object.entries(changes)) {
      expect(rule[name], `${id} ${name} (the wireframe has ${wireframe})`).toBe(built);
    }
  }
});

it('makes Black & White the default, and what the app does not know', () => {
  const mono = declarations(`:root[data-game-theme='mono']`, themesCss);
  expect(declarations(':root', themesCss)).toEqual(mono);
  expect(mono).toMatchObject({
    '--page': '#eeeef0',
    '--accent': '#0b0b0c',
    '--accent-ink': '#fff',
    '--hmain': '#fff',
    '--hmain-ink': '#0b0b0c',
    '--ring': '#fff',
    '--xp': '#fff',
    '--av': '#fff',
  });
  // The wireframe leaves the tint to a fallback: black at 35%.
  expect(parseColor(mono['--shadow-tint']!)).toEqual([0, 0, 0, 0.35]);
  // A stored theme the app no longer has (or none at all) reads as Black & White, in both modes.
  const unknowns: Record<string, string>[] = [{}, { 'data-game-theme': 'violet' }];
  for (const unknown of unknowns) {
    expect(varsOn(unknown)['--page']).toBe('#eeeef0');
    expect(varsOn(unknown)['--accent']).toBe('#0b0b0c');
    expect(varsOn({ ...unknown, 'data-theme': 'dark' })['--accent']).toBe('#f4f4f8');
  }
  expect(varsOn({ 'data-theme': 'dark' })['--accent-ink']).toBe('#0b0b10');
});

it('keeps each theme its own page shapes in dark mode, as the dark default comes before the themes', () => {
  // The dark default and a theme's own rule match with the same weight; the theme has to win.
  expect(varsOn({ 'data-theme': 'dark', 'data-game-theme': 'sky' })['--page-blobs']).toBe(
    declarations(`:root[data-game-theme='sky']`, themesCss)['--page-blobs'],
  );
  expect(varsOn({ 'data-theme': 'dark', 'data-game-theme': 'sky' })['--accent']).toBe(
    DARK_ACCENT.sky,
  );
});

it('gives Black & White shapes of its own on the dark page, where its white one would glare', () => {
  const dark = varsOn({ 'data-theme': 'dark' })['--page-blobs']!;
  expect(dark).not.toBe(declarations(':root', themesCss)['--page-blobs']);
  for (const strength of dark.match(/rgba\([^)]*\)/g)!) {
    // At 40% strength a glow of this alpha must not lift the dark page by more than a few percent.
    expect(parseColor(strength)[3] * 0.4).toBeLessThanOrEqual(0.1);
  }
});

/** The utilities in index.css: `@utility name { … }`. */
function utility(name: string): string {
  const body = new RegExp(`@utility ${name} \\{([\\s\\S]*?)\\n\\}`).exec(indexCss)?.[1];
  if (body === undefined) throw new Error(`No utility ${name}`);
  return body.replace(/\s+/g, ' ');
}

it('defines the glass recipes of the wireframe', () => {
  // Glass on the block: the theme's own glass, 22px blur.
  expect(utility('glass-head')).toContain('var(--hg-bg)');
  expect(utility('glass-head')).toContain('1px solid var(--hg-line)');
  expect(utility('glass-head')).toContain('inset 0 1px 0 var(--hg-hi)');
  // Glass on the page, and the thicker variant for what hangs over the edge of the block.
  expect(utility('glass')).toContain('background: var(--color-glass)');
  expect(utility('glass')).toContain('1px solid var(--color-glass-line)');
  expect(utility('glass')).toContain('inset 0 1px 0 var(--color-glass-hi)');
  expect(utility('glass')).toContain('0 12px 28px -18px var(--shadow-tint)');
  // Glass strong is glass with its background swapped, so it keeps the blur and the edges.
  expect(utility('glass-strong')).toContain('@apply glass');
  expect(utility('glass-strong')).toContain('background: var(--color-glass-strong)');
  // What hangs over the block's edge has its ring round it, mostly on the page: the accent again (held
  // on the page below), not the block's ink, which can be as light as the page.
  expect(utility('glass-strong')).toContain('--color-focus: var(--accent)');
  for (const name of ['glass-head', 'glass']) {
    expect(utility(name), name).toContain('blur(22px) saturate(180%)');
  }
  expect(utility('glass-bar')).toContain('var(--color-glass-bar)');
  expect(utility('glass-bar')).toContain('blur(20px) saturate(180%)');
});

it('defines the frosted surface of a sheet and a dialog, whose dark colour comes from the token', () => {
  // The inner-screens wireframe's .sheet: the surface at 90%, a 1px lit top edge, blur(24px).
  expect(utility('glass-sheet')).toContain('background: var(--color-glass-sheet)');
  expect(utility('glass-sheet')).toContain('box-shadow: inset 0 1px 0 var(--color-glass-hi)');
  expect(utility('glass-sheet')).toContain('backdrop-filter: blur(24px) saturate(180%)');
  // The shadow is the <dialog>'s, which is clear: the frost sits on the box inside it.
  expect(utility('glass-sheet')).not.toContain('var(--shadow-overlay)');
  // Nothing in it names a colour: both modes come from the tokens.
  expect(utility('glass-sheet')).not.toMatch(/#[0-9a-f]{3,6}|rgba?\(/);
  // The token is the overlay colour at 90% in each mode, so the sheet reads as the page's overlay.
  for (const [mode, vars] of [
    ['light', declarations('@theme static')],
    ['dark', declarations(":root[data-theme='dark']")],
  ] as const) {
    const [r, g, b, alpha] = parseColor(vars['--color-glass-sheet']!);
    const [or, og, ob] = parseColor(vars['--color-overlay']!);
    expect([r, g, b], mode).toEqual([or, og, ob]);
    expect(alpha, mode).toBe(0.9);
  }
});

it("gives back the page's ink to a page surface drawn inside the block (a menu opened from it)", () => {
  // Inside the block the text tokens are its ink; primary is not taken over, and it is the page's
  // ink in both modes.
  expect(utility('page-ink')).toContain('--color-text: var(--color-primary)');
  expect(utility('page-ink')).toContain('--color-focus: var(--accent)');
  const light = declarations('@theme static');
  const dark = declarations(":root[data-theme='dark']");
  expect(light['--color-primary']).toBe(light['--color-text']);
  expect(dark['--color-primary']).toBe(dark['--color-text']);
});

it('defines the block, the two main buttons and the shapes behind the page', () => {
  expect(utility('bg-head')).toContain('var(--head-blobs), var(--head)');
  // The focus ring on the block is the block's ink: the accent can be as dark as the block itself.
  expect(utility('bg-head')).toContain('--color-focus: var(--head-ink)');
  expect(utility('btn-head')).toContain('var(--hmain)');
  expect(utility('btn-head')).toContain('color: var(--hmain-ink)');
  expect(utility('btn-accent')).toContain('var(--accent)');
  expect(utility('btn-accent')).toContain('color: var(--accent-ink)');
  expect(utility('page-blobs')).toContain('var(--page-blobs)');
  expect(utility('page-blobs')).toContain('position: fixed');
  expect(utility('page-blobs')).toContain('var(--page-blobs-strength)');
  // 0.11's name for the block, kept until the header is rebuilt.
  expect(utility('bg-hero')).toContain('bg-head');
  // The tab bar: 56px of tabs over the bottom edge's safe area, at least 30px of it: 86px on most phones.
  expect(indexCss).toContain('--tab-bar: calc(56px + max(30px, env(safe-area-inset-bottom)));');
});

/*
 * Contrast, for every theme in both modes. The top block is the theme's in both, so its checks run
 * twice; the page, the glass over it and the accent are what change with the mode.
 */
const CASES = THEMES.flatMap((id) => MODES.map((mode) => ({ id, mode })));

/**
 * Where, as a share of a button's height, its label's glyphs begin: a 44px pill with 14px text has its
 * capitals from about 38% to 62%. Under the shine the label can only be lighter-backed at the top.
 */
const GLYPH_TOP = 0.38;

/** The share of white a main button's shine lays over its fill `position` of the way down (0 top, 1 bottom). */
function shineAt(name: 'btn-head' | 'btn-accent', position: number): number {
  const match =
    /linear-gradient\(180deg, rgb\(255 255 255 \/ ([\d.]+)\), rgb\(255 255 255 \/ 0\) (\d+)%\)/.exec(
      utility(name),
    );
  if (!match) throw new Error(`No shine in ${name}`);
  return Number(match[1]) * Math.max(0, 1 - position / (Number(match[2]) / 100));
}

/** What text on a plain row can be: the ink, the muted line, the accent and the three status colors. */
const ROW_TEXT = [
  '--color-text',
  '--color-text-muted',
  '--color-accent',
  '--color-success',
  '--color-warning',
  '--color-danger',
] as const;

/** The colors the block's text can sit on: each end of its gradient, and each glow at full strength over each end. */
function blockBackdrops(t: (name: string) => string): string[] {
  const stops = t('--head').match(/#[0-9a-f]{6}/gi)!;
  const glows = t('--head-blobs').match(/rgba?\([^)]*\)/g)!;
  expect(stops, 'the two ends of the block').toHaveLength(2);
  expect(glows, 'the three glows in the block').toHaveLength(3);
  return stops.flatMap((stop) => [stop, ...glows.map((glow) => composite(glow, stop))]);
}

/**
 * A share of the block ink, as the color it paints: 0.11's muted header line by default, or Home's
 * dimmed hero (`--color-head-dim`, `--color-head-faint`).
 */
function mutedInk(t: (name: string) => string, name = '--color-hero-muted'): string {
  const match = /^color-mix\(in srgb, (#[0-9a-f]{3,6}) (\d+)%, transparent\)$/.exec(t(name));
  if (!match) throw new Error(`Not a muted ink: ${t(name)}`);
  const [r, g, b] = parseColor(match[1]!);
  return `rgb(${r} ${g} ${b} / ${Number(match[2]) / 100})`;
}

/**
 * The ink SegmentedControl writes its options not chosen in on the block's glass, as the color it
 * paints: read from the component, as the 88% muted line falls under 4.5:1 on that glass over the
 * brightest glows of Forest Night and Espresso.
 */
function heroIdleInk(t: (name: string) => string): string {
  const source = readFileSync('src/components/ui/SegmentedControl.tsx', 'utf8');
  // The labels not chosen: `: hero ? 'text-…'` (the chosen ones read `? hero ? …`).
  const name = /:\s*hero\s*\?\s*'text-([\w-]+)'/.exec(source)?.[1];
  if (!name) throw new Error('No ink for the options not chosen on the block glass');
  const value = t(`--color-${name}`);
  return value.startsWith('color-mix(') ? mutedInk(t, `--color-${name}`) : value;
}

describe.each(CASES)('the $id theme in $mode mode', ({ id, mode }) => {
  const t = tokensFor(id, mode);

  it('keeps the block text at 4.5:1 or better on the block, on its brightest glow and under its glass', () => {
    for (const backdrop of blockBackdrops(t)) {
      expect(contrast(t('--head-ink'), backdrop), `ink on ${backdrop}`).toBeGreaterThanOrEqual(4.5);
      const glass = composite(t('--hg-bg'), backdrop);
      expect(
        contrast(t('--head-ink'), glass),
        `ink on glass over ${backdrop}`,
      ).toBeGreaterThanOrEqual(4.5);
      // 0.11's muted line, which the header keeps until it is rebuilt.
      expect(
        contrast(composite(mutedInk(t), backdrop), backdrop),
        `muted on ${backdrop}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the focus ring, the block ink, at 3:1 or better on the block, its glow and its glass', () => {
    for (const backdrop of blockBackdrops(t)) {
      expect(contrast(t('--head-ink'), backdrop), backdrop).toBeGreaterThanOrEqual(3);
      const glass = composite(t('--hg-bg'), backdrop);
      expect(contrast(t('--head-ink'), glass), backdrop).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the Shop's tabs not chosen at 4.5:1 or better on the block glass, on every point of it", () => {
    // Themes, Avatars and Freezes are a SegmentedControl on the block's glass (`tone="hero"`).
    const ink = heroIdleInk(t);
    for (const backdrop of blockBackdrops(t)) {
      const glass = composite(t('--hg-bg'), backdrop);
      expect(contrast(composite(ink, glass), glass), `over ${backdrop}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps the main button label at 4.5:1 or better on the button, under its shine', () => {
    expect(contrast(t('--hmain-ink'), t('--hmain'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('--accent-ink'), t('--accent'))).toBeGreaterThanOrEqual(4.5);
    // The label's glyphs begin GLYPH_TOP of the way down the button; the shine is white over the fill there.
    for (const [name, fill, ink] of [
      ['btn-head', '--hmain', '--hmain-ink'],
      ['btn-accent', '--accent', '--accent-ink'],
    ] as const) {
      const shined = composite(`rgb(255 255 255 / ${shineAt(name, GLYPH_TOP)})`, t(fill));
      expect(contrast(t(ink), shined), `${name} label under its shine`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the text on plain rows at 4.5:1 or better on the page and on every shape behind it', () => {
    // Recent, Categories, Bills, Loans and the Profile menus have no glass: their text sits on the page
    // and on the peak of whichever page shape is behind it, at the strength the mode gives the shapes.
    const page = t('--color-bg');
    const strength = Number(t('--page-blobs-strength'));
    const peaks = t('--page-blobs').match(/rgba?\([^)]*\)/g)!;
    expect(peaks.length, 'the shapes behind the page').toBeGreaterThanOrEqual(2);
    for (const fg of ROW_TEXT) {
      for (const backdrop of [page, ...peaks.map((peak) => composite(peak, page, strength))]) {
        expect(contrast(t(fg), backdrop), `${fg} on ${backdrop}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the current tab label at 4.5:1 or better on the page and on the tab bar over it', () => {
    const page = t('--color-bg');
    expect(contrast(t('--accent'), page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t('--accent'), composite(t('--color-glass-bar'), page))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('keeps text and muted text at 4.5:1 or better on the page and on the glass over it', () => {
    const page = t('--color-bg');
    const glass = composite(t('--color-glass'), page);
    // Home's Overview tiles write what came in and went out in the success and danger colors.
    for (const fg of ['--color-text', '--color-text-muted', '--color-success', '--color-danger']) {
      expect(contrast(t(fg), page), `${fg} on the page`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t(fg), glass), `${fg} on the glass`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the text, muted, accent and status colours at 4.5:1 or better on a sheet or dialog, over anything the page can show behind it', () => {
    // The sheet is the surface at 90%, so a tenth of what is behind it shows through: the page and
    // its shapes, the dimmed block, or a dark or white card. Black and white bound all of those.
    const page = t('--color-bg');
    const strength = Number(t('--page-blobs-strength'));
    const peaks = t('--page-blobs').match(/rgba?\([^)]*\)/g)!;
    const behind = [
      '#000000',
      '#ffffff',
      page,
      ...peaks.map((peak) => composite(peak, page, strength)),
    ];
    for (const fg of ROW_TEXT) {
      for (const backdrop of behind) {
        const sheet = composite(t('--color-glass-sheet'), backdrop);
        expect(
          contrast(t(fg), sheet),
          `${fg} on the sheet over ${backdrop}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the text on the thick glass that hangs over the block at 4.5:1 or better on every point of it', () => {
    // The bill bubbles' initials and the Available pill's words: the ink of the page, never muted.
    for (const backdrop of blockBackdrops(t)) {
      const glass = composite(t('--color-glass-strong'), backdrop);
      expect(contrast(t('--color-text'), glass), `over ${backdrop}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the XP fill at 3:1 or better on its glass track on the block, and the initials readable', () => {
    for (const backdrop of blockBackdrops(t)) {
      const track = composite(t('--hg-bg'), backdrop);
      expect(contrast(t('--xp'), track), `xp on ${track}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(t('--av-ink'), t('--av'))).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The glass of a tile on the page over each backdrop it can sit on: the page, and the peak of each
 * shape behind it at the mode's strength.
 */
function glassOnPage(t: (name: string) => string): string[] {
  const page = t('--color-bg');
  const strength = Number(t('--page-blobs-strength'));
  const peaks = t('--page-blobs').match(/rgba?\([^)]*\)/g)!;
  return [page, ...peaks.map((peak) => composite(peak, page, strength))].map((backdrop) =>
    composite(t('--color-glass'), backdrop),
  );
}

/** Whether the muted ink at `share` (0-1) falls under `ratio` on the glass, in some theme in some mode. */
function quietBarsFail(share: number, ratio: number): boolean {
  return CASES.some(({ id, mode }) => {
    const t = tokensFor(id, mode);
    const [r, g, b] = parseColor(t('--color-text-muted'));
    const ink = `rgb(${r} ${g} ${b} / ${share})`;
    return glassOnPage(t).some((glass) => contrast(composite(ink, glass), glass) < ratio);
  });
}

/** What the glass's saturate(180%), which this model leaves out, may take off the 3:1 of a bar. */
const BAR_MARGIN = 0.2;

/** The charts on page glass whose bars that are not picked are the only mark of their amounts. */
const QUIET_BARS = ['src/components/charts/DayBars.tsx', 'src/features/cards/SpendChart.tsx'];

it.each(QUIET_BARS)(
  "draws a chart's quiet bars in a share of the muted ink that holds 3:1 on the glass, with room to spare (%s)",
  (file) => {
    // A bar's length is the only mark of its period's amount until it is tapped, so the bars that
    // are not picked are graphics (WCAG 1.4.11: 3:1). DayBars and the Cards chart paint them
    // `bg-muted/NN`. NN holds 3:1 plus a margin in every theme in both modes, over every shape behind
    // the glass.
    const match = /bg-muted\/(\d+)/.exec(readFileSync(file, 'utf8'));
    expect(match, `the quiet bars in ${file}`).not.toBeNull();
    const percent = Number(match![1]);
    expect(quietBarsFail(percent / 100, 3 + BAR_MARGIN), `bg-muted/${percent}`).toBe(false);
  },
);

it('measures the quiet bars in a model that bites', () => {
  // 70 is the least whole share that reaches 3:1 at all.
  expect(quietBarsFail(0.7, 3), 'bg-muted/70').toBe(false);
  expect(quietBarsFail(0.69, 3), 'bg-muted/69').toBe(true);
  // What the bars had never did: DayBars' track colour (about 1.1:1) and the Cards chart's
  // `bg-text/10` (about 1.2:1).
  for (const { id, mode } of CASES) {
    const t = tokensFor(id, mode);
    const [r, g, b] = parseColor(t('--color-text'));
    for (const glass of glassOnPage(t)) {
      expect(
        contrast(t('--color-track'), glass),
        `track on ${glass} (${id}, ${mode})`,
      ).toBeLessThan(3);
      const tenth = composite(`rgb(${r} ${g} ${b} / 0.1)`, glass);
      expect(contrast(tenth, glass), `text/10 on ${glass} (${id}, ${mode})`).toBeLessThan(3);
    }
  }
});

/** The cards' veil and sheen on a light block, then on a dark one, as glass-card sets them. */
function cardGlass(): Record<'light' | 'dark', { veil: string; sheen: string }> {
  const body = utility('glass-card');
  const read = (text: string) => {
    const veil = /--card-veil: (rgb\([^)]*\));/.exec(text)?.[1];
    const sheen = /--card-sheen: (rgb\([^)]*\));/.exec(text)?.[1];
    if (!veil || !sheen) throw new Error(`No veil or sheen in ${text}`);
    return { veil, sheen };
  };
  const dark = /\[data-block-tone='dark'\] & \{([^}]*)\}/.exec(body)?.[1];
  if (!dark) throw new Error('No dark-block rule in glass-card');
  return { light: read(body.replace(dark, '')), dark: read(dark) };
}

/** The four tints the carousel's cards take in turn: the theme's three, then AccountCard's white. */
const CARD_TINTS = ['--card-tint', '--card-tint-2', '--card-tint-3', 'rgb(255 255 255 / 0.2)'];

describe.each(THEMES)('the cards on the %s block', (id) => {
  // The block is the theme's in both modes, so one mode stands for both.
  const t = tokensFor(id, 'light');
  const { veil, sheen } = cardGlass()[DARK_BLOCK.has(id) ? 'dark' : 'light'];

  it('keeps the card text, and the kind label on its glass, at 4.5:1 or better under the sheen', () => {
    // Over every point of the block (its ends and its glows at full strength), under each tint at
    // full strength, the veil and the sheen where it is brightest: the most the text can be lit.
    for (const tint of CARD_TINTS) {
      for (const backdrop of blockBackdrops(t)) {
        const card = composite(veil, composite(tint.startsWith('--') ? t(tint) : tint, backdrop));
        const lit = composite(sheen, card);
        expect(contrast(t('--head-ink'), lit), `${tint} over ${backdrop}`).toBeGreaterThanOrEqual(
          4.5,
        );
        const label = composite(t('--hg-bg'), lit);
        expect(contrast(t('--head-ink'), label), `kind on ${tint}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

/**
 * Home's hero sits straight on the block, dimmed as the wireframe dims it: the label, the account and
 * the currency at --color-head-dim, the cents of the big amount at --color-head-faint. The
 * wireframe's 60% and 35% fall under the bar on the brightest glows, so each is the least share of
 * the ink that holds in every theme: 4.5:1 for the small text, 3:1 for the cents, large text at 42px.
 */
const HERO_INK = { '--color-head-dim': [84, 4.5], '--color-head-faint': [59, 3] } as const;

/** Whether the ink at `share` (0-1) falls under `ratio` on some point of some theme's block. */
function failsSomewhere(share: number, ratio: number): boolean {
  return THEMES.some((id) => {
    const t = tokensFor(id, 'light');
    const [r, g, b] = parseColor(t('--head-ink'));
    const ink = `rgb(${r} ${g} ${b} / ${share})`;
    return blockBackdrops(t).some(
      (backdrop) => contrast(composite(ink, backdrop), backdrop) < ratio,
    );
  });
}

it("dims Home's hero by the least share of the ink that holds in every theme", () => {
  for (const [name, [percent, ratio]] of Object.entries(HERO_INK)) {
    expect(declarations('@theme static')[name]).toBe(
      `color-mix(in srgb, var(--head-ink) ${percent}%, transparent)`,
    );
    expect(failsSomewhere(percent / 100, ratio), `${name} at ${percent}%`).toBe(false);
    expect(failsSomewhere((percent - 1) / 100, ratio), `${name} at ${percent - 1}%`).toBe(true);
  }
  // The wireframe's own shares, which these raise.
  expect(failsSomewhere(0.6, 4.5)).toBe(true);
  expect(failsSomewhere(0.35, 3)).toBe(true);
});

describe.each(THEMES)("Home's hero on the %s block", (id) => {
  // The block is the theme's in both modes, so one mode stands for both.
  const t = tokensFor(id, 'light');

  it('keeps the dimmed label at 4.5:1 and the dimmed cents at 3:1 on every point of the block', () => {
    for (const backdrop of blockBackdrops(t)) {
      for (const [name, [, ratio]] of Object.entries(HERO_INK)) {
        expect(
          contrast(composite(mutedInk(t, name), backdrop), backdrop),
          `${name} on ${backdrop}`,
        ).toBeGreaterThanOrEqual(ratio);
      }
    }
  });
});

describe.each(CASES)('the edge ring in the $id theme in $mode mode', ({ id, mode }) => {
  const t = tokensFor(id, mode);

  it('shows at 3:1 or better on the block, its glows and the page, by its ink or its page-colored ring', () => {
    expect(utility('focus-edge')).toContain('outline: 2px solid var(--color-text)');
    expect(utility('focus-edge')).toContain('0 0 0 2px var(--color-bg)');
    // On the piece itself, or on the disc of a link that holds it (a bill bubble).
    expect(utility('focus-edge')).toContain('&:focus-visible, :focus-visible > &');
    for (const backdrop of blockBackdrops(t)) {
      const best = Math.max(
        contrast(t('--color-text'), backdrop),
        contrast(t('--color-bg'), backdrop),
      );
      expect(best, `on ${backdrop}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(t('--color-text'), t('--color-bg'))).toBeGreaterThanOrEqual(3);
  });
});

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

describe.each(CASES)('the other contrast in the $id theme in $mode mode', ({ id, mode }) => {
  const t = tokensFor(id, mode);

  it.each(TEXT_TOKENS)('keeps %s at 4.5:1 or better on every surface it sits on', (fg) => {
    for (const surface of SURFACES) {
      expect(contrast(t(fg), t(surface)), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['--color-primary-contrast', '--color-primary'],
    ['--color-xp-contrast', '--color-xp-text'],
    // The danger button's label: white is under 3:1 on the light red of the dark theme.
    ['--color-danger-contrast', '--color-danger'],
  ])('keeps the text %s at 4.5:1 or better on its fill %s', (fg, fill) => {
    expect(contrast(t(fg), t(fill))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus ring and the XP bar at 3:1 or better (UI marks, WCAG 1.4.11)', () => {
    for (const surface of SURFACES) {
      expect(contrast(t('--color-focus'), t(surface)), surface).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(t('--color-xp'), t('--color-bg'))).toBeGreaterThanOrEqual(3);
    expect(contrast(t('--color-xp'), t('--color-track'))).toBeGreaterThanOrEqual(3);
  });

  it('keeps an off switch visible: its track on the page, and its knob on the track, at 3:1', () => {
    // The track is the muted text colour, the knob the colour of text on a primary button.
    expect(contrast(t('--color-text-muted'), t('--color-bg'))).toBeGreaterThanOrEqual(3);
    expect(contrast(t('--color-primary-contrast'), t('--color-text-muted'))).toBeGreaterThanOrEqual(
      3,
    );
  });
});

it('keeps the Other chart colour at 3:1 or better against the page, light and dark, in every theme', () => {
  for (const { id, mode } of CASES) {
    const t = tokensFor(id, mode);
    expect(
      contrast(t('--color-chart-other'), t('--color-bg')),
      `${id} in ${mode}`,
    ).toBeGreaterThanOrEqual(3);
  }
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
  for (const mode of MODES) {
    const t = tokensFor('mono', mode);
    for (const tone of Object.keys(BANNER_TONES)) {
      for (const end of [t(`--color-${tone}-from`), t(`--color-${tone}-to`)]) {
        // The title and the sentence use the page text colour; the second line is muted.
        expect(contrast(t('--color-text'), end)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t(`--color-${tone}-muted`), end)).toBeGreaterThanOrEqual(4.5);
        // The primary button sits on the card.
        expect(contrast(t('--color-primary'), end)).toBeGreaterThanOrEqual(3);
      }
    }
    expect(contrast(t('--color-primary-contrast'), t('--color-primary'))).toBeGreaterThanOrEqual(
      4.5,
    );
  }
});

it('holds the danger colour at 4.5:1 on the danger banner, now that it is darker', () => {
  for (const mode of MODES) {
    const t = tokensFor('mono', mode);
    for (const end of [t('--color-danger-from'), t('--color-danger-to')]) {
      expect(contrast(t('--color-danger'), end), mode).toBeGreaterThanOrEqual(4.5);
    }
  }
});

it('gives the danger button a label colour of its own, white on light and ink on dark', () => {
  expect(declarations('@theme static')['--color-danger-contrast']).toBe('#ffffff');
  expect(declarations(":root[data-theme='dark']")['--color-danger-contrast']).toBe('#0b0b10');
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
  'validates the chart series like the palette validator in the %s theme',
  (name) => {
    // The series is the same in every theme.
    const t = tokensFor('mono', name);
    const series = [1, 2, 3, 4, 5, 6].map((n) => t(`--color-chart-${n}`));
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
