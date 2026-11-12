/**
 * Four one-handed signs, scored on the same features the ASL fingerspelling coach uses: total bend
 * per finger, thumb geometry in the palm frame, the palm normal and fingertip contacts.
 * Each score is 0..1 and soft, so a sign degrades gracefully instead of flickering. Each sign is
 * built to look nothing like the other three: open hand to the lens, thumb up, pinch, palm up.
 */
import type { ExtractedFeatures } from '../vision/features';
import { smooth } from '../vision/landmarks';

export type SignName = 'STOP' | 'GO' | 'SLOW' | 'GIVE';
type Finger = 'index' | 'middle' | 'ring' | 'pinky';

export interface SignSpec {
  name: SignName;
  /** what the screen calls it */
  label: string;
  emoji: string;
  /** how to make it */
  hand: string;
  /** what the robot does */
  robot: string;
  /** how many of the last WINDOW frames must agree before it fires */
  need: number;
  cooldownMs: number;
  score(f: ExtractedFeatures): number;
}

/** frames of history the stabilizer votes over (about a quarter second at 30 fps) */
export const WINDOW = 8;

const ext = (f: ExtractedFeatures, k: Finger) => 1 - smooth(f.bend[k], 65, 120);
/** looser: a cupped "give me" hand still counts as open */
const openish = (f: ExtractedFeatures, k: Finger) => 1 - smooth(f.bend[k], 95, 150);
const cur = (f: ExtractedFeatures, k: Finger) => smooth(f.bend[k], 95, 150);
const fingersOpen = (f: ExtractedFeatures) => Math.min(ext(f, 'index'), ext(f, 'middle'), ext(f, 'ring'), ext(f, 'pinky'));
const fingersOpenish = (f: ExtractedFeatures) => Math.min(openish(f, 'index'), openish(f, 'middle'), openish(f, 'ring'), openish(f, 'pinky'));
const fingersCurled = (f: ExtractedFeatures) => Math.min(cur(f, 'index'), cur(f, 'middle'), cur(f, 'ring'), cur(f, 'pinky'));
const thumbExt = (f: ExtractedFeatures) => 1 - smooth(f.thumb.bend, 60, 110);
const pinched = (f: ExtractedFeatures) => 1 - smooth(f.touch['thumb-index'], 0.3, 0.5);
/** palm or back of the hand squarely toward the lens; either side counts, so handedness cannot break STOP */
const flatToCamera = (f: ExtractedFeatures) => smooth(Math.abs(f.palmNormal.z), 0.12, 0.45);
/** palm facing the ceiling (MediaPipe's world y points down, so an upward normal is negative y) */
const palmUp = (f: ExtractedFeatures) => smooth(-f.palmNormal.y, 0.3, 0.65);

/**
 * Thumbs up, from geometry rather than a learned score: the thumb is straight, runs up the palm
 * axis, and its tip is the highest point of the hand, above every curled fingertip.
 */
export function thumbUp(f: ExtractedFeatures): number {
  const topFinger = Math.max(f.tipsV.index, f.tipsV.middle, f.tipsV.ring, f.tipsV.pinky);
  const above = smooth(f.thumbLocal.v - topFinger, 0.0, 0.25);
  const along = smooth(f.thumbDir.v, 0.4, 0.75);
  return thumbExt(f) * Math.max(along * above, 0.8 * (f.thumb.scores.extended_up ?? 0));
}

export const SIGNS: readonly SignSpec[] = [
  {
    name: 'STOP', label: 'STOP', emoji: '✋', hand: 'flat hand toward the camera', robot: 'freezes, light red, needs GO', need: 3, cooldownMs: 1200,
    score: (f) => fingersOpen(f) * flatToCamera(f),
  },
  {
    name: 'GO', label: 'GO', emoji: '👍', hand: 'thumbs up', robot: 'resumes', need: 5, cooldownMs: 1200,
    score: (f) => fingersCurled(f) * thumbUp(f),
  },
  {
    name: 'SLOW', label: 'SLOW', emoji: '🤏', hand: 'thumb and index pinched', robot: 'runs at a third of its speed', need: 5, cooldownMs: 1200,
    score: (f) => pinched(f) * (1 - 0.6 * ext(f, 'index')),
  },
  {
    name: 'GIVE', label: 'GIVE ME', emoji: '🫴', hand: 'open palm facing up', robot: 'brings you the next part and holds it out', need: 5, cooldownMs: 2500,
    score: (f) => fingersOpenish(f) * palmUp(f) * (1 - pinched(f)),
  },
];

export interface Classification {
  /** the sign we are confident in, or null */
  name: SignName | null;
  /** the best-scoring sign even when not confident, for coaching the operator */
  best: SignName;
  score: number;
  scores: Record<SignName, number>;
}

export function classify(f: ExtractedFeatures, minScore = 0.45, margin = 0.1): Classification {
  const scores = {} as Record<SignName, number>;
  let best: SignSpec = SIGNS[0], bs = -1, second = -1;
  for (const s of SIGNS) {
    const v = s.score(f);
    scores[s.name] = v;
    if (v > bs) { second = bs; bs = v; best = s; } else if (v > second) second = v;
  }
  const confident = bs >= minScore && bs - second >= margin;
  return { name: confident ? best.name : null, best: best.name, score: bs, scores };
}

export const SPEC: Record<SignName, SignSpec> = Object.fromEntries(SIGNS.map((s) => [s.name, s])) as Record<SignName, SignSpec>;
