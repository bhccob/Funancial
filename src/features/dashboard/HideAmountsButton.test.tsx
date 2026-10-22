import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { HideAmountsButton } from './HideAmountsButton';

afterEach(() => {
  localStorage.clear();
  useAmountsHidden.setState({ hidden: false });
});

it('is a 44px button named Hide amounts, not pressed, with a plain open eye while amounts are shown', () => {
  render(<HideAmountsButton />);
  const button = screen.getByRole('button', { name: 'Hide amounts' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveClass('size-11');
  expect(button.querySelector('svg.lucide-eye')).toBeInTheDocument();
  // The eye alone, in the colour of the words beside it: no circle round it.
  expect(button.querySelector('span')).toBeNull();
  expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');
});

it('keeps its name and turns pressed while hidden: a crossed-out eye', async () => {
  render(<HideAmountsButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
  const button = screen.getByRole('button', { name: 'Hide amounts' });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Show amounts' })).not.toBeInTheDocument();
  expect(button.querySelector('svg.lucide-eye-off')).toBeInTheDocument();

  await userEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button.querySelector('svg.lucide-eye')).toBeInTheDocument();
});

it('is still pressed when the button is mounted again', async () => {
  const { unmount } = render(<HideAmountsButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
  unmount();
  render(<HideAmountsButton />);
  expect(screen.getByRole('button', { name: 'Hide amounts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
