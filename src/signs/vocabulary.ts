/**
 * Five one-handed signs, scored on the same features the ASL fingerspelling coach uses: total bend
 * per finger, thumb position scores in the palm frame, the palm normal and fingertip contacts.
 * Each score is 0..1 and soft, so a sign degrades gracefully instead of flickering.
 */
import type { ExtractedFeatures } from '../vision/features';
import { smooth } from '../vision/landmarks';

export type SignName = 'STOP' | 'HOLD' | 'GO' | 'SLOW' | 'POINT';

export interface SignSpec {
  name: SignName;
  emoji: string;
  /** how to make it */
  hand: string;
  /** what the robot does */
  robot: string;
  /** consecutive frames before it fires */
  stableFrames: number;
  cooldownMs: number;
  score(f: ExtractedFeatures): number;
}

const ext = (f: ExtractedFeatures, k: 'index' | 'middle' | 'ring' | 'pinky') => 1 - smooth(f.bend[k], 55, 105);
const cur = (f: ExtractedFeatures, k: 'index' | 'middle' | 'ring' | 'pinky') => smooth(f.bend[k], 110, 165);
const thumbExt = (f: ExtractedFeatures) => 1 - smooth(f.thumb.bend, 40, 85);
const pinched = (f: ExtractedFeatures) => 1 - smooth(f.touch['thumb-index'], 0.3, 0.5);
const facingCamera = (f: ExtractedFeatures) => smooth(-f.palmNormal.z, 0.1, 0.45);
const min4 = (a: number, b: number, c: number, d: number) => Math.min(a, b, c, d);

export const SIGNS: readonly SignSpec[] = [
  {
    name: 'STOP', emoji: '✋', hand: 'flat palm toward the camera', robot: 'freezes, light red, needs GO', stableFrames: 3, cooldownMs: 1200,
    score: (f) => min4(ext(f, 'index'), ext(f, 'middle'), ext(f, 'ring'), ext(f, 'pinky')) * facingCamera(f),
  },
  {
    name: 'HOLD', emoji: '✊', hand: 'fist', robot: 'pauses where it is', stableFrames: 6, cooldownMs: 1200,
    score: (f) => min4(cur(f, 'index'), cur(f, 'middle'), cur(f, 'ring'), cur(f, 'pinky')) * (1 - 0.9 * thumbUp(f)),
  },
  {
    name: 'GO', emoji: '👍', hand: 'thumbs up', robot: 'resumes', stableFrames: 6, cooldownMs: 1200,
    score: (f) => min4(cur(f, 'index'), cur(f, 'middle'), cur(f, 'ring'), cur(f, 'pinky')) * thumbUp(f),
  },
  {
    name: 'SLOW', emoji: '🤏', hand: 'thumb and index pinched', robot: 'runs at a third of its speed', stableFrames: 6, cooldownMs: 1200,
    score: (f) => pinched(f) * (1 - 0.6 * ext(f, 'index')),
  },
  {
    name: 'POINT', emoji: '☝️', hand: 'point at a part', robot: 'packs that one next', stableFrames: 4, cooldownMs: 0,
    score: (f) => ext(f, 'index') * Math.min(cur(f, 'middle'), cur(f, 'ring'), cur(f, 'pinky')) * (1 - pinched(f)),
  },
];

/** thumb clearly extended and sticking up the palm axis, past the knuckle line */
function thumbUp(f: ExtractedFeatures): number {
  const up = Math.max(f.thumb.scores.extended_up ?? 0, smooth(f.thumbLocal.v, 1.0, 1.35));
  return thumbExt(f) * smooth(up, 0.25, 0.65);
}

export interface Classification { name: SignName; score: number; scores: Record<SignName, number> }

export function classify(f: ExtractedFeatures, minScore = 0.5, margin = 0.12): Classification | null {
  const scores = {} as Record<SignName, number>;
  let best: SignSpec | null = null, bs = -1, second = -1;
  for (const s of SIGNS) {
    const v = s.score(f);
    scores[s.name] = v;
    if (v > bs) { second = bs; bs = v; best = s; } else if (v > second) second = v;
  }
  if (!best || bs < minScore || bs - second < margin) return null;
  return { name: best.name, score: bs, scores };
}

export const SPEC: Record<SignName, SignSpec> = Object.fromEntries(SIGNS.map((s) => [s.name, s])) as Record<SignName, SignSpec>;
