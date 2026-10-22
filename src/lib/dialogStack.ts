import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** A modal dialog, or anything shown over the page without showModal() (a modeless one, a menu). */
type Open = { el: HTMLDialogElement; modal: true } | { el: HTMLElement; modal: false };

/**
 * Open dialogs, innermost last: the modal ones, and anything shown without showModal() (a modeless
 * dialog, an open menu) that is put here by hand so the back gesture closes it all the same, by a
 * `cancel` event it listens for. A modal makes the rest of the page inert, so anything that must
 * stay readable and clickable while one is open (toasts) renders inside the innermost modal one.
 */
const dialogStack = createStore<{ open: Open[] }>()(() => ({
  open: [],
}));

/** A modal is always a `<dialog>`; what is put here by hand as modeless may be any element. */
export function pushDialog(el: HTMLDialogElement): void;
export function pushDialog(el: HTMLElement, options: { modal: false }): void;
export function pushDialog(el: HTMLElement, { modal = true } = {}): void {
  const entry = { el, modal } as Open;
  dialogStack.setState((s) => ({ open: [...s.open.filter((d) => d.el !== el), entry] }));
}

export function removeDialog(el: HTMLElement): void {
  dialogStack.setState((s) => ({ open: s.open.filter((d) => d.el !== el) }));
}

/** The innermost open modal dialog: while there is one, only what is inside it can be used. */
export function useTopModalDialog(): HTMLDialogElement | null {
  return useStore(
    dialogStack,
    (s) => s.open.findLast((d): d is Extract<Open, { modal: true }> => d.modal)?.el ?? null,
  );
}

/** The innermost open dialog or menu right now, for code outside React (the Android back gesture). */
export function topDialog(): HTMLElement | null {
  return dialogStack.getState().open.at(-1)?.el ?? null;
}
