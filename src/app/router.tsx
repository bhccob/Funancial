import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { NotFound } from './NotFound';
import { APP_ROUTES } from './routes';

export const appRouteObjects: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      ...APP_ROUTES.map(({ path, element }) => ({ path, element })),
      { path: '*', element: <NotFound /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRouteObjects);
}
