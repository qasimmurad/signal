import { describe, it, expect } from 'vitest';
import { parseNudge } from '../control/voice';
import { Dwell } from '../control/dwell';

describe('voice nudges', () => {
  it('understands halts, moves and approvals', () => {
    expect(parseNudge('stop')).toEqual({ kind: 'stop' });
    expect(parseNudge('left a bit')).toEqual({ kind: 'move', delta: { x: -0.02, y: 0, z: 0 } });
    expect(parseNudge('go up more')).toEqual({ kind: 'move', delta: { x: 0, y: 0.05, z: 0 } });
    expect(parseNudge('yes')).toEqual({ kind: 'approve' });
    expect(parseNudge('press the red button')).toBeNull();
  });
});

describe('dwell', () => {
  it('fires once after resting on the same control', () => {
    const d = new Dwell(500);
    expect(d.update('button:red', 0)).toBeNull();
    expect(d.update('button:red', 300)).toBeNull();
    expect(d.update('button:red', 600)).toBe('button:red');
    expect(d.update('button:red', 900)).toBeNull();
    expect(d.update('button:blue', 1000)).toBeNull();
    expect(d.update('button:blue', 1600)).toBe('button:blue');
  });
  it('treats nearby slider positions as the same target', () => {
    const d = new Dwell(500);
    d.update('slider:0.50', 0);
    d.update('slider:0.55', 300);
    expect(d.update('slider:0.52', 600)).toBe('slider:0.52');
  });
});
