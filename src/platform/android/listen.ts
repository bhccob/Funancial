/**
 * Adds a native listener and returns its unsubscribe. Capacitor adds and removes listeners
 * asynchronously, and either can fail; a failure is logged, never an unhandled rejection, because
 * a listener that did not attach must not take the app down.
 */
export function listen(add: () => Promise<{ remove(): Promise<void> }>, what: string): () => void {
  const handle = add().catch((e: unknown) => {
    console.error(`Could not listen for ${what}`, e);
    return null;
  });
  return () => {
    handle
      .then((h) => h?.remove())
      .catch((e: unknown) => console.error(`Could not stop listening for ${what}`, e));
  };
}
