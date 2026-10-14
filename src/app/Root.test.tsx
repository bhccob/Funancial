import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Root } from './Root';

it('renders the Home screen at the root path', async () => {
  render(<Root />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument();
});
