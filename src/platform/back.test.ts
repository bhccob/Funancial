import { act, render } from '@testing-library/react';
import { createElement, Fragment, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '@/components/ui/Dialog';
import { topDialog } from '@/lib/dialogStack';
import { handleBack } from './back';

function env() {
  return { topDialog, back: vi.fn(), minimize: vi.fn() };
}

const dialog = (title: string, onClose: () => void) =>
  createElement(Dialog, { key: title, open: true, title, onClose });

describe('handleBack', () => {
  it('closes the open dialog instead of leaving the screen', () => {
    const onClose = vi.fn();
    render(dialog('Delete this?', onClose));
    const e = env();

    expect(handleBack(true, e)).toBe('dialog');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(e.back).not.toHaveBeenCalled();
    expect(e.minimize).not.toHaveBeenCalled();
  });

  it('closes only the innermost dialog when one opens over another', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(createElement(Fragment, null, dialog('Outer', outer), dialog('Inner', inner)));

    expect(handleBack(false, env())).toBe('dialog');

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('closes the dialog first, and the next press leaves the screen', () => {
    function Screen() {
      const [open, setOpen] = useState(true);
      return createElement(Dialog, { open, title: 'Delete this?', onClose: () => setOpen(false) });
    }
    render(createElement(Screen));
    const e = env();

    act(() => void handleBack(true, e));
    expect(topDialog()).toBeNull();
    expect(e.back).not.toHaveBeenCalled();

    expect(handleBack(true, e)).toBe('back');
    expect(e.back).toHaveBeenCalledTimes(1);
  });

  it('goes back when there is history', () => {
    const e = env();

    expect(handleBack(true, e)).toBe('back');

    expect(e.back).toHaveBeenCalledTimes(1);
    expect(e.minimize).not.toHaveBeenCalled();
  });

  it('backgrounds the app on the first screen instead of closing it', () => {
    const e = env();

    expect(handleBack(false, e)).toBe('minimize');

    expect(e.minimize).toHaveBeenCalledTimes(1);
    expect(e.back).not.toHaveBeenCalled();
  });
});

describe('topDialog', () => {
  it('is the innermost open dialog, and null once none is open', () => {
    expect(topDialog()).toBeNull();
    const { unmount } = render(
      createElement(Fragment, null, dialog('Outer', vi.fn()), dialog('Inner', vi.fn())),
    );
    expect(topDialog()).toHaveAttribute('aria-labelledby');
    expect(topDialog()?.querySelector('h2')).toHaveTextContent('Inner');
    unmount();
    expect(topDialog()).toBeNull();
  });
});
