import type { Entry } from '@/domain/history';

/** What the person is asked before an entry is deleted, and what deleting it does. */
export interface Removal {
  title: string;
  /** Said in place of the usual "removed from your history", when deleting does more. */
  description?: string;
  remove(): Promise<unknown>;
}

/** The actions that delete the entries History lists, bar an expense, which is deleted from its edit form. */
export interface RemovalActions {
  deleteIncome(id: string): Promise<unknown>;
  deleteTransaction(id: string): Promise<unknown>;
  deleteDividend(id: string): Promise<unknown>;
  undoSale(id: string): Promise<unknown>;
}

/** What deleting `entry` asks and does: a sale is undone, its shares going back to the holding. */
export function removalOf(
  entry: Exclude<Entry, { kind: 'expense' }>,
  title: string,
  actions: RemovalActions,
): Removal {
  switch (entry.kind) {
    case 'income':
      return { title, remove: () => actions.deleteIncome(entry.item.id) };
    case 'dividend':
      return { title, remove: () => actions.deleteDividend(entry.item.id) };
    case 'sale':
      return {
        title,
        description: `${title} will be removed from your history, and its shares go back to your ${entry.item.symbol} holding.`,
        remove: () => actions.undoSale(entry.item.id),
      };
    case 'transaction':
      return { title, remove: () => actions.deleteTransaction(entry.item.id) };
  }
}
