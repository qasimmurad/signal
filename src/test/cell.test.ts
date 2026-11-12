import { describe, it, expect } from 'vitest';
import { Cell, TRAY_SLOTS, BOX, GRIP_OFFSET, PART } from '../sim/cell';
import { v3 } from '../sim/vec';

describe('packing cell', () => {
  it('grasps the part under the tip and carries it', () => {
    const c = new Cell();
    const s = TRAY_SLOTS[0];
    expect(c.grasp(v3(s.x, s.y + 0.1, s.z), 0)).toBeNull(); // too high
    const p = c.grasp(v3(s.x + 0.005, s.y + GRIP_OFFSET, s.z), 1);
    expect(p?.color).toBe('red');
    c.step(v3(0, 0.15, -0.1), 2);
    expect(p!.pos).toEqual(v3(0, 0.15 - GRIP_OFFSET, -0.1));
  });
  it('places a released part into the box and ships a full box', () => {
    const c = new Cell();
    for (let i = 0; i < 4; i++) {
      const s = TRAY_SLOTS[i];
      expect(c.grasp(v3(s.x, s.y + GRIP_OFFSET, s.z), i)).not.toBeNull();
      c.release(v3(BOX.center.x, 0.03, BOX.center.z), i + 0.5);
      c.step(v3(0, 0.1, 0), i + 0.6);
    }
    expect(c.boxesShipped).toBe(1);
    expect(c.partsPacked).toBe(4);
    expect(c.trayNo).toBe(2);
    expect(c.remaining).toHaveLength(4);
  });
  it('drops a part back on the tray when released elsewhere', () => {
    const c = new Cell();
    const s = TRAY_SLOTS[1];
    c.grasp(v3(s.x, s.y + GRIP_OFFSET, s.z), 0);
    const p = c.release(v3(-0.05, 0.08, -0.1), 1)!;
    expect(p.placed).toBe(false);
    expect(p.pos.y).toBeCloseTo(0.08 - GRIP_OFFSET, 6);
    expect(p.pos.y).toBeGreaterThanOrEqual(PART / 2);
  });
});
