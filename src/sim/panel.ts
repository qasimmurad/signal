/**
 * A BusyBox-style panel: four lit buttons, a toggle switch, a six-position knob and a slider,
 * mounted on a vertical face at PANEL_Z. Every module changes state from where the tool tip is
 * and how it moved, so a policy and a human hand act on it through exactly the same rules.
 */
import { type V3, v3, clamp } from './vec';

export const PANEL_Z = -0.24;
/** how far the tip can sink into a module before the face stops it */
export const CONTACT_DEPTH = 0.016;
export const PRESS_DEPTH = 0.007;

export type ButtonColor = 'red' | 'green' | 'blue' | 'yellow';
export const BUTTON_COLORS: readonly ButtonColor[] = ['red', 'green', 'blue', 'yellow'] as const;
export const BUTTON_POS: Record<ButtonColor, V3> = {
  red: v3(-0.085, 0.225, PANEL_Z),
  green: v3(-0.035, 0.225, PANEL_Z),
  blue: v3(-0.085, 0.175, PANEL_Z),
  yellow: v3(-0.035, 0.175, PANEL_Z),
};
export const BUTTON_RADIUS = 0.016;

export const SWITCH_POS = v3(0.05, 0.205, PANEL_Z);
export const SWITCH_HALF = 0.022; // lever half-length
export const KNOB_POS = v3(0.09, 0.12, PANEL_Z);
export const KNOB_RADIUS = 0.024;
export const KNOB_POSITIONS = 6;
export const SLIDER_Y = 0.105;
export const SLIDER_X0 = -0.105, SLIDER_X1 = 0.0;
export const SLIDER_GRAB = 0.018;

export interface PanelState {
  buttons: Record<ButtonColor, boolean>;
  switchUp: boolean;
  knob: number; // 0..5
  slider: number; // 0..1
}

export const sliderPos = (value: number): V3 => v3(SLIDER_X0 + (SLIDER_X1 - SLIDER_X0) * clamp(value, 0, 1), SLIDER_Y, PANEL_Z);
export const knobAngle = (pos: number): number => (pos / KNOB_POSITIONS) * Math.PI * 2;

export interface PanelEvent { kind: 'press' | 'switch' | 'knob' | 'slider'; detail: string; t: number }

export class Panel {
  state: PanelState = { buttons: { red: false, green: false, blue: false, yellow: false }, switchUp: false, knob: 0, slider: 0.2 };
  events: PanelEvent[] = [];
  private pressedLatch: Record<ButtonColor, boolean> = { red: false, green: false, blue: false, yellow: false };
  private knobAccum = 0;
  private lastKnobAngle: number | null = null;
  private prevTip: V3 | null = null;
  private sliderGrabbed = false;
  /** which side of the switch pivot the tip was last seen on while in contact: -1 below, 1 above, 0 unknown */
  private switchSide = 0;

  reset(): void {
    this.state = { buttons: { red: false, green: false, blue: false, yellow: false }, switchUp: false, knob: 0, slider: 0.2 };
    this.knobAccum = 0; this.lastKnobAngle = null; this.prevTip = null; this.sliderGrabbed = false; this.switchSide = 0;
    for (const c of BUTTON_COLORS) this.pressedLatch[c] = false;
  }

  snapshot(): PanelState {
    return { buttons: { ...this.state.buttons }, switchUp: this.state.switchUp, knob: this.state.knob, slider: this.state.slider };
  }

