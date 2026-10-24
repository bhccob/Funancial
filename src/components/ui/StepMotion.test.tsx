import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it("moves focus to the new step's heading when the step changes, so it is announced", () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerender } = render(<Steps at="a" />);
    // Not on the first showing: the page has only just opened.
    expect(focus).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'First' })).not.toHaveFocus();

    rerender(<Steps at="b" />);
    const heading = screen.getByRole('heading', { name: 'Second' });
    expect(heading).toHaveFocus();
    // A heading is focusable by script only, and the screen is not scrolled to it as it rises.
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });

    rerender(<Steps at="a" direction="back" />);
    expect(screen.getByRole('heading', { name: 'First' })).toHaveFocus();
  });

  it("can make a step's box a form, which a button outside it submits, and never the leaving one", () => {
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    function Formed({ at }: { at: Key }) {
      return (
        <>
          <StepMotion
            stepKey={at}
            render={(k) => <h1>{NAMES[k]}</h1>}
            form={(k) => ({ id: `step-${k}`, onSubmit })}
          />
          <button type="submit" form={`step-${at}`}>
            Next
          </button>
        </>
      );
    }
    const { rerender } = render(<Formed at="a" />);
    expect(layer('First')?.tagName).toBe('FORM');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<Formed at="b" />);
    expect(layer('Second')?.tagName).toBe('FORM');
    // What is leaving is only a picture of the step: not a form, so nothing in it submits.
    expect(leaving()?.tagName).toBe('DIV');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
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
