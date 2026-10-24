import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextButton } from './TextButton';

describe('TextButton', () => {
  it('is a quiet underlined word, 44px tall to tap, with no pill or fill of its own', () => {
    render(<TextButton>Try with demo money</TextButton>);
    const button = screen.getByRole('button', { name: 'Try with demo money' });
    expect(button).toHaveClass('min-h-11', 'font-bold', 'underline', 'underline-offset-4');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveClass('glass', 'glass-head', 'bg-primary', 'rounded-full', 'border');
  });

  it('is written in the accent for the page, the ink for the top block and danger for a risk', () => {
    render(
      <>
        <TextButton>Page</TextButton>
        <TextButton tone="ink">Block</TextButton>
        <TextButton tone="danger">Risk</TextButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Page' })).toHaveClass('text-accent-text');
    // On the top block `text-text` is the block's ink: the accent can be as dark as the block.
    expect(screen.getByRole('button', { name: 'Block' })).toHaveClass('text-text');
    expect(screen.getByRole('button', { name: 'Block' })).not.toHaveClass('text-accent-text');
    expect(screen.getByRole('button', { name: 'Risk' })).toHaveClass('text-danger');
  });

  it('clicks, and does nothing while disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<TextButton onClick={onClick}>Skip</TextButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <TextButton onClick={onClick} disabled>
        Skip
      </TextButton>,
    );
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
