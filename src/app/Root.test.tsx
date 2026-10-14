import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Root } from './Root';

it('renders the app name', () => {
  render(<Root />);
  expect(screen.getByRole('heading', { name: 'Funancial' })).toBeInTheDocument();
});
