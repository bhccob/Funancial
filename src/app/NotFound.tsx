import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Page not found</h1>
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted">This path leads nowhere. Let's head back to familiar ground.</p>
        <Link to="/" className="text-accent-text font-bold underline underline-offset-4">
          Go home
        </Link>
      </div>
    </div>
  );
}
