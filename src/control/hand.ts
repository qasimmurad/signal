/**
 * Webcam hand as a clutch. A pinch (thumb tip to index tip) takes the gripper; while pinched, the
 * hand's movement in the image moves the tip across the panel and moving the hand toward the camera
 * pushes it in. Letting go hands control back. A visible hand that is not pinching is treated as a
 * person in the workspace, which the safety layer uses to slow the arm.
 */
import type { HandFrame } from '../vision/types';
import { THUMB_TIP, INDEX_TIP, INDEX_MCP, PINKY_MCP, dist2 } from '../vision/landmarks';
import { type V3, v3 } from '../sim/vec';

export interface HandSignal {
  present: boolean;
  pinching: boolean;
  /** hand visible but not controlling */
  inZone: boolean;
  /** metres to add to the anchor target while pinching */
  delta: V3 | null;
  /** pinch point in mirrored, normalized image coords, for the overlay */
  cursor: { x: number; y: number } | null;
  /** 0..1 pinch tightness for the overlay */
  pinchAmount: number;
}

export class HandController {
  gainXY = 0.75;
  gainZ = 1.8;
  private pinchFrames = 0;
  private pinching = false;
  private anchor: { x: number; y: number; pw: number } | null = null;
  private smooth: V3 | null = null;
  lastFrame: HandFrame | null = null;

  update(frames: HandFrame[], _now: number): HandSignal {
    const f = frames[0];
    this.lastFrame = f ?? null;
    if (!f) {
      this.release();
      return { present: false, pinching: false, inZone: false, delta: null, cursor: null, pinchAmount: 0 };
    }
    const lm = f.landmarks;
    const pw = dist2(lm[INDEX_MCP], lm[PINKY_MCP]) || 1e-6;
    const pinchRatio = dist2(lm[THUMB_TIP], lm[INDEX_TIP]) / pw;
    const pinchAmount = Math.max(0, Math.min(1, 1 - (pinchRatio - 0.35) / 0.6));
    const tight = pinchRatio < 0.5, loose = pinchRatio > 0.72;
    if (!this.pinching) { this.pinchFrames = tight ? this.pinchFrames + 1 : 0; if (this.pinchFrames >= 3) this.pinching = true; }
    else if (loose) { this.pinching = false; this.pinchFrames = 0; }

    const mx = 1 - (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2; // mirrored so screen-right is +x
    const my = (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2;
    const cursor = { x: mx, y: my };

    if (!this.pinching) {
      this.anchor = null; this.smooth = null;
      return { present: true, pinching: false, inZone: true, delta: null, cursor, pinchAmount };
    }
    if (!this.anchor) this.anchor = { x: mx, y: my, pw };
    const raw = v3((mx - this.anchor.x) * this.gainXY, -(my - this.anchor.y) * this.gainXY, -(pw - this.anchor.pw) * this.gainZ);
    this.smooth = this.smooth ? v3(this.smooth.x + (raw.x - this.smooth.x) * 0.45, this.smooth.y + (raw.y - this.smooth.y) * 0.45, this.smooth.z + (raw.z - this.smooth.z) * 0.35) : raw;
    return { present: true, pinching: true, inZone: false, delta: this.smooth, cursor, pinchAmount };
  }

  release(): void { this.pinching = false; this.pinchFrames = 0; this.anchor = null; this.smooth = null; }
}
