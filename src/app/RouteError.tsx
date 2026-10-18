import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { CrashScreen } from '@/components/ui/ErrorBoundary';

/** A screen that throws gets the app's own crash screen, not the router's default error page. */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => console.error('Funcial screen crashed', error), [error]);
  return <CrashScreen />;
}
