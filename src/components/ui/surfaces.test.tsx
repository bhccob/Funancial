import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Snowflake } from 'lucide-react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Key } from './Key';
import { Pill } from './Pill';
import { RoundAction } from './RoundAction';
import { SegmentedControl } from './SegmentedControl';
import { Tile } from './Tile';

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

const inRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('Tile', () => {
  it('renders as the element it is asked to be, solid and padded', () => {
    render(
      <Tile as="section" aria-label="Spending" className="mt-2">
        Food
      </Tile>,
    );
    const tile = screen.getByRole('region', { name: 'Spending' });
    expect(tile.tagName).toBe('SECTION');
    expect(tile).toHaveClass('bg-surface', 'rounded-tile', 'shadow-tile', 'p-4', 'mt-2');
  });

  it('is a div by default, and drops its padding when told to', () => {
    render(<Tile padded={false}>Food</Tile>);
    const tile = screen.getByText('Food');
    expect(tile.tagName).toBe('DIV');
    expect(tile).not.toHaveClass('p-4');
  });
});

describe('Pill', () => {
  it('is a link with `to`, with a 44px tap area', () => {
    inRouter(<Pill to="/profile">Profile</Pill>);
    const pill = screen.getByRole('link', { name: 'Profile' });
    expect(pill).toHaveAttribute('href', '/profile');
    expect(pill).toHaveClass('h-9', 'rounded-full', 'text-small', 'press', 'hit-44');
  });

  it('is a button with `onClick`, and fires it', async () => {
    const onClick = vi.fn();
    render(
      <Pill onClick={onClick} aria-label="Currency: AWG">
        AWG
      </Pill>,
    );
    const pill = screen.getByRole('button', { name: 'Currency: AWG' });
    expect(pill).toHaveAttribute('type', 'button');
    expect(pill).toHaveClass('press', 'hit-44');
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is plain text, not focusable and without press feedback, when it goes nowhere', async () => {
    render(<Pill>Level 4</Pill>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const pill = screen.getByText('Level 4');
    expect(pill.tagName).toBe('SPAN');
    expect(pill).not.toHaveClass('press');
    await userEvent.tab();
    expect(document.body).toHaveFocus();
  });

  it('has a soft, an ink and a glass tone for the dark header', () => {
    const { rerender } = render(<Pill>One</Pill>);
    expect(screen.getByText('One')).toHaveClass('bg-surface-2', 'text-text');
    rerender(<Pill tone="ink">One</Pill>);
    expect(screen.getByText('One')).toHaveClass('bg-primary', 'text-primary-contrast');
    rerender(<Pill tone="hero">One</Pill>);
    expect(screen.getByText('One')).toHaveClass(
      'bg-glass-hero',
      'ring-glass-hero-line',
      'text-hero-text',
      'backdrop-blur-[24px]',
    );
  });
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
});

describe('RoundAction', () => {
  it('is named by its label, shown under the chip', () => {
    render(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Freeze' })).toHaveTextContent('Freeze');
  });

  it('is named by its label as an aria-label when the label is hidden', () => {
    render(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} showLabel={false} />);
    const action = screen.getByRole('button', { name: 'Freeze' });
    expect(action).toHaveAttribute('aria-label', 'Freeze');
    expect(action).not.toHaveTextContent('Freeze');
  });

  it('is a link with `to`, a round chip of the size it is given', () => {
    inRouter(<RoundAction icon={Snowflake} label="Add" to="/add" size={44} />);
    const action = screen.getByRole('link', { name: 'Add' });
    expect(action).toHaveAttribute('href', '/add');
    expect(action.querySelector('span')).toHaveStyle({ width: '44px', height: '44px' });
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<RoundAction icon={Snowflake} label="Freeze" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reports aria-pressed only when it is given', () => {
    const { rerender } = render(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Freeze' })).not.toHaveAttribute('aria-pressed');
    rerender(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} pressed={false} />);
    expect(screen.getByRole('button', { name: 'Freeze' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} pressed />);
    expect(screen.getByRole('button', { name: 'Freeze' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has a light, a glass and an ink tone', () => {
    const { rerender } = render(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} />);
    const chip = () => screen.getByRole('button', { name: 'Freeze' }).querySelector('span');
    expect(chip()).toHaveClass('bg-surface', 'shadow-tile');
    rerender(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} tone="hero" />);
    expect(chip()).toHaveClass('bg-glass-hero', 'text-hero-text');
    rerender(<RoundAction icon={Snowflake} label="Freeze" onClick={vi.fn()} tone="ink" />);
    expect(chip()).toHaveClass('bg-primary', 'text-primary-contrast');
  });
});

describe('Key', () => {
  it('shows its label and value', () => {
    render(<Key label="Spent in October" value="AWG 1,240" />);
    expect(screen.getByText('Spent in October')).toBeInTheDocument();
    expect(screen.getByText('AWG 1,240')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is a link with `to`, and draws a chevron when asked', () => {
    const { container, rerender } = inRouter(<Key label="Saved" value="AWG 900" to="/saved" />);
    const key = screen.getByRole('link', { name: /Saved/ });
    expect(key).toHaveAttribute('href', '/saved');
    expect(key).toHaveClass('rounded-key', 'min-h-16', 'press');
    expect(container.querySelector('svg')).toBeNull();
    rerender(
      <MemoryRouter>
        <Key label="Saved" value="AWG 900" to="/saved" chevron />
      </MemoryRouter>,
    );
    expect(container.querySelector('svg.lucide-chevron-right')).toHaveClass('size-4');
  });

  it('is a button with `onClick`, and fires it', async () => {
    const onClick = vi.fn();
    render(<Key label="Spent" value="AWG 10" onClick={onClick} />);
    const key = screen.getByRole('button', { name: /Spent/ });
    await userEvent.click(key);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has a glass tone for the dark header', () => {
    render(<Key label="Spent" value="AWG 10" tone="hero" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Spent/ })).toHaveClass(
      'bg-glass-hero',
      'ring-glass-hero-line',
    );
  });
});
