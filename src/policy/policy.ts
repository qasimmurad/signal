/**
 * A scripted stand-in for a learned policy. It plans waypoints for a task, executes them against
 * the panel, and reports intent and confidence the way a VLA would surface them. Failure modes are
 * injected so the console has something real to correct:
 *   wrong_target  affordance confusion: confidently works the wrong module (BusyBox's hard case)
 *   drift         reaches a few centimetres off and pushes beside the control
 *   stall         freezes on approach and its confidence decays
 *   overshoot     knob or slider goes past the goal and the policy still reports success
 * Confidence is deliberately miscalibrated on wrong_target and overshoot, so the trust panel's
 * calibration readout has a real signal.
 */
import { type V3, v3, dist, copy } from '../sim/vec';
import { PANEL_Z, CONTACT_DEPTH, PRESS_DEPTH, BUTTON_COLORS, BUTTON_POS, SWITCH_POS, KNOB_POS, KNOB_RADIUS, KNOB_POSITIONS, sliderPos, type PanelState, type ButtonColor } from '../sim/panel';
import { type Task, goalMet, taskAnchor, taskLabel } from './tasks';

export type FailureMode = 'wrong_target' | 'drift' | 'stall' | 'overshoot';
export type PolicyStatus = 'idle' | 'running' | 'stuck' | 'claimed_done' | 'done';

export interface Waypoint { p: V3; label: string; hold?: number; slow?: boolean }

export interface Intent {
  task: Task | null;
  step: string;
  target: V3 | null;
  confidence: number;
  status: PolicyStatus;
  failure: FailureMode | null;
  /** what the policy would say if asked */
  note: string;
}

const APPROACH = 0.06;
const PRESS_Z = PANEL_Z + CONTACT_DEPTH - PRESS_DEPTH - 0.003;
const TOUCH_Z = PANEL_Z + 0.009;
const BASE_CONF: Record<Task['kind'], number> = { press: 0.92, switch: 0.84, knob: 0.76, slider: 0.8 };

/** seeded RNG so a demo run is reproducible */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const applicable: Record<Task['kind'], FailureMode[]> = {
  press: ['wrong_target', 'drift', 'stall'],
  switch: ['drift', 'stall'],
  knob: ['overshoot', 'stall'],
  slider: ['overshoot', 'drift'],
};

export function pickFailure(task: Task, chaos: number, rnd: () => number): FailureMode | null {
  if (rnd() >= chaos) return null;
  const opts = applicable[task.kind];
  return opts[Math.floor(rnd() * opts.length)];
}

