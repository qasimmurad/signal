/**
 * A 5-DOF arm with SO-101 proportions: base yaw, shoulder pitch, elbow pitch, wrist pitch, wrist roll.
 * The tool always points straight down, so every grasp is top-down. IK is analytic: yaw from the
 * target's bearing, a planar two-link solve for shoulder and elbow to put the wrist one tool-length
 * above the tip, and a wrist pitch that keeps the tool vertical. Joints move toward the solution at
 * a bounded rate, so the tip lags the target like a real arm.
 */
import { type V3, v3, clamp } from './vec';

export const LINK = { base: 0.06, upper: 0.15, fore: 0.15, tool: 0.07 } as const;

/** [yaw, shoulder, elbow, wristPitch, roll] in radians */
export type Joints = [number, number, number, number, number];

export interface FK { base: V3; shoulder: V3; elbow: V3; wrist: V3; tip: V3 }

const planarToWorld = (r: number, y: number, yaw: number): V3 => v3(r * Math.sin(yaw), y, -r * Math.cos(yaw));
const TOOL_ANGLE = -Math.PI / 2; // straight down

export function forward(j: Joints): FK {
  const [yaw, a1, a2, a3] = j;
  const sR = 0, sY = LINK.base;
  const eR = sR + LINK.upper * Math.cos(a1), eY = sY + LINK.upper * Math.sin(a1);
  const wR = eR + LINK.fore * Math.cos(a1 + a2), wY = eY + LINK.fore * Math.sin(a1 + a2);
  const tR = wR + LINK.tool * Math.cos(a1 + a2 + a3), tY = wY + LINK.tool * Math.sin(a1 + a2 + a3);
  return {
    base: v3(0, 0, 0),
    shoulder: planarToWorld(sR, sY, yaw),
    elbow: planarToWorld(eR, eY, yaw),
    wrist: planarToWorld(wR, wY, yaw),
    tip: planarToWorld(tR, tY, yaw),
  };
}

export interface IKResult { joints: Joints; reachable: boolean }

/** Solve for a vertical tool whose tip is at p. Out-of-reach targets give the nearest reachable pose. */
export function inverse(p: V3, roll = 0): IKResult {
  const yaw = Math.atan2(p.x, -p.z);
  let r = Math.hypot(p.x, p.z);
  let reachable = true;
  if (r < 0.05) { r = 0.05; reachable = false; }
  const dx = r, dy = p.y + LINK.tool - LINK.base; // wrist sits one tool length above the tip
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
  const a3 = TOOL_ANGLE - (a1 + a2);
  return { joints: [yaw, a1, a2, a3, roll], reachable };
}

export class Arm {
  joints: Joints;
  /** rad/s per joint */
  maxRate = 2.2;
  constructor(initial?: Joints) {
    this.joints = initial ?? inverse(v3(0, 0.14, -0.16)).joints;
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
