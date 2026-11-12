/** MediaPipe hand landmark indices, connections, and small vector helpers. */
import type { Vec3, Landmarks, FingerName } from './types';

export const WRIST = 0;
export const THUMB_CMC = 1, THUMB_MCP = 2, THUMB_IP = 3, THUMB_TIP = 4;
export const INDEX_MCP = 5, INDEX_PIP = 6, INDEX_DIP = 7, INDEX_TIP = 8;
export const MIDDLE_MCP = 9, MIDDLE_PIP = 10, MIDDLE_DIP = 11, MIDDLE_TIP = 12;
export const RING_MCP = 13, RING_PIP = 14, RING_DIP = 15, RING_TIP = 16;
export const PINKY_MCP = 17, PINKY_PIP = 18, PINKY_DIP = 19, PINKY_TIP = 20;

/** [MCP, PIP, DIP, TIP] per finger */
export const FINGER_JOINTS: Record<FingerName, [number, number, number, number]> = {
  index: [INDEX_MCP, INDEX_PIP, INDEX_DIP, INDEX_TIP],
  middle: [MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP],
  ring: [RING_MCP, RING_PIP, RING_DIP, RING_TIP],
  pinky: [PINKY_MCP, PINKY_PIP, PINKY_DIP, PINKY_TIP],
};
export const TIP: Record<FingerName | 'thumb', number> = { thumb: THUMB_TIP, index: INDEX_TIP, middle: MIDDLE_TIP, ring: RING_TIP, pinky: PINKY_TIP };
export const MCP: Record<FingerName | 'thumb', number> = { thumb: THUMB_MCP, index: INDEX_MCP, middle: MIDDLE_MCP, ring: RING_MCP, pinky: PINKY_MCP };

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const norm = (a: Vec3): Vec3 => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const mid = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5);

/** angle between two vectors in degrees (0..180) */
export function angleDeg(a: Vec3, b: Vec3): number {
  const d = dot(a, b) / ((len(a) || 1e-9) * (len(b) || 1e-9));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

/** bend at joint b between segments a->b and b->c, in degrees (0 = straight) */
export function bendAt(a: Vec3, b: Vec3, c: Vec3): number {
  return 180 - angleDeg(sub(a, b), sub(c, b));
}

/** mirror x so a left hand becomes a canonical right hand (world coords: x -> -x) */
export function mirrorWorld(lms: Landmarks): Landmarks {
  return lms.map((p) => ({ x: -p.x, y: p.y, z: p.z }));
}
/** mirror normalized image coords (x -> 1 - x) */
export function mirrorImage(lms: Landmarks): Landmarks {
  return lms.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** smooth step mapping v from [a,b] to [0,1] */
export function smooth(v: number, a: number, b: number): number {
  const t = clamp((v - a) / (b - a || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}
