import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { useAmountsHidden } from '@/store/useAmountsHidden';
import { HideAmountsButton } from './HideAmountsButton';

afterEach(() => {
  localStorage.clear();
  useAmountsHidden.setState({ hidden: false });
});

it('is a 44px button named Hide amounts, not pressed, with an open eye while amounts are shown', () => {
  render(<HideAmountsButton />);
  const button = screen.getByRole('button', { name: 'Hide amounts' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveClass('size-11');
  expect(button.querySelector('svg.lucide-eye')).toBeInTheDocument();
});

it('keeps its name and turns pressed while hidden: a crossed-out eye on a dark circle', async () => {
  render(<HideAmountsButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Hide amounts' }));
  const button = screen.getByRole('button', { name: 'Hide amounts' });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: 'Show amounts' })).not.toBeInTheDocument();
  expect(button.querySelector('svg.lucide-eye-off')).toBeInTheDocument();
  expect(button.querySelector('.bg-primary')).toBeInTheDocument();

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
