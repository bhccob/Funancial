import { readFileSync } from 'node:fs';
const css = readFileSync('src/styles/tokens.css', 'utf8');
import { expect, it } from 'vitest';

it('defines the Pro Ledger tokens', () => {
  expect(css).toContain('--color-accent-text: #007a55');
  expect(css).toContain('--color-chart-6: #008300');
  expect(css).toContain('--color-overlay: #ffffff');
});

it('no longer ships the pixel look', () => {
  expect(css).not.toMatch(/pixelify/i);
  expect(css).not.toContain('--color-texture');
});
