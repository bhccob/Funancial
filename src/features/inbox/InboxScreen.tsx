import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { REMINDER_AREA } from '@/domain/notifications';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { formatDay } from '@/lib/format';
import { useAction } from '@/lib/useAction';
import { useInboxActions, useInboxItems } from '@/store/useInbox';

type Show = 'new' | 'all';

/** "Oct 14, 09:00" from a reminder's `YYYY-MM-DDTHH:MM`. */
const when = (at: string) => `${formatDay(at.slice(0, 10))}, ${at.slice(11)}`;

/**
 * The reminders of the last 30 days, newest first, for someone who swiped one away: New or All, a
 * dot on those not read yet. A tap opens the screen it is about and reads it. The rows are plain,
 * with hairlines between them, as Profile's menu draws its own.
 */
export function InboxScreen() {
  const items = useInboxItems();
  const actions = useInboxActions();
  const run = useAction();
  const [show, setShow] = useState<Show>('new');

  const fresh = items.filter((i) => !i.read);
  const shown = show === 'new' ? fresh : items;
  const tabs: Array<{ value: Show; label: string }> = [
    { value: 'new', label: `New (${fresh.length})` },
    { value: 'all', label: 'All' },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader title="Inbox" back />

      <SegmentedControl<Show>
        label="Show"
        value={show}
        options={tabs}
        onChange={setShow}
        tone="glass"
        className="mt-3"
      />

      {shown.length === 0 ? (
        <div className="mt-4">
          {/* Only New can be empty while All has some: they are all read. */}
          <EmptyState
            title={
              items.length > 0
                ? 'No new reminders.'
                : 'Nothing here yet. Reminders you miss will show up here.'
            }
          />
        </div>
      ) : (
        <ul className={cn('mt-2', ROWS)}>
          {shown.map((item) => (
            <li key={item.key}>
              <Link
                to={item.route}
                // The tap goes on to the screen; a failure to remember it is told, not blocking.
                onClick={() => {
                  if (!item.read) void run(() => actions.markRead(item.key));
                }}
                className="text-text press flex min-h-14 items-center gap-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2 shrink-0 rounded-full', !item.read && 'bg-chart-1')}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  {!item.read && <span className="sr-only">Unread: </span>}
                  <span
                    className={cn(
                      'text-[15px] break-words',
                      item.read ? 'font-semibold' : 'font-extrabold',
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="text-muted text-[13px] font-semibold">
                    {`${REMINDER_AREA[item.kind]} · ${when(item.at)}`}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="text-muted size-[18px] shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {fresh.length > 0 && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => void run(() => actions.markAllRead())}
        >
          Mark all as read
        </Button>
      )}
    </div>
  );
}
