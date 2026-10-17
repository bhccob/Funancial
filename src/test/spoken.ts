/** What a reader hears of an element: its text without anything hidden from them, such as a logo. */
export function spoken(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
}
