import { readFileSync } from 'node:fs';

/*
 * Reads the app's token files the way the browser cascades them, so a test can ask for the value a
 * token has on <html> in a given mode and theme. The two files hold nothing but plain rules (no
 * nesting, no media queries), and every selector in them is a compound of `:root`, `[attr='value']`
 * and `:not([attr])`, which is all this understands.
 */

export const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
export const themesCss = readFileSync('src/styles/themes.css', 'utf8');

/** One selector of a rule, with the custom properties the rule declares. */
export interface Rule {
  selector: string;
  vars: Record<string, string>;
}

/** Every selector of every rule in `css`, in source order. */
export function rulesOf(css: string): Rule[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectorList, body]) => {
    const vars = Object.fromEntries(
      [...body!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
        name!,
        value!.replace(/\s+/g, ' ').trim(),
      ]),
    );
    return selectorList!.split(',').map((selector) => ({ selector: selector.trim(), vars }));
  });
}

/** The declarations of the rule whose selector is exactly `selector`. */
export function declarations(selector: string, css = tokensCss): Record<string, string> {
  const rule = rulesOf(css).find((r) => r.selector === selector);
  if (!rule) throw new Error(`No rule for ${selector}`);
  return rule.vars;
}

/**
 * How many class-level parts `selector` has if it matches <html> with these attributes, else null.
 * Tailwind puts `@theme static` on `:root`, so that is how it counts.
 */
function specificity(selector: string, attributes: Record<string, string>): number | null {
  const part = /^(?::(root)|\[([\w-]+)='([^']*)'\]|:not\(\[([\w-]+)\]\))/;
  let rest = selector === '@theme static' ? ':root' : selector;
  let count = 0;
  while (rest) {
    const m = part.exec(rest);
    if (!m) return null;
    if (m[2] !== undefined && attributes[m[2]] !== m[3]) return null;
    if (m[4] !== undefined && attributes[m[4]] !== undefined) return null;
    count += 1;
    rest = rest.slice(m[0].length);
  }
  return count;
}

/** The rules of both files in the order index.css imports them. */
const ALL_RULES = [...rulesOf(tokensCss), ...rulesOf(themesCss)];

/** The custom properties on <html> with these attributes: higher specificity wins, then the later rule. */
export function varsOn(attributes: Record<string, string>): Record<string, string> {
  const matched = ALL_RULES.flatMap((rule, order) => {
    const level = specificity(rule.selector, attributes);
    return level === null ? [] : [{ level, order, vars: rule.vars }];
  });
  matched.sort((a, b) => a.level - b.level || a.order - b.order);
  return Object.assign({}, ...matched.map((m) => m.vars)) as Record<string, string>;
}

/** `value` with every `var(--name)` replaced by that name's value in `vars`. */
export function resolve(value: string, vars: Record<string, string>): string {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const inner = vars[name];
    if (inner === undefined) throw new Error(`No ${name} for ${value}`);
    return resolve(inner, vars);
  });
}
