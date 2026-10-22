import { Check, ChevronLeft, Coins, Snowflake } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { HeadBlock } from '@/components/ui/HeadBlock';
import { Rise } from '@/components/ui/Rise';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { Cosmetics } from '@/domain/entities';
import {
  FREEZE_LIMIT,
  purchaseBlocker,
  SHOP_ITEMS,
  THEMES,
  type GameTheme,
  type ShopItem,
  type ThemeKind,
} from '@/domain/game/shop';
import { freezeTokensHeld } from '@/domain/game/streaks';
import { formatMoney } from '@/domain/money';
import { Avatar } from '@/features/game/Avatar';
import { ROWS } from '@/features/shared/PlainSection';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useCurrency } from '@/store/useFinance';
import { useGameActions, useGameView } from '@/store/useGame';
import { BuyDialog } from './BuyDialog';

type Tab = 'themes' | 'avatars' | 'freezes';

const TABS: { value: Tab; label: string }[] = [
  { value: 'themes', label: 'Themes' },
  { value: 'avatars', label: 'Avatars' },
  { value: 'freezes', label: 'Freezes' },
];

/** The part a link opens the Shop on (`/shop?tab=freezes`, from Get freezes), else Themes. */
function tabFrom(param: string | null): Tab {
  return TABS.find((t) => t.value === param)?.value ?? 'themes';
}

/** The kinds of theme, in the order the Shop lists them. */
const KINDS: { kind: ThemeKind; label: string }[] = [
  { kind: 'free', label: 'Free' },
  { kind: 'light', label: 'Light' },
  { kind: 'dark', label: 'Dark' },
];

/** The streak a freeze protects. */
const FREEZE_STREAK: Record<string, 'logging' | 'checkin'> = {
  'freeze-logging': 'logging',
  'freeze-checkin': 'checkin',
};

/** What the mini preview of a theme shows as its balance: a sample, in the profile's currency. */
const SAMPLE_BALANCE = 261_700;

/** "Light · 400–450 coins": a group's name and what its themes cost, read from the catalogue. */
function groupTitle(label: string, themes: readonly GameTheme[]): string {
  const prices = themes.map((t) => t.price);
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  if (high === 0) return label;
  return `${label} · ${low === high ? low : `${low}–${high}`} coins`;
}

/** What an item costs: the coin and the price, said in words to a screen reader. */
function Price({ price }: { price: number }) {
  if (price === 0) return <span className="text-[12px] font-extrabold">Free</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-extrabold tabular-nums">
      <Coins aria-hidden="true" className="size-[13px]" />
      {price}
      <span className="sr-only"> coins</span>
    </span>
  );
}

/** The pill of Buy and Use: the page's ink, 30px tall with a 44px tap area. */
const PILL =
  'press hit-44 inline-flex min-h-[30px] items-center rounded-full px-3 text-[12px] font-extrabold ' +
  'bg-primary text-primary-contrast disabled:pointer-events-none disabled:opacity-45';

interface OfferProps {
  item: ShopItem;
  worn: Cosmetics;
  owned: boolean;
  /** Why the item cannot be bought now, or `null`. */
  blocker: string | null;
  onBuy(item: ShopItem): void;
  onUse(itemId: string): Promise<unknown>;
}

/**
 * What an item offers: Buy (a freeze is bought again and again, anything else once), Use for what is
 * owned and not worn, and On for what is worn. A Buy that is off carries the reason it is.
 */
function offerOf({
  item,
  worn,
  owned,
  blocker,
}: Pick<OfferProps, 'item' | 'worn' | 'owned' | 'blocker'>) {
  const buyable = item.slot === 'freeze' || !owned;
  return {
    buyable,
    equipped: owned && item.slot !== 'freeze' && worn[item.slot] === item.id,
    reason: buyable ? blocker : null,
  };
}

