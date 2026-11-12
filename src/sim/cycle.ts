/**
 * The pack cycle: take the next part from the tray, put it in the box, repeat forever. It is a
 * state machine over waypoints with three modes that a sign can set: running, slow, stopped.
 * STOP freezes the tip where it is; GO resumes from the same phase. "That one next"
 * re-targets the pick while the gripper is empty, or queues it for after the current place.
 */
import { type V3, v3, dist, copy } from './vec';
import { type Cell, type Part, BOX_SLOTS, GRIP_OFFSET } from './cell';

export type Mode = 'running' | 'slow' | 'stopped';
export type Phase = 'home' | 'to part' | 'descend' | 'grasp' | 'lift' | 'to box' | 'lower' | 'place' | 'rise' | 'waiting';

export const HOME = v3(0.0, 0.15, -0.14);
const LIFT_Y = 0.11;
const REACH = 0.006;
const GRIP_HOLD = 0.25;
const TRAY_WAIT = 1.0;

export const SPEED: Record<Mode, number> = { running: 1, slow: 0.3, stopped: 0 };

export class Cycle {
  mode: Mode = 'running';
  phase: Phase = 'home';
  gripperClosed = false;
  current: Part | null = null;
  requested: Part | null = null;
  private target: V3 = copy(HOME);
  private frozen: V3 | null = null;
  private wait = 0;
  private boxSlot: V3 = BOX_SLOTS[0];

  constructor(private cell: Cell) {}

  get frozenNow(): boolean { return this.mode === 'stopped'; }

  setMode(m: Mode, tip: V3): void {
    if (m === this.mode) return;
    if (m === 'stopped') this.frozen = copy(tip);
    else this.frozen = null;
    this.mode = m;
  }

  /** "that one next" */
  requestNext(p: Part): void {
    if (p.placed) return;
    this.requested = p;
    if (!this.cell.held && (this.phase === 'to part' || this.phase === 'descend' || this.phase === 'home' || this.phase === 'waiting')) {
      this.current = p;
      this.phase = 'to part';
      this.target = v3(p.pos.x, LIFT_Y, p.pos.z);
      this.requested = null;
    }
  }

  private pickNext(): Part | null {
    const rem = this.cell.remaining;
    if (!rem.length) return null;
    if (this.requested && !this.requested.placed && !this.requested.held) { const p = this.requested; this.requested = null; return p; }
    return rem.slice().sort((a, b) => a.slot - b.slot)[0];
  }

  /** One control step: returns the target the arm should move toward. */
  tick(dt: number, tip: V3, t: number): V3 {
    if (this.frozenNow) return this.frozen ?? copy(tip);
    const reached = dist(tip, this.target) < REACH;
    switch (this.phase) {
      case 'home': {
        this.target = copy(HOME);
        const p = this.pickNext();
        if (p) { this.current = p; this.phase = 'to part'; this.target = v3(p.pos.x, LIFT_Y, p.pos.z); }
        else if (reached) { this.phase = 'waiting'; this.wait = TRAY_WAIT; }
        break;
      }
      case 'waiting': {
        this.wait -= dt;
        if (this.wait <= 0) this.phase = 'home';
        break;
      }
      case 'to part': {
        const p = this.current;
        if (!p || p.placed) { this.phase = 'home'; break; }
        this.target = v3(p.pos.x, LIFT_Y, p.pos.z);
        if (reached) { this.phase = 'descend'; this.target = v3(p.pos.x, p.pos.y + GRIP_OFFSET, p.pos.z); }
        break;
      }
      case 'descend': {
        if (reached) { this.phase = 'grasp'; this.gripperClosed = true; this.wait = GRIP_HOLD; }
        break;
      }
      case 'grasp': {
        this.wait -= dt;
        if (this.wait <= 0) {
          const got = this.cell.grasp(tip, t);
          if (!got) { this.gripperClosed = false; this.phase = 'home'; break; }
          this.current = got;
          this.boxSlot = BOX_SLOTS[Math.min(this.cell.placedCount, BOX_SLOTS.length - 1)];
          this.phase = 'lift'; this.target = v3(tip.x, LIFT_Y, tip.z);
        }
        break;
      }
      case 'lift': {
        if (reached) { this.phase = 'to box'; this.target = v3(this.boxSlot.x, LIFT_Y, this.boxSlot.z); }
        break;
      }
      case 'to box': {
        if (reached) { this.phase = 'lower'; this.target = v3(this.boxSlot.x, this.boxSlot.y + GRIP_OFFSET, this.boxSlot.z); }
        break;
      }
      case 'lower': {
        if (reached) { this.phase = 'place'; this.gripperClosed = false; this.wait = GRIP_HOLD; }
        break;
      }
      case 'place': {
        this.wait -= dt;
        if (this.wait <= 0) { this.cell.release(tip, t); this.current = null; this.phase = 'rise'; this.target = v3(tip.x, LIFT_Y, tip.z); }
        break;
      }
      case 'rise': {
        if (reached) this.phase = 'home';
        break;
      }
    }
    return this.target;
  }
}
