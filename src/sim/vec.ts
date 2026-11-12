/** Tiny vector helpers for the simulator (metres, y up, the panel sits at negative z). */
export interface V3 { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: V3, b: V3): number => len(sub(a, b));
export const lerp = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const copy = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
/** move a toward b by at most step */
export function toward(a: V3, b: V3, step: number): V3 {
  const d = dist(a, b);
  if (d <= step || d === 0) return copy(b);
  return lerp(a, b, step / d);
}
