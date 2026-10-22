import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { CountUp } from './CountUp';
import { Rise } from './Rise';

/** matchMedia answering "no" to everything: nobody asked for less motion. */
function allowMotion() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const dollars = (n: number) => `$${n}`;

afterEach(() => vi.unstubAllGlobals());

describe('CountUp', () => {
  it('shows the final number at once under reduced motion, with no hidden copy', () => {
    // jsdom has no matchMedia, which reads as reduced motion.
    const { container } = render(<CountUp value={1234} format={dollars} className="big" />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toHaveTextContent(/^\$1234$/);
    expect(container.firstElementChild).toHaveClass('big');
    expect(container.querySelector('[aria-hidden]')).toBeNull();
    expect(container.querySelector('.sr-only')).toBeNull();
  });

  it('counts up with a hidden moving copy, then settles into one plain span', async () => {
    allowMotion();
    const { container } = render(<CountUp value={900} duration={0.05} format={dollars} />);
    // While it runs: the moving number is hidden from a screen reader, which gets the final one.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelector('.sr-only')).toHaveTextContent('$900');

    // Settled: one span with the final text, no copies.
    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());
    expect(container.querySelector('[aria-hidden]')).toBeNull();
    expect(container.firstElementChild?.children).toHaveLength(0);
    expect(container.firstElementChild).toHaveTextContent(/^\$900$/);
  });

  it('hands format whole numbers only', async () => {
    allowMotion();
    const seen: number[] = [];
    const { container } = render(
      <CountUp
        value={77}
        duration={0.05}
        format={(n) => {
          seen.push(n);
          return n;
        }}
      />,
    );
    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every(Number.isInteger)).toBe(true);
    expect(seen.at(-1)).toBe(77);
  });

  it('counts a new value from the one last shown, not from 0', async () => {
    allowMotion();
    let seen: number[] = [];
    const format = (n: number) => {
      seen.push(n);
      return n;
    };
    const { container, rerender } = render(
      <CountUp value={1000} duration={0.05} format={format} />,
    );
    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());

    seen = [];
    rerender(<CountUp value={2000} duration={0.2} format={format} />);
    // Right after the change it is already moving, from where it stood.
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('1000');
    expect(container.querySelector('.sr-only')).toHaveTextContent('2000');

    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());
    expect(container.firstElementChild).toHaveTextContent(/^2000$/);
    // Every number on the way lies between the two; none went back down towards 0.
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(1000);
    expect(Math.max(...seen)).toBe(2000);
    expect(seen.some((n) => n > 1000 && n < 2000)).toBe(true);
  });

  it('picks up from the number on screen when the value changes mid-count', async () => {
    allowMotion();
    const { container, rerender } = render(<CountUp value={1000} duration={2} format={String} />);
    const moving = () => container.querySelector('[aria-hidden="true"]');
    await vi.waitFor(() => expect(Number(moving()?.textContent)).toBeGreaterThan(100));
    const before = Number(moving()?.textContent);
    expect(before).toBeLessThan(1000);

    rerender(<CountUp value={2000} duration={2} format={String} />);
    // Not back at the old target, not back at 0: where it was.
    const after = Number(moving()?.textContent);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after).toBeLessThan(1000);
    expect(container.querySelector('.sr-only')).toHaveTextContent('2000');
  });

  it('counts down as well', async () => {
    allowMotion();
    let seen: number[] = [];
    const format = (n: number) => {
      seen.push(n);
      return n;
    };
    const { container, rerender } = render(<CountUp value={500} duration={0.05} format={format} />);
    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());

    seen = [];
    rerender(<CountUp value={100} duration={0.2} format={format} />);
    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());
    expect(container.firstElementChild).toHaveTextContent(/^100$/);
    expect(Math.max(...seen)).toBeLessThanOrEqual(500);
    expect(Math.min(...seen)).toBe(100);
    expect(seen.some((n) => n > 100 && n < 500)).toBe(true);
  });

  it('does not move again for a value that did not change', async () => {
    allowMotion();
    const { container, rerender } = render(<CountUp value={40} duration={0.05} format={String} />);
    await vi.waitFor(() => expect(container.querySelector('.sr-only')).toBeNull());

    rerender(<CountUp value={40} duration={0.05} format={String} className="again" />);
    expect(container.querySelector('[aria-hidden]')).toBeNull();
    expect(container.firstElementChild).toHaveClass('again');
    expect(container.firstElementChild).toHaveTextContent(/^40$/);
  });
});

describe('Rise', () => {
  it('rises under motion-safe, only fades under motion-reduce, and waits its turn in the list', () => {
    const { container } = render(<Rise index={3}>Hello</Rise>);
    const rise = container.firstElementChild as HTMLElement;
    expect(rise.tagName).toBe('DIV');
    expect(rise).toHaveClass('motion-safe:animate-rise', 'motion-reduce:animate-fade-in');
    // Whatever moves does so under motion-safe: no bare animation class.
    expect(rise.className).not.toMatch(/(^|\s)animate-/);
    expect(rise.style.animationDelay).toBe('180ms');
    expect(rise).toHaveTextContent('Hello');
  });

  it('starts at once by default, and takes the element and class it is given', () => {
    const { container } = render(
      <ul>
        <Rise as="li" className="row">
          One
        </Rise>
      </ul>,
    );
    const rise = container.querySelector('li') as HTMLElement;
    expect(rise).toHaveClass('row', 'motion-safe:animate-rise');
    expect(rise.style.animationDelay).toBe('0ms');
  });
});

describe('press', () => {
  it('is on every Button', () => {
    const { getByRole } = render(<Button>Save</Button>);
    expect(getByRole('button', { name: 'Save' })).toHaveClass('press');
  });
});
