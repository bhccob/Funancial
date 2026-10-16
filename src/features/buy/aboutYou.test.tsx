import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/domain/money';
import type { AboutYou } from '@/domain/entities';
import { CATEGORY_OPTIONS } from '@/features/shared/categories';
import { formatDay } from '@/lib/format';
import { renderWithStore } from '@/test/appStoreStub';
import { makeAboutYou, makeGoal, makeProfile } from '@/test/fixtures';
import { freshRealStore } from '@/test/realStore';
import { AboutYouScreen } from './AboutYouScreen';

const MATTERS = 'What matters to you';
const SITUATION = 'Your situation (optional)';
const GOAL = 'A goal to protect';
const TOO_LONG = 'Keep it to 500 characters or fewer';
const NOTE =
  'Asking about something in a category you overspend on lowers the meter a little and reminds you. Your goal to protect always shows first, and delaying it more than a week lowers the meter too. What matters to you is shown back on every answer.';

const bike = makeGoal({ id: 'bike', name: 'Bike', target: 1_200_00, deadline: '2027-05-01' });
const fund = makeGoal({ id: 'fund', name: 'Emergency fund', target: 5_000_00, deadline: null });

/** A real store (USD), optionally with goals and a saved About-you record. */
async function renderAbout(opts: { about?: AboutYou; goals?: ReturnType<typeof makeGoal>[] } = {}) {
  const { store } = await freshRealStore();
  await store.getState().put('profile', makeProfile({ currency: 'USD' }));
  for (const g of opts.goals ?? []) await store.getState().put('goal', g);
  if (opts.about) await store.getState().put('aboutYou', opts.about);
  renderWithStore(<AboutYouScreen />, store);
  return { store, saved: () => store.getState().data.tables.aboutYou[0] };
}

async function pasteInto(label: string, text: string) {
  await userEvent.clear(screen.getByLabelText(label));
  await userEvent.paste(text);
}

const chip = (name: string) => screen.getByRole('button', { name });

