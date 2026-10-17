import { describe, expect, it } from 'vitest';
import { platformOf } from './platform';

const PIXEL_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// iPadOS in desktop mode sends a Mac's user agent; only its touch screen gives it away.
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('platformOf', () => {
  it('knows an Android phone', () => {
    expect(platformOf(PIXEL_CHROME)).toBe('android');
  });

  it('knows an iPhone and an iPad', () => {
    expect(platformOf(IPHONE_SAFARI)).toBe('ios');
    expect(platformOf(IPAD_SAFARI)).toBe('ios');
  });

  it('knows an iPad in desktop mode by its touch screen, and a Mac by the lack of one', () => {
    expect(platformOf(MAC_SAFARI, 5)).toBe('ios');
    expect(platformOf(MAC_SAFARI, 0)).toBe('other');
    expect(platformOf(MAC_SAFARI)).toBe('other');
  });

  it('calls a computer, or anything unknown, other', () => {
    expect(platformOf(WINDOWS_CHROME)).toBe('other');
    expect(platformOf('')).toBe('other');
  });
});
