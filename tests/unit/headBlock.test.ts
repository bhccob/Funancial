import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** Every component file under `dir` (the tests are not screens). */
function components(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return components(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

it("is never given side margins, side padding or bottom padding by a screen's className: those are reach and compact", () => {
  // `cn` joins classes, it does not merge them: a class that restated one of the block's own margins
  // or paddings would win or lose by the order of the stylesheet, not by what the screen meant. So a
  // screen asks for them with `reach` and `compact`, and `className` only adds.
  const using = components('src').filter((file) =>
    readFileSync(file, 'utf8').includes('<HeadBlock'),
  );
  // Home, Cards, Profile, Shop, and the lock and welcome screens.
  expect(using.length).toBeGreaterThanOrEqual(6);

  const given: string[] = [];
  for (const file of using) {
    const source = readFileSync(file, 'utf8');
    for (const [, attributes] of source.matchAll(/<HeadBlock(?![A-Za-z])([^>]*)>/g)) {
      const className = /className="([^"]*)"/.exec(attributes!)?.[1] ?? '';
      for (const cls of className.split(/\s+/)) {
        if (/^-?(m[xlr]|p[xlr]|pb)-/.test(cls)) given.push(`${file}: ${cls}`);
      }
    }
  }
  expect(given).toEqual([]);
});

it('measures in a model that bites: the welcome screen once passed mx, px and pb classes, and one of them lost', () => {
  const was = '<HeadBlock compact className="mx-[calc(50%-50vw)] -mt-4 flex px-[22px] pb-12">';
  const [, attributes] = /<HeadBlock(?![A-Za-z])([^>]*)>/.exec(was)!;
  const className = /className="([^"]*)"/.exec(attributes!)![1]!;
  expect(className.split(/\s+/).filter((cls) => /^-?(m[xlr]|p[xlr]|pb)-/.test(cls))).toEqual([
    'mx-[calc(50%-50vw)]',
    'px-[22px]',
    'pb-12',
  ]);
});
