import { describe, it, expect } from 'vitest';
import { Panel, BUTTON_POS, PANEL_Z, SWITCH_POS, KNOB_POS, KNOB_RADIUS, sliderPos, describeChange } from '../sim/panel';
import { v3 } from '../sim/vec';

describe('panel affordances', () => {
  it('toggles a button when the tip pushes past the press depth, once per press', () => {
    const p = new Panel();
    const b = BUTTON_POS.red;
    p.interact(v3(b.x, b.y, PANEL_Z + 0.05), 0);
    p.interact(v3(b.x, b.y, PANEL_Z + 0.004), 1);
    p.interact(v3(b.x, b.y, PANEL_Z + 0.004), 2); // still held
    expect(p.state.buttons.red).toBe(true);
    expect(p.events.filter((e) => e.kind === 'press')).toHaveLength(1);
    p.interact(v3(b.x, b.y, PANEL_Z + 0.05), 3);
    p.interact(v3(b.x, b.y, PANEL_Z + 0.004), 4);
    expect(p.state.buttons.red).toBe(false);
  });
  it('ignores a push beside the button', () => {
    const p = new Panel();
    const b = BUTTON_POS.red;
    p.interact(v3(b.x + 0.03, b.y, PANEL_Z + 0.004), 0);
    expect(p.state.buttons.red).toBe(false);
  });
  it('flips the switch by crossing the pivot while in contact', () => {
    const p = new Panel();
    const s = SWITCH_POS;
    p.interact(v3(s.x, s.y - 0.015, PANEL_Z + 0.01), 0);
    p.interact(v3(s.x, s.y + 0.015, PANEL_Z + 0.01), 1);
    expect(p.state.switchUp).toBe(true);
    p.interact(v3(s.x, s.y - 0.015, PANEL_Z + 0.01), 2);
    expect(p.state.switchUp).toBe(false);
  });
  it('turns the knob one detent per 60 degrees of tip travel around it', () => {
    const p = new Panel();
    const r = KNOB_RADIUS;
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI / 2 - (i / 12) * Math.PI * 2 * (2 / 6); // clockwise, 120 degrees total
      p.interact(v3(KNOB_POS.x + r * Math.cos(a), KNOB_POS.y + r * Math.sin(a), PANEL_Z + 0.01), i);
    }
    expect(p.state.knob).toBe(2);
  });
  it('drags the slider handle along the track', () => {
    const p = new Panel();
    const h = sliderPos(p.state.slider);
    p.interact(v3(h.x, h.y, PANEL_Z + 0.01), 0);
    const target = sliderPos(0.8);
    p.interact(v3(target.x, target.y, PANEL_Z + 0.01), 1);
    expect(p.state.slider).toBeCloseTo(0.8, 1);
  });
  it('describes changes in words', () => {
    const a = { buttons: { red: false, green: false, blue: false, yellow: false }, switchUp: false, knob: 0, slider: 0.2 };
    const b = { ...a, buttons: { ...a.buttons, red: true }, knob: 3 };
    expect(describeChange(a, b)).toEqual(['pressed red on', 'turned the knob to 3']);
  });
});
