import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { readableInk } from '@/lib/colorMath';
import { logoColor } from '@/lib/logoColor';
import { loadLogo } from '@/services/logo';

/**
 * The ink for text on a disc filled with `fill`: white, the page's ink or black, whichever holds
 * 4.5:1 on it. A fill that cannot be read (a `var()`) gets the text colour.
 */
const inkOn = (fill: string): string => readableInk(fill) ?? 'var(--color-text)';

/**
 * A round mark for a logo: the content centred on a disc, ringed in `color` (a slice colour). The
 * ring carries the colour so the text on it stays the text colour, which is readable in both themes
 * where white on a slice colour is not. As a `badge` the disc is instead filled with `color` and the
 * content is drawn in white or the ink, whichever holds 4.5:1 on it (the pie's badge, where the ticker
 * stands on the slice's own colour, and a logo sits inside 2px of it, so the pill says which slice it
 * is for with no line to it); `color` is then a colour that can be read, `#rrggbb` or `rgb()`.
 * A picture, so hidden from a screen reader.
 */
export function LogoDisc({
  color,
  size,
  children,
  logo,
  badge = false,
  fontSize,
}: {
  color: string;
  size: number;
  children: ReactNode;
  /** What `data-logo` says, for the page's tests and its counting of logos. */
  logo: string;
  /** Fill the disc with `color` and draw the content in white or the ink, in place of the ring. */
  badge?: boolean;
  /** The content's size in px; half the disc's by default. */
  fontSize?: number;
}) {
  return (
    <span
      aria-hidden="true"
      data-logo={logo}
      className="bg-surface-2 text-text inline-grid flex-none place-items-center overflow-hidden rounded-full leading-none font-extrabold"
      style={{
        width: size,
        height: size,
        fontSize: fontSize ?? Math.round(size * 0.5),
        ...(badge
          ? {
              backgroundColor: color,
              color: inkOn(color),
              fontWeight: 700,
              letterSpacing: '-0.03em',
              padding: 2,
            }
          : { boxShadow: `inset 0 0 0 1.5px ${color}` }),
      }}
    >
      {children}
    </span>
  );
}

/** A symbol's letters and digits, up to four of them: "BRK.B" is "BRKB", "RDSA.AS" is "RDSA". */
function ticker(symbol: string, name: string): string {
  const letters = [...symbol.replace(/[^\p{L}\p{N}]/gu, '')].slice(0, 4).join('');
  return letters || [...(name.trim() || symbol)][0]?.toUpperCase() || '';
}

/** The size of a ticker's text in px: 12 for one or two letters on a 24px disc, 10 for three, 9 for four. */
function tickerSize(letters: number, disc: number): number {
  const share = letters <= 2 ? 0.5 : letters === 3 ? 0.42 : 0.375;
  return Math.max(9, Math.round(disc * share));
}

/** The widest a ticker may be on a 24px disc, in px: the disc's chord at the height of capitals is just over 23. */
const TICKER_MAX = 21;

/**
 * A ticker on a badge. At 9px a wide four-letter one (VWRL, AMZN, GOOG) is 25px or more, which a 24px
 * disc cannot hold, so one that is wider than `TICKER_MAX` is squeezed sideways to fit, as measured
 * on the page in the font it is set in (and again once the fonts are in). Narrower ones are left as
 * they are.
 */
function Ticker({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    let live = true;
    const fit = () => {
      const el = ref.current;
      if (!live || !el) return;
      el.style.transform = '';
      const width = el.getBoundingClientRect().width;
      if (width > TICKER_MAX) el.style.transform = `scaleX(${TICKER_MAX / width})`;
    };
    fit();
    void document.fonts?.ready.then(fit);
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <span ref={ref} className="inline-block">
      {text}
    </span>
  );
}

/**
 * A company's logo from the price service, as a round mark of `size` px. Until it arrives, and if
 * there is none or it will not draw, it is the first letter of the name on a disc ringed in `color`.
 *
 * As a `badge` that stand-in is the ticker (up to four letters, never under 9px) on a disc filled
 * with `color`, in white or the ink, whichever holds 4.5:1 on it, and the logo, once it is in, is a
 * white disc inside a 2px ring of `color`; `color` is then a colour that can be read, `#rrggbb` or
 * `rgb()`, not a `var()`. With `onColor` it reports the logo's own colour
 * once the picture has loaded (null where it gives none), for a slice to take.
 */
export function CompanyLogo({
  symbol,
  name,
  color,
  size = 20,
  badge = false,
  onColor,
}: {
  symbol: string;
  name: string;
  color: string;
  size?: number;
  badge?: boolean;
  onColor?(color: string | null): void;
}) {
  // Tied to the symbol they belong to, so one holding's logo is never shown for the next.
  const [shown, setShown] = useState<{ symbol: string; src: string } | null>(null);
  const [broken, setBroken] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let src: string | undefined;
    loadLogo(symbol).then(
      (blob) => {
        if (!live || !blob) return;
        src = URL.createObjectURL(blob);
        setShown({ symbol, src });
      },
      // No logo is no harm: the letter stays.
      () => {},
    );
    return () => {
      live = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [symbol]);

  const src = shown?.symbol === symbol && broken !== symbol ? shown.src : null;
  const letters = badge && !src ? ticker(symbol, name) : null;
  return (
    <LogoDisc
      color={color}
      size={size}
      logo={symbol}
      badge={badge}
      fontSize={letters === null ? undefined : tickerSize([...letters].length, size)}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          // A blob URL is of the app's own origin, so the canvas it is drawn on is never tainted.
          onLoad={onColor && ((e) => onColor(logoColor(e.currentTarget, symbol.toUpperCase())))}
          onError={() => setBroken(symbol)}
          className={cn('size-full bg-white object-contain p-0.5', badge && 'rounded-full')}
        />
      ) : letters === null ? (
        [...(name.trim() || symbol)][0]?.toUpperCase()
      ) : (
        <Ticker text={letters} />
      )}
    </LogoDisc>
  );
}
