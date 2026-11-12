/**
 * Four signs, scored on the same features the ASL fingerspelling coach uses: total bend per finger,
 * thumb geometry in the palm frame, the palm normal and the pointing direction. Each score is 0..1
 * and soft, so a sign degrades gracefully instead of flickering. The four are built from the two
 * cues hand tracking gets right most often, "which fingers are open" and "is the palm flat to the
 * lens", and each looks nothing like the others: one open hand, a thumb up, two open hands, one
 * finger up.
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
  hands: 1 | 2;
  /** how to make it */
  hand: string;
  /** what the robot does */
  robot: string;
  /** how many of the last WINDOW frames must agree before it fires */
  need: number;
  cooldownMs: number;
  /** one-hand score; two-hand signs score through `pair` instead */
  score(f: ExtractedFeatures): number;
  pair?(a: ExtractedFeatures, b: ExtractedFeatures): number;
}

/** frames of history the stabilizer votes over (about a quarter second at 30 fps) */
export const WINDOW = 8;

const ext = (f: ExtractedFeatures, k: Finger) => 1 - smooth(f.bend[k], 65, 120);
const cur = (f: ExtractedFeatures, k: Finger) => smooth(f.bend[k], 95, 150);
const fingersOpen = (f: ExtractedFeatures) => Math.min(ext(f, 'index'), ext(f, 'middle'), ext(f, 'ring'), ext(f, 'pinky'));
const fingersCurled = (f: ExtractedFeatures) => Math.min(cur(f, 'index'), cur(f, 'middle'), cur(f, 'ring'), cur(f, 'pinky'));
const thumbExt = (f: ExtractedFeatures) => 1 - smooth(f.thumb.bend, 60, 110);
/** palm or back of the hand squarely toward the lens; either side counts, so handedness cannot break it */
const flatToCamera = (f: ExtractedFeatures) => smooth(Math.abs(f.palmNormal.z), 0.12, 0.45);
/** one open hand facing the lens: the STOP shape */
export const openHand = (f: ExtractedFeatures) => fingersOpen(f) * flatToCamera(f);
/** the index points roughly at the ceiling (pointing.angle is 0 up, 90 right, 180 down) */
const indexUp = (f: ExtractedFeatures) => 1 - smooth(Math.min(f.pointing.angle, 360 - f.pointing.angle), 40, 75);

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
    name: 'STOP', label: 'STOP', emoji: '✋', hands: 1, hand: 'one flat hand toward the camera', robot: 'freezes, light red, needs GO', need: 3, cooldownMs: 1200,
    score: openHand,
  },
  {
    name: 'GO', label: 'GO', emoji: '👍', hands: 1, hand: 'thumbs up', robot: 'resumes', need: 5, cooldownMs: 1200,
    score: (f) => fingersCurled(f) * thumbUp(f),
  },
  {
    name: 'SLOW', label: 'SLOW', emoji: '🙌', hands: 2, hand: 'both hands up, open, toward the camera', robot: 'runs at a third of its speed', need: 5, cooldownMs: 1200,
    score: () => 0,
    pair: (a, b) => Math.min(openHand(a), openHand(b)),
  },
  {
    name: 'GIVE', label: 'GIVE ME', emoji: '☝️', hands: 1, hand: 'one finger up, like "one, please"', robot: 'brings you the next part and holds it out', need: 5, cooldownMs: 2500,
    score: (f) => ext(f, 'index') * Math.min(cur(f, 'middle'), cur(f, 'ring'), cur(f, 'pinky')) * indexUp(f),
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

/**
 * Classify what is in view: one or two hands. A one-hand sign counts from whichever hand makes it
 * best. Two open hands are SLOW and outrank the STOP each of them would score alone.
 */
export function classify(hands: ExtractedFeatures[], minScore = 0.45, margin = 0.1): Classification {
  const scores: Record<SignName, number> = { STOP: 0, GO: 0, SLOW: 0, GIVE: 0 };
  for (const s of SIGNS) {
    if (s.hands === 2) { if (hands.length >= 2 && s.pair) scores[s.name] = s.pair(hands[0], hands[1]); }
    else for (const h of hands) scores[s.name] = Math.max(scores[s.name], s.score(h));
  }
  if (scores.SLOW >= minScore) scores.STOP *= 1 - scores.SLOW;
  let best: SignName = 'STOP', bs = -1, second = -1;
  for (const s of SIGNS) {
    const v = scores[s.name];
    if (v > bs) { second = bs; bs = v; best = s.name; } else if (v > second) second = v;
  }
  const confident = bs >= minScore && bs - second >= margin;
  return { name: confident ? best : null, best, score: bs, scores };
}

export const SPEC: Record<SignName, SignSpec> = Object.fromEntries(SIGNS.map((s) => [s.name, s])) as Record<SignName, SignSpec>;
