import { useEffect, useState, type ReactNode } from 'react';
import { loadLogo } from '@/services/logo';

/**
 * A round mark for a logo: the content centred on a disc, ringed in `color` (a slice colour). The
 * ring carries the colour so the text on it stays the text colour, which is readable in both themes
 * where white on a slice colour is not. A picture, so hidden from a screen reader.
 */
export function LogoDisc({
  color,
  size,
  children,
  logo,
}: {
  color: string;
  size: number;
  children: ReactNode;
  /** What `data-logo` says, for the page's tests and its counting of logos. */
  logo: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-logo={logo}
      className="bg-surface-2 text-text inline-grid flex-none place-items-center overflow-hidden rounded-full leading-none font-extrabold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
        boxShadow: `inset 0 0 0 1.5px ${color}`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A company's logo from the price service, as a round mark of `size` px. Until it arrives, and if
 * there is none or it will not draw, it is the first letter of the name on a disc ringed in `color`.
 */
export function CompanyLogo({
  symbol,
  name,
  color,
  size = 20,
}: {
  symbol: string;
  name: string;
  color: string;
  size?: number;
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
  return (
    <LogoDisc color={color} size={size} logo={symbol}>
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onError={() => setBroken(symbol)}
          className="size-full bg-white object-contain p-0.5"
        />
      ) : (
        [...(name.trim() || symbol)][0]?.toUpperCase()
      )}
    </LogoDisc>
  );
}
