export interface BackEnv {
  /** The innermost open modal dialog, if any. */
  topDialog(): HTMLDialogElement | null;
  /** One step back in the app's own history. */
  back(): void;
  /** Send the app to the background, as the back gesture does from a phone's first screen. */
  minimize(): void;
}

/**
 * What the Android back gesture does, in order: close the open dialog, else go back a screen,
 * else (on the first screen) put the app in the background instead of closing it.
 *
 * A dialog is asked to close the way the browser asks, with a cancelable `cancel` event;
 * `Dialog` turns that into its `onClose`, so each dialog decides what closing means.
 */
export function handleBack(canGoBack: boolean, env: BackEnv): 'dialog' | 'back' | 'minimize' {
  const dialog = env.topDialog();
  if (dialog) {
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    return 'dialog';
  }
  if (canGoBack) {
    env.back();
    return 'back';
  }
  env.minimize();
  return 'minimize';
}
