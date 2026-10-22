import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { Rise } from '@/components/ui/Rise';
import { Tile } from '@/components/ui/Tile';
import { NetWorthSheet } from '@/features/dashboard/NetWorthSheet';
import { useFinanceView } from '@/store/useFinance';
import { MENU_GROUPS, type MenuGroup, type MenuItem, type MenuSheet } from './menu';
import { useMenuSubtitles } from './useMenuSubtitles';

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

const ROW = 'text-text flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left';

/**
 * One row: the colored icon chip, the name over what is inside, and a chevron. A page's row is a
 * link, a sheet's a button; a row not built yet is a disabled button marked "Soon".
 */
function Row({
  item,
  subtitle,
  onOpen,
}: {
  item: MenuItem;
  subtitle: string | undefined;
  onOpen(sheet: MenuSheet): void;
}) {
  const { path, sheet, label, icon: Icon, color } = item;
  const face = (
    <>
      <span
        aria-hidden
        className="grid size-[42px] shrink-0 place-items-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15.5px] font-extrabold">{label}</span>
        <span className="text-muted text-[13px] font-semibold">{subtitle}</span>
      </span>
      {item.soon ? (
        <span className="text-muted text-xs font-extrabold">Soon</span>
      ) : (
        <ChevronRight aria-hidden className="text-muted size-[18px] shrink-0" />
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

/** A group's title over one tile of rows. */
function Group({
  group,
  subtitles,
  onOpen,
}: {
  group: MenuGroup;
  subtitles: Record<string, string>;
  onOpen(sheet: MenuSheet): void;
}) {
  return (
    <>
      <h2 className="text-section mt-[22px] mb-2.5">{group.title}</h2>
      <Tile as="ul" padded={false}>
        {group.items.map((item) => (
          <li key={item.label} className="border-border border-t first:border-t-0">
            <Row item={item} subtitle={subtitles[item.label]} onOpen={onOpen} />
          </li>
        ))}
      </Tile>
    </>
  );
}

/** Everything the tab bar has no room for, grouped, with what is inside each: Profile's menu. */
export function MenuGroups({ riseFrom }: MenuGroupsProps) {
  const subtitles = useMenuSubtitles();
  const [sheet, setSheet] = useState<MenuSheet | null>(null);
  return (
    <>
      {MENU_GROUPS.map((group, i) => (
        <Rise key={group.title} as="section" index={riseFrom + i}>
          <Group group={group} subtitles={subtitles} onOpen={setSheet} />
        </Rise>
      ))}
      <MenuSheets open={sheet} onClose={() => setSheet(null)} />
    </>
  );
}
