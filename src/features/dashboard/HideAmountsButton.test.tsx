import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { HideAmountsButton } from './HideAmountsButton';

afterEach(() => {
  localStorage.clear();
  useAmountsHidden.setState({ hidden: false });
});

it('is a 44px button named for what it does, with an open eye while amounts are shown', () => {
  render(<HideAmountsButton />);
  const button = screen.getByRole('button', { name: 'Hide amounts' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveClass('size-11');
  expect(button.querySelector('svg.lucide-eye')).toBeInTheDocument();
});

it('follows the state: pressed, named Show amounts, a crossed-out eye on a dark circle', async () => {
  render(<HideAmountsButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
  const button = screen.getByRole('button', { name: 'Show amounts' });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(button.querySelector('svg.lucide-eye-off')).toBeInTheDocument();
  expect(button.querySelector('.bg-primary')).toBeInTheDocument();

  await userEvent.click(button);
  expect(screen.getByRole('button', { name: 'Hide amounts' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

it('is still pressed when the button is mounted again', async () => {
  const { unmount } = render(<HideAmountsButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
  unmount();
  render(<HideAmountsButton />);
  expect(screen.getByRole('button', { name: 'Show amounts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
