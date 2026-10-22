import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../site/get/screens';
import { resolve, varsOn } from './cssTokens';

// The app with no theme set: Black & White, in light mode.
const light = varsOn({});

describe('the colours the download page draws its phone screens in', () => {
  it.each(Object.entries(TOKENS))('%s is the app light-theme colour', (name, value) => {
    expect(resolve(light[name]!, light)).toBe(value);
  });
});
