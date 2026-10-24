import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { PasswordOwner } from '@/domain/passwordRules';
import { PasswordField } from './parts';

function Field({
  strength,
  initial = '',
}: {
  strength?: boolean | PasswordOwner;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PasswordField
      label="New password"
      strength={strength}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}

/** The three marks of the bar, filled or not. */
const marks = () =>
  [...document.querySelectorAll<HTMLElement>('[data-strength-mark]')].map(
    (mark) => mark.dataset.strengthMark,
  );

describe('PasswordField strength', () => {
  it('has no bar unless it is asked for', () => {
    render(<Field initial="Tr0ub4dor&3xyz" />);
    expect(document.querySelector('[data-strength]')).toBeNull();
    expect(screen.queryByText(/^(Weak|Okay|Strong)$/)).toBeNull();
  });

  it('shows an empty bar and no word while nothing is typed', () => {
    render(<Field strength />);
    expect(marks()).toEqual(['off', 'off', 'off']);
    expect(screen.queryByText(/^(Weak|Okay|Strong)$/)).toBeNull();
  });

  it.each([
    ['short', 'Weak', ['on', 'off', 'off']],
    ['Password123', 'Weak', ['on', 'off', 'off']],
    ['abcdefghijk', 'Okay', ['on', 'on', 'off']],
    ['Tr0ub4dor&3xyz', 'Strong', ['on', 'on', 'on']],
  ])('shows %s as %s', async (typed, word, expected) => {
    render(<Field strength />);
    await userEvent.type(screen.getByLabelText('New password'), typed);
    expect(screen.getByText(word)).toBeInTheDocument();
    expect(marks()).toEqual(expected);
  });

  it('follows the password as it changes', async () => {
    render(<Field strength />);
    const input = screen.getByLabelText('New password');
    await userEvent.type(input, 'abcdefghijk');
    expect(screen.getByText('Okay')).toBeInTheDocument();
    await userEvent.type(input, 'l');
    expect(screen.getByText('Okay')).toBeInTheDocument();
    await userEvent.clear(input);
    expect(screen.queryByText('Okay')).toBeNull();
    expect(marks()).toEqual(['off', 'off', 'off']);
  });

  it('says the word politely with what it is the strength of, and leaves the marks out of the reading', async () => {
    render(<Field strength />);
    expect(document.querySelector('[aria-live]')).toBeEmptyDOMElement();
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    // The visible word is its own element; the region reads it whole, with the words before it.
    const word = screen.getByText('Weak');
    const region = word.closest('[aria-live]');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toHaveTextContent('Password strength: Weak');
    expect(screen.getByText('Password strength:')).toHaveClass('sr-only');
    expect(word).not.toHaveClass('sr-only');
    expect(
      document.querySelector('[data-strength-mark]')?.closest('[aria-hidden="true"]'),
    ).not.toBe(null);
  });

  it('draws the marks in the status colours and the empty ones in the track, and the word in the muted ink', async () => {
    render(<Field strength />);
    const input = screen.getByLabelText('New password');
    const colours = () =>
      [...document.querySelectorAll<HTMLElement>('[data-strength-mark]')].map(
        (mark) => mark.className.match(/\bbg-(danger|warning|success|track)\b/)?.[1],
      );
    await userEvent.type(input, 'short');
    expect(colours()).toEqual(['danger', 'track', 'track']);
    await userEvent.clear(input);
    await userEvent.type(input, 'abcdefghijk');
    expect(colours()).toEqual(['warning', 'warning', 'track']);
    await userEvent.clear(input);
    await userEvent.type(input, 'Tr0ub4dor&3xyz');
    expect(colours()).toEqual(['success', 'success', 'success']);
    expect(screen.getByText('Strong')).toHaveClass('text-muted');
  });

  it.each([
    ['the username', { username: 'robin.smith1' }, 'robin.smith1'],
    [
      'the username, in another case and with spaces',
      { username: ' Robin.Smith1 ' },
      'robin.smith1',
    ],
    ['the name part of the email', { email: 'robin.smith1@example.com' }, 'Robin.Smith1'],
    ['the whole email', { email: 'robin.smith1@example.com' }, 'robin.smith1@example.com'],
  ])('shows a password that is %s as Weak, as submitting it is refused', async (_, who, typed) => {
    render(<Field strength={who} />);
    await userEvent.type(screen.getByLabelText('New password'), typed);
    expect(screen.getByText('Weak')).toBeInTheDocument();
    expect(marks()).toEqual(['on', 'off', 'off']);
  });

  it('shows the same password as it is without names when it is not one of them', async () => {
    render(<Field strength={{ username: 'someone.else', email: 'x@example.com' }} />);
    await userEvent.type(screen.getByLabelText('New password'), 'Tr0ub4dor&3xyz');
    expect(screen.getByText('Strong')).toBeInTheDocument();
    expect(marks()).toEqual(['on', 'on', 'on']);
  });

  it('keeps the Show toggle, and works in the row variant too', async () => {
    render(
      <PasswordField variant="row" label="New password" strength value="abcdefghijk" readOnly />,
    );
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByText('Okay')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
  });
});
