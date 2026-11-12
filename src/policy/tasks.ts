/** Task vocabulary shared by the policy, the agent, the recorder and the trust panel. */
import { type ButtonColor, BUTTON_POS, SWITCH_POS, KNOB_POS, sliderPos, type PanelState } from '../sim/panel';
import type { V3 } from '../sim/vec';

export type Task =
  | { kind: 'press'; color: ButtonColor }
  | { kind: 'switch'; up: boolean }
  | { kind: 'knob'; to: number }
  | { kind: 'slider'; to: number };

export type TaskKind = Task['kind'];
export const TASK_KINDS: readonly TaskKind[] = ['press', 'switch', 'knob', 'slider'] as const;

export function taskLabel(t: Task): string {
  switch (t.kind) {
    case 'press': return `press the ${t.color} button`;
    case 'switch': return `flip the switch ${t.up ? 'up' : 'down'}`;
    case 'knob': return `turn the knob to ${t.to}`;
    case 'slider': return `set the slider to ${Math.round(t.to * 100)}%`;
  }
}

export function goalMet(t: Task, s: PanelState): boolean {
  switch (t.kind) {
    case 'press': return s.buttons[t.color];
    case 'switch': return s.switchUp === t.up;
    case 'knob': return s.knob === t.to;
    case 'slider': return Math.abs(s.slider - t.to) <= 0.06;
  }
}

/** where on the panel the task's affordance lives (the "right" target) */
export function taskAnchor(t: Task, s: PanelState): V3 {
  switch (t.kind) {
    case 'press': return BUTTON_POS[t.color];
    case 'switch': return SWITCH_POS;
    case 'knob': return KNOB_POS;
    case 'slider': return sliderPos(s.slider);
  }
}

/** how much a mistake on this task costs; the approval gate compares it with a threshold */
export function taskRisk(t: Task): number {
  switch (t.kind) {
    case 'press': return t.color === 'red' ? 0.45 : 0.2;
    case 'switch': return 0.7;
    case 'knob': return 0.35;
    case 'slider': return 0.25;
  }
}
