/**
 * Where the scroll story is, from how far down it the page has been scrolled. The numbers are the
 * approved spike's: an intro (the phone rises in), four stops, and an outro (the phone turns to its
 * back and steps aside for the download).
 */

export const INTRO_END = 0.08;
export const STOP_LENGTH = 0.19;
export const OUTRO_START = 0.84;

export interface Frame {
  /** 0 to 1 over the intro. */
  intro: number;
  /** 0 to 1 over the outro. */
  outro: number;
  /** The screen on show. During the outro it stays at the last. */
  stop: 0 | 1 | 2 | 3;
  /** 0 to 1 over the part of a stop after the turn, when its screen plays. */
  hold: number;
  /** 0 to 1 over the end of a stop, as the next screen takes over. Never in the last stop. */
  slide: number;
  /** 0 to 1 over the whole stop: the turn, then the hold. */
  local: number;
}

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/** The first quarter of a stop turns the phone; the rest holds. The last 22% slides to the next. */
const TURN = 0.25;
const SLIDE_FROM = 0.78;

/** The frame at scroll position `p`, 0 (top of the story) to 1 (its end). Other values clamp. */
export function timeline(p: number): Frame {
  const at = clamp(p);
  const m = clamp((at - INTRO_END) / (STOP_LENGTH * 4)) * 4;
  const stop = Math.min(3, Math.floor(m)) as Frame['stop'];
  const local = m - stop;
  return {
    intro: clamp(at / INTRO_END),
    outro: clamp((at - OUTRO_START) / (1 - OUTRO_START)),
    stop,
    hold: clamp((local - TURN) / (1 - TURN)),
    slide: stop < 3 ? clamp((local - SLIDE_FROM) / (1 - SLIDE_FROM)) : 0,
    local,
  };
}

/** How visible the caption of stop `n` is: in from 18% of its stop, out from 80%, off elsewhere. */
export function caption(frame: Frame, n: number): number {
  if (n !== frame.stop) return 0;
  return clamp((frame.local - 0.18) / 0.15) * (1 - clamp((frame.local - 0.8) / 0.12));
}
