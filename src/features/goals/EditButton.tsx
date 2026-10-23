import { Pencil } from 'lucide-react';

/**
 * The round glass pencil beside a row's main pill (Add money, Pay card): the pill is what the row is
 * for, this is the quieter way to change the row itself. 44px, named "Edit <name>" for screen readers.
 */
export function EditButton({ name, onClick }: { name: string; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={`Edit ${name}`}
      onClick={onClick}
      className="glass press text-text grid size-11 shrink-0 place-items-center rounded-full"
    >
      <Pencil aria-hidden="true" className="size-[18px]" />
    </button>
  );
}
