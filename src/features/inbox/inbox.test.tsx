import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptySnapshot, type DataSnapshot } from '@/domain/snapshot';
import { formatDay } from '@/lib/format';
import { toastStore } from '@/lib/toast';
import { createStubStore, renderWithStore } from '@/test/appStoreStub';
import { INBOX_NOW, inboxData } from '@/test/inboxData';
import { InboxScreen } from './InboxScreen';

const actions = vi.hoisted(() => ({
  markRead: vi.fn<(key: string) => Promise<void>>(async () => {}),
  markAllRead: vi.fn(async () => {}),
}));
vi.mock('@/store/useInbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store/useInbox')>()),
  useInboxActions: () => actions,
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: INBOX_NOW });
  Object.values(actions).forEach((a) => a.mockClear());
  toastStore.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

function renderInbox(data: DataSnapshot = inboxData()) {
  renderWithStore(
    <MemoryRouter initialEntries={['/inbox']}>
      <Routes>
        <Route path="/inbox" element={<InboxScreen />} />
        <Route path="/freeze" element={<p>The freeze page</p>} />
        <Route path="*" element={<p>Somewhere else</p>} />
      </Routes>
    </MemoryRouter>,
    createStubStore({ data, today: '2026-10-14' }),
  );
}

const rows = () => screen.getAllByRole('link');

describe('InboxScreen', () => {
  it('lists the reminders of the last 30 days newest first: title, then area and when', () => {
    renderInbox();
    expect(screen.getByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
    const day = (d: string, time: string) => `${formatDay(d)}, ${time}`;
    const expected = [
      ['Salary freeze ends today', `Salary freeze · ${day('2026-10-13', '09:00')}`],
      ['Salary freeze starts today', `Salary freeze · ${day('2026-10-12', '09:00')}`],
      ['Weekly check-in', `Budget · ${day('2026-10-11', '18:00')}`],
      ['Weekly check-in', `Budget · ${day('2026-10-04', '18:00')}`],
      ['Monthly review', `Budget · ${day('2026-09-30', '18:00')}`],
      ['Weekly check-in', `Budget · ${day('2026-09-27', '18:00')}`],
      ['Weekly check-in', `Budget · ${day('2026-09-20', '18:00')}`],
    ];
    expect(rows()).toHaveLength(expected.length);
    rows().forEach((row, i) => {
      expect(within(row).getByText(expected[i]![0]!)).toBeInTheDocument();
      expect(within(row).getByText(expected[i]![1]!)).toBeInTheDocument();
    });
  });

  it('opens the screen a reminder is about', () => {
    renderInbox();
    expect(rows()[0]).toHaveAttribute('href', '/freeze');
    expect(rows()[2]).toHaveAttribute('href', '/');
  });

  it('has New and All underline tabs, with the count of what is new', async () => {
    renderInbox(inboxData({ readBefore: null, read: ['week:2026-10-11', 'week:2026-10-04'] }));
    const group = screen.getByRole('group', { name: 'Show' });
    const fresh = within(group).getByRole('button', { name: 'New (5)' });
    const all = within(group).getByRole('button', { name: 'All' });
    expect(fresh).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(rows()).toHaveLength(5);

    await userEvent.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(fresh).toHaveAttribute('aria-pressed', 'false');
    expect(rows()).toHaveLength(7);
    // Only the rows still to read carry the dot.
    expect(screen.getAllByText('Unread:')).toHaveLength(5);
    expect(rows()[2]).not.toHaveTextContent('Unread');

    await userEvent.click(fresh);
    expect(rows()).toHaveLength(5);
  });

  it('opens a row and marks it read', async () => {
    renderInbox();
    await userEvent.click(rows()[0]!);
    expect(actions.markRead).toHaveBeenCalledTimes(1);
    expect(actions.markRead).toHaveBeenCalledWith('freeze-end:freeze-1');
    expect(screen.getByText('The freeze page')).toBeInTheDocument();
  });

  it('opens a row that was read without marking it again', async () => {
    renderInbox(inboxData({ readBefore: null, read: ['freeze-end:freeze-1'] }));
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.click(rows()[0]!);
    expect(actions.markRead).not.toHaveBeenCalled();
    expect(screen.getByText('The freeze page')).toBeInTheDocument();
  });

  it('still opens the row when marking it read fails, and says so', async () => {
    actions.markRead.mockRejectedValueOnce(new Error('Storage is full.'));
    renderInbox();
    await userEvent.click(rows()[0]!);
    expect(screen.getByText('The freeze page')).toBeInTheDocument();
    await waitFor(() =>
      expect(toastStore.getState().toasts.map((t) => [t.tone, t.message])).toEqual([
        ['danger', 'Storage is full.'],
      ]),
    );
  });

  it('marks all as read', async () => {
    renderInbox();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(actions.markAllRead).toHaveBeenCalledOnce();
  });

  it('has nothing to mark when everything is read, and says so on New, not as if none came', async () => {
    const readBefore = '2026-10-14T08:00:00.000Z';
    renderInbox(inboxData({ readBefore, read: [] }));
    expect(screen.getByRole('button', { name: 'New (0)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    expect(screen.getByText('No new reminders.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    // They are all still there to read again.
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.queryByText('No new reminders.')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(7);
  });

  it('says so when no reminder has come due yet, on both tabs', async () => {
    renderInbox(emptySnapshot());
    const text = 'Nothing here yet. Reminders you miss will show up here.';
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
