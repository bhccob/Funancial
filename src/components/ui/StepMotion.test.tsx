import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blobs } from './Blobs';
import { StepMotion, type StepDirection } from './StepMotion';

const NAMES = { a: 'First', b: 'Second', c: 'Third' } as const;
type Key = keyof typeof NAMES;

function Steps({ at, direction }: { at: Key; direction?: StepDirection }) {
  return (
    <StepMotion
      stepKey={at}
      direction={direction}
      render={(k) => (
        <>
          <h1>{NAMES[k]}</h1>
          <p>about {NAMES[k]}</p>
        </>
      )}
    />
  );
}

const layer = (name: string) => screen.getByRole('heading', { name }).closest('[data-motion]');
const leaving = () => document.querySelector('[data-motion="leaving"]');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('StepMotion', () => {
  it('rises in from below, and only fades for a person who asked for less motion', () => {
    render(<Steps at="a" />);
    const current = layer('First');
    expect(current).toHaveAttribute('data-motion', 'current');
    expect(current).toHaveClass('motion-safe:animate-step-in-up', 'motion-reduce:animate-fade-in');
    // Whatever moves does so under motion-safe: no bare animation class.
    expect(current?.className).not.toMatch(/(^|\s)animate-/);
    expect(leaving()).toBeNull();
  });

  it('brings the lines of a step in one after another, under motion-safe only', () => {
    render(<Steps at="a" />);
    expect(layer('First')).toHaveClass('motion-safe:stagger-lines');
    expect(layer('First')?.className).not.toMatch(/(^|\s)stagger-lines/);
  });

  it('on the next step the new one rises and the old one lifts away and fades, then is gone', () => {
    const { rerender } = render(<Steps at="a" />);
    rerender(<Steps at="b" />);

    expect(layer('Second')).toHaveClass('motion-safe:animate-step-in-up');
    const old = leaving();
    expect(old).toHaveTextContent('First');
    expect(old).toHaveClass('motion-safe:animate-step-out-up', 'motion-reduce:animate-fade-out');
    // It is only there to be seen leaving: out of reach of a tap, a Tab and a screen reader.
    expect(old).toHaveAttribute('aria-hidden', 'true');
    expect(old).toHaveAttribute('inert');
    expect(old).toHaveClass('pointer-events-none', 'absolute');
    expect(screen.getAllByRole('heading')).toHaveLength(1);

    act(() => void vi.advanceTimersByTime(700));
    expect(leaving()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  it('going back reverses it: the step comes down from above and the old one leaves downward', () => {
    const { rerender } = render(<Steps at="b" />);
    rerender(<Steps at="a" direction="back" />);

    expect(layer('First')).toHaveClass('motion-safe:animate-step-in-down');
    expect(leaving()).toHaveClass('motion-safe:animate-step-out-down');
    expect(layer('First')).not.toHaveClass('motion-safe:animate-step-in-up');
  });

  it('shows the leaving step as it is now, from the same render function', () => {
    function Typed({ at, typed }: { at: Key; typed: string }) {
      return (
        <StepMotion
          stepKey={at}
          render={(k) => <h1>{k === 'a' ? `First: ${typed}` : NAMES[k]}</h1>}
        />
      );
    }
    const { rerender } = render(<Typed at="a" typed="" />);
    rerender(<Typed at="a" typed="12" />);
    rerender(<Typed at="b" typed="12" />);
    expect(leaving()).toHaveTextContent('First: 12');
  });

  it('keeps only the latest leaving step when steps follow each other quickly', () => {
    const { rerender } = render(<Steps at="a" />);
    rerender(<Steps at="b" />);
    rerender(<Steps at="c" />);
    expect(leaving()).toHaveTextContent('Second');
    act(() => void vi.advanceTimersByTime(700));
    expect(leaving()).toBeNull();
  });
});

describe('Blobs', () => {
  it('are decoration, and drift only under motion-safe', () => {
    const { container } = render(<Blobs />);
    const blobs = container.querySelectorAll('[data-blob]');
    expect(blobs.length).toBeGreaterThanOrEqual(2);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    for (const blob of blobs) {
      expect(blob).toHaveClass('motion-safe:animate-blob-drift');
      expect(blob.className).not.toMatch(/(^|\s)animate-/);
    }
  });

  it('shift colour and position with the step', () => {
    const { container, rerender } = render(<Blobs step={0} />);
    const before = [...container.querySelectorAll<HTMLElement>('[data-blob]')].map((b) =>
      b.getAttribute('style'),
    );
    rerender(<Blobs step={3} />);
    const after = [...container.querySelectorAll<HTMLElement>('[data-blob]')].map((b) =>
      b.getAttribute('style'),
    );
    expect(after).not.toEqual(before);
  });
});
