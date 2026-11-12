/** MediaPipe hand landmark indices and small helpers. */
import type { Vec3 } from './types';

export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5, INDEX_TIP = 8;
export const MIDDLE_MCP = 9, MIDDLE_TIP = 12;
export const PINKY_MCP = 17;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const dist2 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
