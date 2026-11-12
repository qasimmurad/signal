/**
 * The pack cycle: take the next part from the tray, put it in the box, repeat forever. It is a
 * state machine over waypoints with three modes that a sign can set: running, slow, stopped.
 * STOP freezes the tip where it is; GO resumes from the same phase. GIVE ME asks for a handover:
 * the next part the gripper lifts goes to the front of the cell and is held out until it is taken.
 */
import { type V3, v3, dist, copy } from './vec';
import { type Cell, type Part, BOX_SLOTS, GRIP_OFFSET } from './cell';

export type Mode = 'running' | 'slow' | 'stopped';
export type Phase = 'home' | 'to part' | 'descend' | 'grasp' | 'lift' | 'to box' | 'lower' | 'place' | 'rise' | 'waiting' | 'to hand' | 'offer' | 'offering';

export const HOME = v3(0.0, 0.15, -0.14);
/** where the robot holds a part out for the operator: the front of the cell, toward the camera */
export const HANDOVER = v3(0.02, 0.1, -0.07);
const LIFT_Y = 0.11;
const CARRY_Y = 0.13;
const REACH = 0.006;
const GRIP_HOLD = 0.25;
const TRAY_WAIT = 1.0;
/** how long the part is held out before the operator is assumed to have taken it */
export const OFFER_HOLD = 1.8;

export const SPEED: Record<Mode, number> = { running: 1, slow: 0.3, stopped: 0 };

export interface CycleEvent { kind: 'offered' | 'taken'; part: Part }

export class Cycle {
  mode: Mode = 'running';
  phase: Phase = 'home';
  gripperClosed = false;
  current: Part | null = null;
  /** a GIVE ME has been seen and not yet fulfilled */
  handoverPending = false;
  events: CycleEvent[] = [];
  private target: V3 = copy(HOME);
  private frozen: V3 | null = null;
  private wait = 0;
  private boxSlot: V3 = BOX_SLOTS[0];

  constructor(private cell: Cell) {}

  get frozenNow(): boolean { return this.mode === 'stopped'; }
  get offering(): boolean { return this.phase === 'to hand' || this.phase === 'offer' || this.phase === 'offering'; }

  setMode(m: Mode, tip: V3): void {
    if (m === this.mode) return;
    if (m === 'stopped') this.frozen = copy(tip);
    else this.frozen = null;
    this.mode = m;
  }

  /** GIVE ME: the next part the gripper lifts comes to the operator instead of the box */
  requestHandover(): boolean {
    if (this.handoverPending || this.offering) return false;
    this.handoverPending = true;
    return true;
  }

  private pickNext(): Part | null {
    const rem = this.cell.remaining;
    if (!rem.length) return null;
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
        if (reached) {
          if (this.handoverPending) { this.phase = 'to hand'; this.target = v3(HANDOVER.x, CARRY_Y, HANDOVER.z); }
          else { this.phase = 'to box'; this.target = v3(this.boxSlot.x, LIFT_Y, this.boxSlot.z); }
        }
        break;
      }
      case 'to box': {
        if (this.handoverPending) { this.phase = 'to hand'; this.target = v3(HANDOVER.x, CARRY_Y, HANDOVER.z); break; }
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
      case 'to hand': {
        if (reached) { this.phase = 'offer'; this.target = copy(HANDOVER); }
        break;
      }
      case 'offer': {
        if (reached) { this.phase = 'offering'; this.wait = OFFER_HOLD; if (this.current) this.events.push({ kind: 'offered', part: this.current }); }
        break;
      }
      case 'offering': {
        this.wait -= dt;
        if (this.wait <= 0) {
          const p = this.cell.handOff(t);
          if (p) this.events.push({ kind: 'taken', part: p });
          this.gripperClosed = false; this.handoverPending = false; this.current = null;
          this.phase = 'rise'; this.target = v3(tip.x, CARRY_Y, tip.z);
        }
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
