/**
 * Records every task attempt as an episode: frames at a fixed rate, who was driving, what the policy
 * said it was doing and how sure it was, and every human intervention with an auto-written label
 * that says what went wrong and what the person did about it. Exports a LeRobot-shaped JSON so the
 * corrections can go straight into a training set and an evaluation table.
 */
import { type V3, sub, len } from '../sim/vec';
import { type PanelState, describeChange } from '../sim/panel';
import { type Task, taskLabel } from '../policy/tasks';
import type { FailureMode, Intent } from '../policy/policy';
import type { Controller } from '../sim/world';

export type Modality = 'hand' | 'voice' | 'dwell' | 'keyboard';
export type Outcome = 'success' | 'failed' | 'skipped' | 'open';
export type CompletedBy = 'policy' | 'human' | 'policy_after_nudge' | null;

export interface Frame {
  t: number;
  ctrl: Controller;
  target: [number, number, number] | null;
  tip: [number, number, number];
  joints: number[];
  conf: number;
  step: string;
}

export interface Intervention {
  tStart: number;
  tEnd: number;
  modality: Modality;
  policyStep: string;
  policyConf: number;
  policyFailure: FailureMode | null;
  startTip: [number, number, number];
  endTip: [number, number, number];
  movedCm: number;
  direction: string;
  panelChange: string[];
  label: string;
}

export interface Episode {
  index: number;
  task: Task;
  label: string;
  tStart: number;
  tEnd: number;
  outcome: Outcome;
  completedBy: CompletedBy;
  failureInjected: FailureMode | null;
  /** the policy reported success while the panel disagreed */
  claimedSuccess: boolean;
  interventions: Intervention[];
  frames: Frame[];
  meanConf: number;
}

const arr = (p: V3): [number, number, number] => [round(p.x), round(p.y), round(p.z)];
const round = (n: number, d = 4): number => Math.round(n * 10 ** d) / 10 ** d;

export function directionWords(d: V3): string {
  const w: string[] = [];
  if (Math.abs(d.x) > 0.01) w.push(d.x > 0 ? 'right' : 'left');
  if (Math.abs(d.y) > 0.01) w.push(d.y > 0 ? 'up' : 'down');
  if (Math.abs(d.z) > 0.01) w.push(d.z < 0 ? 'in toward the panel' : 'out from the panel');
  return w.length ? w.join(' and ') : 'barely';
}

export function interventionLabel(iv: Omit<Intervention, 'label'>, task: Task, outcomeNote: string): string {
  const dur = ((iv.tEnd - iv.tStart)).toFixed(1);
  const why = iv.policyFailure ? `, failure: ${iv.policyFailure.replace('_', ' ')}` : '';
  const change = iv.panelChange.length ? ` and ${iv.panelChange.join(', ')}` : '';
  return `Policy was "${iv.policyStep}" at confidence ${iv.policyConf.toFixed(2)}${why}. Human (${iv.modality}) took over for ${dur}s, moved the gripper ${iv.movedCm.toFixed(1)} cm ${iv.direction}${change}. ${outcomeNote}`;
}

export class Recorder {
  episodes: Episode[] = [];
  current: Episode | null = null;
  fps = 20;
  private acc = 0;
  private confSum = 0;
  private confN = 0;
  private open: (Omit<Intervention, 'tEnd' | 'endTip' | 'movedCm' | 'direction' | 'panelChange' | 'label'> & { panelAtStart: PanelState }) | null = null;

  startEpisode(task: Task, failure: FailureMode | null, t: number): Episode {
    const ep: Episode = {
      index: this.episodes.length, task, label: taskLabel(task), tStart: t, tEnd: t, outcome: 'open', completedBy: null,
      failureInjected: failure, claimedSuccess: false, interventions: [], frames: [], meanConf: 0,
    };
    this.episodes.push(ep);
    this.current = ep; this.acc = 0; this.confSum = 0; this.confN = 0;
    return ep;
  }

  frame(dt: number, t: number, ctrl: Controller, target: V3 | null, tip: V3, joints: number[], intent: Intent): void {
    const ep = this.current;
    if (!ep) return;
    this.acc += dt;
    if (this.acc < 1 / this.fps) return;
    this.acc = 0;
    ep.frames.push({ t: round(t, 3), ctrl, target: target ? arr(target) : null, tip: arr(tip), joints: joints.map((j) => round(j)), conf: round(intent.confidence, 3), step: intent.step });
    if (ctrl === 'policy') { this.confSum += intent.confidence; this.confN++; }
  }

  beginIntervention(t: number, modality: Modality, intent: Intent, tip: V3, panel: PanelState): void {
    if (!this.current || this.open) return;
    this.open = { tStart: t, modality, policyStep: intent.step || intent.note, policyConf: intent.confidence, policyFailure: intent.failure, startTip: arr(tip), panelAtStart: panel };
  }

  get interventionOpen(): boolean { return !!this.open; }

  endIntervention(t: number, tip: V3, panel: PanelState, outcomeNote: string): Intervention | null {
    const ep = this.current, o = this.open;
    if (!ep || !o) return null;
    const start = { x: o.startTip[0], y: o.startTip[1], z: o.startTip[2] };
    const d = sub(tip, start);
    const base = { ...o, tEnd: t, endTip: arr(tip), movedCm: len(d) * 100, direction: directionWords(d), panelChange: describeChange(o.panelAtStart, panel) };
    const { panelAtStart: _p, ...rest } = base;
    const iv: Intervention = { ...rest, label: interventionLabel(rest, ep.task, outcomeNote) };
    ep.interventions.push(iv);
    this.open = null;
    return iv;
  }

  endEpisode(t: number, outcome: Outcome, completedBy: CompletedBy, claimedSuccess: boolean): Episode | null {
    const ep = this.current;
    if (!ep) return null;
    ep.tEnd = t; ep.outcome = outcome; ep.completedBy = completedBy; ep.claimedSuccess = claimedSuccess;
    ep.meanConf = this.confN ? this.confSum / this.confN : 0;
    this.current = null; this.open = null;
    return ep;
  }

  /** LeRobot-shaped export: one info block and one record per episode with its frames and corrections. */
  export(): object {
    return {
      info: {
        codebase: 'nudge',
        codebase_version: 'v0.1',
        robot_type: 'so101-sim',
        fps: this.fps,
        total_episodes: this.episodes.length,
        total_frames: this.episodes.reduce((n, e) => n + e.frames.length, 0),
        features: {
          'observation.state': { dtype: 'float32', shape: [5], names: ['yaw', 'shoulder', 'elbow', 'wrist_pitch', 'roll'] },
          'observation.tip': { dtype: 'float32', shape: [3], names: ['x', 'y', 'z'] },
          'action': { dtype: 'float32', shape: [3], names: ['target_x', 'target_y', 'target_z'] },
          'controller': { dtype: 'string', values: ['policy', 'human', 'idle'] },
          'policy.confidence': { dtype: 'float32', shape: [1] },
        },
        note: 'Corrections are the frames where controller == human; each is paired with an intervention record carrying a language label.',
      },
      episodes: this.episodes.map((e) => ({ ...e, task: { ...e.task } })),
    };
  }
}
