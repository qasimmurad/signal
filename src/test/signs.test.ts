import { describe, it, expect } from 'vitest';
import { classify } from '../signs/vocabulary';
import { Stabilizer } from '../signs/recognizer';
import type { ExtractedFeatures } from '../vision/features';

/** build a feature set from the few numbers the sign specs read */
function feats(o: { bends: [number, number, number, number]; thumbBend?: number; thumbUpScore?: number; thumbV?: number; nz?: number; thumbIndex?: number }): ExtractedFeatures {
  const [i, m, r, p] = o.bends;
  return {
    curl: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    bend: { index: i, middle: m, ring: r, pinky: p },
    thumb: { curl: 'extended', bend: o.thumbBend ?? 30, position: 'other', scores: { extended_up: o.thumbUpScore ?? 0 } },
    palmFacing: 'forward', palmNormal: { x: 0, y: 0, z: o.nz ?? -0.8 },
    fingerDirection: 'up', pointing: { angle: 0, forward: 0, dir: 'up' },
    spread: { 'index-middle': 10, 'middle-ring': 10, 'ring-pinky': 10 },
    touch: { 'thumb-index': o.thumbIndex ?? 1.0, 'thumb-middle': 1, 'thumb-ring': 1, 'thumb-pinky': 1, 'index-middle': 0.3 },
    crossed: '', palmWidth: 0.08, hand: 'Right', thumbLocal: { u: 0.5, v: o.thumbV ?? 0.8, n: 0 },
  };
}

describe('sign vocabulary', () => {
  it('reads a flat palm toward the camera as STOP', () => {
    expect(classify(feats({ bends: [20, 25, 20, 30], nz: -0.8 }))?.name).toBe('STOP');
    expect(classify(feats({ bends: [20, 25, 20, 30], nz: 0.6 }))).toBeNull(); // palm away: not a stop
  });
  it('reads a fist as HOLD and a thumbs up as GO', () => {
    expect(classify(feats({ bends: [180, 185, 190, 180], thumbBend: 100 }))?.name).toBe('HOLD');
    expect(classify(feats({ bends: [180, 185, 190, 180], thumbBend: 20, thumbUpScore: 0.9, thumbV: 1.5 }))?.name).toBe('GO');
  });
  it('reads a pinch as SLOW and a lone index as POINT', () => {
    expect(classify(feats({ bends: [120, 150, 160, 160], thumbIndex: 0.2 }))?.name).toBe('SLOW');
    expect(classify(feats({ bends: [25, 170, 175, 170], thumbIndex: 0.9 }))?.name).toBe('POINT');
  });
  it('returns nothing for an ambiguous hand', () => {
    expect(classify(feats({ bends: [90, 90, 90, 90] }))).toBeNull();
  });
});

describe('stabilizer', () => {
  it('fires STOP after 3 frames, once, and remembers when the sign was first seen', () => {
    const s = new Stabilizer();
    expect(s.update('STOP', 100).fired).toBeNull();
    expect(s.update('STOP', 133).fired).toBeNull();
    const r = s.update('STOP', 166);
    expect(r.fired).toBe('STOP');
    expect(r.firstSeenMs).toBe(100);
    expect(s.update('STOP', 200).fired).toBeNull();
  });
  it('respects the cooldown but re-fires after it', () => {
    const s = new Stabilizer();
    for (let i = 0; i < 6; i++) s.update('GO', i * 33);
    s.update(null, 300);
    for (let i = 0; i < 5; i++) expect(s.update('GO', 400 + i * 33).fired).toBeNull();
    expect(s.update('GO', 400 + 5 * 33).fired).toBeNull(); // within 1200ms cooldown
    s.update(null, 1500);
    let fired: string | null = null;
    for (let i = 0; i < 6; i++) fired = s.update('GO', 1600 + i * 33).fired ?? fired;
    expect(fired).toBe('GO');
  });
});
