import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { ShopItem } from '@/domain/game/shop';
import { useAction } from '@/lib/useAction';
import { useGameActions } from '@/store/useGame';

function BuyForm({ item, onDone }: { item: ShopItem; onDone(): void }) {
  const { buy } = useGameActions();
  const run = useAction();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const bought = await run(() => buy(item.id), { success: `${item.name} is yours.` });
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

/** Asks before coins are spent: the price, then Buy or Cancel. Closes once the item is bought. */
export function BuyDialog({ item, onClose }: { item: ShopItem | null; onClose(): void }) {
  return (
    <Dialog
      open={item !== null}
      title={item ? `Buy ${item.name} for ${item.price} coins?` : ''}
      onClose={onClose}
    >
      {item && <BuyForm key={item.id} item={item} onDone={onClose} />}
    </Dialog>
  );
}
