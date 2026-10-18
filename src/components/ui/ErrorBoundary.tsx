import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

/** What a crash looks like anywhere in the app: a way out instead of a blank or technical page. */
export function CrashScreen() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-sm flex-col items-start gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="text-muted">
          Your data is safe on this device. Reloading usually fixes this.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </main>
  );
}

/** Last line of defense: a crash shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Funcial crashed', error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
