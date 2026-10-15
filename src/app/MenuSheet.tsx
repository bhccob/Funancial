import { ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router';
import { Sheet } from '@/components/ui/Sheet';
import { MENU_GROUPS } from './menu';
import { useMenuSubtitles } from './useMenuSubtitles';

/** The phone's Menu: everything the bottom bar has no room for, grouped, with what is inside each. */
export function MenuSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} title="Menu" onClose={onClose}>
      {/* Mounted only while open, so the subtitles are not worked out for a closed sheet. */}
      {open && <MenuList onClose={onClose} />}
    </Sheet>
  );
}

function MenuList({ onClose }: { onClose(): void }) {
  const subtitles = useMenuSubtitles();
  return (
    <div className="flex flex-col">
      {MENU_GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="mt-[18px] mb-1.5 text-[21px] font-extrabold tracking-[-0.02em]">
            {group.title}
          </h3>
          <ul>
            {group.items.map(({ path, label, icon: Icon, color, soon }) => (
              <li key={path} className="border-border border-t first:border-t-0">
                <NavLink
                  to={path}
                  onClick={onClose}
                  className="text-text flex min-h-14 items-center gap-3.5 py-3"
                >
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
          </ul>
        </section>
      ))}
    </div>
  );
}
