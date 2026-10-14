import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';

export function NotFound() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold">Page not found</h1>
      <Card className="flex flex-col items-start gap-3">
        <p className="text-muted">This path leads nowhere. Let's head back to familiar ground.</p>
        <Link to="/" className="text-primary font-bold underline underline-offset-4">
          Go home
        </Link>
      </Card>
    </div>
  );
}
