/**
 * Turns episodes into the numbers an operator needs to decide how much autonomy to grant:
 * autonomous success rate, intervention rate, time-to-recovery and whether the policy's reported
 * confidence matches reality. Then recommends a level per task.
 */
import type { Episode } from './recorder';
import { TASK_KINDS, type TaskKind } from '../policy/tasks';

export interface TaskStats {
  kind: TaskKind;
  attempts: number;
  successes: number;
  autonomousSuccesses: number;
  interventions: number;
  recoveryS: number[];
  /** the policy reported success while the panel disagreed */
  claimedWrong: number;
  meanConf: number;
}

export type Level = 'autonomous' | 'supervised' | 'teleop' | 'collect more';
export interface Recommendation { level: Level; reason: string }

export function computeStats(episodes: Episode[]): Record<TaskKind, TaskStats> {
  const out = {} as Record<TaskKind, TaskStats>;
  for (const k of TASK_KINDS) out[k] = { kind: k, attempts: 0, successes: 0, autonomousSuccesses: 0, interventions: 0, recoveryS: [], claimedWrong: 0, meanConf: 0 };
  const confSum = {} as Record<TaskKind, number>;
  for (const k of TASK_KINDS) confSum[k] = 0;
  for (const e of episodes) {
    if (e.outcome === 'open') continue;
    const s = out[e.task.kind];
    s.attempts++;
    if (e.outcome === 'success') s.successes++;
    if (e.outcome === 'success' && e.interventions.length === 0) s.autonomousSuccesses++;
    s.interventions += e.interventions.length;
    for (const iv of e.interventions) s.recoveryS.push(iv.tEnd - iv.tStart);
    if (e.claimedSuccess) s.claimedWrong++;
    confSum[e.task.kind] += e.meanConf;
  }
  for (const k of TASK_KINDS) out[k].meanConf = out[k].attempts ? confSum[k] / out[k].attempts : 0;
  return out;
}

export const autonomousRate = (s: TaskStats): number => (s.attempts ? s.autonomousSuccesses / s.attempts : 0);
export const interventionRate = (s: TaskStats): number => (s.attempts ? s.interventions / s.attempts : 0);
export const meanRecovery = (s: TaskStats): number | null => (s.recoveryS.length ? s.recoveryS.reduce((a, b) => a + b, 0) / s.recoveryS.length : null);
/** reported confidence minus what actually happened; positive means the policy is overconfident */
export const calibrationGap = (s: TaskStats): number | null => (s.attempts ? s.meanConf - autonomousRate(s) : null);

/**
 * autonomous: succeeds alone almost every time, confidence matches reality, never reported a false success
 * supervised: gets there, but needs a person watching (nudges, or a false success on record)
 * teleop:     a person has to do most of it
 */
export function recommend(s: TaskStats, minAttempts = 3): Recommendation {
  if (s.attempts < minAttempts) return { level: 'collect more', reason: `${s.attempts}/${minAttempts} attempts` };
  const alone = autonomousRate(s);
  const success = s.successes / s.attempts;
  const gap = calibrationGap(s) ?? 0;
  const pct = `${Math.round(alone * 100)}% without help`;
  if (s.claimedWrong > 0) return { level: alone >= 0.5 || success >= 0.8 ? 'supervised' : 'teleop', reason: `reported success wrongly ${s.claimedWrong}×` };
  if (alone >= 0.9 && gap < 0.15) return { level: 'autonomous', reason: pct };
  if (alone >= 0.5 || (success >= 0.8 && alone >= 0.3)) return { level: 'supervised', reason: gap >= 0.15 ? `${pct}, overconfident by ${gap.toFixed(2)}` : pct };
  return { level: 'teleop', reason: pct };
}

export interface Totals { attempts: number; successes: number; interventions: number; minutes: number; interventionsPerMin: number; recoveryS: number | null }
export function totals(episodes: Episode[]): Totals {
  const closed = episodes.filter((e) => e.outcome !== 'open');
  const span = closed.length ? (Math.max(...closed.map((e) => e.tEnd)) - Math.min(...closed.map((e) => e.tStart))) / 60 : 0;
  const ivs = closed.flatMap((e) => e.interventions);
  return {
    attempts: closed.length,
    successes: closed.filter((e) => e.outcome === 'success').length,
    interventions: ivs.length,
    minutes: span,
    interventionsPerMin: span > 0 ? ivs.length / span : 0,
    recoveryS: ivs.length ? ivs.reduce((a, iv) => a + (iv.tEnd - iv.tStart), 0) / ivs.length : null,
  };
}
