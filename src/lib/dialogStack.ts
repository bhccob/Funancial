import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/**
 * Open modal dialogs, innermost last. A modal makes the rest of the page inert, so anything that
 * must stay readable and clickable while one is open (toasts) renders inside the top one.
 */
const dialogStack = createStore<{ open: HTMLDialogElement[] }>()(() => ({ open: [] }));

export function pushDialog(el: HTMLDialogElement): void {
  dialogStack.setState((s) => ({ open: [...s.open.filter((d) => d !== el), el] }));
}

export function removeDialog(el: HTMLDialogElement): void {
  dialogStack.setState((s) => ({ open: s.open.filter((d) => d !== el) }));
}

export function useTopDialog(): HTMLDialogElement | null {
  return useStore(dialogStack, (s) => s.open.at(-1) ?? null);
}
