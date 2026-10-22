import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router';
import { Rise } from '@/components/ui/Rise';
import { Tile } from '@/components/ui/Tile';
import { MENU_GROUPS, type MenuGroup } from './menu';
import { useMenuSubtitles } from './useMenuSubtitles';

export interface MenuGroupsProps {
  /** Brings each group in as a `Rise`, the first at this index and each next one a beat later. */
  riseFrom: number;
}

/** A group's title over one tile of rows: the colored icon chip, name, what is inside, a chevron. */
function Group({ group, subtitles }: { group: MenuGroup; subtitles: Record<string, string> }) {
  return (
    <>
      <h2 className="text-section mt-[22px] mb-2.5">{group.title}</h2>
      <Tile as="ul" padded={false}>
        {group.items.map(({ path, label, icon: Icon, color, soon }) => (
          <li key={path} className="border-border border-t first:border-t-0">
            <NavLink to={path} className="text-text flex min-h-14 items-center gap-3.5 px-4 py-3">
              <span
                aria-hidden
                className="grid size-[42px] shrink-0 place-items-center rounded-full text-white"
                style={{ backgroundColor: color }}
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15.5px] font-extrabold">{label}</span>
                <span className="text-muted text-[13px] font-semibold">{subtitles[path]}</span>
              </span>
              {soon ? (
                <span className="text-muted text-xs font-extrabold">Soon</span>
              ) : (
                <ChevronRight aria-hidden className="text-muted size-[18px] shrink-0" />
              )}
            </NavLink>
          </li>
        ))}
      </Tile>
    </>
  );
}

/** Everything the tab bar has no room for, grouped, with what is inside each: Profile's menu. */
export function MenuGroups({ riseFrom }: MenuGroupsProps) {
  const subtitles = useMenuSubtitles();
  return (
    <>
      {MENU_GROUPS.map((group, i) => (
        <Rise key={group.title} as="section" index={riseFrom + i}>
          <Group group={group} subtitles={subtitles} />
        </Rise>
      ))}
    </>
  );
}
