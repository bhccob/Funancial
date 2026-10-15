import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';
import { AppStoreProvider } from '@/store/AppStoreProvider';
import { createStubStore } from '@/test/appStoreStub';
import { appRouteObjects } from './router';

function Broken(): never {
  throw new Error('render failed');
}

it('shows the friendly crash screen when a screen throws', () => {
  const [root] = appRouteObjects;
  if (!root) throw new Error('no root route');
  const router = createMemoryRouter([
    {
      element: root.element,
      errorElement: root.errorElement,
      children: [{ path: '/', element: <Broken /> }],
    },
  ]);
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <AppStoreProvider store={createStubStore()}>
      <RouterProvider router={router} />
    </AppStoreProvider>,
  );
  quiet.mockRestore();
  expect(
    screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
});
