/**
 * The world owns the arm and the panel and advances them one step at a time. Whoever is driving
 * (policy, human, or nobody) hands in a target; the world clamps it to the workspace, applies the
 * safety speed scale, moves the arm, and lets the panel react to the tool tip.
 */
import { Arm } from './arm';
import { Panel, PANEL_Z, type PanelEvent } from './panel';
import { type V3, v3, clamp, copy } from './vec';

export type Controller = 'policy' | 'human' | 'idle';

export const BOUNDS = { min: v3(-0.2, 0.03, -0.3), max: v3(0.2, 0.32, -0.04) } as const;
/** the panel face is solid: the tip can sink into a module but not through the plate */
export const Z_FLOOR = PANEL_Z + 0.003;

export function clampToWorkspace(p: V3): { p: V3; clamped: boolean } {
  const q = v3(clamp(p.x, BOUNDS.min.x, BOUNDS.max.x), clamp(p.y, BOUNDS.min.y, BOUNDS.max.y), clamp(p.z, Math.max(BOUNDS.min.z, Z_FLOOR), BOUNDS.max.z));
  return { p: q, clamped: q.x !== p.x || q.y !== p.y || q.z !== p.z };
}

export class World {
  arm = new Arm();
  panel = new Panel();
  /** the commanded tip position after clamping */
  target: V3;
  controller: Controller = 'idle';
  /** 1 = full speed; the safety layer lowers it when a person is in the zone */
  speedScale = 1;
  reachable = true;
  clamped = false;
  t = 0;
  lastEvents: PanelEvent[] = [];

  constructor() { this.target = copy(this.arm.tip); }

  get tip(): V3 { return this.arm.tip; }

  step(dt: number, target: V3 | null, controller: Controller): void {
    this.t += dt;
    this.controller = controller;
    if (target) {
      const c = clampToWorkspace(target);
      this.target = c.p;
      this.clamped = c.clamped;
    }
    const sol = this.arm.moveToward(this.target, dt, this.speedScale);
    this.reachable = sol.reachable;
    this.lastEvents = this.panel.interact(this.arm.tip, this.t);
  }
}
