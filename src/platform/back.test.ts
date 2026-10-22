import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, Fragment, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { Sheet } from '@/components/ui/Sheet';
import { pushDialog, removeDialog, topDialog } from '@/lib/dialogStack';
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

  it('closes a dialog shown without showModal(), put on the stack by hand, the same way', () => {
    const el = document.createElement('dialog');
    const cancelled = vi.fn();
    el.addEventListener('cancel', cancelled);
    pushDialog(el, { modal: false });
    const e = env();

    expect(topDialog()).toBe(el);
    expect(handleBack(true, e)).toBe('dialog');

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(e.back).not.toHaveBeenCalled();
    removeDialog(el);
  });

  it('closes only the inner dialog when it sits inside another (a question over a sheet)', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const page = (asking: boolean) =>
      createElement(
        Sheet,
        { open: true, title: 'Add expense', onClose: outer },
        createElement(Dialog, { open: asking, title: 'Over your limit?', onClose: inner }),
      );
    // The sheet first, then the question over it, as Save asks it.
    const { rerender } = render(page(false));
    rerender(page(true));
    expect(topDialog()?.querySelector('h2')).toHaveTextContent('Over your limit?');

    expect(handleBack(true, env())).toBe('dialog');

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

describe('handleBack with a menu open', () => {
  const menu = (onSelect = vi.fn()) =>
    createElement(Menu, { label: 'More', items: [{ label: 'Move money', onSelect }] });

  it('closes the menu, back on its button, before leaving the screen', async () => {
    const onSelect = vi.fn();
    render(menu(onSelect));
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu', { name: 'More' })).toBeInTheDocument();
    const e = env();

    let result: string | undefined;
    act(() => void (result = handleBack(true, e)));
    expect(result).toBe('dialog');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    expect(e.back).not.toHaveBeenCalled();
    expect(e.minimize).not.toHaveBeenCalled();

    // The menu is off the stack once it is closed, however it closed.
    expect(topDialog()).toBeNull();
    expect(handleBack(false, e)).toBe('minimize');
  });

  it('leaves the stack when the menu closes by a pick', async () => {
    render(menu());
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(topDialog()).not.toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move money' }));
    expect(topDialog()).toBeNull();
  });

  it('closes a menu open in a dialog before the dialog', async () => {
    const onClose = vi.fn();
    render(createElement(Dialog, { open: true, title: 'Bills', onClose }, menu()));
    await userEvent.click(screen.getByRole('button', { name: 'More' }));

    act(() => void handleBack(true, env()));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(topDialog()?.querySelector('h2')).toHaveTextContent('Bills');
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
