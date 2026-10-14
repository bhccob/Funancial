import { Card } from '@/components/ui/Card';

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      <Card>
        <p className="text-muted">Coming soon.</p>
      </Card>
    </div>
  );
}
