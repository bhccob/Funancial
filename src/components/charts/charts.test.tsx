import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Slice } from '@/domain/charts';
import { sliceColor } from './colors';
import { DayBars } from './DayBars';
import { Donut, DonutLegend } from './Donut';
import { PriceLine } from './PriceLine';
import { Ring } from './Ring';
import { Sparkline } from './Sparkline';
import { StackedBars } from './StackedBars';

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

  /** The px a donut writes `text` at, read from its `text-[NNpx]` class. */
  const sizeOf = (text: string, props: Partial<React.ComponentProps<typeof Donut>> = {}) => {
    const { unmount } = donut({
      size: 200,
      thickness: 22,
      idle: { value: text, label: 'All' },
      ...props,
    });
    const px = Number(/text-\[(\d+)px\]/.exec(screen.getByText(text).className)![1]);
    unmount();
    return px;
  };

  it('steps a long amount down 28, 24, 20px so that it fits the hole of a 200px donut', () => {
    // The hole is 156px; an amount of 163px at 28px would graze the ring.
    expect(sizeOf('$14,853')).toBe(28);
    expect(sizeOf('$99,999')).toBe(28);
    // Common amounts with cents still fit at 28px (145px).
    expect(sizeOf('$1,200.00')).toBe(28);
    expect(sizeOf('$10,000.00')).toBe(24);
    expect(sizeOf('$1,234,567')).toBe(24);
    expect(sizeOf('$100,000.00')).toBe(20);
  });

  it('goes no lower than 20px, however long the amount', () => {
    expect(sizeOf('$999,999,999,999,999.00')).toBe(20);
  });

  it('steps a chosen slice by the amount it shows, as the idle figure is', () => {
    const shows = (text: string) => ({ selected: 0, formatAmount: () => text });
    expect(sizeOf('$5.00', shows('$5.00'))).toBe(28);
    expect(sizeOf('$12,000.00', shows('$12,000.00'))).toBe(24);
    expect(sizeOf('$10,000,000.00', shows('$10,000,000.00'))).toBe(20);
  });

  it('takes the hole of the donut it is in: a 240px donut (Budget) keeps 28px for the same amount', () => {
    expect(sizeOf('$10,000.00', { size: 240 })).toBe(28);
    expect(sizeOf('$123,456.78', { size: 240 })).toBe(28);
  });

  it('keeps the same size for a hidden amount, whatever it is: the mask is one string', () => {
    // The pie writes the mask in place of every amount while they are hidden, so its size cannot say how much.
    for (const amount of [5, 1000, 123_456_700, 99_999_999_999_00]) {
      const slices = [{ key: 'a', label: 'A', amount }];
      expect(sizeOf('••••', { selected: 0, formatAmount: () => '••••', slices })).toBe(28);
    }
  });

  it('leaves the 15px and 19px donuts as they are, however long the amount', () => {
    expect(sizeOf('$1,234,567.00', { size: 120, thickness: 14 })).toBe(15);
    expect(sizeOf('$1,234,567.00', { size: 150, thickness: 18 })).toBe(19);
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
    expect(bar('Sat: $88.45').className).toContain('bg-muted/75');
    expect(bar('Sat: $88.45').className).not.toContain('bg-track');
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

  it('draws its track in the page track colour, or the one it is given', () => {
    const { container, unmount } = render(
      <Ring value={50} size={44} thickness={3} color="red" label="x" />,
    );
    expect(container.querySelector('circle')).toHaveAttribute('stroke', 'var(--color-track)');
    unmount();
    const block = render(
      <Ring value={50} size={44} thickness={3} color="red" track="var(--hg-bg)" label="x" />,
    );
    expect(block.container.querySelector('circle')).toHaveAttribute('stroke', 'var(--hg-bg)');
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

  it('is a picture only, hidden from a screen reader, without a label', () => {
    const { container } = render(<Sparkline values={[1, 2]} height={30} color="green" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('can end on a round dot, drawn as a point the stroke caps round whatever the scale', () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} height={30} color="green" dot />);
    const [line, dot] = [...container.querySelectorAll('path')];
    const end = line!.getAttribute('d')!.split(' ').at(-1)!.slice(1);
    expect(dot).toHaveAttribute('d', `M${end} l0,0`);
    expect(dot).toHaveAttribute('stroke-linecap', 'round');
    expect(dot).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(Number(dot!.getAttribute('stroke-width'))).toBe(6);
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

describe('StackedBars', () => {
  const bars = [
    {
      label: 'SEP',
      name: 'September 2026',
      current: false,
      parts: [
        { key: 'salary', amount: 300, color: 'blue' },
        { key: 'extra', amount: 100, color: 'orange' },
        { key: 'dividends', amount: 0, color: 'green' },
      ],
    },
    {
      label: 'OCT',
      name: 'October 2026',
      current: true,
      parts: [
        { key: 'salary', amount: 200, color: 'blue' },
        { key: 'extra', amount: 0, color: 'orange' },
        { key: 'dividends', amount: 0, color: 'green' },
      ],
    },
    {
      label: 'NOV',
      name: 'November 2026',
      current: false,
      parts: [
        { key: 'salary', amount: 0, color: 'blue' },
        { key: 'extra', amount: 0, color: 'orange' },
        { key: 'dividends', amount: 0, color: 'green' },
      ],
    },
  ];

  function stacked(props: Partial<React.ComponentProps<typeof StackedBars>> = {}) {
    const onSelect = vi.fn();
    render(
      <StackedBars
        label="Income per month"
        bars={bars}
        selected={null}
        onSelect={onSelect}
        formatAmount={(minor) => formatAmount(minor)}
        {...props}
      />,
    );
    return { onSelect };
  }
  const barOf = (name: string) => screen.getByRole('button', { name });
  const parts = (name: string) => [...(barOf(name).firstElementChild as HTMLElement).children];

  it('names the bars as a group, each reading its month and total', () => {
    stacked();
    const group = screen.getByRole('group', { name: 'Income per month' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(within(group).getByRole('button', { name: 'September 2026: $4.00' })).toBeVisible();
    expect(within(group).getByRole('button', { name: 'November 2026: $0.00' })).toBeVisible();
  });

  it('stacks the parts in the order given from the bottom up, one colour each, skipping a part of nothing', () => {
    stacked();
    const sep = parts('September 2026: $4.00') as HTMLElement[];
    expect(sep.map((p) => p.style.backgroundColor)).toEqual(['blue', 'orange']);
    const stack = barOf('September 2026: $4.00').firstElementChild as HTMLElement;
    expect(stack).toHaveClass('flex-col-reverse', 'gap-0.5'); // a 2px gap between the parts
    expect(parts('October 2026: $2.00')).toHaveLength(1);
  });

  it('scales the bars to the biggest month, keeping each part in proportion', () => {
    stacked();
    const heights = (name: string) => (parts(name) as HTMLElement[]).map((p) => p.style.height);
    // 100px for the biggest bar, less the 2px between its two parts: 98 shared 3 to 1.
    expect(heights('September 2026: $4.00')).toEqual(['73.5px', '24.5px']);
    expect(heights('October 2026: $2.00')).toEqual(['50px']);
  });

  it('keeps a part too small to see at 4px', () => {
    stacked({
      bars: [
        {
          label: 'OCT',
          name: 'October 2026',
          current: true,
          parts: [
            { key: 'salary', amount: 420_000, color: 'blue' },
            { key: 'dividends', amount: 13, color: 'green' },
          ],
        },
      ],
    });
    const [, dividends] = parts('October 2026: $4,200.13') as HTMLElement[];
    expect(dividends!.style.height).toBe('4px');
  });

  it('shows a month with nothing as a 6px track, and every month so in a quiet year, without NaN', () => {
    stacked();
    const nov = barOf('November 2026: $0.00').firstElementChild as HTMLElement;
    expect(nov.className).toContain('bg-track');
    expect(nov.style.height).toBe('6px');

    cleanup();
    stacked({
      bars: bars.map((b) => ({ ...b, parts: b.parts.map((p) => ({ ...p, amount: 0 })) })),
    });
    const heights = screen
      .getAllByRole('button')
      .map((b) => (b.firstElementChild as HTMLElement).style.height);
    expect(heights).toEqual(['6px', '6px', '6px']);
  });

  it('selects a bar by its name, and clears the selection when the selected bar is tapped again', async () => {
    const { onSelect } = stacked();
    await userEvent.click(barOf('October 2026: $2.00'));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    cleanup();

    const again = stacked({ selected: 1 });
    expect(barOf('October 2026: $2.00')).toHaveAttribute('aria-pressed', 'true');
    expect(barOf('September 2026: $4.00')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(barOf('October 2026: $2.00'));
    expect(again.onSelect).toHaveBeenLastCalledWith(null);
  });

  it('fades the other bars while one is selected, and keeps the labels in text colours', () => {
    stacked({ selected: 0 });
    expect(barOf('September 2026: $4.00').firstElementChild).not.toHaveClass('opacity-40');
    expect(barOf('October 2026: $2.00').firstElementChild).toHaveClass('opacity-40');
    for (const button of screen.getAllByRole('button')) {
      expect(button.lastElementChild!.className).toMatch(/\btext-(text|muted)\b/);
      expect((button.lastElementChild as HTMLElement).style.color).toBe('');
    }
    expect(screen.getByText('OCT')).toHaveClass('text-text'); // the current month
    expect(screen.getByText('SEP')).toHaveClass('text-muted');
  });
});
