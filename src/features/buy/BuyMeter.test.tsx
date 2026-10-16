import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BuyMeter } from './BuyMeter';

describe('BuyMeter', () => {
  it('is a labelled meter from 0 to 100 that reads out its zone', () => {
    render(<BuyMeter meter={38} />);
    const meter = screen.getByRole('meter', { name: 'Buy meter' });
    expect(meter).toHaveAttribute('aria-valuenow', '38');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '38% a buy, Wait zone');
    expect(meter).toHaveTextContent('38% a buy');
  });

  it.each([
    [0, 'Skip'],
    [33, 'Skip'],
    [34, 'Wait'],
    [66, 'Wait'],
    [67, 'Buy'],
    [100, 'Buy'],
  ])('puts %i%% in the %s zone', (meter, name) => {
    render(<BuyMeter meter={meter} />);
    expect(screen.getByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      `${meter}% a buy, ${name} zone`,
    );
  });

  it('names the three zones under the gauge', () => {
    render(<BuyMeter meter={50} />);
    const labels = screen.getByRole('meter').querySelector('[data-zones]');
    expect(labels).toHaveTextContent('SkipWaitBuy');
  });

  it('turns the marker to the reading, along the gauge from Skip to Buy', () => {
    const { rerender } = render(<BuyMeter meter={0} />);
    expect(screen.getByTestId('meter-marker')).toHaveStyle({ transform: 'rotate(0deg)' });
    rerender(<BuyMeter meter={38} />);
    expect(screen.getByTestId('meter-marker')).toHaveStyle({ transform: 'rotate(68.4deg)' });
    rerender(<BuyMeter meter={100} />);
    expect(screen.getByTestId('meter-marker')).toHaveStyle({ transform: 'rotate(180deg)' });
  });

  it('moves the marker only where motion is allowed', () => {
    render(<BuyMeter meter={38} />);
    const moving = screen
      .getByTestId('meter-marker')
      .getAttribute('class')!
      .split(/\s+/)
      .filter((c) => /animate|transition/.test(c));
    expect(moving.length).toBeGreaterThan(0);
    for (const c of moving) expect(c).toMatch(/^motion-safe:/);
  });
});