describe('About you', () => {
  it('shows the heading, intro, four fields and the note, and saves nothing until a change', async () => {
    const { saved } = await renderAbout({ goals: [bike] });
    expect(screen.getByRole('heading', { level: 1, name: 'About you' })).toBeInTheDocument();
    expect(
      screen.getByText('The app uses this every time you ask. It stays on your phone.'),
    ).toBeInTheDocument();
    for (const label of [MATTERS, SITUATION]) {
      expect(screen.getByLabelText(label)).toHaveClass('border-b', 'font-extrabold');
    }
    expect(screen.getByLabelText(GOAL)).toHaveClass('border-b');
    expect(screen.getByRole('group', { name: 'Where you tend to overspend' })).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();

    // Looking and leaving a field alone makes no record.
    await userEvent.click(screen.getByLabelText(MATTERS));
    await userEvent.tab();
    expect(saved()).toBeUndefined();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('starts from what was saved', async () => {
    await renderAbout({
      goals: [bike],
      about: makeAboutYou({
        matters: 'A house deposit',
        situation: 'Rent a flat',
        overspend: ['entertainment'],
        protectGoalId: 'bike',
      }),
    });
    expect(screen.getByLabelText(MATTERS)).toHaveValue('A house deposit');
    expect(screen.getByLabelText(SITUATION)).toHaveValue('Rent a flat');
    expect(chip('Fun')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Shopping')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText(GOAL)).toHaveValue('bike');
  });

  it('saves what matters when the field is left, trimmed, and says Saved', async () => {
    const { saved } = await renderAbout();
    await pasteInto(MATTERS, '  A house deposit by 2028 ');
    expect(saved()).toBeUndefined(); // not on every key
    await userEvent.tab();
    await waitFor(() => expect(saved()?.matters).toBe('A house deposit by 2028'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('saves the situation when the field is left, and clearing it saves too', async () => {
    const { saved } = await renderAbout({ about: makeAboutYou({ situation: 'Rent a flat' }) });
    await userEvent.clear(screen.getByLabelText(SITUATION));
    await userEvent.tab();
    await waitFor(() => expect(saved()?.situation).toBe(''));

    await pasteInto(SITUATION, 'Work in Amsterdam');
    await userEvent.tab();
    await waitFor(() => expect(saved()?.situation).toBe('Work in Amsterdam'));
    expect(saved()?.matters).toBe(''); // one field at a time
  });

  it('hides Saved again when the person starts typing', async () => {
    await renderAbout();
    await pasteInto(MATTERS, 'A house');
    await userEvent.tab();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(MATTERS), '!');
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  describe('the overspend chips', () => {
    it('are a 44px toggle for every category, all off to begin with', async () => {
      await renderAbout();
      const group = screen.getByRole('group', { name: 'Where you tend to overspend' });
      const chips = within(group).getAllByRole('button');
      expect(chips.map((c) => c.textContent)).toEqual(CATEGORY_OPTIONS.map((o) => o.label));
      for (const c of chips) {
        expect(c).toHaveAttribute('aria-pressed', 'false');
        expect(c).toHaveClass('min-h-11');
      }
    });

    it('toggle on and off, saving each time', async () => {
      const { saved } = await renderAbout();
      await userEvent.click(chip('Fun'));
      expect(chip('Fun')).toHaveAttribute('aria-pressed', 'true');
      await waitFor(() => expect(saved()?.overspend).toEqual(['entertainment']));
      expect(screen.getByRole('status')).toHaveTextContent('Saved');

      await userEvent.click(chip('Fun'));
      expect(chip('Fun')).toHaveAttribute('aria-pressed', 'false');
      await waitFor(() => expect(saved()?.overspend).toEqual([]));
    });

    it('keep each category once, however fast they are tapped', async () => {
      const { saved } = await renderAbout();
      await userEvent.click(chip('Fun'));
      await userEvent.click(chip('Shopping'));
      await userEvent.click(chip('Fun'));
      await userEvent.click(chip('Fun'));
      await waitFor(() => expect(saved()?.overspend).toEqual(['shopping', 'entertainment']));
      expect(new Set(saved()!.overspend).size).toBe(saved()!.overspend.length);
    });

    it('leave the text in the other fields alone', async () => {
      const { saved } = await renderAbout({ about: makeAboutYou({ matters: 'Kept' }) });
      await userEvent.click(chip('Shopping'));
      await waitFor(() => expect(saved()?.overspend).toEqual(['shopping']));
      expect(saved()?.matters).toBe('Kept');
    });
  });

  describe('the goal to protect', () => {
    it('lists the goals, then None', async () => {
      await renderAbout({ goals: [bike, fund] });
      const select = screen.getByLabelText(GOAL);
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual([
        'None',
        `Bike · ${formatMoney(1_200_00, 'USD')} by ${formatDay('2027-05-01')}`,
        `Emergency fund · ${formatMoney(5_000_00, 'USD')}`,
      ]);
      expect(select).toHaveValue('');
    });

    it('saves the pick, and None clears it', async () => {
      const { saved } = await renderAbout({ goals: [bike, fund] });
      await userEvent.selectOptions(screen.getByLabelText(GOAL), 'bike');
      await waitFor(() => expect(saved()?.protectGoalId).toBe('bike'));
      expect(screen.getByLabelText(GOAL)).toHaveValue('bike');
      expect(screen.getByRole('status')).toHaveTextContent('Saved');

      await userEvent.selectOptions(screen.getByLabelText(GOAL), 'None');
      await waitFor(() => expect(saved()?.protectGoalId).toBeNull());
      expect(screen.getByLabelText(GOAL)).toHaveValue('');
    });

    it('shows None for a goal that was deleted, and the next save clears it', async () => {
      const { saved } = await renderAbout({
        goals: [fund],
        about: makeAboutYou({ protectGoalId: 'gone' }),
      });
      expect(screen.getByLabelText(GOAL)).toHaveValue('');
      expect(saved()?.protectGoalId).toBe('gone'); // looking changes nothing

      await userEvent.click(chip('Fun'));
      await waitFor(() => expect(saved()?.overspend).toEqual(['entertainment']));
      expect(saved()?.protectGoalId).toBeNull();
    });

    it('still saves a pick when the stored goal was deleted', async () => {
      const { saved } = await renderAbout({
        goals: [fund],
        about: makeAboutYou({ protectGoalId: 'gone' }),
      });
      await userEvent.selectOptions(screen.getByLabelText(GOAL), 'fund');
      await waitFor(() => expect(saved()?.protectGoalId).toBe('fund'));
    });

    it('offers just None when there are no goals', async () => {
      await renderAbout();
      expect(
        within(screen.getByLabelText(GOAL))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['None']);
    });
  });

  describe('the 500 character limits', () => {
    it.each([
      [MATTERS, 'matters'],
      [SITUATION, 'situation'],
    ] as const)('stop %s at 500 with a message, and save nothing', async (label, key) => {
      const { saved } = await renderAbout({ about: makeAboutYou({ [key]: 'Before' }) });
      await pasteInto(label, 'x'.repeat(501));
      await userEvent.tab();
      const field = screen.getByLabelText(label);
      expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveValue('x'.repeat(501)); // what was typed is kept
      expect(saved()?.[key]).toBe('Before');
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    });

    it('take exactly 500', async () => {
      const { saved } = await renderAbout();
      await pasteInto(MATTERS, 'x'.repeat(500));
      await userEvent.tab();
      await waitFor(() => expect(saved()?.matters).toHaveLength(500));
      expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
    });

    it('clear the message once the text is shortened and saved', async () => {
      const { saved } = await renderAbout();
      await pasteInto(MATTERS, 'x'.repeat(501));
      await userEvent.tab();
      expect(await screen.findByText(TOO_LONG)).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText(MATTERS), '{Backspace}');
      expect(screen.queryByText(TOO_LONG)).not.toBeInTheDocument();
      await userEvent.tab();
      await waitFor(() => expect(saved()?.matters).toHaveLength(500));
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });

    it('do not hold back a chip or a goal', async () => {
      const { saved } = await renderAbout({ goals: [bike] });
      await pasteInto(MATTERS, 'x'.repeat(501));
      await userEvent.tab();
      await userEvent.click(chip('Fun'));
      await waitFor(() => expect(saved()?.overspend).toEqual(['entertainment']));
      expect(saved()?.matters).toBe('');
    });
  });
});
