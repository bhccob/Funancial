/** Frames are drawn as a 2px ring; `frame-none` (or anything unknown) has none. */
const RINGS: Record<string, string> = {
  'frame-silver': 'ring-2 ring-[#a8adb7]',
  'frame-gold': 'ring-2 ring-[#d4a017]',
  'frame-game': 'ring-2 ring-xp',
};

/** The classes of the ring a frame draws, or `undefined` for none. The avatar and badges wear it. */
export function frameRing(frame: string): string | undefined {
  return RINGS[frame];
}
