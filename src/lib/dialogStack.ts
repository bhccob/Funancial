import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Open dialogs, innermost last: the modal ones, and any shown without showModal() (modeless) that is
 * put here by hand so the back gesture closes it all the same. A modal makes the rest of the page
 * inert, so anything that must stay readable and clickable while one is open (toasts) renders
 * inside the innermost modal one.
 */
const dialogStack = createStore<{ open: { el: HTMLDialogElement; modal: boolean }[] }>()(() => ({
  open: [],
}));

export function pushDialog(el: HTMLDialogElement, { modal = true } = {}): void {
  dialogStack.setState((s) => ({ open: [...s.open.filter((d) => d.el !== el), { el, modal }] }));
}

export function removeDialog(el: HTMLDialogElement): void {
  dialogStack.setState((s) => ({ open: s.open.filter((d) => d.el !== el) }));
}

/** The innermost open modal dialog: while there is one, only what is inside it can be used. */
export function useTopModalDialog(): HTMLDialogElement | null {
  return useStore(dialogStack, (s) => s.open.findLast((d) => d.modal)?.el ?? null);
}

/** The innermost open dialog right now, for code outside React (the Android back gesture). */
export function topDialog(): HTMLDialogElement | null {
  return dialogStack.getState().open.at(-1)?.el ?? null;
}
