import type { BackButtonListenerEvent } from '@capacitor/app';
import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { topDialog } from '@/lib/dialogStack';
import { onBarsBackground } from '@/lib/systemBars';
import { onThemeApplied } from '@/lib/theme';
import { handleBack } from '../back';
import { listen } from './listen';

/**
 * Light icons on `bar` over a dark background, dark ones over a light one. Each call names its bar:
 * a style without one lands on both.
 */
function setBarStyle(bar: SystemBarType, dark: boolean) {
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light, bar }).catch(
    (e: unknown) => console.error('Could not set the system bar style', e),
  );
}

/**
 * Makes the web app behave like a phone app: the back gesture closes a dialog, then goes back a
 * screen, then backgrounds the app; and the system bars' icons follow what is behind them. The
 * status bar's follow the theme's block while it covers the top of the screen (light on a dark
 * block, dark on a light one, in either theme), and the theme otherwise; the navigation bar's follow
 * the theme alone, as the block never reaches the bottom.
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

    onBarsBackground((background) =>
      setBarStyle(SystemBarType.StatusBar, background === 'dark'),
    );
    // The theme is applied again on each change of preference or of the phone's own setting, often
    // to the same one: only a change is passed on, as `onBarsBackground` does for the status bar.
    let navigationDark: boolean | undefined;
    onThemeApplied((dark) => {
      if (dark === navigationDark) return;
      navigationDark = dark;
      setBarStyle(SystemBarType.NavigationBar, dark);
    });
  } catch (e) {
    console.error('Could not set up the Android shell', e);
  }
}
