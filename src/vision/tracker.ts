/** MediaPipe HandLandmarker wrapper. Pretrained hand model, runs fully in the browser (WASM + WebGL). */
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { HandFrame, Hand } from './types';

export const TASKS_VISION_VERSION = '0.10.35';
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * MediaPipe labels handedness assuming the input is a MIRRORED selfie image. We feed the raw,
 * un-mirrored camera frame (and only mirror the display), so the labels come back swapped.
 * Keep this true for raw getUserMedia frames.
 */
let swapHandedness = true;
export const setSwapHandedness = (v: boolean): void => { swapHandedness = v; };
export const getSwapHandedness = (): boolean => swapHandedness;

export interface TrackerOptions { numHands?: number; delegate?: 'GPU' | 'CPU' }

export class HandTracker {
  private lastTs = -1;
  private constructor(private lm: HandLandmarker, public readonly delegate: 'GPU' | 'CPU') {}

  static async create(opts: TrackerOptions = {}): Promise<HandTracker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: opts.numHands ?? 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    const want = opts.delegate ?? 'GPU';
    try {
      return new HandTracker(await make(want), want);
    } catch (e) {
      if (want === 'CPU') throw e;
      console.warn('[tracker] GPU delegate failed, falling back to CPU', e);
      return new HandTracker(await make('CPU'), 'CPU');
    }
  }

  /** Run detection on the current video frame. nowMs must be monotonic. */
  detect(video: HTMLVideoElement, nowMs: number): HandFrame[] {
    if (video.videoWidth === 0 || video.videoHeight === 0) return [];
    let ts = Math.round(nowMs);
    if (ts <= this.lastTs) ts = this.lastTs + 1; // detectForVideo needs strictly increasing timestamps
    this.lastTs = ts;
    const res = this.lm.detectForVideo(video, ts);
    return toFrames(res, nowMs);
  }

  close(): void { this.lm.close(); }
}

function toFrames(res: HandLandmarkerResult, t: number): HandFrame[] {
  const out: HandFrame[] = [];
  for (let i = 0; i < res.landmarks.length; i++) {
    const cat = res.handedness[i]?.[0];
    const label = (cat?.categoryName ?? 'Right') as Hand;
    const hand: Hand = swapHandedness ? (label === 'Left' ? 'Right' : 'Left') : label;
    out.push({
      t,
      landmarks: res.landmarks[i].map((p) => ({ x: p.x, y: p.y, z: p.z })),
      world: (res.worldLandmarks[i] ?? res.landmarks[i]).map((p) => ({ x: p.x, y: p.y, z: p.z })),
      hand,
      score: cat?.score ?? 1,
    });
  }
  return out;
}
