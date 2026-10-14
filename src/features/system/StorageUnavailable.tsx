import { TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function StorageUnavailable() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Card className="flex max-w-md flex-col gap-3">
        <TriangleAlert aria-hidden className="text-warning size-8" strokeLinecap="square" />
        <h1 className="font-display text-2xl font-semibold">Funancial can't save data here</h1>
        <p className="text-muted">
          Your browser is blocking storage (this can happen in private windows). Open Funancial in a
          normal window to continue.
        </p>
      </Card>
    </main>
  );
}