/** Build the waypoint plan for a task, nominal or with a failure baked in. */
export function buildPlan(task: Task, s: PanelState, failure: FailureMode | null, rnd: () => number = Math.random): Waypoint[] {
  const off = (p: V3, dz: number) => v3(p.x, p.y, p.z + dz);
  const driftX = rnd() < 0.5 ? -0.03 : 0.03;
  switch (task.kind) {
    case 'press': {
      let color: ButtonColor = task.color;
      if (failure === 'wrong_target') {
        const others = BUTTON_COLORS.filter((c) => c !== task.color);
        color = others[Math.floor(rnd() * others.length)];
      }
      let b = copy(BUTTON_POS[color]);
      if (failure === 'drift') b = v3(b.x + driftX, b.y, b.z);
      const plan: Waypoint[] = [
        { p: off(b, APPROACH), label: `approach ${color}` },
        { p: v3(b.x, b.y, PRESS_Z), label: `press ${color}`, hold: 0.18, slow: true },
        { p: off(b, APPROACH), label: 'retreat' },
      ];
      if (failure === 'stall') return [plan[0], { p: off(b, APPROACH * 0.6), label: 'hesitating', hold: Infinity }];
      return plan;
    }
    case 'switch': {
      const dir = task.up ? 1 : -1;
      const x = SWITCH_POS.x + (failure === 'drift' ? driftX : 0);
      const start = v3(x, SWITCH_POS.y - dir * 0.034, TOUCH_Z);
      const end = v3(x, SWITCH_POS.y + dir * 0.034, TOUCH_Z);
      const plan: Waypoint[] = [
        { p: off(start, APPROACH), label: 'approach switch' },
        { p: start, label: 'touch lever', slow: true },
        { p: end, label: `sweep ${task.up ? 'up' : 'down'}`, slow: true },
        { p: off(end, APPROACH), label: 'retreat' },
      ];
      if (failure === 'stall') return [plan[0], { p: off(start, APPROACH * 0.5), label: 'hesitating', hold: Infinity }];
      return plan;
    }
    case 'knob': {
      let detents = task.to - s.knob;
      if (failure === 'overshoot') detents += detents >= 0 ? 1 : -1;
      if (task.to >= KNOB_POSITIONS - 1 && failure === 'overshoot') detents -= 2; // can't go past the end: undershoot instead
      const r = KNOB_RADIUS + 0.004;
      const a0 = Math.PI / 2;
      const sweep = -(detents * (Math.PI * 2 / KNOB_POSITIONS) + Math.sign(detents) * 0.15);
      const steps = Math.max(4, Math.abs(detents) * 8);
      const at = (a: number, z: number) => v3(KNOB_POS.x + r * Math.cos(a), KNOB_POS.y + r * Math.sin(a), z);
      const plan: Waypoint[] = [{ p: at(a0, PANEL_Z + APPROACH), label: 'approach knob' }, { p: at(a0, TOUCH_Z), label: 'touch rim', slow: true }];
      if (detents === 0) return [plan[0], { p: at(a0, PANEL_Z + APPROACH), label: 'already there' }];
      for (let i = 1; i <= steps; i++) plan.push({ p: at(a0 + (sweep * i) / steps, TOUCH_Z), label: `turn ${detents > 0 ? 'clockwise' : 'anticlockwise'}`, slow: true });
      plan.push({ p: at(a0 + sweep, PANEL_Z + APPROACH), label: 'retreat' });
      if (failure === 'stall') return [plan[0], { p: at(a0, PANEL_Z + APPROACH * 0.5), label: 'hesitating', hold: Infinity }];
      return plan;
    }
    case 'slider': {
      const h = sliderPos(s.slider);
      let goal = task.to;
      if (failure === 'overshoot') goal = goal + (goal >= s.slider ? 0.22 : -0.22);
      const g = sliderPos(goal);
      const y = SLIDER_YOFF(failure === 'drift' ? driftX : 0);
      const plan: Waypoint[] = [
        { p: v3(h.x, h.y + y, PANEL_Z + APPROACH), label: 'approach handle' },
        { p: v3(h.x, h.y + y, TOUCH_Z), label: 'grab handle', slow: true },
        { p: v3(g.x, h.y + y, TOUCH_Z), label: `drag to ${Math.round(task.to * 100)}%`, slow: true },
        { p: v3(g.x, h.y + y, PANEL_Z + APPROACH), label: 'retreat' },
      ];
      return plan;
    }
  }
}
/** drift on the slider is a vertical miss (the handle is a horizontal track) */
const SLIDER_YOFF = (d: number): number => d;

export class Policy {
  intent: Intent = { task: null, step: '', target: null, confidence: 0, status: 'idle', failure: null, note: 'idle' };
  private plan: Waypoint[] = [];
  private i = 0;
  private holdLeft = 0;
  private stepTime = 0;
  private retries = 0;
  private taskTime = 0;
  /** run the whole plan even if the goal is already met (a person pressing a lit button means toggle it) */
  private force = false;
  rnd: () => number;
  constructor(seed = 7) { this.rnd = mulberry32(seed); }

  get active(): boolean { return this.intent.status === 'running' || this.intent.status === 'stuck' || this.intent.status === 'claimed_done'; }

  start(task: Task, s: PanelState, chaos: number, opts: { force?: boolean } = {}): void {
    const failure = pickFailure(task, chaos, this.rnd);
    this.plan = buildPlan(task, s, failure, this.rnd);
    this.i = 0; this.holdLeft = 0; this.stepTime = 0; this.retries = 0; this.taskTime = 0;
    this.force = !!opts.force;
    this.intent = { task, step: this.plan[0]?.label ?? '', target: this.plan[0]?.p ?? null, confidence: BASE_CONF[task.kind], status: 'running', failure, note: `going to ${taskLabel(task)}` };
  }

  stop(): void { this.intent = { ...this.intent, status: 'idle', target: null, step: '', note: 'idle' }; this.plan = []; }

