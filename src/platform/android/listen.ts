/**
 * Adds a native listener that runs `cb`, and returns its unsubscribe. After the unsubscribe `cb`
 * never runs again. Capacitor removes a listener asynchronously, and by then the native side may
 * already have queued an event for it (the resume that woke the app, say), which would still
 * reach a component that has gone.
 *
 * Adding or removing can fail; a failure is logged, never an unhandled rejection, because a
 * listener that did not attach must not take the app down.
 */
export function listen<A extends unknown[]>(
  add: (handler: (...args: A) => void) => Promise<{ remove(): Promise<void> }>,
  cb: (...args: A) => void,
  what: string,
): () => void {
  let live = true;
  const handle = add((...args) => {
    if (live) cb(...args);
  }).catch((e: unknown) => {
    console.error(`Could not listen for ${what}`, e);
    return null;
  });
  return () => {
    live = false;
    handle
      .then((h) => h?.remove())
      .catch((e: unknown) => console.error(`Could not stop listening for ${what}`, e));
  };
}
