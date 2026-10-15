import { Check, Coins, Snowflake } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import type { Cosmetics } from '@/domain/entities';
import { FREEZE_LIMIT, purchaseBlocker, SHOP_ITEMS, type ShopItem } from '@/domain/game/shop';
import { freezeTokensHeld } from '@/domain/game/streaks';
import { cn } from '@/lib/cn';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';
import { useGameActions, useGameView } from '@/store/useGame';
import { Avatar } from '@/features/game/Avatar';
import { BuyDialog } from './BuyDialog';

const SECTIONS = [
  { slot: 'theme', title: 'Themes' },
  { slot: 'avatar', title: 'Avatars' },
  { slot: 'frame', title: 'Frames' },
  { slot: 'freeze', title: 'Streak freezes' },
] as const;

/** Each theme's game color, light then dark: the dot follows the page's `data-theme`. */
const SWATCHES: Record<string, string> = {
  'theme-violet': 'bg-[#7c5cff] dark:bg-[#9d85ff]',
  'theme-ocean': 'bg-[#1f63d6] dark:bg-[#6aa6ff]',
  'theme-orchid': 'bg-[#a8189a] dark:bg-[#f08ae0]',
  'theme-graphite': 'bg-[#4a4f5c] dark:bg-[#c3c8d4]',
};

/** The streak a freeze protects. */
const FREEZE_STREAK: Record<string, 'logging' | 'checkin'> = {
  'freeze-logging': 'logging',
  'freeze-checkin': 'checkin',
};

function Preview({ item, worn }: { item: ShopItem; worn: Cosmetics }) {
  switch (item.slot) {
    case 'theme':
      return (
        <span
          aria-hidden="true"
          className={cn('size-6 shrink-0 rounded-full', SWATCHES[item.id])}
        />
      );
    case 'avatar':
      return <Avatar item={item.id} frame="frame-none" size={32} />;
    case 'frame':
      return <Avatar item={worn.avatar} frame={item.id} size={32} />;
    case 'freeze':
      return <Snowflake aria-hidden="true" className="text-xp-text size-5 shrink-0" />;
  }
}

interface ItemRowProps {
  item: ShopItem;
  worn: Cosmetics;
  owned: boolean;
  /** Why the item cannot be bought now, or `null`. */
  blocker: string | null;
  /** Freezes held, for a freeze. */
  held: number | null;
  onBuy(item: ShopItem): void;
  onUse(itemId: string): Promise<unknown>;
}

function ItemRow({ item, worn, owned, blocker, held, onBuy, onUse }: ItemRowProps) {
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  // Freezes are bought again and again; anything else is bought once.
  const buyable = item.slot === 'freeze' || !owned;
  const equipped = owned && item.slot !== 'freeze' && worn[item.slot] === item.id;
  const reason = buyable ? blocker : null;

  async function use() {
    setBusy(true);
    await run(() => onUse(item.id));
    setBusy(false);
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center">
        <Preview item={item} worn={worn} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{item.name}</p>
        <p className="text-muted text-[12.5px] tabular-nums">
          {item.price === 0 ? 'Free' : `${item.price} coins`}
        </p>
        {held !== null && (
          <p className="text-muted text-[12.5px] tabular-nums">{`Held: ${held} of ${FREEZE_LIMIT}`}</p>
        )}
        {reason && (
          <p id={reasonId} className="text-muted text-[12.5px]">
            {reason}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {buyable ? (
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Buy ${item.name}`}
            aria-describedby={reason ? reasonId : undefined}
            disabled={reason !== null}
            onClick={() => onBuy(item)}
          >
            Buy
          </Button>
        ) : equipped ? (
          <span className="text-xp-text flex items-center gap-1 text-sm font-semibold">
            <Check aria-hidden="true" className="size-4" />
            In use
          </span>
        ) : (
          // Off while the change is being saved, so a double tap cannot run it twice.
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Use ${item.name}`}
            disabled={busy}
            onClick={() => void use()}
          >
            Use
          </Button>
        )}
      </div>
    </li>
  );
}

/** The coin shop: game themes, avatars and badge frames to wear, and streak freezes, for coins. */
export function ShopScreen() {
  const game = useGameView();
  const data = useApp((s) => s.data);
  const { equip } = useGameActions();
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const coins = Math.max(0, game.totals.coins);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Shop" />
      <Section>
        <p className="flex items-center gap-1.5 text-[15px] font-bold tabular-nums">
          <Coins aria-hidden="true" className="size-4" />
          {`${coins} ${coins === 1 ? 'coin' : 'coins'}`}
        </p>
        <p className="text-muted mt-1 text-[12.5px]">
          Coins are for fun. They can&apos;t be bought and have no money value.
        </p>
      </Section>
      {SECTIONS.map(({ slot, title }) => (
        <Section key={slot} title={title}>
          <ul className="divide-border -my-3 divide-y">
            {SHOP_ITEMS.filter((item) => item.slot === slot).map((item) => {
              const streak = FREEZE_STREAK[item.id];
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  worn={game.cosmetics}
                  owned={game.owned.has(item.id)}
                  blocker={purchaseBlocker(item.id, data)}
                  held={streak ? freezeTokensHeld(data, streak) : null}
                  onBuy={setBuying}
                  onUse={equip}
                />
              );
            })}
          </ul>
        </Section>
      ))}
      <BuyDialog item={buying} onClose={() => setBuying(null)} />
    </div>
  );
}
