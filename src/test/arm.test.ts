import { describe, it, expect } from 'vitest';
import { forward, inverse, Arm, LINK } from '../sim/arm';
import { v3, dist } from '../sim/vec';

describe('arm kinematics', () => {
  it('round-trips FK(IK(p)) for reachable targets with a level tool', () => {
    const targets = [v3(0, 0.18, -0.2), v3(0.1, 0.25, -0.24), v3(-0.1, 0.1, -0.22), v3(0.05, 0.3, -0.15)];
    for (const p of targets) {
      const { joints, reachable } = inverse(p);
      expect(reachable).toBe(true);
      const fk = forward(joints);
      expect(dist(fk.tip, p)).toBeLessThan(1e-6);
      // level tool: wrist and tip share a height
      expect(Math.abs(fk.wrist.y - fk.tip.y)).toBeLessThan(1e-6);
    }
  });
  it('clamps unreachable targets to the nearest reachable pose', () => {
    const far = v3(0.4, 0.5, -0.4);
    const { joints, reachable } = inverse(far);
    expect(reachable).toBe(false);
    const tip = forward(joints).tip;
    expect(dist(tip, v3(0, LINK.base, 0))).toBeLessThan(LINK.upper + LINK.fore + LINK.tool + 1e-3);
  });
  it('moves toward a target at a bounded joint rate', () => {
    const arm = new Arm();
    const start = arm.tip;
    const target = v3(0.1, 0.25, -0.24);
    arm.moveToward(target, 0.05);
    const after = arm.tip;
    expect(dist(after, target)).toBeLessThan(dist(start, target));
    expect(dist(after, target)).toBeGreaterThan(0.005); // did not teleport
    for (let i = 0; i < 100; i++) arm.moveToward(target, 0.05);
    expect(dist(arm.tip, target)).toBeLessThan(1e-3);
  });
});
