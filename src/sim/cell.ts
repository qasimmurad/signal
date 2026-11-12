/**
 * The packing cell: a tray of four parts on the left, a box on the right. Parts are grasped and
 * released by the tool tip with geometric rules: a closed gripper over a part lifts it, an open
 * gripper over the box sets it down in the next free slot. When the box is full it ships and a new
 * tray arrives.
 */
import { type V3, v3, copy } from './vec';

export type PartColor = 'red' | 'green' | 'blue' | 'yellow';
export const PART_COLORS: readonly PartColor[] = ['red', 'green', 'blue', 'yellow'] as const;
export const PART = 0.03; // cube edge
export const TRAY = { center: v3(-0.12, 0, -0.14), size: 0.1, top: 0.006 } as const;
export const BOX = { center: v3(0.14, 0, -0.14), inner: 0.1, wall: 0.004, height: 0.055, floor: 0.004 } as const;
const SLOT = 0.03;
export const TRAY_SLOTS: readonly V3[] = [-1, 1].flatMap((sz) => [-1, 1].map((sx) => v3(TRAY.center.x + sx * SLOT, TRAY.top + PART / 2, TRAY.center.z + sz * SLOT)));
export const BOX_SLOTS: readonly V3[] = [-1, 1].flatMap((sz) => [-1, 1].map((sx) => v3(BOX.center.x + sx * 0.026, BOX.floor + PART / 2, BOX.center.z + sz * 0.026)));
/** how high the tip hovers above a part centre when it holds it */
export const GRIP_OFFSET = PART / 2 + 0.004;
export const GRASP_RADIUS = 0.018;

export interface Part { id: number; color: PartColor; pos: V3; slot: number; held: boolean; placed: boolean }

export interface CellEvent { kind: 'grasp' | 'place' | 'ship' | 'tray'; part?: Part; t: number }

export class Cell {
  parts: Part[] = [];
  held: Part | null = null;
  boxesShipped = 0;
  partsPacked = 0;
  trayNo = 0;
  events: CellEvent[] = [];
  private nextId = 1;

  constructor() { this.newTray(0); }

  get remaining(): Part[] { return this.parts.filter((p) => !p.placed && !p.held); }
  get placedCount(): number { return this.parts.filter((p) => p.placed).length; }

  newTray(t: number): void {
    this.trayNo++;
    this.parts = TRAY_SLOTS.map((s, i) => ({ id: this.nextId++, color: PART_COLORS[i], pos: copy(s), slot: i, held: false, placed: false }));
    this.held = null;
    this.events.push({ kind: 'tray', t });
  }

  /** the part the gripper would take at this tip position, or null */
  partUnder(tip: V3): Part | null {
    let best: Part | null = null, bd = Infinity;
    for (const p of this.parts) {
      if (p.placed || p.held) continue;
      const d = Math.hypot(tip.x - p.pos.x, tip.z - p.pos.z);
      if (d <= GRASP_RADIUS && tip.y <= p.pos.y + PART / 2 + 0.012 && d < bd) { best = p; bd = d; }
    }
    return best;
  }

  /** close the gripper: take the part under the tip, if any */
  grasp(tip: V3, t: number): Part | null {
    if (this.held) return this.held;
    const p = this.partUnder(tip);
    if (!p) return null;
    p.held = true; this.held = p;
    this.events.push({ kind: 'grasp', part: p, t });
    return p;
  }

  /** open the gripper: a held part goes into the box if the tip is over it, else back where it is */
  release(tip: V3, t: number): Part | null {
    const p = this.held;
    if (!p) return null;
    p.held = false; this.held = null;
    const overBox = Math.abs(tip.x - BOX.center.x) <= BOX.inner / 2 && Math.abs(tip.z - BOX.center.z) <= BOX.inner / 2;
    if (overBox) {
      const slot = this.placedCount;
      p.pos = copy(BOX_SLOTS[Math.min(slot, BOX_SLOTS.length - 1)]);
      p.placed = true;
      this.partsPacked++;
      this.events.push({ kind: 'place', part: p, t });
    } else {
      p.pos = v3(tip.x, Math.max(TRAY.top + PART / 2, tip.y - GRIP_OFFSET), tip.z);
    }
    return p;
  }

  /** keep a held part under the tip; ship a full box */
  step(tip: V3, t: number): void {
    if (this.held) this.held.pos = v3(tip.x, tip.y - GRIP_OFFSET, tip.z);
    if (this.placedCount === this.parts.length && !this.held) {
      this.boxesShipped++;
      this.events.push({ kind: 'ship', t });
      this.newTray(t);
    }
  }
}
