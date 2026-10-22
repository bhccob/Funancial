import { useOutletContext } from 'react-router';
import type { AddKind } from './AddSheet';

/** What AppShell hands the screen inside it. */
export interface ShellContext {
  openAdd(kind: AddKind): void;
}

const nothing = () => {};

/**
 * Opens the Add expense or Add income sheet over the screen, from any screen inside AppShell. A
 * screen drawn on its own (as a test may draw one) has no shell and no sheet, and it does nothing.
 */
export function useAddSheet(): (kind: AddKind) => void {
  return useOutletContext<ShellContext | null>()?.openAdd ?? nothing;
}
