import { describe, it, expect } from 'vitest';
import { forward, inverse, Arm, LINK } from '../sim/arm';
import { v3, dist } from '../sim/vec';

describe('arm kinematics', () => {
  it('round-trips FK(IK(p)) with the tool pointing straight down', () => {
    const targets = [v3(-0.12, 0.03, -0.14), v3(0.165, 0.03, -0.165), v3(-0.15, 0.12, -0.17), v3(0, 0.14, -0.16)];
    for (const p of targets) {
      const { joints, reachable } = inverse(p);
      expect(reachable).toBe(true);
      const fk = forward(joints);
      expect(dist(fk.tip, p)).toBeLessThan(1e-6);
      expect(Math.abs(fk.wrist.x - fk.tip.x)).toBeLessThan(1e-6);
      expect(Math.abs(fk.wrist.z - fk.tip.z)).toBeLessThan(1e-6);
      expect(fk.wrist.y - fk.tip.y).toBeCloseTo(LINK.tool, 6);
    }
  });
  it('clamps unreachable targets to the nearest reachable pose', () => {
    const { joints, reachable } = inverse(v3(0.4, 0.3, -0.4));
    expect(reachable).toBe(false);
    const tip = forward(joints).tip;
    expect(dist(tip, v3(0, LINK.base, 0))).toBeLessThan(LINK.upper + LINK.fore + LINK.tool + 1e-3);
  });
  it('moves toward a target at a bounded joint rate', () => {
    const arm = new Arm();
    const start = arm.tip;
    const target = v3(-0.12, 0.03, -0.14);
    arm.moveToward(target, 0.05);
    const after = arm.tip;
    expect(dist(after, target)).toBeLessThan(dist(start, target));
    expect(dist(after, target)).toBeGreaterThan(0.005);
    for (let i = 0; i < 100; i++) arm.moveToward(target, 0.05);
    expect(dist(arm.tip, target)).toBeLessThan(1e-3);
  });
});
