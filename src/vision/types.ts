/** Hand-tracking types (MediaPipe order, 21 points). */
export interface Vec3 { x: number; y: number; z: number }
export type Landmarks = Vec3[];
export type Hand = 'Left' | 'Right';

/** One detected hand on one video frame. */
export interface HandFrame {
  /** ms timestamp, monotonic */
  t: number;
  /** normalized image coordinates (0..1) of the RAW, un-mirrored camera frame */
  landmarks: Landmarks;
  /** metric 3D coordinates in meters, origin at the hand's centre */
  world: Landmarks;
  hand: Hand;
  score: number;
}
