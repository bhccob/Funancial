/**
 * The four phone screens of the story, drawn on a canvas in the app's own look: Inter Tight, and the
 * light colours of src/styles/tokens.css and themes.css (Black & White). They are demo money, not a screenshot. `progress` runs from
 * 0 (just arrived) to 1 (settled): numbers count up, bars fill, tiles pop in.
 */

export const SCREEN = { w: 540, h: 1140 } as const;

export type ScreenIndex = 0 | 1 | 2 | 3;

/** The light-theme tokens the screens use. siteTokens.test.ts checks each against tokens.css and themes.css. */
export const TOKENS = {
  '--color-bg': '#eeeef0',
  '--color-border': '#e6e6ec',
  '--color-text': '#0b0b12',
  '--color-text-muted': '#66667a',
  '--color-track': '#ececf1',
  '--color-accent': '#0b0b0c',
  '--color-xp': '#0b0b0c',
  '--color-danger': '#ca2a31',
  '--color-chart-1': '#7c5cff',
  '--color-chart-5': '#f59e0b',
  '--color-danger-soft': '#f5d9da',
  '--color-success-soft': '#d2eadf',
  '--color-warning-from': '#fff0d4',
  '--color-info-from': '#e2efff',
  '--color-demo-from': '#ede7ff',
} as const;

const BG = TOKENS['--color-bg'];
const INK = TOKENS['--color-text'];
const MUTED = TOKENS['--color-text-muted'];
const TRACK = TOKENS['--color-track'];

const FAMILY = '"Inter Tight Variable", system-ui, sans-serif';
const font = (weight: 700 | 800, size: number) => `${weight} ${size}px ${FAMILY}`;

/** Loads Inter Tight for the canvas, which does not wait for fonts the way the page's text does. */
export async function loadScreenFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'Home Budget $0123456789,.%·/';
  // A font that fails to load leaves the system font, which still reads fine.
  await Promise.all(
    [700, 800].map((weight) => document.fonts.load(`${weight} 24px ${FAMILY}`, sample)),
  ).catch(() => undefined);
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const out = (t: number) => 1 - Math.pow(1 - t, 3);
const money = (v: number) =>
  '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  // Browsers before 2022 have no roundRect; square corners beat no screen.
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

function text(
  g: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  weight: 700 | 800,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
) {
  g.font = font(weight, size);
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(value, x, y);
}

/** The title and the tab bar every screen shares. */
function chrome(g: CanvasRenderingContext2D, title: string) {
  text(g, title, 40, 130, 800, 44, INK);
  g.fillStyle = TOKENS['--color-border'];
  g.fillRect(0, SCREEN.h - 110, SCREEN.w, 1);
  ['Home', 'Budget', 'Invest', 'Menu'].forEach((tab, i) =>
    text(g, tab, 40 + i * 128, SCREEN.h - 50, 700, 22, MUTED),
  );
}

function home(g: CanvasRenderingContext2D, s: number) {
  chrome(g, 'Home');
  text(g, 'Available to spend', 40, 210, 700, 24, MUTED);
  text(g, money(3482.15 * out(s)), 40, 295, 800, 76, INK);

  const points = [0, 30, 22, 60, 55, 90, 84, 120, 140, 150, 170];
  const drawn = Math.max(1, Math.round(out(s) * (points.length - 1)));
  g.strokeStyle = TOKENS['--color-chart-1'];
  g.lineWidth = 6;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= drawn; i++) {
    const x = 40 + (i / 10) * 460;
    const y = 470 - points[i]!;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();

  g.globalAlpha = clamp((s - 0.5) * 3);
  g.fillStyle = TOKENS['--color-info-from'];
  roundRect(g, 40, 560, 460, 120, 22);
  g.fill();
  text(g, 'Bills to come', 70, 610, 700, 26, INK);
  text(g, 'CloudBox · $9.99', 70, 650, 700, 26, MUTED);
}

function budget(g: CanvasRenderingContext2D, s: number) {
  chrome(g, 'Budget');
  const rows: Array<[string, number, string]> = [
    ['Food', 0.62, TOKENS['--color-accent']],
    ['Fun', 0.91, TOKENS['--color-chart-5']],
    ['Transport', 0.34, TOKENS['--color-accent']],
    ['Shopping', 1.08, TOKENS['--color-danger']],
    ['Overall', 0.48, TOKENS['--color-accent']],
  ];
  rows.forEach(([name, used, color], i) => {
    const k = out(clamp(s * 1.6 - i * 0.12));
    const y = 220 + i * 150;
    text(g, name, 40, y, 700, 30, INK);
    text(g, `${Math.round(used * 100 * k)}%`, 500, y, 700, 26, MUTED, 'right');
    g.fillStyle = TRACK;
    roundRect(g, 40, y + 24, 460, 22, 11);
    g.fill();
    g.fillStyle = color;
    roundRect(g, 40, y + 24, Math.max(22, 460 * Math.min(used, 1) * k), 22, 11);
    g.fill();
  });
}

