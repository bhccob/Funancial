import { Link } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';

export function NotFound() {
  return (
    <div>
      <PageHeader title="Page not found" />
      <Section className="flex flex-col items-start gap-2">
        <p className="text-muted font-semibold">
          This path leads nowhere. Let's head back to familiar ground.
        </p>
        <Link
          to="/"
          className="text-accent-text -my-1 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
        >
          Go home
        </Link>
      </Section>
    </div>
  );
}
