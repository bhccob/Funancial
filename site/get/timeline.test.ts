import { describe, expect, it } from 'vitest';
import { caption, INTRO_END, OUTRO_START, STOP_LENGTH, timeline } from './timeline';

/** The scroll position `fraction` of the way through stop `stop`. */
const at = (stop: number, fraction: number) => INTRO_END + STOP_LENGTH * (stop + fraction);

describe('timeline', () => {
  it('starts with nothing done', () => {
    expect(timeline(0)).toEqual({ intro: 0, outro: 0, stop: 0, hold: 0, slide: 0, local: 0 });
  });

  it('finishes the intro at 0.08', () => {
    expect(timeline(INTRO_END).intro).toBe(1);
    expect(timeline(INTRO_END / 2).intro).toBeCloseTo(0.5);
  });

  it('gives each stop 0.19, a quarter of it turning and the rest holding', () => {
    const t = timeline(INTRO_END + 0.19 * 1.5);
    expect(t.stop).toBe(1);
    expect(t.hold).toBeCloseTo(0.333, 2);
    expect(timeline(at(2, 0.25)).hold).toBeCloseTo(0);
    expect(timeline(at(2, 1 - 1e-9)).hold).toBeCloseTo(1);
  });

  it('reaches each stop in turn', () => {
    expect([0, 1, 2, 3].map((n) => timeline(at(n, 0.5)).stop)).toEqual([0, 1, 2, 3]);
  });

  it('slides to the next screen only at the end of a stop', () => {
    expect(timeline(at(1, 0.25)).slide).toBe(0);
    expect(timeline(at(1, 0.78)).slide).toBeCloseTo(0);
    expect(timeline(at(1, 0.9)).slide).toBeGreaterThan(0);
    expect(timeline(at(1, 1 - 1e-9)).slide).toBeCloseTo(1);
  });

  it('never slides after the last stop, where the phone turns instead', () => {
    expect(timeline(OUTRO_START).stop).toBe(3);
    expect(timeline(OUTRO_START).slide).toBe(0);
    expect(timeline(at(3, 0.9)).slide).toBe(0);
  });

  it('runs the outro from 0.84 to 1', () => {
    expect(timeline(OUTRO_START).outro).toBe(0);
    expect(timeline(0.92).outro).toBeCloseTo(0.5);
    expect(timeline(1).outro).toBe(1);
  });

  it('clamps scroll positions outside 0 to 1', () => {
    expect(timeline(-0.5)).toEqual(timeline(0));
    expect(timeline(1.5)).toEqual(timeline(1));
  });
});

describe('caption', () => {
  it('shows only the caption of the stop the story is at', () => {
    const t = timeline(at(2, 0.5));
    expect([0, 1, 2, 3].map((n) => caption(t, n))).toEqual([0, 0, 1, 0]);
  });

  it('fades in from 18% of a stop and out from 80%', () => {
    expect(caption(timeline(at(1, 0.1)), 1)).toBe(0);
    expect(caption(timeline(at(1, 0.255)), 1)).toBeCloseTo(0.5);
    expect(caption(timeline(at(1, 0.86)), 1)).toBeCloseTo(0.5);
    expect(caption(timeline(at(1, 0.95)), 1)).toBe(0);
  });

  it('shows no caption in the intro or the outro', () => {
    for (const p of [0, 0.04, INTRO_END, OUTRO_START, 0.95, 1]) {
      const t = timeline(p);
      expect(
        [0, 1, 2, 3].map((n) => caption(t, n)),
        String(p),
      ).toEqual([0, 0, 0, 0]);
    }
  });
});
