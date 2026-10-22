import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

// jsdom draws no glide, so the pill's layoutId would never show: this puts it on the element.
vi.mock('motion/react', async () => {
  const { createElement } = await import('react');
  return {
    motion: {
      span: ({ layoutId, className, style }: Record<string, unknown>) =>
        createElement('span', {
          'aria-hidden': true,
          'data-layout-id': layoutId,
          className,
          style,
        }),
    },
  };
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
  ] as const;

  it('is a group named by its label, with exactly one option pressed', () => {
    render(
      <SegmentedControl label="Period" value="month" options={[...options]} onChange={vi.fn()} />,
    );
    const group = screen.getByRole('group', { name: 'Period' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Week', 'Month', 'Year']);
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the option that was clicked', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl label="Period" value="month" options={[...options]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Year' }));
    expect(onChange).toHaveBeenCalledWith('year');
  });

  it('keeps its own pressed option when another control shares the page', () => {
    render(
      <>
        <SegmentedControl label="Period" value="week" options={[...options]} onChange={vi.fn()} />
        <SegmentedControl label="Range" value="year" options={[...options]} onChange={vi.fn()} />
      </>,
    );
    const pressed = (name: string) =>
      within(screen.getByRole('group', { name }))
        .getAllByRole('button', { pressed: true })
        .map((b) => b.textContent);
    expect(pressed('Period')).toEqual(['Week']);
    expect(pressed('Range')).toEqual(['Year']);
    // One sliding pill each, under its own id: a shared id would send the pill between controls.
    const pills = (name: string) =>
      screen.getByRole('group', { name }).querySelectorAll('[data-layout-id]');
    expect(pills('Period')).toHaveLength(1);
    expect(pills('Range')).toHaveLength(1);
    expect(pills('Period')[0]?.getAttribute('data-layout-id')).toBeTruthy();
    expect(pills('Period')[0]?.getAttribute('data-layout-id')).not.toBe(
      pills('Range')[0]?.getAttribute('data-layout-id'),
    );
  });

  it('keeps every label above the sliding pill, which sweeps across the labels it leaves behind', () => {
    render(
      <SegmentedControl label="Period" value="week" options={[...options]} onChange={vi.fn()} />,
    );
    const group = screen.getByRole('group', { name: 'Period' });
    // The labels' z-index lives inside the control, not over whatever sits above it on the page.
    expect(group).toHaveClass('isolate');
    for (const label of ['Week', 'Month', 'Year']) {
      expect(within(group).getByText(label)).toHaveClass('relative', 'z-10');
    }
  });

  it('gives each option a 34px button with a 44px tap area, in either tone', () => {
    const { rerender } = render(
      <SegmentedControl label="Period" value="week" options={[...options]} onChange={vi.fn()} />,
    );
    for (const b of screen.getAllByRole('button')) expect(b).toHaveClass('h-8.5', 'hit-44');
    rerender(
      <SegmentedControl
        label="Period"
        tone="hero"
        value="week"
        options={[...options]}
        onChange={vi.fn()}
      />,
    );
    for (const b of screen.getAllByRole('button')) expect(b).toHaveClass('h-8.5', 'hit-44');
    expect(screen.getByRole('group', { name: 'Period' })).toHaveClass('bg-glass-hero');
  });

  it("writes the options not chosen on the block's glass in the block's full ink", () => {
    // The 88% muted line falls under 4.5:1 on that glass in Forest Night and Espresso.
    render(
      <SegmentedControl
        label="Period"
        tone="hero"
        value="week"
        options={[...options]}
        onChange={vi.fn()}
      />,
    );
    for (const label of ['Month', 'Year']) {
      expect(screen.getByText(label), label).toHaveClass('text-hero-text');
      expect(screen.getByText(label), label).not.toHaveClass('text-hero-muted');
    }
    expect(screen.getByText('Week')).toHaveClass('text-hero-to');
  });
});

describe('SegmentedControl stretched', () => {
  const options = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('runs the width of its box with each option taking an equal share, only when asked', () => {
    const { rerender } = render(
      <SegmentedControl label="Part" stretch value="a" options={options} onChange={vi.fn()} />,
    );
    const group = screen.getByRole('group', { name: 'Part' });
    expect(group).toHaveClass('flex', 'w-full');
    expect(group).not.toHaveClass('inline-flex');
    for (const b of screen.getAllByRole('button')) expect(b).toHaveClass('flex-1');

    rerender(<SegmentedControl label="Part" value="a" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Part' })).toHaveClass('inline-flex');
    for (const b of screen.getAllByRole('button')) expect(b).not.toHaveClass('flex-1');
  });
});
