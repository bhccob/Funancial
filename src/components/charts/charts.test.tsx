import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Slice } from '@/domain/charts';
import { sliceColor } from './colors';
import { DayBars } from './DayBars';
import { Donut, DonutLegend } from './Donut';
import { MonthLine } from './MonthLine';
import { PriceLine } from './PriceLine';
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
      label="Spending by category"
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

  it('colours keys that are not categories, such as a holding or a sector, by position too', () => {
    expect(sliceColor('Technology', 2)).toBe('var(--color-chart-3)');
    expect(sliceColor('a3f9-holding-id', 5)).toBe('var(--color-chart-1)');
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
        label="Spending by category"
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

describe('Charts have a name and their figures as text', () => {
  it('names the donut, whose slices are a list of their label, amount and share', () => {
    donut();
    const list = screen.getByRole('list', { name: 'Spending by category' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Rent, $1,200.00, 64%', 'Food, $500.00, 27%', 'Other, $175.00, 9%']);
  });

  it('names the day bars as a group, each bar reading its day and amount', () => {
    render(
      <DayBars
        label="Spending per day"
        days={[
          { label: 'Fri', amount: 2410, isToday: false },
          { label: 'Today', amount: 0, isToday: true },
        ]}
        selected={null}
        onSelect={() => {}}
        formatAmount={formatAmount}
      />,
    );
    const group = screen.getByRole('group', { name: 'Spending per day' });
    expect(within(group).getByRole('button', { name: 'Fri: $24.10' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Today: $0.00' })).toBeInTheDocument();
  });

  it('names the month line as a group, each segment reading its label and amount', () => {
    render(
      <MonthLine
        label="This month"
        segments={[
          { key: 'spent', label: 'Spent so far: $18.00', amount: 1800, color: 'red' },
          { key: 'left', label: 'Left: $82.00', amount: 8200, color: 'blue' },
        ]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    const group = screen.getByRole('group', { name: 'This month' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
  });

  it('gives a ring, a sparkline and a price line a name for screen readers', () => {
    render(
      <>
        <Ring value={40} size={40} thickness={5} color="red" label="Food: 40% used" />
        <Sparkline values={[1, 2]} height={40} color="red" label="Net worth over 30 days" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Food: 40% used' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Net worth over 30 days' })).toBeInTheDocument();
  });

  it('keeps the day bars 44px wide where seven fit a phone, with no gap between their taps', () => {
    render(
      <DayBars
        label="Spending per day"
        days={[{ label: 'Fri', amount: 1, isToday: false }]}
        selected={null}
        onSelect={() => {}}
        formatAmount={formatAmount}
      />,
    );
    expect(screen.getByRole('group', { name: 'Spending per day' })).not.toHaveClass('gap-3.5');
  });
});

describe('Donut centre figure', () => {
  const figure = () => screen.getByText('$1,875');

  it('is 15px on a donut under 150px, where the hole is too narrow for an exact amount', () => {
    donut({ size: 120, thickness: 14 });
    expect(figure()).toHaveClass('text-[15px]');
    expect(figure()).not.toHaveClass('text-[19px]');
  });

  it('keeps 19px at 150px (Home) and 28px from 200px (Budget)', () => {
    const { unmount } = donut({ size: 150 });
    expect(figure()).toHaveClass('text-[19px]');
    unmount();
    donut({ size: 240, thickness: 22 });
    expect(figure()).toHaveClass('text-[28px]');
  });

  it('shows a chosen slice at the same size, with its exact amount', () => {
    donut({ size: 120, thickness: 14, selected: 0 });
    expect(screen.getByText('$1,200.00')).toHaveClass('text-[15px]');
  });
});

describe('Donut percentages', () => {
  const shown = () => screen.queryAllByText(/^[0-9]+%$/).map((el) => el.textContent);

  it('writes no percentages unless asked', () => {
    const { container } = donut();
    expect(shown()).toEqual([]);
    expect(container.firstElementChild).not.toHaveStyle({ margin: '16px 28px' });
  });

  it('writes the share of each slice of 6% or more, rounded to a whole percent', () => {
    donut({ showPercent: true });
    expect(shown()).toEqual(['64%', '27%', '9%']);

    // 5.9% stays off the pie; exactly 6% gets its label. The read-out of the arcs is unchanged.
    const { unmount } = donut({
      showPercent: true,
      slices: [
        { key: 'a', label: 'A', amount: 6 },
        { key: 'b', label: 'B', amount: 5.9 },
        { key: 'c', label: 'C', amount: 88.1 },
      ],
    });
    expect(shown().slice(3)).toEqual(['6%', '88%']);
    expect(screen.getByRole('button', { name: 'B, $0.06, 6%' })).toBeInTheDocument();
    unmount();
  });

  it('puts a label just outside the ring at the middle of its slice, in the text colour', () => {
    donut({ showPercent: true });
    const label = screen.getByText('64%');
    // Rent runs from 0 to 64% of the way round, so it points 115.2 degrees clockwise from the top.
    const angle = 0.32 * 2 * Math.PI;
    const radius = (150 - 18) / 2 + 18 / 2 + 4;
    expect(parseFloat(label.style.left)).toBeCloseTo(75 + radius * Math.sin(angle), 5);
    expect(parseFloat(label.style.top)).toBeCloseTo(75 - radius * Math.cos(angle), 5);
    expect(label).toHaveClass('text-text');
    expect(label.style.color).toBe('');
    expect(label).toHaveAttribute('aria-hidden', 'true');
    // On the right of the ring it grows rightwards, so it clears the ring.
    expect(label.style.transform).toBe(
      `translate(${-50 + 50 * Math.sin(angle)}%, ${-50 - 50 * Math.cos(angle)}%)`,
    );
  });

  it('keeps room around the ring for the labels', () => {
    const { container } = donut({ showPercent: true });
    expect(container.firstElementChild).toHaveStyle({ margin: '16px 28px' });
  });

  it('labels a lone slice below the ring, as 100%', () => {
    donut({ showPercent: true, slices: [{ key: 'ko', label: 'KO', amount: 500 }] });
    expect(shown()).toEqual(['100%']);
  });

  it('writes none on an empty donut', () => {
    donut({ showPercent: true, slices: [] });
    expect(shown()).toEqual([]);
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

describe('DonutLegend percentages', () => {
  it('adds each slice share after its amount, small slices included, only when asked', () => {
    const slices = [...SLICES, { key: 'tiny', label: 'Tiny', amount: 5000 }];
    const { rerender } = render(
      <DonutLegend
        slices={slices}
        formatAmount={formatAmount}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Rent$1,200.00',
      'Food$500.00',
      'Other$175.00',
      'Tiny$50.00',
    ]);

    rerender(
      <DonutLegend
        slices={slices}
        formatAmount={formatAmount}
        selected={null}
        onSelect={() => {}}
        showPercent
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Rent$1,200.0062%',
      'Food$500.0026%',
      'Other$175.009%',
      'Tiny$50.003%',
    ]);
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
      <MonthLine label="This month" segments={segments} selected={null} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bills still to come: $547.81' }));
    expect(onSelect).toHaveBeenLastCalledWith('bills');

    rerender(
      <MonthLine label="This month" segments={segments} selected="bills" onSelect={onSelect} />,
    );
    expect(screen.getByRole('button', { name: 'Bills still to come: $547.81' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bills still to come: $547.81' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('sizes each segment by its amount', () => {
    render(
      <MonthLine label="This month" segments={segments} selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /Spent so far/ }).style.flexGrow).toBe('188436');
  });

  it('keeps a tiny segment wide enough to tap beside a huge one', () => {
    render(
      <MonthLine
        label="This month"
        segments={[
          { key: 'spent', label: 'Spent so far: $2,600', amount: 260000, color: 'red' },
          { key: 'bills', label: 'Bills still to come: $16', amount: 1600, color: 'blue' },
        ]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    // Sized by amount the bills would be about 2px wide; the minimum keeps them tappable.
    expect(screen.getByRole('button', { name: /Bills still to come/ })).toHaveClass('min-w-2');
    expect(screen.getByRole('button', { name: /Spent so far/ })).toHaveClass('min-w-2');
  });

  it('shows the track only when nothing is left to show', () => {
    render(
      <MonthLine
        label="This month"
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
    render(
      <DayBars
        label="Spending per day"
        days={days}
        selected={null}
        onSelect={onSelect}
        formatAmount={formatAmount}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sat: $88.45' }));
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  it('clears the selection when the selected day is tapped again', async () => {
    const onSelect = vi.fn();
    render(
      <DayBars
        label="Spending per day"
        days={days}
        selected={1}
        onSelect={onSelect}
        formatAmount={formatAmount}
      />,
    );
    const sat = screen.getByRole('button', { name: 'Sat: $88.45' });
    expect(sat).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(sat);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('scales bars to the busiest day, with a 6px minimum, and fills today and the selection', () => {
    render(
      <DayBars
        label="Spending per day"
        days={days}
        selected={0}
        onSelect={() => {}}
        formatAmount={formatAmount}
      />,
    );
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
        label="Spending per day"
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

describe('PriceLine', () => {
  // Prices in minor units, as the holding's page hands them over.
  const points = [
    { date: '2025-03-03', value: 21050 },
    { date: '2025-03-10', value: 20000 },
    { date: '2025-03-17', value: 22000 },
    { date: '2025-03-24', value: 24076 },
  ];
  const formatDate = (d: string) => `on ${d}`;
  const LABEL = 'From $210.50 on Mar 3, 2025 to $240.76 today';

  function line(props: Partial<React.ComponentProps<typeof PriceLine>> = {}) {
    return render(
      <PriceLine
        points={points}
        paid={21050}
        formatValue={formatAmount}
        formatDate={formatDate}
        label={LABEL}
        {...props}
      />,
    );
  }
  const chart = () => screen.getByRole('img', { name: LABEL });
  const ys = (container: HTMLElement) =>
    [
      ...container
        .querySelector('path')!
        .getAttribute('d')!
        .matchAll(/ ([0-9.]+)/g),
    ].map((m) => Number(m[1]));

  it('reads out the summary, labels what was paid and the latest price, and marks the start', () => {
    const { container } = line();
    expect(chart()).toBeInTheDocument();
    expect(screen.getByText('You bought · $210.50')).toBeInTheDocument();
    expect(screen.getByText('$240.76')).toBeInTheDocument();
    // The first point has a dot: a zero-length round stroke, which stays round as the chart stretches.
    const dot = container.querySelectorAll('path')[1]!;
    expect(dot.getAttribute('d')).toBe(`M0 ${ys(container)[0]} L0 ${ys(container)[0]}`);
    expect(dot).toHaveAttribute('stroke-linecap', 'round');
    // The dashed line is at the price paid, which is also the first point's price here.
    const dashed = container.querySelector('line[stroke-dasharray]')!;
    expect(dashed.getAttribute('y1')).toBe(String(ys(container)[0]));
  });

  it('draws the closes left to right, higher prices higher up', () => {
    const { container } = line();
    const d = container.querySelector('path')!.getAttribute('d')!;
    expect(d.startsWith('M0 ')).toBe(true);
    expect(d).toContain('L100 ');
    const y = ys(container);
    expect(y[3]).toBeLessThan(y[0]!);
    expect(y[1]).toBeGreaterThan(y[0]!);
    expect(d).not.toContain('NaN');
  });

  it('keeps the price paid in view, even when every close is above it', () => {
    const { container } = line({ paid: 10000 });
    const paidY = Number(container.querySelector('line[stroke-dasharray]')!.getAttribute('y1'));
    expect(paidY).toBeGreaterThan(Math.max(...ys(container)));
    expect(paidY).toBeLessThanOrEqual(100);
  });

  describe('without scaling to the price paid', () => {
    const dashed = (container: HTMLElement) => container.querySelector('line[stroke-dasharray]');

    it('fits the chart to the closes alone, and keeps a paid line that falls among them', () => {
      const { container } = line({ scaleToPaid: false, paid: 22000 });
      // The lowest close is on the bottom of the drawing area and the highest on the top.
      expect(Math.max(...ys(container))).toBe(88);
      expect(Math.min(...ys(container))).toBe(18);
      expect(dashed(container)).toBeInTheDocument();
      expect(screen.getByText('You bought · $220.00')).toBeInTheDocument();
    });

    it('draws no line for a price paid below the closes, and says so at the bottom edge', () => {
      const { container } = line({ scaleToPaid: false, paid: 10000 });
      expect(Math.max(...ys(container))).toBe(88);
      expect(dashed(container)).not.toBeInTheDocument();
      const edge = screen.getByText('You bought · $100.00 ↓');
      expect(edge).toHaveClass('bottom-0');
      expect(edge.style.top).toBe('');
    });

    it('draws no line for a price paid above the closes, and says so at the top edge', () => {
      const { container } = line({ scaleToPaid: false, paid: 30000 });
      expect(Math.min(...ys(container))).toBe(18);
      expect(dashed(container)).not.toBeInTheDocument();
      expect(screen.getByText('You bought · $300.00 ↑')).toHaveClass('top-0');
    });

    it('keeps a price paid at the highest close on the line', () => {
      const { container } = line({ scaleToPaid: false, paid: 24076 });
      expect(dashed(container)).toBeInTheDocument();
      expect(screen.getByText('You bought · $240.76')).toBeInTheDocument();
    });

    it('draws a flat series without NaN, with the paid line at the edge it differs on', () => {
      const { container } = line({
        scaleToPaid: false,
        points: points.map((p) => ({ ...p, value: 100 })),
        paid: 50,
      });
      expect(container.innerHTML).not.toContain('NaN');
      expect(screen.getByText('You bought · $0.50 ↓')).toBeInTheDocument();
    });
  });

  it('draws a flat line without NaN when nothing moved', () => {
    const { container } = line({
      points: points.map((p) => ({ ...p, value: 100 })),
      paid: 100,
    });
    expect(container.innerHTML).not.toContain('NaN');
    expect(new Set(ys(container)).size).toBe(1);
  });

  describe('reading a price', () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 10,
        width: 300,
        top: 0,
        height: 160,
        right: 310,
        bottom: 160,
        x: 10,
        y: 0,
        toJSON: () => ({}),
      });
    });
    afterEach(() => vi.restoreAllMocks());

    it('shows the date and price under the pointer, and drops them when a mouse leaves', () => {
      line();
      expect(screen.queryByText('on 2025-03-10 · $200.00')).not.toBeInTheDocument();
      // 110px in of 300 is a third of the way: the second of four closes.
      fireEvent.pointerMove(chart(), { clientX: 110, pointerType: 'mouse' });
      expect(screen.getByText('on 2025-03-10 · $200.00')).toBeInTheDocument();
      fireEvent.pointerMove(chart(), { clientX: 5000, pointerType: 'mouse' });
      expect(screen.getByText('on 2025-03-24 · $240.76')).toBeInTheDocument();
      fireEvent.pointerLeave(chart(), { pointerType: 'mouse' });
      expect(screen.queryByText(/^on 2025/)).not.toBeInTheDocument();
    });

    it('keeps the price a finger touched after it lifts', () => {
      line();
      fireEvent.pointerDown(chart(), { clientX: 10, pointerType: 'touch' });
      fireEvent.pointerLeave(chart(), { pointerType: 'touch' });
      expect(screen.getByText('on 2025-03-03 · $210.50')).toBeInTheDocument();
    });

    it('can be walked a close at a time from the keyboard', () => {
      line();
      const slider = screen.getByRole('slider', { name: 'Price on a day' });
      expect(slider).toHaveAttribute('max', '3');
      expect(slider).toHaveAttribute('aria-valuetext', 'on 2025-03-24: $240.76');
      fireEvent.change(slider, { target: { value: '1' } });
      expect(slider).toHaveAttribute('aria-valuetext', 'on 2025-03-10: $200.00');
      expect(screen.getByText('on 2025-03-10 · $200.00')).toBeInTheDocument();
    });
  });
});
