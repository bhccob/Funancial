import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

/**
 * Typed-confirmation erase of everything on this device. Works locked or unlocked. `erase` replaces
 * what the confirmation does (Delete all data starting over, for a phone with an account).
 */
export function EraseDialog({
  open,
  title,
  description,
  onClose,
  erase,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose(): void;
  erase?(): Promise<void>;
}) {
  const deleteAllData = useApp((s) => s.deleteAllData);
  const run = useAction();
  const [typed, setTyped] = useState('');
  const close = () => {
    setTyped('');
    onClose();
  };

  return (
    <Dialog open={open} title={title} description={description} onClose={close}>
      {open && (
        <div className="flex flex-col gap-5">
          <TextField
            variant="line"
            label="Type DELETE to confirm"
            autoComplete="off"
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={typed !== 'DELETE'}
              onClick={() => {
                close();
                void run(erase ?? deleteAllData);
              }}
            >
              Delete everything
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
