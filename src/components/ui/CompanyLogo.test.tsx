import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLogo } from '@/services/logo';
import { CompanyLogo, LogoDisc } from './CompanyLogo';

vi.mock('@/services/logo', () => ({ loadLogo: vi.fn() }));

const load = vi.mocked(loadLogo);
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

describe('LogoDisc', () => {
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
