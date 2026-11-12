/** Shared types for the ASL coach. */

export interface Vec3 { x: number; y: number; z: number }
export type Landmarks = Vec3[]; // always 21 points, MediaPipe order

export type Hand = 'Left' | 'Right';

/** One detected hand on one video frame. */
export interface HandFrame {
  /** ms timestamp, monotonic (performance.now based) */
  t: number;
  /** normalized image coordinates (0..1) of the RAW, un-mirrored camera frame */
  landmarks: Landmarks;
  /** metric 3D coordinates in meters, origin at the hand's center, camera-aligned axes */
  world: Landmarks;
  /** the user's actual hand (already corrected for the un-mirrored frame) */
  hand: Hand;
  score: number;
}

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
export const FINGERS: readonly FingerName[] = ['index', 'middle', 'ring', 'pinky'] as const;

export type Curl = 'extended' | 'half' | 'curled';

export type ThumbPosition =
  | 'alongside_index'      // A: thumb up against the side of the index
  | 'across_fingers'       // S: thumb over the front of the curled fingers
  | 'under_index'          // T: thumb tucked between index and middle
  | 'under_middle'         // N: thumb tip between middle and ring
  | 'under_ring'           // M: thumb tip beside the pinky, under three fingers
  | 'touching_index_tip'   // F: thumb and index tips touch
  | 'touching_fingertips'  // O / E / D: fingertips meet the thumb
  | 'extended_out'         // L, Y: thumb sticks out sideways
  | 'extended_up'          // thumb pointing straight up
  | 'between_index_middle' // K: thumb tip between index and middle bases
  | 'across_palm'          // B: thumb folded across the palm
  | 'alongside_fingers'    // C: thumb curved parallel to the fingers
  | 'pinned_by_index'      // G, H: thumb parallel to the extended index
  | 'other';

export type PalmFacing = 'forward' | 'side' | 'down' | 'back' | 'up';
export type Direction = 'up' | 'side' | 'down' | 'forward' | 'none';

export type HintKey = 'thumb' | FingerName | 'palm' | 'spread' | 'touching' | 'direction' | 'motion';

/** Handshape spec for one fingerspelled letter (verified against Lifeprint / HandSpeak / Wikipedia). */
export interface LetterSpec {
  letter: string;
  isStatic: boolean;
  motionNote?: string;
  fingers: Record<FingerName, Curl>;
  thumb: { curl: Curl; position: ThumbPosition };
  palmFacing: PalmFacing;
  fingerDirection: Direction;
  /** adjacent extended-finger pairs that are spread apart, e.g. "index-middle" */
  spread: string[];
  /** adjacent pairs held together */
  together: string[];
  /** fingertip contacts, e.g. "thumb-index" */
  touching: string[];
  /** e.g. "index-over-middle" for R */
  crossed?: string;
  description: string;
  commonMistakes: string[];
  hints: Partial<Record<HintKey, string>>;
  confusableWith: string[];
  distinguishingFeature: string;
}

/** Features extracted from one HandFrame, in a canonical right-hand palm frame. */
export interface HandFeatures {
  curl: Record<FingerName, Curl>;
  /** total bend in degrees (MCP + PIP + DIP) per finger */
  bend: Record<FingerName, number>;
  thumb: { curl: Curl; bend: number; position: ThumbPosition; scores: Partial<Record<ThumbPosition, number>> };
  palmFacing: PalmFacing;
  palmNormal: Vec3;
  fingerDirection: Direction;
  /** angle in degrees between adjacent fingers (MCP->TIP vectors) */
  spread: Record<'index-middle' | 'middle-ring' | 'ring-pinky', number>;
  /** fingertip distances as a fraction of palm width */
  touch: Record<string, number>;
  crossed: 'index-over-middle' | 'middle-over-index' | '';
  palmWidth: number;
  hand: Hand;
}
