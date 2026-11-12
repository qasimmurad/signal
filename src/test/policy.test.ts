import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { Policy, buildPlan, mulberry32 } from '../policy/policy';
import { goalMet, type Task } from '../policy/tasks';
import { parseInstruction, Agent } from '../policy/agent';
import { BUTTON_POS } from '../sim/panel';
import { v3 } from '../sim/vec';

function run(world: World, policy: Policy, seconds: number): void {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const target = policy.tick(dt, world.tip, world.panel.state);
    world.step(dt, target, target ? 'policy' : 'idle');
  }
}

describe('scripted policy', () => {
  const tasks: Task[] = [
    { kind: 'press', color: 'red' },
    { kind: 'switch', up: true },
    { kind: 'knob', to: 3 },
    { kind: 'slider', to: 0.75 },
  ];
  for (const task of tasks) {
    it(`completes "${task.kind}" with no failure injected`, () => {
      const world = new World();
      const policy = new Policy(1);
      policy.start(task, world.panel.state, 0);
      run(world, policy, 12);
      expect(goalMet(task, world.panel.state)).toBe(true);
      expect(policy.intent.status).toBe('done');
    });
  }
  it('a wrong_target plan works a different button and the policy claims success', () => {
    const world = new World();
    const policy = new Policy(3);
    policy.start({ kind: 'press', color: 'red' }, world.panel.state, 1);
    // force the failure for determinism
    (policy as any).plan = buildPlan({ kind: 'press', color: 'red' }, world.panel.state, 'wrong_target', mulberry32(2));
    policy.intent.failure = 'wrong_target';
    run(world, policy, 8);
    expect(world.panel.state.buttons.red).toBe(false);
    expect(Object.values(world.panel.state.buttons).some(Boolean)).toBe(true);
    expect(policy.intent.status).toBe('claimed_done');
    expect(policy.intent.confidence).toBeGreaterThan(0.8); // confidently wrong
  });
  it('a stalled policy gets stuck and its confidence decays; a nudge near the right button replans', () => {
    const world = new World();
    const policy = new Policy(5);
    policy.start({ kind: 'press', color: 'blue' }, world.panel.state, 0);
    (policy as any).plan = buildPlan({ kind: 'press', color: 'blue' }, world.panel.state, 'stall', mulberry32(2));
    policy.intent.failure = 'stall';
    run(world, policy, 5);
    expect(policy.intent.status).toBe('stuck');
    expect(policy.intent.confidence).toBeLessThan(0.4);
    const b = BUTTON_POS.blue;
    const r = policy.handback(v3(b.x + 0.01, b.y, b.z + 0.05), world.panel.state);
    expect(r).toBe('replanned');
    run(world, policy, 8);
    expect(world.panel.state.buttons.blue).toBe(true);
    expect(policy.intent.status).toBe('done');
  });
});

describe('agent', () => {
  const s = { buttons: { red: false, green: true, blue: false, yellow: false }, switchUp: false, knob: 1, slider: 0.2 };
  it('parses multi-step instructions', () => {
    expect(parseInstruction('press the red button, then flip the switch up and turn the knob to 4', s)).toEqual([
      { kind: 'press', color: 'red' }, { kind: 'switch', up: true }, { kind: 'knob', to: 4 },
    ]);
    expect(parseInstruction('set the slider to 70%', s)).toEqual([{ kind: 'slider', to: 0.7 }]);
    expect(parseInstruction('reset the panel', s)).toEqual([{ kind: 'press', color: 'green' }, { kind: 'knob', to: 0 }]);
    expect(parseInstruction('the blue one', s)).toEqual([{ kind: 'press', color: 'blue' }]);
  });
  it('holds risky steps for approval', () => {
    const a = new Agent();
    a.enqueue(parseInstruction('flip the switch up then press green', s), 'test');
    expect(a.next()).toBeNull();
    expect(a.waiting?.task.kind).toBe('switch');
    a.approve();
    expect(a.next()?.task.kind).toBe('switch');
  });
});
