import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../site/get/screens';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const theme = /@theme static \{([^}]*)\}/.exec(css)?.[1] ?? '';
const light = Object.fromEntries(
  [...theme.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]),
);

describe('the colours the download page draws its phone screens in', () => {
  it.each(Object.entries(TOKENS))('%s is the app light-theme colour', (name, value) => {
    expect(light[name]).toBe(value);
  });
});
