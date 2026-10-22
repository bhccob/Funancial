/**
 * Frames are drawn as a 2px ring; `frame-none` (or anything unknown) has none. The prism border is the
 * one that is not a plain ring: `frame-prism` (index.css) draws a rainbow ring with a glass edge.
 */
const RINGS: Record<string, string> = {
  'frame-bronze': 'ring-2 ring-[#b0703c]',
  'frame-silver': 'ring-2 ring-[#a8adb7]',
  'frame-gold': 'ring-2 ring-[#d4a017]',
  'frame-platinum': 'ring-2 ring-[#8fb3c9]',
  'frame-diamond': 'ring-2 ring-[#4cc9f0]',
  'frame-prism': 'frame-prism',
  'frame-game': 'ring-2 ring-xp',
};

/** The classes of the ring a frame draws, or `undefined` for none. The avatar and badges wear it. */
export function frameRing(frame: string): string | undefined {
  return RINGS[frame];
}
