/**
 * A 5-DOF arm with SO-101 proportions: base yaw, shoulder pitch, elbow pitch, wrist pitch, wrist roll.
 * IK is analytic: yaw from the target's bearing, a planar two-link solve for shoulder and elbow,
 * and a wrist pitch that keeps the tool level so it always approaches the panel straight on.
 * Joints move toward the solution at a bounded rate, so the tip lags the target like a real arm.
 */
import { type V3, v3, clamp } from './vec';

export const LINK = { base: 0.06, upper: 0.15, fore: 0.15, tool: 0.07 } as const;
export const MAX_REACH = LINK.upper + LINK.fore + LINK.tool;

/** [yaw, shoulder, elbow, wristPitch, roll] in radians */
export type Joints = [number, number, number, number, number];

export interface FK { base: V3; shoulder: V3; elbow: V3; wrist: V3; tip: V3 }

const planarToWorld = (r: number, y: number, yaw: number): V3 => v3(r * Math.sin(yaw), y, -r * Math.cos(yaw));

export function forward(j: Joints): FK {
  const [yaw, a1, a2, a3] = j;
  const base = v3(0, 0, 0);
  const sR = 0, sY = LINK.base;
  const eR = sR + LINK.upper * Math.cos(a1), eY = sY + LINK.upper * Math.sin(a1);
  const wR = eR + LINK.fore * Math.cos(a1 + a2), wY = eY + LINK.fore * Math.sin(a1 + a2);
  const tR = wR + LINK.tool * Math.cos(a1 + a2 + a3), tY = wY + LINK.tool * Math.sin(a1 + a2 + a3);
  return {
    base,
    shoulder: planarToWorld(sR, sY, yaw),
    elbow: planarToWorld(eR, eY, yaw),
    wrist: planarToWorld(wR, wY, yaw),
    tip: planarToWorld(tR, tY, yaw),
  };
}

export interface IKResult { joints: Joints; reachable: boolean }

/** Solve for a level tool tip at p. If p is out of reach the nearest reachable pose is returned. */
export function inverse(p: V3, roll = 0): IKResult {
  const yaw = Math.atan2(p.x, -p.z);
  let r = Math.hypot(p.x, p.z);
  let reachable = true;
  const minR = LINK.tool + 0.02;
  if (r < minR) { r = minR; reachable = false; }
  const wr = r - LINK.tool;
  const dx = wr, dy = p.y - LINK.base;
  let d = Math.hypot(dx, dy);
  const dMax = LINK.upper + LINK.fore - 1e-4;
  const dMin = Math.abs(LINK.upper - LINK.fore) + 1e-4;
  let sx = dx, sy = dy;
  if (d > dMax) { sx *= dMax / d; sy *= dMax / d; d = dMax; reachable = false; }
  if (d < dMin) { sx = dMin; sy = 0; d = dMin; reachable = false; }
  const cosInner = clamp((LINK.upper ** 2 + LINK.fore ** 2 - d * d) / (2 * LINK.upper * LINK.fore), -1, 1);
  const inner = Math.acos(cosInner);
  const cosShoulder = clamp((LINK.upper ** 2 + d * d - LINK.fore ** 2) / (2 * LINK.upper * d), -1, 1);
  const a1 = Math.atan2(sy, sx) + Math.acos(cosShoulder); // elbow-up configuration
  const a2 = -(Math.PI - inner);
  const a3 = -(a1 + a2); // keep the tool level
  return { joints: [yaw, a1, a2, a3, roll], reachable };
}

export class Arm {
  joints: Joints;
  /** rad/s per joint */
  maxRate = 2.4;
  constructor(initial?: Joints) {
    this.joints = initial ?? inverse(v3(0, 0.18, -0.16)).joints;
  }
  get pose(): FK { return forward(this.joints); }
  get tip(): V3 { return forward(this.joints).tip; }

  /** Step every joint toward the IK solution for `target`, bounded by maxRate * speedScale. */
  moveToward(target: V3, dt: number, speedScale = 1): IKResult {
    const sol = inverse(target, this.joints[4]);
    const step = this.maxRate * speedScale * dt;
    const next = this.joints.slice() as Joints;
    for (let i = 0; i < 5; i++) {
      const delta = sol.joints[i] - this.joints[i];
      next[i] = this.joints[i] + clamp(delta, -step, step);
    }
    this.joints = next;
    return sol;
  }
}
