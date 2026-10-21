import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { FAQ, GLOSSARY, HELP_PAGES, LEGAL, RESULT_ROWS } from '@/content/help';
import { EXAMPLES, ex, type WorkedExample } from '@/domain/examples';
import { formatMoney } from '@/domain/money';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { ExampleTable } from './ExampleTable';
import { HelpPage } from './HelpPage';
import { HelpScreen } from './HelpScreen';

function renderHelp(path = '/help') {
  const router = createMemoryRouter(
    [
      { path: '/help', element: <HelpScreen /> },
      { path: '/help/:id', element: <HelpPage /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const GROUPS = [
  ['numbers', 'How your numbers work'],
  ['how', 'How it works'],
  ['more', 'More'],
] as const;

describe('Help index', () => {
  it('lists every page under its group, with a title and a summary', () => {
    renderHelp();
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    for (const [group, title] of GROUPS) {
      const region = screen.getByRole('region', { name: title });
      const pages = HELP_PAGES.filter((p) => p.group === group);
      const links = within(region).getAllByRole('link');
      expect(
        links.map((a) => a.getAttribute('href')),
        title,
      ).toEqual(pages.map((p) => `/help/${p.id}`));
      pages.forEach((p, i) => {
        expect(links[i]).toHaveTextContent(p.title);
        expect(links[i]).toHaveTextContent(p.summary);
      });
    }
  });

  it('filters by title and by summary, ignoring case, and hides empty groups', async () => {
    renderHelp();
    const search = screen.getByRole('searchbox', { name: 'Search help' });

    await userEvent.type(search, 'WARNINGS');
    expect(screen.getByRole('link', { name: /^Limits and warnings/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Words/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'More' })).not.toBeInTheDocument();

    await userEvent.clear(search);
    // "reinvested" is in the summary of Dividends, and in no title.
    await userEvent.type(search, 'reinvested');
    expect(screen.getByRole('link', { name: /^Dividends/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Available to spend/ })).not.toBeInTheDocument();
  });

  it('matches every word, each in the title or the summary', async () => {
    renderHelp();
    const search = screen.getByRole('searchbox', { name: 'Search help' });
    const hrefs = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href'));

    await userEvent.type(search, 'net worth');
    expect(hrefs()).toEqual(['/help/net-worth']);

    await userEvent.clear(search);
    await userEvent.type(search, 'glossary');
    expect(hrefs()).toEqual(['/help/glossary']);

    await userEvent.clear(search);
    await userEvent.type(search, 'salary dividends');
    expect(hrefs()).toEqual([]);
  });

  it('suggests only words that find a page', async () => {
    renderHelp();
    const search = screen.getByRole('searchbox', { name: 'Search help' });
    const words = search
      .getAttribute('placeholder')!
      .replace(/^e.g. /, '')
      .split(', ');
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      await userEvent.clear(search);
      await userEvent.type(search, word);
      expect(screen.queryAllByRole('link').length, word).toBeGreaterThan(0);
    }
  });

  it('finds no page about a salary freeze', async () => {
    renderHelp();
    const search = screen.getByRole('searchbox', { name: 'Search help' });
    await userEvent.type(search, 'freeze');
    expect(screen.getByRole('status')).toHaveTextContent('No help page matches “freeze”.');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('says so when nothing matches, and comes back when the search is cleared', async () => {
    renderHelp();
    const search = screen.getByRole('searchbox', { name: 'Search help' });
    await userEvent.type(search, 'zzzz');
    expect(screen.getByRole('status')).toHaveTextContent('No help page matches “zzzz”.');
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    await userEvent.clear(search);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getAllByRole('link')).toHaveLength(HELP_PAGES.length);
  });

  it('opens a page from its row', async () => {
    renderHelp();
    await userEvent.click(screen.getByRole('link', { name: /^Available to spend/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Available to spend' })).toBeVisible();
  });
});

describe('a help page', () => {
  it.each(HELP_PAGES.map((p) => [p.id, p] as const))('shows %s in full', (id, page) => {
    renderHelp(`/help/${id}`);
    expect(screen.getByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();
    expect(screen.getByText(page.summary)).toBeInTheDocument();
    for (const paragraph of page.body) expect(screen.getByText(paragraph)).toBeInTheDocument();
    for (const exampleId of page.exampleIds ?? []) {
      const example = EXAMPLES.find((e) => e.id === exampleId)!;
      expect(screen.getByRole('heading', { level: 2, name: example.title })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Back to Help' })).toHaveAttribute('href', '/help');
  });

  it('sends an unknown page back to the index', () => {
    const router = renderHelp('/help/nope');
    expect(router.state.location.pathname).toBe('/help');
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
  });

  it('shows the cards page with both of its examples, simplest first', () => {
    renderHelp('/help/cards');
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(
      ['EXP-1', 'BAL-1'].map((id) => EXAMPLES.find((e) => e.id === id)!.title),
    );
  });

  it('ends the pages about numbers and rules with the not-financial-advice note', () => {
    renderHelp('/help/available');
    expect(screen.getByText(LEGAL.disclaimers[0]!.text)).toBeInTheDocument();
  });

  it('adds the market and headline disclaimers to the Investments page', () => {
    renderHelp('/help/investments');
    for (const { text } of LEGAL.disclaimers) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('keeps the other pages to the one note', () => {
    renderHelp('/help/dividends');
    expect(screen.getByText(LEGAL.disclaimers[0]!.text)).toBeInTheDocument();
    expect(screen.queryByText(LEGAL.disclaimers[1]!.text)).not.toBeInTheDocument();
    expect(screen.queryByText(LEGAL.disclaimers[2]!.text)).not.toBeInTheDocument();
  });

  it('links Net worth to the page with the worked example', () => {
    renderHelp('/help/net-worth');
    expect(screen.getByRole('link', { name: 'Cards and balances' })).toHaveAttribute(
      'href',
      '/help/cards',
    );
  });

  it('leaves the note off the pages about the app itself', () => {
    renderHelp('/help/glossary');
    expect(screen.queryByText(LEGAL.disclaimers[0]!.text)).not.toBeInTheDocument();
  });

  it('has no Should I buy it? page: its old address goes back to the index', () => {
    const router = renderHelp('/help/buy-it');
    expect(router.state.location.pathname).toBe('/help');
    expect(screen.queryByRole('list', { name: 'Meter zones' })).not.toBeInTheDocument();
  });

  it('lists every word of the glossary', () => {
    renderHelp('/help/glossary');
    for (const { term, meaning } of GLOSSARY) {
      expect(screen.getByText(term)).toBeInTheDocument();
      expect(screen.getByText(meaning)).toBeInTheDocument();
    }
  });

  it('lists every question of the FAQ with its answer', () => {
    renderHelp('/help/faq');
    for (const { q, a } of FAQ) {
      expect(screen.getByText(q)).toBeInTheDocument();
      expect(screen.getByText(a)).toBeInTheDocument();
    }
  });

  it('puts the three disclaimers on the terms page', () => {
    renderHelp('/help/terms');
    for (const { title, text } of LEGAL.disclaimers) {
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});

describe('ExampleTable', () => {
  /** What a row should read; limit levels are in words and have their own test below. */
  const expected = (key: string, value: number) => {
    const { kind } = RESULT_ROWS[key]!;
    if (kind === 'money') return formatMoney(value, 'USD');
    if (kind === 'percent') return `${value}%`;
    return kind === 'level' ? null : String(value);
  };

  it.each(EXAMPLES.map((ex) => [ex.id, ex] as const))(
    'shows every step and every result of %s',
    (_id, example) => {
      render(<ExampleTable example={example} />);
      expect(screen.getByRole('heading', { level: 2, name: example.title })).toBeInTheDocument();

      const steps = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
      expect(steps.map((s) => s.textContent)).toEqual(example.steps);

      const rows = screen.getByRole('group', { name: 'Result' });
      for (const [key, value] of Object.entries(example.result)) {
        const row = within(rows).getByText(RESULT_ROWS[key]!.label).parentElement!;
        const text = expected(key, value);
        if (text !== null) expect(row, key).toHaveTextContent(text);
      }
    },
  );

  it('formats each kind of value as the app does', () => {
    const avl = EXAMPLES.find((e) => e.id === 'AVL-1')!;
    render(<ExampleTable example={avl} />);
    const row = (label: string) => screen.getByText(label).parentElement!;
    expect(row(RESULT_ROWS.available!.label)).toHaveTextContent('$1,054.01');
    expect(row(RESULT_ROWS.foodPct!.label)).toHaveTextContent('83%');
  });

  it('shows money in the currency of the example, not a fixed one', () => {
    const euro: WorkedExample = {
      id: 'EUR-1',
      rule: 'Currency',
      title: 'An example in euros',
      today: '2026-10-14',
      data: ex.snapshot({ profile: [ex.profile({ openingDate: '2026-10-01', currency: 'EUR' })] }),
      steps: ['Step'],
      result: { available: 1_054_01 },
    };
    render(<ExampleTable example={euro} />);
    const result = screen.getByRole('group', { name: 'Result' });
    expect(result).toHaveTextContent(formatMoney(1_054_01, 'EUR'));
    expect(result).not.toHaveTextContent('$');
  });

  it("keeps its numbers while amounts are hidden: they are an illustration, not the person's money", () => {
    useAmountsHidden.setState({ hidden: true });
    try {
      const avl = EXAMPLES.find((e) => e.id === 'AVL-1')!;
      render(<ExampleTable example={avl} />);
      const row = (label: string) => screen.getByText(label).parentElement!;
      expect(row(RESULT_ROWS.available!.label)).toHaveTextContent('$1,054.01');
      expect(screen.queryByText('••••')).not.toBeInTheDocument();
    } finally {
      useAmountsHidden.setState({ hidden: false });
    }
  });

  it('puts the limit levels in words', () => {
    const lim = EXAMPLES.find((e) => e.id === 'LIM-1')!;
    render(<ExampleTable example={lim} />);
    const row = (label: string) => screen.getByText(label).parentElement!;
    expect(row(RESULT_ROWS.levelRank!.label)).toHaveTextContent('Warning');
    expect(row(RESULT_ROWS.levelRankAfterLunch!.label)).toHaveTextContent('Over the limit');
  });
});
