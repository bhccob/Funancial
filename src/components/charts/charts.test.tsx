import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Slice } from '@/domain/charts';
import { sliceColor } from './colors';
import { DayBars } from './DayBars';
import { Donut, DonutLegend } from './Donut';
import { MonthLine } from './MonthLine';
import { Ring } from './Ring';
import { Sparkline } from './Sparkline';

const formatAmount = (minor: number) =>
  `$${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SLICES: Slice[] = [
  { key: 'rent', label: 'Rent', amount: 120000 },
  { key: 'food', label: 'Food', amount: 50000 },
  { key: 'other', label: 'Other', amount: 17500 },
];

const idle = { value: '$1,875', label: 'October' };

function donut(props: Partial<React.ComponentProps<typeof Donut>> = {}) {
  const onSelect = vi.fn();
  const view = render(
    <Donut
      slices={SLICES}
      size={150}
      thickness={18}
      formatAmount={formatAmount}
      idle={idle}
      selected={null}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { ...view, onSelect };
}

describe('sliceColor', () => {
  it('colours Other with the other token and the rest in order', () => {
    expect(sliceColor('other', 5)).toBe('var(--color-chart-other)');
    expect(sliceColor('rent', 0)).toBe('var(--color-chart-1)');
    expect(sliceColor('food', 1)).toBe('var(--color-chart-2)');
    expect(sliceColor('health', 4)).toBe('var(--color-chart-5)');
  });
});

describe('Donut', () => {
  it('labels each donut slice with amount and share, and selects it', async () => {
    const { onSelect } = donut();
    await userEvent.click(screen.getByRole('button', { name: 'Rent, $1,200.00, 64%' }));
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: 'Food, $500.00, 27%' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other, $175.00, 9%' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('draws one arc per slice and colours them by the slice order, Other last', () => {
    const { container } = donut();
    const arcs = [...container.querySelectorAll('circle')].slice(1);
    expect(arcs.map((c) => c.getAttribute('stroke'))).toEqual([
      'var(--color-chart-1)',
      'var(--color-chart-2)',
      'var(--color-chart-other)',
    ]);
  });

  it('leaves a 3px gap after each arc', () => {
    const { container } = donut();
    const r = (150 - 18) / 2;
    const circumference = 2 * Math.PI * r;
    const [rent, food] = [...container.querySelectorAll('circle')].slice(1);
    const [dash, rest] = rent!.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(dash).toBeCloseTo((120000 / 187500) * circumference - 3, 5);
    // The pattern is one dash and a gap longer than the ring, so the dash never repeats.
    expect(rest).toBeGreaterThanOrEqual(circumference);
    // Each arc starts where the one before it ends, gap included.
    expect(Number(rent!.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
    expect(Number(food!.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      -(120000 / 187500) * circumference,
      5,
    );
  });

  it('selects an arc on tap as well', async () => {
    const { container, onSelect } = donut();
    await userEvent.click([...container.querySelectorAll('circle')][2]!);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows the idle centre when nothing is selected', () => {
    donut();
    expect(screen.getByText('$1,875')).toBeInTheDocument();
    expect(screen.getByText('October')).toBeInTheDocument();
  });

  it('puts a small caption over the centre figure, selected or not', () => {
    const { rerender } = donut({ caption: 'Spent' });
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('$1,875')).toBeInTheDocument();
    rerender(
      <Donut
        slices={SLICES}
        size={150}
        thickness={18}
        formatAmount={formatAmount}
        idle={idle}
        caption="Spent"
        selected={1}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Food · 27%')).toBeInTheDocument();
  });

  it('has no caption unless asked for one', () => {
    donut();
    expect(screen.queryByText('Spent')).not.toBeInTheDocument();
  });

  it('shows the selected slice in the centre and fades the others', () => {
    const { container } = donut({ selected: 1 });
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('Food · 27%')).toBeInTheDocument();
    expect(screen.queryByText('$1,875')).not.toBeInTheDocument();
    const arcs = [...container.querySelectorAll('circle')].slice(1);
    expect(arcs.map((c) => c.style.opacity)).toEqual(['0.25', '1', '0.25']);
    expect(screen.getByRole('button', { name: 'Food, $500.00, 27%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clears the selection when the selected slice is tapped again', async () => {
    const { onSelect } = donut({ selected: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Rent, $1,200.00, 64%' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows the idle centre, and a track only, when there are no slices', () => {
    const { container } = donut({ slices: [] });
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.getByText('$1,875')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('draws the track only, without NaN, when every slice is zero', () => {
    const { container } = donut({ slices: [{ key: 'food', label: 'Food', amount: 0 }] });
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('NaN');
  });
});

describe('DonutLegend', () => {
  it('lists each slice with its amount and marks the selected one', async () => {
    const onSelect = vi.fn();
    render(
      <DonutLegend slices={SLICES} formatAmount={formatAmount} selected={2} onSelect={onSelect} />,
    );
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Rent');
    expect(rows[0]).toHaveTextContent('$1,200.00');
    expect(rows.map((r) => r.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);

    await userEvent.click(rows[1]!);
    expect(onSelect).toHaveBeenLastCalledWith(1);
    await userEvent.click(rows[2]!);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('MonthLine', () => {
  const segments = [
    {
      key: 'spent',
      label: 'Spent so far: $1,884.36',
      amount: 188436,
      color: 'var(--color-chart-4)',
    },
    {
      key: 'bills',
      label: 'Bills still to come: $547.81',
      amount: 54781,
      color: 'var(--color-chart-5)',
    },
  ];

  it('selects a segment by label, and clears it when tapped again', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <MonthLine segments={segments} selected={null} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bills still to come: $547.81' }));
    expect(onSelect).toHaveBeenLastCalledWith('bills');

    rerender(<MonthLine segments={segments} selected="bills" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'Bills still to come: $547.81' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bills still to come: $547.81' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('sizes each segment by its amount', () => {
    render(<MonthLine segments={segments} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /Spent so far/ }).style.flexGrow).toBe('188436');
  });

  it('shows the track only when nothing is left to show', () => {
    render(
      <MonthLine
        segments={[{ key: 'spent', label: 'Spent so far: $0.00', amount: 0, color: 'red' }]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('DayBars', () => {
  const days = [
    { label: 'Fri', amount: 2410, isToday: false },
    { label: 'Sat', amount: 8845, isToday: false },
    { label: 'Sun', amount: 0, isToday: false },
    { label: 'Today', amount: 4849, isToday: true },
  ];

  it('selects a day bar by label', async () => {
    const onSelect = vi.fn();
    render(<DayBars days={days} selected={null} onSelect={onSelect} formatAmount={formatAmount} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sat: $88.45' }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  it('clears the selection when the selected day is tapped again', async () => {
    const onSelect = vi.fn();
    render(<DayBars days={days} selected={1} onSelect={onSelect} formatAmount={formatAmount} />);
    const sat = screen.getByRole('button', { name: 'Sat: $88.45' });
    expect(sat).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(sat);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('scales bars to the busiest day, with a 6px minimum, and fills today and the selection', () => {
    render(<DayBars days={days} selected={0} onSelect={() => {}} formatAmount={formatAmount} />);
    const bar = (name: string) =>
      screen.getByRole('button', { name }).firstElementChild as HTMLElement;
    expect(bar('Sat: $88.45').style.height).toBe('100px');
    expect(bar('Sun: $0.00').style.height).toBe('6px');
    expect(bar('Fri: $24.10').className).toContain('bg-text');
    expect(bar('Today: $48.49').className).toContain('bg-text');
    expect(bar('Sat: $88.45').className).toContain('bg-track');
    expect(bar('Sat: $88.45').className).not.toContain('bg-text');
  });

  it('keeps every bar at the minimum, without NaN, in a quiet week', () => {
    render(
      <DayBars
        days={days.map((d) => ({ ...d, amount: 0 }))}
        selected={null}
        onSelect={() => {}}
        formatAmount={formatAmount}
      />,
    );
    const heights = screen
      .getAllByRole('button')
      .map((b) => (b.firstElementChild as HTMLElement).style.height);
    expect(heights).toEqual(['6px', '6px', '6px', '6px']);
  });
});

describe('Ring', () => {
  const arc = (container: HTMLElement) => container.querySelectorAll('circle')[1]!;

  it('caps a ring above 100% and keeps its label', () => {
    const { container } = render(
      <Ring value={135} size={86} thickness={7} color="red" label="Food: 135% used, $20 over">
        <b>135%</b>
      </Ring>,
    );
    expect(screen.getByRole('img', { name: 'Food: 135% used, $20 over' })).toBeInTheDocument();
    expect(arc(container).getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('draws the share of the circle that is used', () => {
    const { container } = render(
      <Ring value={25} size={100} thickness={10} color="red" label="x" />,
    );
    const circumference = 2 * Math.PI * 45;
    expect(Number(arc(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * 0.75,
      5,
    );
  });

  it('draws no arc for nothing used', () => {
    const { container } = render(<Ring value={0} size={86} thickness={7} color="red" label="x" />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('NaN');
  });
});

describe('Sparkline', () => {
  it('draws a flat sparkline for equal values without NaN', () => {
    render(<Sparkline values={[5, 5, 5, 5]} height={70} color="green" label="Flat" />);
    const d = screen.getByRole('img', { name: 'Flat' }).querySelector('path')!.getAttribute('d')!;
    expect(d).not.toContain('NaN');
    const ys = [...d.matchAll(/,(-?[\d.]+)/g)].map((m) => m[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it('rises with the values', () => {
    render(<Sparkline values={[1, 2, 3]} height={70} color="green" label="Up" />);
    const d = screen.getByRole('img', { name: 'Up' }).querySelector('path')!.getAttribute('d')!;
    const ys = [...d.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[0]).toBeGreaterThan(ys[1]!);
    expect(ys[1]).toBeGreaterThan(ys[2]!);
  });

  it('draws a flat line, without NaN, for one value or none', () => {
    for (const values of [[7], []]) {
      const { unmount } = render(
        <Sparkline values={values} height={70} color="green" label="Few" />,
      );
      const d = screen.getByRole('img', { name: 'Few' }).querySelector('path')!.getAttribute('d')!;
      expect(d).not.toContain('NaN');
      unmount();
    }
  });
});
