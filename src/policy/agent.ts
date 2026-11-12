/**
 * The agent turns a sentence into a queue of tasks, scores each for risk, and holds anything above
 * the approval threshold until a person approves it. Rule-based on purpose: the point is the gate,
 * not the parser, and nothing leaves the browser.
 */
import { type Task, taskRisk, taskLabel } from './tasks';
import type { ButtonColor, PanelState } from '../sim/panel';

export interface Queued { task: Task; risk: number; needsApproval: boolean; approved: boolean; source: string }

const COLORS: ButtonColor[] = ['red', 'green', 'blue', 'yellow'];

export function parseInstruction(text: string, s: PanelState): Task[] {
  const out: Task[] = [];
  const parts = text.toLowerCase().replace(/[.!?]/g, '').split(/\bthen\b|\band then\b|,|;|\band\b/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (/reset|clear|all off|turn everything off/.test(p)) {
      for (const c of COLORS) if (s.buttons[c]) out.push({ kind: 'press', color: c });
      if (s.switchUp) out.push({ kind: 'switch', up: false });
      if (s.knob !== 0) out.push({ kind: 'knob', to: 0 });
      continue;
    }
    if (/all (the )?buttons|every button/.test(p)) { for (const c of COLORS) out.push({ kind: 'press', color: c }); continue; }
    const color = COLORS.find((c) => p.includes(c));
    if (color && /press|push|hit|tap|light|turn on|button|one\b/.test(p + ' ')) { out.push({ kind: 'press', color }); continue; }
    if (color) { out.push({ kind: 'press', color }); continue; }
    if (/switch|lever|power/.test(p)) {
      const up = /\bup\b|\bon\b|raise/.test(p) ? true : /\bdown\b|\boff\b|lower/.test(p) ? false : !s.switchUp;
      out.push({ kind: 'switch', up });
      continue;
    }
    if (/knob|dial/.test(p)) {
      const m = p.match(/(-?\d+)/);
      const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5 };
      const w = Object.keys(words).find((k) => new RegExp(`\\b${k}\\b`).test(p));
      let to = m ? parseInt(m[1], 10) : w !== undefined ? words[w] : /max|all the way|full/.test(p) ? 5 : /min|zero|off/.test(p) ? 0 : s.knob + 1;
      to = Math.max(0, Math.min(5, to));
      out.push({ kind: 'knob', to });
      continue;
    }
    if (/slider|fader/.test(p)) {
      const m = p.match(/(\d+)\s*%?/);
      let to = m ? parseInt(m[1], 10) / 100 : /max|full|all the way|right/.test(p) ? 1 : /min|zero|left|off/.test(p) ? 0 : /half|middle/.test(p) ? 0.5 : 0.5;
      to = Math.max(0, Math.min(1, to));
      out.push({ kind: 'slider', to });
      continue;
    }
  }
  return out;
}

export class Agent {
  queue: Queued[] = [];
  approvalThreshold = 0.6;

  enqueue(tasks: Task[], source: string): Queued[] {
    const added = tasks.map((task) => {
      const risk = taskRisk(task);
      return { task, risk, needsApproval: risk >= this.approvalThreshold, approved: risk < this.approvalThreshold, source };
    });
    this.queue.push(...added);
    return added;
  }
  /** the next task the policy may run, or null if the head of the queue is waiting for approval */
  next(): Queued | null {
    const head = this.queue[0];
    if (!head) return null;
    return head.approved ? head : null;
  }
  get waiting(): Queued | null { const h = this.queue[0]; return h && !h.approved ? h : null; }
  approve(): void { if (this.queue[0]) this.queue[0].approved = true; }
  reject(): Queued | undefined { return this.queue.shift(); }
  shift(): Queued | undefined { return this.queue.shift(); }
  clear(): void { this.queue = []; }
  describe(): string[] { return this.queue.map((q) => `${taskLabel(q.task)}${q.needsApproval && !q.approved ? ' (needs approval)' : ''}`); }
}
