export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-muted">Coming soon.</p>
    </div>
  );
}