  /** Apply one simulation step given the tool tip. Returns the events it produced. */
  interact(tip: V3, t: number): PanelEvent[] {
    const out: PanelEvent[] = [];
    const inContact = tip.z <= PANEL_Z + CONTACT_DEPTH;

    // buttons: push past PRESS_DEPTH while over the cap; latch so a held press counts once
    for (const c of BUTTON_COLORS) {
      const b = BUTTON_POS[c];
      const over = Math.hypot(tip.x - b.x, tip.y - b.y) <= BUTTON_RADIUS;
      const pushed = over && tip.z <= PANEL_Z + CONTACT_DEPTH - PRESS_DEPTH;
      if (pushed && !this.pressedLatch[c]) {
        this.state.buttons[c] = !this.state.buttons[c];
        this.pressedLatch[c] = true;
        out.push({ kind: 'press', detail: `${c} ${this.state.buttons[c] ? 'on' : 'off'}`, t });
      }
      if (!pushed) this.pressedLatch[c] = false;
    }

    // switch: while in contact with the lever column, remember which side of the pivot the tip is on;
    // arriving on the other side (however slowly) throws the lever that way
    const inColumn = inContact && Math.abs(tip.x - SWITCH_POS.x) <= 0.016 && Math.abs(tip.y - SWITCH_POS.y) <= SWITCH_HALF + 0.012;
    if (inColumn) {
      const y1 = tip.y - SWITCH_POS.y;
      const side = y1 >= 0.004 ? 1 : y1 <= -0.004 ? -1 : 0;
      if (side !== 0) {
        if (this.switchSide === -1 && side === 1 && !this.state.switchUp) { this.state.switchUp = true; out.push({ kind: 'switch', detail: 'up', t }); }
        if (this.switchSide === 1 && side === -1 && this.state.switchUp) { this.state.switchUp = false; out.push({ kind: 'switch', detail: 'down', t }); }
        this.switchSide = side;
      }
    } else {
      this.switchSide = 0;
    }

    // knob: while in contact near the rim, accumulate the tip's angle around the centre; 60° = one detent
    const kd = Math.hypot(tip.x - KNOB_POS.x, tip.y - KNOB_POS.y);
    if (inContact && kd <= KNOB_RADIUS + 0.012 && kd >= 0.006) {
      const a = Math.atan2(tip.y - KNOB_POS.y, tip.x - KNOB_POS.x);
      if (this.lastKnobAngle !== null) {
        let da = a - this.lastKnobAngle;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        this.knobAccum += da;
        const detent = (Math.PI * 2) / KNOB_POSITIONS;
        while (this.knobAccum <= -detent) { // clockwise (screen) = next position
          this.knobAccum += detent;
          if (this.state.knob < KNOB_POSITIONS - 1) { this.state.knob++; out.push({ kind: 'knob', detail: String(this.state.knob), t }); }
        }
        while (this.knobAccum >= detent) {
          this.knobAccum -= detent;
          if (this.state.knob > 0) { this.state.knob--; out.push({ kind: 'knob', detail: String(this.state.knob), t }); }
        }
      }
      this.lastKnobAngle = a;
    } else {
      this.lastKnobAngle = null;
      this.knobAccum = 0;
    }

    // slider: touching the handle grabs it; while the tip stays in contact on the track the handle follows its x
    const h = sliderPos(this.state.slider);
    if (!this.sliderGrabbed && inContact && Math.hypot(tip.x - h.x, tip.y - h.y) <= SLIDER_GRAB) this.sliderGrabbed = true;
    if (this.sliderGrabbed && (!inContact || Math.abs(tip.y - SLIDER_Y) > SLIDER_GRAB + 0.01)) this.sliderGrabbed = false;
    if (this.sliderGrabbed) {
      const v = clamp((tip.x - SLIDER_X0) / (SLIDER_X1 - SLIDER_X0), 0, 1);
      if (Math.abs(v - this.state.slider) > 0.002) {
        this.state.slider = v;
        out.push({ kind: 'slider', detail: `${Math.round(v * 100)}%`, t });
      }
    }

    this.prevTip = { ...tip };
    this.events.push(...out);
    return out;
  }
}

/** Human-readable diff between two panel states, e.g. "pressed red on, flipped the switch down". */
export function describeChange(a: PanelState, b: PanelState): string[] {
  const out: string[] = [];
  for (const c of BUTTON_COLORS) if (a.buttons[c] !== b.buttons[c]) out.push(`pressed ${c} ${b.buttons[c] ? 'on' : 'off'}`);
  if (a.switchUp !== b.switchUp) out.push(`flipped the switch ${b.switchUp ? 'up' : 'down'}`);
  if (a.knob !== b.knob) out.push(`turned the knob to ${b.knob}`);
  if (Math.abs(a.slider - b.slider) > 0.02) out.push(`set the slider to ${Math.round(b.slider * 100)}%`);
  return out;
}
