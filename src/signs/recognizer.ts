/**
 * Turns per-frame classifications into events. The stabilizer votes over the last few frames, so
 * a dropped or noisy frame does not reset the count: a sign fires once enough of the recent frames
 * agree and its cooldown has passed, and stays fired until the hand leaves the sign. The earliest
 * agreeing frame is kept, so reaction time is measured from when the hand was actually in the sign.
 */
import type { HandFrame } from '../vision/types';
import { extractFeatures, type ExtractedFeatures } from '../vision/features';
import { classify, SPEC, WINDOW, type SignName } from './vocabulary';

export interface Stable { fired: SignName | null; active: SignName | null; firstSeenMs: number | null; frames: number }

export class Stabilizer {
  private hist: { name: SignName | null; t: number }[] = [];
  private firedFor: SignName | null = null;
  private lastFired: Partial<Record<SignName, number>> = {};

  update(name: SignName | null, nowMs: number): Stable {
    this.hist.push({ name, t: nowMs });
    if (this.hist.length > WINDOW) this.hist.shift();
    const counts = new Map<SignName, number>();
    for (const h of this.hist) if (h.name) counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
    let active: SignName | null = null, best = 0;
    for (const [k, v] of counts) if (v > best) { best = v; active = k; }
    if (this.firedFor && !counts.has(this.firedFor)) this.firedFor = null; // the hand left the sign
    if (!active || best < 2) return { fired: null, active: null, firstSeenMs: null, frames: 0 };
    const firstSeenMs = this.hist.find((h) => h.name === active)?.t ?? nowMs;
    let fired: SignName | null = null;
    const spec = SPEC[active];
    if (best >= spec.need && this.firedFor !== active && nowMs - (this.lastFired[active] ?? -Infinity) >= spec.cooldownMs) {
      fired = active; this.firedFor = active; this.lastFired[active] = nowMs;
    }
    return { fired, active, firstSeenMs, frames: best };
  }
}

export interface SignFrame extends Stable {
  score: number;
  scores: Partial<Record<SignName, number>>;
  /** best-scoring sign even when not confident, with its score, for coaching */
  nearest: { name: SignName; score: number } | null;
  features: ExtractedFeatures | null;
}

export class SignRecognizer {
  private stab = new Stabilizer();

  update(frames: HandFrame[], nowMs: number): SignFrame {
    const f = frames[0];
    if (!f) return { ...this.stab.update(null, nowMs), score: 0, scores: {}, nearest: null, features: null };
    const feats = extractFeatures(f);
    const c = classify(feats);
    const st = this.stab.update(c.name, nowMs);
    return { ...st, score: c.score, scores: c.scores, nearest: { name: c.best, score: c.score }, features: feats };
  }
}