  /** One control step. Returns the target the policy wants this frame, or null when it is not driving. */
  tick(dt: number, tip: V3, s: PanelState): V3 | null {
    const it = this.intent;
    if (!it.task || it.status === 'idle' || it.status === 'done') return null;
    this.taskTime += dt;
    if (!this.force && goalMet(it.task, s)) { this.finish('done', 'goal met'); return null; }
    if (it.status === 'claimed_done') return null; // waiting: the console will notice the goal is not met
    if (it.status === 'stuck') {
      it.confidence = Math.max(0.08, it.confidence - dt * 0.12);
      return it.target;
    }
    const wp = this.plan[this.i];
    if (!wp) { this.afterPlan(s); return null; }
    this.stepTime += dt;
    it.step = wp.label; it.target = wp.p;
    const reached = dist(tip, wp.p) < 0.004;
    if (wp.hold === Infinity) { // stall: never advances, confidence bleeds out
      it.confidence = Math.max(0.1, it.confidence - dt * 0.25);
      if (this.stepTime > 1.6) this.markStuck('hesitating on approach');
      return wp.p;
    }
    if (reached) {
      if (wp.hold && this.holdLeft <= 0) this.holdLeft = wp.hold;
      if (wp.hold && this.holdLeft > 0) { this.holdLeft -= dt; if (this.holdLeft > 0) return wp.p; }
      this.i++; this.stepTime = 0;
      const next = this.plan[this.i];
      if (next) { it.step = next.label; it.target = next.p; }
      return next ? next.p : wp.p;
    }
    if (this.stepTime > 5) this.markStuck(`cannot reach ${wp.label}`);
    return wp.p;
  }

  private afterPlan(s: PanelState): void {
    const it = this.intent;
    if (!it.task) return;
    if (this.force) { this.finish('done', 'plan complete'); return; }
    if (goalMet(it.task, s)) { this.finish('done', 'goal met'); return; }
    if (it.failure === 'wrong_target' || it.failure === 'overshoot') {
      // confidently wrong: the policy believes it is done
      it.status = 'claimed_done'; it.step = 'reported success'; it.note = `reported success on ${taskLabel(it.task)}`;
      it.target = null;
      return;
    }
    if (this.retries < 1) { // try the same (wrong) thing once more, like a policy would
      this.retries++;
      this.plan = buildPlan(it.task, s, it.failure, this.rnd);
      this.i = 0; this.stepTime = 0;
      it.confidence = Math.max(0.2, it.confidence - 0.3);
      it.note = 'retrying';
      return;
    }
    this.markStuck('no effect after retry');
  }

  private markStuck(why: string): void {
    const it = this.intent;
    it.status = 'stuck'; it.note = `stuck: ${why}`; it.step = 'needs a nudge';
    it.confidence = Math.min(it.confidence, 0.35);
    it.target = this.plan[Math.min(this.i, this.plan.length - 1)]?.p ?? it.target;
  }

  private finish(status: PolicyStatus, note: string): void {
    this.intent = { ...this.intent, status, note, step: status === 'done' ? 'done' : this.intent.step, target: null };
    this.plan = [];
  }

  /**
   * Control returns from a human. If the goal is met the task is done. If the human parked the tool
   * near the right affordance, the confusion is treated as cleared and the policy replans nominally;
   * otherwise it carries on with what it was doing.
   */
  handback(tip: V3, s: PanelState): 'done' | 'replanned' | 'resumed' {
    const it = this.intent;
    if (!it.task) return 'resumed';
    if (goalMet(it.task, s)) { this.finish('done', 'goal met after a nudge'); return 'done'; }
    const near = dist(v3(tip.x, tip.y, 0), v3(taskAnchor(it.task, s).x, taskAnchor(it.task, s).y, 0)) < 0.035;
    if (near || it.status === 'stuck' || it.status === 'claimed_done') {
      this.plan = buildPlan(it.task, s, null, this.rnd);
      this.i = 0; this.stepTime = 0; this.holdLeft = 0; this.retries = 0;
      this.intent = { ...it, status: 'running', failure: null, confidence: Math.max(it.confidence, 0.7), step: this.plan[0].label, target: this.plan[0].p, note: 'replanned after a nudge' };
      return 'replanned';
    }
    it.status = 'running'; it.note = 'resumed';
    return 'resumed';
  }
}
