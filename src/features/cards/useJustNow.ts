import { useEffect, useRef, useState } from 'react';
import { useTopModalDialog } from '@/lib/dialogStack';
import { MOTION } from '@/lib/motion';
import { useLastSpend, type LastSpend } from '@/store/useLastSpend';

/** How much of a card has to show for it to be on screen: half of it. */
export const ON_SCREEN = 0.5;

/** How long after a spend its card can still say "just now" when it comes on screen, in ms. */
const JUST_NOW_WINDOW_MS = 30_000;

/**
 * The spend a card says "just now" for, while it does. A spend is given its turn once a visit: when
 * the card that took it is on screen (`onScreen` holds the ids showing, or is `null` where nothing
 * can say, which counts every card) and no sheet or dialog is open over it (Pay's done step is one,
 * so the badge comes when Done is tapped and not behind the sheet), and only when the spend is under
 * 30 seconds old then (counted from the spend, not from the card coming on screen). It then shows
 * for `MOTION.justNow` seconds. Going away from the card and back, or a re-render, gives it no
 * second turn; a newer spend gets its own.
 */
export function useJustNow(onScreen: ReadonlySet<string> | null): LastSpend | null {
  const last = useLastSpend((s) => s.last);
  const covered = useTopModalDialog() !== null;
  const [shown, setShown] = useState<LastSpend | null>(null);
  // The latest spend that has had its turn, or its chance: shown, or too old when it was due.
  const turned = useRef<LastSpend | null>(null);
  const here = last !== null && (onScreen === null || onScreen.has(last.accountId));

  useEffect(() => {
    if (!last || !here || covered || turned.current === last) return;
    turned.current = last;
    // The badge starts the moment a spend, its card on screen and no sheet over it come together;
    // the ref above lets that happen once per spend, so this is no cascade of renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one render, once per spend
    if (Date.now() - last.at < JUST_NOW_WINDOW_MS) setShown(last);
  }, [last, here, covered]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), MOTION.justNow * 1000);
    return () => clearTimeout(timer);
  }, [shown]);

  return shown;
}
