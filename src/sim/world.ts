/** The world owns the arm and the cell and advances them one step at a time. */
import { Arm } from './arm';
import { Cell } from './cell';
import { type V3, v3, clamp, copy } from './vec';

export const BOUNDS = { min: v3(-0.24, 0.015, -0.26), max: v3(0.24, 0.26, -0.02) } as const;

export function clampToWorkspace(p: V3): V3 {
  return v3(clamp(p.x, BOUNDS.min.x, BOUNDS.max.x), clamp(p.y, BOUNDS.min.y, BOUNDS.max.y), clamp(p.z, BOUNDS.min.z, BOUNDS.max.z));
}

export class World {
  arm = new Arm();
  cell = new Cell();
  target: V3;
  speedScale = 1;
  reachable = true;
  t = 0;
  /** tip speed in m/s over the last step */
  tipSpeed = 0;

  constructor() { this.target = copy(this.arm.tip); }
  get tip(): V3 { return this.arm.tip; }

  step(dt: number, target: V3 | null): void {
    this.t += dt;
    if (target) this.target = clampToWorkspace(target);
    const before = this.arm.tip;
    const sol = this.arm.moveToward(this.target, dt, this.speedScale);
    this.reachable = sol.reachable;
    const after = this.arm.tip;
    this.tipSpeed = dt > 0 ? Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) / dt : 0;
    this.cell.step(after, this.t);
  }
}
