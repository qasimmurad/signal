import { describe, it, expect } from 'vitest';
import { Recorder, directionWords } from '../data/recorder';
import { computeStats, recommend, calibrationGap } from '../data/trust';
import { v3 } from '../sim/vec';
import type { Intent } from '../policy/policy';

const intent = (over: Partial<Intent> = {}): Intent => ({ task: { kind: 'press', color: 'red' }, step: 'press yellow', target: null, confidence: 0.9, status: 'running', failure: 'wrong_target', note: '', ...over });
const panel = (over: Partial<{ red: boolean; yellow: boolean }> = {}) => ({ buttons: { red: !!over.red, green: false, blue: false, yellow: !!over.yellow }, switchUp: false, knob: 0, slider: 0.2 });

describe('recorder', () => {
  it('labels an intervention with what the policy was doing and what the human changed', () => {
    const r = new Recorder();
    r.startEpisode({ kind: 'press', color: 'red' }, 'wrong_target', 0);
    r.beginIntervention(2, 'hand', intent(), v3(-0.035, 0.175, -0.18), panel({ yellow: true }));
    const iv = r.endIntervention(4.5, v3(-0.085, 0.225, -0.18), panel({ yellow: true, red: true }), 'Task completed by the human.');
    expect(iv).not.toBeNull();
    expect(iv!.movedCm).toBeCloseTo(7.07, 1);
    expect(iv!.direction).toBe('left and up');
    expect(iv!.panelChange).toEqual(['pressed red on']);
    expect(iv!.label).toContain('failure: wrong target');
    expect(iv!.label).toContain('Human (hand) took over for 2.5s');
    expect(iv!.label).toContain('pressed red on');
  });
  it('throttles frames to its fps and exports a LeRobot-shaped record', () => {
    const r = new Recorder();
    r.startEpisode({ kind: 'knob', to: 2 }, null, 0);
    for (let i = 0; i < 60; i++) r.frame(1 / 60, i / 60, 'policy', v3(), v3(), [0, 0, 0, 0, 0], intent({ failure: null }));
    r.endEpisode(1, 'success', 'policy', false);
    const out = r.export() as any;
    expect(out.info.robot_type).toBe('so101-sim');
    expect(out.episodes).toHaveLength(1);
    expect(out.episodes[0].frames.length).toBeGreaterThanOrEqual(18);
    expect(out.episodes[0].frames.length).toBeLessThanOrEqual(21);
  });
  it('words directions', () => {
    expect(directionWords(v3(0.02, 0, -0.03))).toBe('right and in toward the panel');
    expect(directionWords(v3(0.001, 0, 0))).toBe('barely');
  });
});

describe('trust', () => {
  function episodes(spec: Array<{ ok: boolean; ivs: number; conf: number; claimed?: boolean }>) {
    return spec.map((s, i) => ({
      index: i, task: { kind: 'press' as const, color: 'red' as const }, label: '', tStart: i * 10, tEnd: i * 10 + 5,
      outcome: s.ok ? ('success' as const) : ('failed' as const), completedBy: null, failureInjected: null, claimedSuccess: !!s.claimed,
      interventions: Array.from({ length: s.ivs }, () => ({ tStart: 1, tEnd: 3, modality: 'hand' as const, policyStep: '', policyConf: 0.5, policyFailure: null, startTip: [0, 0, 0] as [number, number, number], endTip: [0, 0, 0] as [number, number, number], movedCm: 1, direction: '', panelChange: [], label: '' })),
      frames: [], meanConf: s.conf,
    }));
  }
  it('asks for more data before recommending', () => {
    const st = computeStats(episodes([{ ok: true, ivs: 0, conf: 0.9 }]));
    expect(recommend(st.press).level).toBe('collect more');
  });
  it('grants autonomy only when the policy succeeds alone and is calibrated', () => {
    const good = computeStats(episodes([1, 2, 3, 4, 5].map(() => ({ ok: true, ivs: 0, conf: 0.9 }))));
    expect(recommend(good.press).level).toBe('autonomous');
    const needy = computeStats(episodes([{ ok: true, ivs: 1, conf: 0.9 }, { ok: true, ivs: 0, conf: 0.9 }, { ok: true, ivs: 0, conf: 0.9 }, { ok: true, ivs: 1, conf: 0.9 }]));
    expect(recommend(needy.press).level).toBe('supervised');
    expect(calibrationGap(needy.press)).toBeCloseTo(0.4, 2);
    const bad = computeStats(episodes([{ ok: false, ivs: 2, conf: 0.9 }, { ok: false, ivs: 1, conf: 0.9 }, { ok: true, ivs: 1, conf: 0.9 }]));
    expect(recommend(bad.press).level).toBe('teleop');
  });
  it('never grants autonomy to a policy that reports success wrongly', () => {
    const liar = computeStats(episodes([{ ok: true, ivs: 1, conf: 0.95, claimed: true }, { ok: true, ivs: 0, conf: 0.95 }, { ok: true, ivs: 0, conf: 0.95 }, { ok: true, ivs: 0, conf: 0.95 }]));
    expect(recommend(liar.press).level).toBe('supervised');
  });
});
