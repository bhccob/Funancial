import { expect } from 'vitest';

/**
 * Says `el` has none of `classes`. jest-dom's `expect(el).not.toHaveClass('a', 'b')` passes when the
 * element lacks only one of them, so a list of classes it must not have is checked one by one here.
 */
export function lacksClasses(el: Element | null, ...classes: string[]) {
  expect(el).not.toBeNull();
  for (const name of classes) expect(el, `has ${name}`).not.toHaveClass(name);
}
