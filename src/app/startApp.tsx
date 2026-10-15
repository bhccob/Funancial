import { createRoot, type Root } from 'react-dom/client';
import { CrashScreen } from '@/components/ui/ErrorBoundary';

/**
 * Runs the app's start-up into a React root on `container`. If it throws before the app is on
 * screen (a native plugin that fails to load, say), the crash screen and its Reload button show
 * instead of an empty page.
 */
export async function startApp(
  container: HTMLElement,
  start: (root: Root) => Promise<void>,
): Promise<Root> {
  const root = createRoot(container);
  try {
    await start(root);
  } catch (e) {
    console.error('Starting Funancial failed', e);
    root.render(<CrashScreen />);
  }
  return root;
}
