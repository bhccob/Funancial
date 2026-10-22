import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { ShopItem } from '@/domain/game/shop';
import { useAction } from '@/lib/useAction';
import { useGameActions } from '@/store/useGame';

function BuyForm({ item, onDone }: { item: ShopItem; onDone(): void }) {
  const { buy, equip } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const bought = await run(() => buy(item.id), { success: `${item.name} is yours.` });
    // A theme turns on as it is bought. If that fails it is still theirs, and the Shop says Use.
    if (bought && item.slot === 'theme') await run(() => equip(item.id));
    setBusy(false);
    if (bought) onDone();
  }

  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {/* Off while the purchase is pending, so a double tap cannot buy twice. */}
      <Button disabled={busy} onClick={() => void confirm()}>
        Buy
      </Button>
    </div>
  );
}

/**
 * Asks before coins are spent: the price, then Buy or Cancel. Closes once the item is bought, and a
 * theme is on by then: it says so, as the Shop's Buy otherwise only takes coins.
 */
export function BuyDialog({ item, onClose }: { item: ShopItem | null; onClose(): void }) {
  return (
    <Dialog
      open={item !== null}
      title={item ? `Buy ${item.name} for ${item.price} coins?` : ''}
      description={item?.slot === 'theme' ? 'It turns on as soon as it is yours.' : undefined}
      onClose={onClose}
    >
      {item && <BuyForm key={item.id} item={item} onDone={onClose} />}
    </Dialog>
  );
}
