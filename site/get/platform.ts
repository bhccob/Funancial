export type Platform = 'android' | 'ios' | 'other';

/** Which kind of device is looking at the page, from its user agent and, for iPads, its touch screen. */
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  // iPadOS in desktop mode sends a Mac's user agent. A Mac has no touch screen.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'other';
}
