import { act, screen } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startApp } from './startApp';

let mounted: { root: Root; container: HTMLElement } | null = null;

async function run(start: (root: Root) => Promise<void>) {
  const container = document.body.appendChild(document.createElement('div'));
  const root = await act(() => startApp(container, start));
  mounted = { root, container };
}

afterEach(() => {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = null;
});

describe('startApp', () => {
  it('shows the crash screen with a way out when starting fails before anything renders', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await run(async () => {
      throw new Error('The storage plugin failed to load');
    });

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith('Starting Funcial failed', expect.any(Error));
    logged.mockRestore();
  });

  it('shows what the start renders when it works', async () => {
    await run(async (root) => root.render(<p>Ready</p>));

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull();
  });
});
