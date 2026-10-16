import { cn } from '@/lib/cn';
import { useInvestMoney } from '@/store/useInvest';

/** A label stands centred on its marker, but is pulled to line up with it near either end, so it never leaves the bar. */
const place = (pct: number) => ({
  left: `${pct}%`,
  transform: pct < 20 ? 'none' : pct > 80 ? 'translateX(-100%)' : 'translateX(-50%)',
});

/**
 * A holding's break-even next to its price: a bar from the lower of the two to the higher, with room
 * either side, tinted soft red up to break-even and soft green after it, a marker for each and
 * the gap said in words. Every figure is a price per share in minor units of the profile currency,
 * unrounded, so what is shown is rounded once.
 */
export function BreakEven({
  perShare,
  now,
  afterDividends,
}: {
  /** What one share must sell for to get the money back. */
  perShare: number;
  /** The price of a share now; null when there is none. */
  now: number | null;
  /** Break-even once the dividends so far are taken off; null when there have been none. */
  afterDividends: number | null;
}) {
  const { format } = useInvestMoney();

  if (now === null) {
    return (
      <p className="text-muted mt-6 text-[13.5px] font-bold">{`Break-even ${format(perShare)} per share`}</p>
    );
  }

  const low = Math.min(perShare, now);
  const high = Math.max(perShare, now);
  const pad = Math.max(high - low, high * 0.1);
  const start = Math.max(0, low - pad);
  const span = high + pad - start || 1;
  const at = (price: number) => ((price - start) / span) * 100;
  const [breakEvenAt, nowAt] = [at(perShare), at(now)];
  const above = now >= perShare;
  const tone = above ? 'text-success' : 'text-danger';

  return (
    <div className="mt-6">
      <p className="text-muted text-[13px] font-bold">Break-even</p>
      <div
        role="img"
        aria-label={`Break-even ${format(perShare)}, now ${format(now)}`}
        className="relative mt-8 mb-9 h-2.5 rounded-full"
        style={{
          background: `linear-gradient(90deg, var(--color-danger-soft) ${breakEvenAt}%, var(--color-success-soft) ${breakEvenAt}%)`,
        }}
      >
        <span
          aria-hidden="true"
          className="bg-text absolute -top-[5px] h-5 w-0.5 -translate-x-1/2"
          style={{ left: `${breakEvenAt}%` }}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute -top-[5px] h-5 w-0.5 -translate-x-1/2',
            above ? 'bg-success' : 'bg-danger',
          )}
          style={{ left: `${nowAt}%` }}
        />
        <span
          className="text-text absolute bottom-[18px] text-xs font-extrabold whitespace-nowrap"
          style={place(breakEvenAt)}
        >
          {`${format(perShare)} break-even`}
        </span>
        <span
          className={cn('absolute top-[18px] text-xs font-extrabold whitespace-nowrap', tone)}
          style={place(nowAt)}
        >
          {`now ${format(now)}`}
        </span>
      </div>
      <p className="text-muted text-[13.5px] font-semibold">
        {`${format(Math.abs(now - perShare))} per share ${above ? 'above' : 'below'} break-even.` +
          (afterDividends === null
            ? ''
            : ` Dividends so far bring it down to ${format(afterDividends)}.`)}
      </p>
    </div>
  );
}
