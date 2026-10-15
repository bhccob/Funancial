import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { topDialog } from '@/lib/dialogStack';
import { onThemeApplied } from '@/lib/theme';
import { handleBack } from '../back';
import { listen } from './listen';

/**
 * Makes the web app behave like a phone app: the back gesture closes a dialog, then goes back a
 * screen, then backgrounds the app; and the status-bar icons follow the theme (light icons on the
 * dark theme, dark icons on the light one).
 *
 * Nothing here is worth stopping the app for: a failure is logged and the app starts without it.
 */
export async function installShell(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    listen(
      () =>
        App.addListener('backButton', ({ canGoBack }) => {
          handleBack(canGoBack, {
            topDialog,
            back: () => history.back(),
            minimize: () =>
              void App.minimizeApp().catch((e: unknown) =>
                console.error('Could not send the app to the background', e),
              ),
          });
        }),
      'the back button',
    );

    onThemeApplied((dark) => {
      SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(
        (e: unknown) => console.error('Could not set the system bar style', e),
      );
    });
  } catch (e) {
    console.error('Could not set up the Android shell', e);
  }
}
