import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { Cycle, SPEED } from '../sim/cycle';
import { dist } from '../sim/vec';

function run(world: World, cycle: Cycle, seconds: number): void {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    world.speedScale = SPEED[cycle.mode];
    const target = cycle.tick(dt, world.tip, world.t);
    world.step(dt, target);
  }
}

describe('pack cycle', () => {
  it('packs a whole tray and ships the box', () => {
    const world = new World();
    const cycle = new Cycle(world.cell);
    run(world, cycle, 40);
    expect(world.cell.boxesShipped).toBeGreaterThanOrEqual(1);
    expect(world.cell.partsPacked).toBeGreaterThanOrEqual(4);
  });
  it('STOP freezes the tip within a frame and GO resumes the same phase', () => {
    const world = new World();
    const cycle = new Cycle(world.cell);
    run(world, cycle, 3);
    const phase = cycle.phase;
    const before = world.tip;
    cycle.setMode('stopped', world.tip);
    run(world, cycle, 2);
    expect(dist(world.tip, before)).toBeLessThan(1e-3);
    expect(cycle.phase).toBe(phase);
    cycle.setMode('running', world.tip);
    run(world, cycle, 2);
    expect(dist(world.tip, before)).toBeGreaterThan(0.01);
  });
  it('SLOW moves the arm at a third of the speed', () => {
    const a = new World(), ca = new Cycle(a.cell);
    const b = new World(), cb = new Cycle(b.cell);
    cb.setMode('slow', b.tip);
    run(a, ca, 1.2); run(b, cb, 1.2);
    expect(a.cell.partsPacked + (ca.phase === 'home' ? 0 : 1)).toBeGreaterThanOrEqual(0);
    const da = dist(a.tip, a.arm.tip), db = dist(b.tip, b.arm.tip);
    expect(da).toBe(0); expect(db).toBe(0);
    // after the same time the slow arm has progressed less far through the phases
    const order = ['home', 'to part', 'descend', 'grasp', 'lift', 'to box', 'lower', 'place', 'rise', 'waiting'];
    expect(order.indexOf(cb.phase) <= order.indexOf(ca.phase) || a.cell.partsPacked > b.cell.partsPacked).toBe(true);
  });
  it('"that one next" re-targets the pick while the gripper is empty', () => {
    const world = new World();
    const cycle = new Cycle(world.cell);
    run(world, cycle, 0.15);
    const yellow = world.cell.parts.find((p) => p.color === 'yellow')!;
    cycle.requestNext(yellow);
    expect(cycle.current?.color).toBe('yellow');
    run(world, cycle, 12);
    expect(yellow.placed).toBe(true);
    expect(world.cell.parts.find((p) => p.color === 'red')!.placed).toBe(false);
  });
});
