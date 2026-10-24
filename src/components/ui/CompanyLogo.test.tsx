import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contrastRatio } from '@/lib/colorMath';
import { logoColor } from '@/lib/logoColor';
import { loadLogo } from '@/services/logo';
import { CompanyLogo, LogoDisc } from './CompanyLogo';

vi.mock('@/services/logo', () => ({ loadLogo: vi.fn() }));
vi.mock('@/lib/logoColor', () => ({ logoColor: vi.fn() }));

const load = vi.mocked(loadLogo);
const sample = vi.mocked(logoColor);
const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

let made = 0;
const createObjectURL = vi.fn(() => `blob:logo-${++made}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  made = 0;
  // jsdom has no object URLs.
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});
afterEach(() => {
  vi.resetAllMocks();
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

const logo = (props: Partial<React.ComponentProps<typeof CompanyLogo>> = {}) => (
  <CompanyLogo symbol="KO" name="Coca-Cola" color="var(--color-chart-2)" size={20} {...props} />
);
const picture = (container: HTMLElement) => container.querySelector('img');
/** The picture, once the logo has arrived. */
const drawn = (container: HTMLElement) =>
  vi.waitFor(() => {
    const img = picture(container);
    expect(img).not.toBeNull();
    return img!;
  });

describe('CompanyLogo', () => {
  it('is the first letter of the name on a disc while the logo loads, and hidden from a screen reader', () => {
    load.mockReturnValue(new Promise(() => {}));
    const { container } = render(logo());
    expect(container).toHaveTextContent('C');
    expect(picture(container)).toBeNull();
    const disc = container.firstElementChild!;
    expect(disc).toHaveAttribute('aria-hidden', 'true');
    expect(disc).toHaveStyle({ width: '20px', height: '20px' });
    expect(load).toHaveBeenCalledExactlyOnceWith('KO');
  });

  it('uses the symbol when there is no name', () => {
    load.mockReturnValue(new Promise(() => {}));
    const { container } = render(logo({ name: '  ' }));
    expect(container).toHaveTextContent('K');
  });

  it('shows the logo, at its size, once the service has it', async () => {
    load.mockResolvedValue(png());
    const { container } = render(logo({ size: 24 }));
    const img = await drawn(container);
    expect(img).toHaveAttribute('src', 'blob:logo-1');
    expect(img).toHaveAttribute('alt', '');
    expect(container.firstElementChild).toHaveStyle({ width: '24px', height: '24px' });
    expect(container).not.toHaveTextContent('C');
  });

  it('goes back to the letter when the picture will not draw', async () => {
    load.mockResolvedValue(png());
    const { container } = render(logo());
    fireEvent.error(await drawn(container));
    expect(picture(container)).toBeNull();
    expect(container).toHaveTextContent('C');
  });

  it('stays the letter when the service has no logo, or cannot be reached', async () => {
    load.mockResolvedValue(null);
    const none = render(logo());
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    expect(picture(none.container)).toBeNull();
    expect(none.container).toHaveTextContent('C');
    none.unmount();

    load.mockRejectedValue(new Error("Couldn't reach the price service."));
    const failed = render(logo({ symbol: 'MSFT', name: 'Microsoft' }));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(picture(failed.container)).toBeNull();
    expect(failed.container).toHaveTextContent('M');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('frees the picture when it goes away, and shows the next symbol only once its own logo is in', async () => {
    load.mockResolvedValue(png());
    const { container, rerender, unmount } = render(logo());
    await drawn(container);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    let release: (blob: Blob) => void = () => {};
    load.mockReturnValue(new Promise((resolve) => (release = resolve)));
    rerender(logo({ symbol: 'MSFT', name: 'Microsoft' }));
    // The first picture is freed at once, and not shown for the new symbol meanwhile.
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:logo-1');
    expect(picture(container)).toBeNull();
    expect(container).toHaveTextContent('M');

    release(png());
    await vi.waitFor(() => expect(picture(container)).toHaveAttribute('src', 'blob:logo-2'));
    unmount();
    expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:logo-2');
  });

  it('makes no picture for a logo that arrives after it has gone', async () => {
    let release: (blob: Blob) => void = () => {};
    load.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { unmount } = render(logo());
    unmount();
    release(png());
    await Promise.resolve();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('CompanyLogo as a badge', () => {
  const badge = (props: Partial<React.ComponentProps<typeof CompanyLogo>> = {}) =>
    logo({ badge: true, color: '#0f3e99', symbol: 'MSFT', name: 'Microsoft', size: 24, ...props });
  /** What the disc is painted with: its fill, the colour of its text and the size of it. */
  const paint = (container: HTMLElement) => {
    const disc = container.firstElementChild as HTMLElement;
    return { fill: disc.style.backgroundColor, ink: disc.style.color, size: disc.style.fontSize };
  };

  it('is the ticker on the slice colour until the logo arrives, at 9px or more', () => {
    load.mockReturnValue(new Promise(() => {}));
    const { container } = render(badge());
    expect(container.firstElementChild).toHaveTextContent('MSFT');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).toHaveAttribute('data-logo', 'MSFT');
    expect(container.firstElementChild).toHaveStyle({ width: '24px', height: '24px' });
    expect(paint(container).fill).toBe('rgb(15, 62, 153)');
    expect(parseFloat(paint(container).size)).toBeGreaterThanOrEqual(9);
  });

  it('is up to four letters of the symbol, its dots and dashes left out, as big as the room allows', () => {
    load.mockReturnValue(new Promise(() => {}));
    const sizes = [
      ['KO', 'KO', 12],
      ['AAPL', 'AAPL', 9],
      ['VUS', 'VUS', 10],
      ['BRK.B', 'BRKB', 9],
      ['RDSA.AS', 'RDSA', 9],
      ['^GSPC', 'GSPC', 9],
    ] as const;
    for (const [symbol, text, px] of sizes) {
      const { container, unmount } = render(badge({ symbol }));
      expect(container.firstElementChild, symbol).toHaveTextContent(new RegExp(`^${text}$`));
      expect(parseFloat(paint(container).size), symbol).toBe(px);
      unmount();
    }
  });

  it('squeezes a ticker that is wider than the disc can hold, and leaves a narrower one as it is', () => {
    load.mockReturnValue(new Promise(() => {}));
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const text = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('[data-logo] > span')!;
    // At 9px a wide four-letter ticker such as VWRL is over 25px; the disc holds 21.
    measure.mockReturnValue({ width: 25.2 } as DOMRect);
    const wide = render(badge({ symbol: 'VWRL' }));
    expect(text(wide.container).style.transform).toBe(`scaleX(${21 / 25.2})`);
    wide.unmount();
    measure.mockReturnValue({ width: 16 } as DOMRect);
    const narrow = render(badge({ symbol: 'KO' }));
    expect(text(narrow.container).style.transform).toBe('');
    measure.mockRestore();
  });

  it('centres a squeezed ticker on its disc: one column as wide as the disc, scaled about its middle', () => {
    load.mockReturnValue(new Promise(() => {}));
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    measure.mockReturnValue({ width: 23.6 } as DOMRect);
    const { container } = render(badge({ symbol: 'VWRL' }));
    const disc = container.querySelector<HTMLElement>('[data-logo]')!;
    const text = container.querySelector<HTMLElement>('[data-logo] > span')!;
    // An automatic column would grow to the ticker's 23.6px and leave it ~1.8px right of the middle of
    // the disc's 20px inside; a column of the disc's own width (`minmax(0, 1fr)`) is centred on it, and the
    // ticker, wider than the column, overflows both sides alike.
    expect(disc).toHaveClass('inline-grid', 'grid-cols-[minmax(0,1fr)]', 'place-items-center');
    expect(text.style.transform).toBe(`scaleX(${21 / 23.6})`);
    // Scaled about its own middle (the default origin), so the squeeze keeps it centred.
    expect(text.style.transformOrigin).toBe('');
    expect(text.style.marginLeft).toBe('');
    measure.mockRestore();
  });

  it('falls back to the first letter of the name for a symbol with no letters', () => {
    load.mockReturnValue(new Promise(() => {}));
    const { container } = render(badge({ symbol: '^=', name: 'Dollar' }));
    expect(container.firstElementChild).toHaveTextContent(/^D$/);
  });

  it('writes the ticker in white or the ink, whichever holds 4.5:1 on the slice: on a yellow and on a navy one', () => {
    load.mockReturnValue(new Promise(() => {}));
    for (const [fill, ink] of [
      ['#ffd400', 'rgb(11, 11, 18)'],
      ['#0b1f4d', 'rgb(255, 255, 255)'],
      // Neither holds on this mid grey: black does.
      ['#787878', 'rgb(0, 0, 0)'],
    ] as const) {
      const { container, unmount } = render(badge({ color: fill }));
      const painted = paint(container);
      expect(painted.ink, fill).toBe(ink);
      expect(contrastRatio(painted.ink, painted.fill), fill).toBeGreaterThanOrEqual(4.5);
      unmount();
    }
  });

  it('keeps the text colour where the slice colour cannot be read, which is not a colour to compute on', () => {
    load.mockReturnValue(new Promise(() => {}));
    const { container } = render(badge({ color: 'var(--color-chart-1)' }));
    const disc = container.firstElementChild as HTMLElement;
    expect(disc.getAttribute('style')).toContain('var(--color-chart-1)');
    expect(disc.getAttribute('style')).toContain('var(--color-text)');
  });

  it('is the logo on white inside a ring of the slice colour once it arrives: no ticker', async () => {
    load.mockResolvedValue(png());
    const { container } = render(badge());
    const img = await drawn(container);
    expect(container).not.toHaveTextContent('MSFT');
    const disc = container.firstElementChild as HTMLElement;
    // The disc is the slice's colour and the logo a white disc inside it, so the colour shows as a ring.
    expect(disc.style.backgroundColor).toBe('rgb(15, 62, 153)');
    expect(disc.style.padding).toBe('2px');
    expect(img).toHaveClass('bg-white', 'rounded-full');
  });

  it('goes back to the ticker when the picture will not draw', async () => {
    load.mockResolvedValue(png());
    const { container } = render(badge());
    fireEvent.error(await drawn(container));
    expect(picture(container)).toBeNull();
    expect(container).toHaveTextContent('MSFT');
  });

  it("reports the logo's colour, sampled once the picture has loaded, when asked", async () => {
    load.mockResolvedValue(png());
    sample.mockReturnValue('#0f3e99');
    const onColor = vi.fn();
    const { container } = render(badge({ symbol: 'ko', onColor }));
    const img = await drawn(container);
    // Not before the picture has loaded: the logo's colour is in its pixels.
    expect(onColor).not.toHaveBeenCalled();
    fireEvent.load(img);
    // By the symbol, upper case, so that every picture of one logo shares one sampling.
    expect(sample).toHaveBeenCalledExactlyOnceWith(img, 'KO');
    expect(onColor).toHaveBeenCalledExactlyOnceWith('#0f3e99');
  });

  it('reports null when the logo gives no colour, and nothing when there is no logo at all', async () => {
    load.mockResolvedValue(png());
    sample.mockReturnValue(null);
    const onColor = vi.fn();
    const { container } = render(badge({ onColor }));
    fireEvent.load(await drawn(container));
    expect(onColor).toHaveBeenCalledExactlyOnceWith(null);

    load.mockResolvedValue(null);
    const none = vi.fn();
    const bare = render(badge({ symbol: 'NONE', onColor: none }));
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('NONE'));
    expect(none).not.toHaveBeenCalled();
    bare.unmount();
  });

  it('samples nothing unless asked: a logo with no onColor is never drawn on a canvas', async () => {
    load.mockResolvedValue(png());
    const { container } = render(badge());
    fireEvent.load(await drawn(container));
    expect(sample).not.toHaveBeenCalled();
  });

  it('is the same disc and letter as before when it is not a badge', () => {
    load.mockReturnValue(new Promise(() => {}));
    const { container } = render(logo({ symbol: 'MSFT', name: 'Microsoft', size: 24 }));
    expect(container).toHaveTextContent(/^M$/);
    expect(paint(container).fill).toBe('');
  });
});

describe('LogoDisc', () => {
  it('as a badge, fills the disc with its colour and draws the content in the ink that holds on it', () => {
    const { container } = render(
      <LogoDisc color="#838893" size={24} logo="other" badge fontSize={12}>
        +3
      </LogoDisc>,
    );
    const disc = container.firstElementChild as HTMLElement;
    expect(disc).toHaveTextContent('+3');
    expect(disc.style.backgroundColor).toBe('rgb(131, 136, 147)');
    expect(disc.style.color).toBe('rgb(11, 11, 18)');
    expect(disc.style.fontSize).toBe('12px');
    expect(disc.style.boxShadow).toBe('');
  });

  it('draws its content on a disc of the size, ringed in the colour, hidden from a screen reader', () => {
    const { container } = render(
      <LogoDisc color="var(--color-chart-other)" size={22} logo="other">
        +3
      </LogoDisc>,
    );
    const disc = container.firstElementChild!;
    expect(disc).toHaveTextContent('+3');
    expect(disc).toHaveAttribute('aria-hidden', 'true');
    expect(disc).toHaveStyle({ width: '22px', height: '22px' });
  });
});
