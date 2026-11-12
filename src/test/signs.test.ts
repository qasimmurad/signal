import { describe, it, expect } from 'vitest';
import { classify } from '../signs/vocabulary';
import { Stabilizer } from '../signs/recognizer';
import type { ExtractedFeatures } from '../vision/features';

/** build a feature set from the few numbers the sign specs read */
function feats(o: { bends: [number, number, number, number]; thumbBend?: number; thumbDirV?: number; thumbV?: number; tipsV?: number; nz?: number; ny?: number; thumbIndex?: number }): ExtractedFeatures {
  const [i, m, r, p] = o.bends;
  const tv = o.tipsV ?? 1.6;
  return {
    curl: { index: 'extended', middle: 'extended', ring: 'extended', pinky: 'extended' },
    bend: { index: i, middle: m, ring: r, pinky: p },
    thumb: { curl: 'extended', bend: o.thumbBend ?? 30, position: 'other', scores: {} },
    palmFacing: 'forward', palmNormal: { x: 0, y: o.ny ?? 0, z: o.nz ?? -0.8 },
    fingerDirection: 'up', pointing: { angle: 0, forward: 0, dir: 'up' },
    spread: { 'index-middle': 10, 'middle-ring': 10, 'ring-pinky': 10 },
    touch: { 'thumb-index': o.thumbIndex ?? 1.0, 'thumb-middle': 1, 'thumb-ring': 1, 'thumb-pinky': 1, 'index-middle': 0.3 },
    crossed: '', palmWidth: 0.08, hand: 'Right',
    thumbLocal: { u: 0.5, v: o.thumbV ?? 0.8, n: 0 },
    thumbDir: { u: 0.3, v: o.thumbDirV ?? 0.2, n: 0 },
    tipsV: { index: tv, middle: tv, ring: tv, pinky: tv },
  };
}

describe('sign vocabulary', () => {
  it('reads a flat hand toward the camera as STOP, either side', () => {
    expect(classify(feats({ bends: [20, 25, 20, 30], nz: -0.8 })).name).toBe('STOP');
    expect(classify(feats({ bends: [20, 25, 20, 30], nz: 0.7 })).name).toBe('STOP');
    expect(classify(feats({ bends: [20, 25, 20, 30], nz: 0.05 })).name).toBeNull(); // edge-on: not a stop
  });
  it('tolerates a relaxed open hand', () => {
    expect(classify(feats({ bends: [60, 55, 50, 65], nz: -0.6 })).name).toBe('STOP');
  });
  it('reads a thumbs up as GO and a plain fist as nothing', () => {
    expect(classify(feats({ bends: [200, 210, 220, 200], thumbBend: 25, thumbDirV: 0.9, thumbV: 1.4, tipsV: 0.7 })).name).toBe('GO');
    expect(classify(feats({ bends: [200, 210, 220, 200], thumbBend: 100, thumbDirV: -0.2, thumbV: 0.9, tipsV: 0.7 })).name).toBeNull();
  });
  it('still reads GO when the fingers are only loosely curled', () => {
    expect(classify(feats({ bends: [150, 160, 170, 160], thumbBend: 40, thumbDirV: 0.8, thumbV: 1.3, tipsV: 0.9 })).name).toBe('GO');
  });
  it('reads a pinch as SLOW', () => {
    expect(classify(feats({ bends: [120, 150, 160, 160], thumbIndex: 0.2 })).name).toBe('SLOW');
  });
  it('reads an open palm facing up as GIVE, even slightly cupped, and never a palm-up fist', () => {
    expect(classify(feats({ bends: [30, 30, 30, 30], ny: -0.85, nz: 0.1 })).name).toBe('GIVE');
    expect(classify(feats({ bends: [80, 85, 90, 80], ny: -0.75, nz: 0.2 })).name).toBe('GIVE');
    expect(classify(feats({ bends: [200, 200, 200, 200], thumbBend: 100, ny: -0.85, nz: 0.1, tipsV: 0.7 })).name).toBeNull();
  });
  it('a tilted open hand never reads as GIVE: STOP wins or nothing fires', () => {
    expect(classify(feats({ bends: [30, 30, 30, 30], ny: -0.5, nz: -0.5 })).name).not.toBe('GIVE');
  });
  it('names the nearest sign even when not confident', () => {
    const c = classify(feats({ bends: [110, 110, 110, 110] }));
    expect(c.name).toBeNull();
    expect(c.best).toBeDefined();
  });
});

describe('stabilizer', () => {
  it('fires STOP once 3 recent frames agree and remembers when the sign was first seen', () => {
    const s = new Stabilizer();
    expect(s.update('STOP', 100).fired).toBeNull();
    expect(s.update('STOP', 133).fired).toBeNull();
    const r = s.update('STOP', 166);
    expect(r.fired).toBe('STOP');
    expect(r.firstSeenMs).toBe(100);
    expect(s.update('STOP', 200).fired).toBeNull();
  });
  it('survives a dropped frame in the middle of a GO', () => {
    const s = new Stabilizer();
    const seq: Array<'GO' | null> = ['GO', 'GO', null, 'GO', 'GO', 'GO'];
    let fired: string | null = null;
    seq.forEach((n, i) => { fired = s.update(n, i * 33).fired ?? fired; });
    expect(fired).toBe('GO');
  });
  it('re-fires after the hand leaves the sign and the cooldown passes', () => {
    const s = new Stabilizer();
    for (let i = 0; i < 6; i++) s.update('GO', i * 33);
    for (let i = 0; i < 10; i++) s.update(null, 300 + i * 33);
    let fired: string | null = null;
    for (let i = 0; i < 6; i++) fired = s.update('GO', 700 + i * 33).fired ?? fired;
    expect(fired).toBeNull(); // still inside the 1200 ms cooldown
    for (let i = 0; i < 10; i++) s.update(null, 1000 + i * 33);
    for (let i = 0; i < 6; i++) fired = s.update('GO', 1600 + i * 33).fired ?? fired;
    expect(fired).toBe('GO');
  });
});
