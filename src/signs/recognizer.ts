/**
 * Turns per-frame classifications into events: a sign fires once it has been seen for its stable
 * window and its cooldown has passed. The first frame of that window is kept, so reaction time can
 * be measured from the moment the hand was actually in the sign, not from when we admitted it.
 */
import type { HandFrame } from '../vision/types';
import { extractFeatures, type ExtractedFeatures } from '../vision/features';
import { INDEX_TIP } from '../vision/landmarks';
import { classify, SPEC, type SignName } from './vocabulary';

export interface Stable { fired: SignName | null; active: SignName | null; firstSeenMs: number | null; frames: number }

export class Stabilizer {
  private active: SignName | null = null;
  private frames = 0;
  private firstSeen: number | null = null;
  private firedFor: SignName | null = null;
  private lastFired: Partial<Record<SignName, number>> = {};

  update(name: SignName | null, nowMs: number): Stable {
    if (name !== this.active) { this.active = name; this.frames = 0; this.firstSeen = name ? nowMs : null; this.firedFor = null; }
    if (!name) return { fired: null, active: null, firstSeenMs: null, frames: 0 };
    this.frames++;
    let fired: SignName | null = null;
    const spec = SPEC[name];
    if (this.frames >= spec.stableFrames && this.firedFor !== name && nowMs - (this.lastFired[name] ?? -Infinity) >= spec.cooldownMs) {
      fired = name; this.firedFor = name; this.lastFired[name] = nowMs;
    }
    return { fired, active: name, firstSeenMs: this.firstSeen, frames: this.frames };
  }
}

export interface SignFrame extends Stable {
  score: number;
  scores: Partial<Record<SignName, number>>;
  /** index fingertip in mirrored, normalized image coords while pointing */
  pointer: { x: number; y: number } | null;
  features: ExtractedFeatures | null;
}

export class SignRecognizer {
  private stab = new Stabilizer();

  update(frames: HandFrame[], nowMs: number): SignFrame {
    const f = frames[0];
    if (!f) return { ...this.stab.update(null, nowMs), score: 0, scores: {}, pointer: null, features: null };
    const feats = extractFeatures(f);
    const c = classify(feats);
    const st = this.stab.update(c?.name ?? null, nowMs);
    const tip = f.landmarks[INDEX_TIP];
    const pointer = st.active === 'POINT' ? { x: 1 - tip.x, y: tip.y } : null;
    return { ...st, score: c?.score ?? 0, scores: c?.scores ?? {}, pointer, features: feats };
  }
}
