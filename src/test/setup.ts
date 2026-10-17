import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  // jsdom may lack modal <dialog>; mimic the browser: open it and move focus inside.
  const proto = window.HTMLDialogElement?.prototype;
  if (proto && typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.open = true;
      this.focus();
    };
    proto.close = function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  }

  // jsdom has no layout, so its scrollTo only logs "not implemented" on every route change.
  // A spec that cares about the scroll spies on it.
  window.scrollTo = () => {};
}
