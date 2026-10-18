import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePlatform } from '@/platform/PlatformProvider';

const COPY = {
  web: {
    heading: "Funcial can't save data here",
    body: 'Your browser is blocking storage (this can happen in private windows). Open Funcial in a normal window to continue.',
  },
  android: {
    heading: "Funcial can't open its storage",
    body: "Something went wrong opening Funcial's encrypted storage on this phone. Close Funcial completely and open it again. Your data stays on this phone.",
  },
  newer: {
    heading: 'Funcial needs an update',
    body: 'This data was saved by a newer version of Funcial. Install the latest version to open it.',
  },
};

/** The storage can't be opened, or (`newer`) holds data this version is too old to open safely. */
export function StorageUnavailable({ newer = false }: { newer?: boolean }) {
  const platform = usePlatform().kind;
  const { heading, body } = COPY[newer ? 'newer' : platform];
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Card className="flex max-w-md flex-col gap-3">
        <TriangleAlert aria-hidden className="text-warning size-8" strokeLinecap="square" />
        <h1 className="text-2xl font-extrabold tracking-tight">{heading}</h1>
        <p className="text-muted">{body}</p>
        <Button className="self-start" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Card>
    </main>
  );
}
