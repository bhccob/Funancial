import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { Rise } from '@/components/ui/Rise';
import { NetWorthSheet } from '@/features/dashboard/NetWorthSheet';
import { ROWS } from '@/features/shared/PlainSection';
import { useFinanceView } from '@/store/useFinance';
import { useInboxItems } from '@/store/useInbox';
import { MENU_GROUPS, type MenuGroup, type MenuItem, type MenuSheet } from './menu';

export interface MenuGroupsProps {
  /** Brings each group in as a `Rise`, the first at this index and each next one a beat later. */
  riseFrom: number;
}

function NetWorthMenuSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const view = useFinanceView();
  return <NetWorthSheet open={open} view={view} onClose={onClose} />;
}

/**
 * The sheet a menu row opens over the page. It mounts the first time one opens and stays after, so
 * closing it hands focus back to its row as a dialog does, and a screen that never opens one never
 * works out what it would show.
 */
export function MenuSheets({ open, onClose }: { open: MenuSheet | null; onClose(): void }) {
  const [used, setUsed] = useState(open !== null);
  // Set while rendering, as React advises for state that follows a prop.
  if (open !== null && !used) setUsed(true);
  return used ? <NetWorthMenuSheet open={open === 'net-worth'} onClose={onClose} /> : null;
}

const ROW = 'press flex min-h-[54px] w-full items-center gap-3 py-[9px] text-left';
/** A small note on a row: "Soon", or how many are new. */
const NOTE =
  'text-muted shrink-0 rounded-full bg-black/6 px-2 py-0.5 text-[11px] font-extrabold dark:bg-white/8';

/**
 * One row, plain on the page: a glass icon chip, the name, and a chevron. A page's row is a link, a
 * sheet's a button; a row not built yet is a disabled button marked "Soon" in place of the chevron.
 * `note` is a small line in the same pill as Soon (how many reminders are new, on Inbox).
 */
function Row({
  item,
  note,
  onOpen,
}: {
  item: MenuItem;
  note: string | undefined;
  onOpen(sheet: MenuSheet): void;
}) {
  const { path, sheet, label, icon: Icon } = item;
  const face = (
    <>
      <span aria-hidden className="glass grid size-[38px] shrink-0 place-items-center rounded-full">
        <Icon className="size-[17px]" />
      </span>
      <span className="min-w-0 flex-1 text-[14.5px] font-extrabold">{label}</span>
      {note !== undefined && <span className={NOTE}>{note}</span>}
      {item.soon ? (
        <span className={NOTE}>Soon</span>
      ) : (
        <ChevronRight aria-hidden className="text-muted size-4 shrink-0" />
      )}
    </>
  );
  if (path !== undefined) {
    return (
      <NavLink to={path} className={ROW}>
        {face}
      </NavLink>
    );
  }
  if (sheet !== undefined) {
    return (
      <button type="button" onClick={() => onOpen(sheet)} className={ROW}>
        {face}
      </button>
    );
  }
  return (
    <button type="button" disabled className={ROW}>
      {face}
    </button>
  );
}

/** A group's title over its rows, with a hairline between them and no box. */
function Group({
  group,
  notes,
  onOpen,
}: {
  group: MenuGroup;
  notes: Record<string, string>;
  onOpen(sheet: MenuSheet): void;
}) {
  return (
    <>
      <h2 className="text-section mt-[22px] mb-2">{group.title}</h2>
      <ul className={ROWS}>
        {group.items.map((item) => (
          <li key={item.label}>
            <Row item={item} note={notes[item.label]} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Everything the tab bar has no room for, grouped, as plain rows: Profile's menu. */
export function MenuGroups({ riseFrom }: MenuGroupsProps) {
  const unread = useInboxItems().filter((i) => !i.read).length;
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  // Nothing beside Inbox when there is nothing new.
  const notes: Record<string, string> = unread > 0 ? { Inbox: `${unread} new` } : {};
  return (
    <>
      {MENU_GROUPS.map((group, i) => (
        <Rise key={group.title} as="section" index={riseFrom + i}>
          <Group group={group} notes={notes} onOpen={setSheet} />
        </Rise>
      ))}
      <MenuSheets open={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