function buyIt(g: CanvasRenderingContext2D, s: number) {
  chrome(g, 'Buy it?');
  text(g, 'Headphones · $189.00', 40, 210, 800, 34, INK);

  const cx = SCREEN.w / 2;
  const cy = 520;
  const r = 190;
  g.lineWidth = 38;
  (
    [
      [TOKENS['--color-danger-soft'], 1, 1.335],
      [TOKENS['--color-warning-from'], 1.335, 1.665],
      [TOKENS['--color-success-soft'], 1.665, 2],
    ] as const
  ).forEach(([color, from, to]) => {
    g.strokeStyle = color;
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * from, Math.PI * to);
    g.stroke();
  });

  // The needle overshoots a little, then settles at 38%.
  const t = out(clamp(s * 1.4));
  const needle = 0.38 + Math.sin(t * Math.PI) * 0.18 * (1 - t);
  const angle = Math.PI * (1 + needle * t);
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(angle) * (r - 30), cy + Math.sin(angle) * (r - 30));
  g.stroke();
  g.lineCap = 'butt';
  text(g, `${Math.round(38 * t)}% a buy`, cx, cy + 100, 800, 56, INK, 'center');

  g.globalAlpha = clamp((s - 0.55) * 3);
  text(g, 'Wait a few days', cx, cy + 150, 700, 30, MUTED, 'center');
  const facts = [
    ['Fun limit after', '140%'],
    ['Over the limit by', '$40'],
    ['Available after', '$3,293.15'],
  ] as const;
  facts.forEach(([label, value], i) => {
    text(g, label, 40, 790 + i * 58, 700, 26, MUTED);
    text(g, value, 500, 790 + i * 58, 800, 26, INK, 'right');
  });
}

function levels(g: CanvasRenderingContext2D, s: number) {
  chrome(g, 'Level 12');
  text(g, 'Silver Budgeter', 40, 190, 700, 28, MUTED);
  const fill = out(clamp(s * 1.5));
  g.fillStyle = TRACK;
  roundRect(g, 40, 230, 460, 30, 15);
  g.fill();
  g.fillStyle = TOKENS['--color-xp'];
  roundRect(g, 40, 230, Math.max(30, 320 * fill), 30, 15);
  g.fill();
  text(g, `${Math.round(1840 * fill).toLocaleString('en-US')} / 2,600 XP`, 40, 300, 700, 22, MUTED);

  const badges: Array<[string, string, string]> = [
    ['Smart', 'Shopper', TOKENS['--color-warning-from']],
    ['Limit', 'Keeper', TOKENS['--color-success-soft']],
    ['First', 'ETF', TOKENS['--color-info-from']],
    ['Freeze', 'Master', TOKENS['--color-demo-from']],
  ];
  badges.forEach(([first, second, color], i) => {
    const k = out(clamp(s * 2 - 0.4 - i * 0.18));
    const x = 40 + (i % 2) * 240;
    const y = 380 + Math.floor(i / 2) * 230;
    g.save();
    g.globalAlpha = k;
    g.translate(x + 110, y + 100);
    g.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
    g.translate(-(x + 110), -(y + 100));
    g.fillStyle = color;
    roundRect(g, x, y, 220, 200, 28);
    g.fill();
    text(g, first, x + 20, y + 134, 800, 26, INK);
    text(g, second, x + 20, y + 170, 800, 26, INK);
    g.restore();
  });
}

const SCREENS = [home, budget, buyIt, levels] as const;

/** Draws screen `index` at `progress` (0 to 1) over the whole SCREEN, background included. */
export function drawScreen(
  g: CanvasRenderingContext2D,
  index: ScreenIndex,
  progress: number,
): void {
  g.save();
  g.fillStyle = BG;
  g.fillRect(0, 0, SCREEN.w, SCREEN.h);
  SCREENS[index](g, clamp(progress));
  g.restore();
}

const NAMES = ['Home', 'Budget', 'Buy it?', 'Levels'] as const;

/**
 * Puts a still phone into each `[data-screen]` element of `container`: a frame around a canvas with
 * that screen drawn at progress 1. This is the page when the story does not play (reduced motion,
 * no WebGL, or before it has loaded).
 */
export function mountStaticPhones(container: HTMLElement): void {
  const phones = [...container.querySelectorAll<HTMLElement>('[data-screen]')].flatMap((slot) => {
    const index = Number(slot.dataset.screen);
    if (!(index in NAMES)) return [];
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN.w;
    canvas.height = SCREEN.h;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Funcial ${NAMES[index as ScreenIndex]} screen`);
    const frame = document.createElement('div');
    frame.className = 'phone';
    frame.append(canvas);
    slot.append(frame);
    return [{ canvas, index: index as ScreenIndex }];
  });
  void loadScreenFont().then(() => {
    for (const { canvas, index } of phones) {
      const g = canvas.getContext('2d');
      if (g) drawScreen(g, index, 1);
    }
  });
}
