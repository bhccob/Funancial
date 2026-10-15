import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/useAction';
import { useApp } from '@/store/AppStoreProvider';

/** Typed-confirmation erase of everything on this device. Works locked or unlocked. */
export function EraseDialog({
  open,
  title,
  description,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose(): void;
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
        <div className="flex flex-col gap-4">
          <TextField
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
                void run(deleteAllData);
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
