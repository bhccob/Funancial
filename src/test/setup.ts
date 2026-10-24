import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  // A sign-up waiting on its emailed code is kept outside the screens, in memory and on the phone, so
  // a lock or a reload does not lose it: each test starts with none, whatever the last one left.
  // (Registered first, so it runs after the cleanup below has taken the screens down.)
  const { keepPendingCode } = await import('@/lib/pendingCode');
  afterEach(() => keepPendingCode(null));

  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  // jsdom may lack modal <dialog>; mimic the browser: open it and move focus inside, onto the first
  // control Tab could reach (as the browser's dialog focusing steps do), else the dialog itself.
  // A field's autoFocus can't do it: the field mounts while the dialog is still closed, out of
  // sight, where neither jsdom nor the browser lets it take focus.
  const proto = window.HTMLDialogElement?.prototype;
  if (proto && typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.open = true;
      const first = [
        ...this.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]',
        ),
      ].find(
        (el) =>
          el.tabIndex >= 0 &&
          !el.matches(':disabled, input[type="hidden"]') &&
          // Not inside a dialog nested in this one that is still closed.
          !el.closest('dialog:not([open])'),
      );
      (first ?? this).focus();
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