/** The pill itself: Buy, Use or On. */
function Action({ item, reasonId, onBuy, onUse, ...rest }: OfferProps & { reasonId: string }) {
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const { buyable, equipped, reason } = offerOf({ item, ...rest });

  async function use() {
    setBusy(true);
    await run(() => onUse(item.id));
    setBusy(false);
  }

  if (buyable) {
    return (
      <button
        type="button"
        aria-label={`Buy ${item.name}`}
        aria-describedby={reason ? reasonId : undefined}
        disabled={reason !== null}
        onClick={() => onBuy(item)}
        className={PILL}
      >
        Buy
      </button>
    );
  }
  if (equipped) {
    return (
      <span className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-black/8 px-3 text-[12px] font-extrabold dark:bg-white/10">
        <Check aria-hidden="true" className="size-3" />
        On<span className="sr-only">, in use</span>
      </span>
    );
  }
  return (
    // Off while the change is being saved, so a double tap cannot run it twice.
    <button
      type="button"
      aria-label={`Use ${item.name}`}
      disabled={busy}
      onClick={() => void use()}
      className={PILL}
    >
      Use
    </button>
  );
}

/**
 * A theme's or an avatar's card, as the wireframe draws it: glass over the page, a preview on top,
 * then the name, the price and Buy, Use or On. The one worn is outlined.
 */
