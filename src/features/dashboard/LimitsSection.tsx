import { Ring } from '@/components/charts/Ring';
import { EmptyState } from '@/components/ui/EmptyState';
import { HelpTip } from '@/components/ui/HelpTip';
import { EmptyLink, Section, SectionLink } from '@/components/ui/Section';
import { limitLabel, type LimitLevel, type LimitStatus } from '@/domain/budget';
import { useMoney } from '@/store/useFinance';

/** Under 80% accent, 80–99% warning, 100% or more danger (the limit's own thresholds decide). */
const RING_COLORS: Record<LimitLevel, string> = {
  ok: 'var(--color-accent)',
  warn: 'var(--color-warning)',
  over: 'var(--color-danger)',
  'way-over': 'var(--color-danger)',
};

/** Up to three rings, the limits closest to (or past) their cap first. */
export function LimitsSection({ limits }: { limits: LimitStatus[] }) {
  const money = useMoney();
  const shown = limits.slice(0, 3);

  return (
    <Section
      title="Limits"
      help={<HelpTip pageId="limits" label="a limit" />}
      action={<SectionLink to="/budget">Budget</SectionLink>}
    >
      {shown.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {shown.map(({ limit, remaining, pct, level }) => {
            const name = `${limitLabel(limit)}${limit.period === 'weekly' ? ' · week' : ''}`;
            const amount = money(Math.abs(remaining), { whole: true });
            const left = remaining >= 0 ? `${amount} left` : `${amount} over`;
            return (
              <li key={limit.id} className="flex flex-col items-center gap-2 text-center">
                <Ring
                  value={pct}
                  size={86}
                  thickness={7}
                  color={RING_COLORS[level]}
                  label={`${name}: ${pct}% used, ${left}`}
                >
                  <b className="text-[17px] font-extrabold">{pct}%</b>
                </Ring>
                <span className="min-w-0 text-[13.5px] leading-tight font-extrabold">{name}</span>
                <span className="text-muted -mt-1 text-xs font-bold tabular-nums">{left}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No limits yet"
          action={<EmptyLink to="/budget">Set a limit</EmptyLink>}
        />
      )}
    </Section>
  );
}
