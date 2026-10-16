import { describe, expect, it } from 'vitest';
import { arrow, tone } from './gain';

describe('gain and loss', () => {
  it('colours a loss in the danger colour and anything else in the success colour', () => {
    expect(tone(-1)).toBe('text-danger');
    expect(tone(0)).toBe('text-success');
    expect(tone(1)).toBe('text-success');
  });

  it('points down for a loss and up for anything else', () => {
    expect(arrow(-1)).toBe('▼');
    expect(arrow(0)).toBe('▲');
    expect(arrow(1)).toBe('▲');
  });
});
