import type { BackButtonListenerEvent } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { topDialog } from '@/lib/dialogStack';
import { onBarsBackground } from '@/lib/systemBars';
import { handleBack } from '../back';
import { listen } from './listen';

/**
 * Makes the web app behave like a phone app: the back gesture closes a dialog, then goes back a
 * screen, then backgrounds the app; and the status-bar icons follow what is behind the bar (light
 * icons on the dark theme or under the dark glass header, dark icons on the light theme otherwise).
 *
 * Nothing here is worth stopping the app for: a failure is logged and the app starts without it.
 */
export async function installShell(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    listen(
      (run) => App.addListener('backButton', run),
      ({ canGoBack }: BackButtonListenerEvent) => {
        handleBack(canGoBack, {
          topDialog,
          back: () => history.back(),
          minimize: () =>
            void App.minimizeApp().catch((e: unknown) =>
              console.error('Could not send the app to the background', e),
            ),
        });
      },
      'the back button',
    );

    onBarsBackground((background) => {
      SystemBars.setStyle({
        style: background === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      }).catch((e: unknown) => console.error('Could not set the system bar style', e));
    });
  } catch (e) {
    console.error('Could not set up the Android shell', e);
  }
}
