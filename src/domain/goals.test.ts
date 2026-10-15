import { describe, expect, it } from 'vitest';
import { makeGoal } from '@/test/fixtures';
import { monthlyToReach } from './goals';

describe('monthlyToReach', () => {
  it('splits what is left over the months to the deadline, rounding up', () => {
    const bike = makeGoal({ target: 1_200_00, current: 450_00, deadline: '2027-02-14' });
    expect(monthlyToReach(bike, '2026-10-14')).toBe(187_50);
    const odd = makeGoal({ target: 100_00, current: 0, deadline: '2027-01-01' });
    // 10,000 / 3 = 3,333.33… → 3,334
    expect(monthlyToReach(odd, '2026-10-31')).toBe(33_34);
  });

  it('asks for everything left this month when the deadline is this month or past', () => {
    const due = makeGoal({ target: 500_00, current: 100_00, deadline: '2026-10-30' });
    expect(monthlyToReach(due, '2026-10-14')).toBe(400_00);
    const late = makeGoal({ target: 500_00, current: 100_00, deadline: '2026-08-01' });
    expect(monthlyToReach(late, '2026-10-14')).toBe(400_00);
  });

  it('has nothing to say without a deadline or once reached', () => {
    expect(monthlyToReach(makeGoal({ deadline: null }), '2026-10-14')).toBeNull();
    const done = makeGoal({ target: 100_00, current: 120_00, deadline: '2027-01-01' });
    expect(monthlyToReach(done, '2026-10-14')).toBeNull();
  });
});
