import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <Section>
        <p className="text-muted font-semibold">Coming soon.</p>
      </Section>
    </div>
  );
}