function Card({ preview, ...offer }: OfferProps & { preview: ReactNode }) {
  const reasonId = useId();
  const { equipped, reason } = offerOf(offer);
  return (
    <li
      className={cn(
        'glass flex flex-col overflow-hidden rounded-[22px]',
        equipped && 'outline-text outline-2 outline-offset-1',
      )}
    >
      {preview}
      <div className="px-3 pt-2.5 pb-3">
        <p className="text-[13.5px] font-extrabold">{offer.item.name}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Price price={offer.item.price} />
          <Action {...offer} reasonId={reasonId} />
        </div>
        {reason && (
          <p id={reasonId} className="text-muted mt-1.5 text-[11.5px] font-semibold">
            {reason}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * The mini preview of a theme: its own block with its glass panel and a sample balance. It sets the
 * theme's variables on itself (`data-theme-preview`), so it reads them through the raw-variable
 * utilities (`bg-head`, `glass-head`, `--head-ink`); the color tokens are set on the page for the
 * theme worn, and would show that one.
 */
function ThemePreview({ id, currency }: { id: string; currency: string }) {
  return (
    <div
      aria-hidden="true"
      data-theme-preview={id.replace(/^theme-/, '')}
      className="bg-head relative h-[92px] overflow-hidden p-2.5 text-(--head-ink)"
    >
      <p className="relative text-[9px] font-extrabold">Available balance</p>
      <span className="glass-head absolute inset-x-2.5 top-6 h-[46px] rounded-[14px]" />
      <p className="relative mt-3.5 ml-2 text-[19px] font-extrabold tracking-[-0.03em]">
        {formatMoney(SAMPLE_BALANCE, currency, undefined, { whole: true })}
      </p>
    </div>
  );
}

/** An avatar's preview: on the block of the theme worn, as it is worn. */
function AvatarPreview({ item }: { item: string }) {
  return (
    <div aria-hidden="true" className="bg-head text-head-ink grid h-[92px] place-items-center">
      <Avatar item={item} frame="frame-none" size={48} tone="hero" />
    </div>
  );
}

/** A freeze, as a plain row: how many are held, the price and Buy. */
function FreezeRow({ held, ...offer }: OfferProps & { held: number }) {
  const reasonId = useId();
  const { reason } = offerOf(offer);
  return (
    <li className="flex min-h-[62px] items-center gap-3 py-[9px]">
      <span className="glass grid size-11 flex-none place-items-center rounded-full">
        <Snowflake aria-hidden="true" className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-extrabold">{offer.item.name}</p>
        <p className="text-muted text-[12px] font-semibold tabular-nums">{`Held: ${held} of ${FREEZE_LIMIT}`}</p>
        {reason && (
          <p id={reasonId} className="text-muted text-[12px] font-semibold">
            {reason}
          </p>
        )}
      </div>
      <div className="flex flex-none items-center gap-3">
        <Price price={offer.item.price} />
        <Action {...offer} reasonId={reasonId} />
      </div>
    </li>
  );
}

/** A group of the Shop: a small uppercase title over what is in it. */
function ShopGroup({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="pt-4">
      <h2
        id={headingId}
        className="text-muted mx-1 mb-2.5 text-[12px] font-extrabold tracking-[0.06em] uppercase"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The cards of a group, two across on a phone. */
const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3';

/**
 * The coin shop, as in the glass wireframe: on the theme's block the way back, the title and the
 * coins, with Themes, Avatars and Freezes under them; below, the themes in Free, Light and Dark
 * groups as cards with a mini preview, then avatars as cards and streak freezes as plain rows. Buying
 * goes through a confirm; a theme bought is turned on.
 */
export function ShopScreen() {
  const game = useGameView();
  const data = useApp((s) => s.data);
  const currency = useCurrency();
  const { equip } = useGameActions();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => tabFrom(params.get('tab')));
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const coins = Math.max(0, game.totals.coins);

  // Back to where the Shop was opened from, or to Profile when it was the first screen.
  const back = () => void (location.key === 'default' ? navigate('/profile') : navigate(-1));

  const offer = (item: ShopItem): OfferProps => ({
    item,
    worn: game.cosmetics,
    owned: game.owned.has(item.id),
    blocker: purchaseBlocker(item.id, data),
    onBuy: setBuying,
    onUse: equip,
  });
  const themeItem = (theme: GameTheme) => SHOP_ITEMS.find((i) => i.id === theme.id)!;

  return (
    <>
      {/* The block must be the first thing on the page, so it can run up behind the status bar. */}
      <Rise index={0}>
        <HeadBlock compact>
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Back"
                  onClick={back}
                  className="glass-head press grid size-11 shrink-0 place-items-center rounded-full"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>
                <h1 className="text-page">Shop</h1>
              </div>
              <span className="glass-head inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-extrabold tabular-nums">
                <Coins aria-hidden="true" className="size-4" />
                {`${coins} ${coins === 1 ? 'coin' : 'coins'}`}
              </span>
            </div>
            <SegmentedControl<Tab>
              label="Shop sections"
              tone="hero"
              stretch
              value={tab}
              options={TABS}
              onChange={setTab}
              className="mt-3.5"
            />
          </div>
        </HeadBlock>
      </Rise>

      <Rise index={1} className="mx-auto max-w-3xl">
        {tab === 'themes' &&
          KINDS.map(({ kind, label }) => {
            const themes = THEMES.filter((t) => t.kind === kind);
            return (
              <ShopGroup key={kind} title={groupTitle(label, themes)}>
                <ul className={GRID}>
                  {themes.map((theme) => (
                    <Card
                      key={theme.id}
                      {...offer(themeItem(theme))}
                      preview={<ThemePreview id={theme.id} currency={currency} />}
                    />
                  ))}
                </ul>
              </ShopGroup>
            );
          })}
        {tab === 'avatars' && (
          <ShopGroup title="Avatars">
            <ul className={GRID}>
              {SHOP_ITEMS.filter((i) => i.slot === 'avatar').map((item) => (
                <Card key={item.id} {...offer(item)} preview={<AvatarPreview item={item.id} />} />
              ))}
            </ul>
          </ShopGroup>
        )}
        {tab === 'freezes' && (
          <ShopGroup title="Streak freezes">
            <ul className={cn('px-1', ROWS)}>
              {SHOP_ITEMS.filter((i) => i.slot === 'freeze').map((item) => {
                const streak = FREEZE_STREAK[item.id];
                return (
                  <FreezeRow
                    key={item.id}
                    {...offer(item)}
                    held={streak ? freezeTokensHeld(data, streak) : 0}
                  />
                );
              })}
            </ul>
          </ShopGroup>
        )}
        <p className="text-muted mx-1 mt-3.5 text-[12px] leading-[1.45] font-semibold">
          Coins are for fun. They can&apos;t be bought and have no money value.
        </p>
      </Rise>
      <BuyDialog item={buying} onClose={() => setBuying(null)} />
    </>
  );
}
