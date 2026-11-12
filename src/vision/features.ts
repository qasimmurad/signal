/**
 * Turns 21 hand landmarks into the geometric features the letter specs talk about.
 * Everything is computed in a canonical RIGHT-hand palm frame: a left hand is mirrored first.
 *
 * Palm frame (world coordinates, meters):
 *   u = across the palm, from the pinky knuckle toward the index knuckle (the thumb side is +u)
 *   v = up the palm, wrist -> middle knuckle
 *   n = u x v, the palm normal. For a right hand with the palm toward the camera, n points at
 *       the camera (-z in MediaPipe's camera-aligned world frame, where +z is away from the lens).
 */
import {
  WRIST, THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP, INDEX_MCP, INDEX_PIP, INDEX_TIP,
  MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP, RING_MCP, RING_PIP, RING_TIP, PINKY_MCP, PINKY_PIP, PINKY_TIP,
  FINGER_JOINTS, sub, dot, cross, norm, scale, dist, len, mid, angleDeg, bendAt, mirrorWorld, mirrorImage, smooth, clamp,
} from './landmarks';
import { FINGERS } from './types';
import type { HandFrame, HandFeatures, Curl, FingerName, ThumbPosition, PalmFacing, Direction, Vec3, Landmarks } from './types';
import { T } from './thresholds';

export interface Pointing { angle: number; forward: number; dir: Direction }

export interface ExtractedFeatures extends HandFeatures {
  pointing: Pointing;
  /** local palm-frame coordinates of the thumb tip, in palm widths */
  thumbLocal: { u: number; v: number; n: number };
  /** unit direction of the thumb (MCP -> tip) in the palm frame */
  thumbDir: { u: number; v: number; n: number };
  /** palm-frame height (v, in palm widths) of each fingertip */
  tipsV: Record<FingerName, number>;
}

export function curlFromBend(bend: number, ext: number = T.curl.extendedMax, half: number = T.curl.halfMax): Curl {
  return bend < ext ? 'extended' : bend < half ? 'half' : 'curled';
}

/** project p into the palm frame, in palm widths */
function local(p: Vec3, origin: Vec3, u: Vec3, v: Vec3, n: Vec3, pw: number) {
  const d = sub(p, origin);
  return { u: dot(d, u) / pw, v: dot(d, v) / pw, n: dot(d, n) / pw };
}

const bell = (x: number, lo: number, hi: number, soft = 0.12): number => smooth(x, lo - soft, lo) * (1 - smooth(x, hi, hi + soft));

export function extractFeatures(frame: HandFrame): ExtractedFeatures {
  const isLeft = frame.hand === 'Left';
  const W: Landmarks = isLeft ? mirrorWorld(frame.world) : frame.world;
  const I: Landmarks = isLeft ? mirrorImage(frame.landmarks) : frame.landmarks;

  const wrist = W[WRIST];
  const pw = dist(W[INDEX_MCP], W[PINKY_MCP]) || 1e-6;
  const u = norm(sub(W[INDEX_MCP], W[PINKY_MCP]));
  const v0 = sub(W[MIDDLE_MCP], wrist);
  const v = norm(sub(v0, scale(u, dot(v0, u))));
  const n = norm(cross(u, v));

  // ---- finger bends and curls ----
  const bend = {} as Record<FingerName, number>;
  const curl = {} as Record<FingerName, Curl>;
  const fingerDir = {} as Record<FingerName, Vec3>;
  for (const f of FINGERS) {
    const [m, p, d, t] = FINGER_JOINTS[f];
    // MCP flexion measured in the v-n plane so that spreading fingers (abduction) does not count as bending
    const seg = sub(W[p], W[m]);
    const segFlex = sub(seg, scale(u, dot(seg, u)));
    const bMcp = angleDeg(v, segFlex);
    const bPip = bendAt(W[m], W[p], W[d]);
    const bDip = bendAt(W[p], W[d], W[t]);
    bend[f] = bMcp + bPip + bDip;
    curl[f] = curlFromBend(bend[f]);
    fingerDir[f] = norm(sub(W[t], W[m]));
  }

  // ---- thumb ----
  const tBend = bendAt(W[THUMB_CMC], W[THUMB_MCP], W[THUMB_IP]) + bendAt(W[THUMB_MCP], W[THUMB_IP], W[THUMB_TIP]);
  const tCurl = curlFromBend(tBend, T.thumb.extendedMax, T.thumb.halfMax);
  const tt = W[THUMB_TIP];
  const td = norm(sub(tt, W[THUMB_MCP]));
  const du = dot(td, u), dv = dot(td, v), dn = dot(td, n);
  const L = (i: number) => local(W[i], wrist, u, v, n, pw);
  const lt = L(THUMB_TIP);
  const tipsV: Record<FingerName, number> = { index: L(INDEX_TIP).v, middle: L(MIDDLE_TIP).v, ring: L(RING_TIP).v, pinky: L(PINKY_TIP).v };
  const lIdxPip = L(INDEX_PIP), lMidPip = L(MIDDLE_PIP), lRingPip = L(RING_PIP), lPinkyPip = L(PINKY_PIP);
  const lIdxMcp = L(INDEX_MCP), lMidMcp = L(MIDDLE_MCP), lPinkyMcp = L(PINKY_MCP);
  const mcpV = (lIdxMcp.v + lMidMcp.v + L(RING_MCP).v + lPinkyMcp.v) / 4;
  const D = (i: number) => dist(tt, W[i]) / pw;
  const tipIdx = D(INDEX_TIP), tipMid = D(MIDDLE_TIP), tipRing = D(RING_TIP), tipPinky = D(PINKY_TIP);
  const tipIdxPip = D(INDEX_PIP), tipIdxMcp = D(INDEX_MCP);
  const thumbExt = 1 - smooth(tBend, T.thumb.extendedMax, T.thumb.halfMax);
  const knuckleHeight = 1 - smooth(Math.abs(lt.v - lIdxPip.v), 0.3, 0.6);
  const inFront = smooth(lt.n - lIdxPip.n, -0.05, 0.2);
  const betweenU = (lo: number, hi: number) => bell(lt.u, Math.min(lo, hi) - 0.02, Math.max(lo, hi) + 0.02, 0.1);
  const idxDirCos = dot(td, fingerDir.index);

  const scores: Partial<Record<ThumbPosition, number>> = {
    touching_index_tip: 1 - smooth(tipIdx, 0.2, 0.45),
    touching_fingertips: 1 - smooth(Math.min(tipMid, tipRing, tipPinky), 0.2, 0.45),
    extended_out: smooth(du, 0.3, 0.75) * thumbExt * smooth(tipIdxMcp, 0.4, 0.8),
    extended_up: smooth(dv, 0.45, 0.8) * thumbExt * smooth(Math.abs(lt.u - lIdxPip.u), 0.3, 0.6),
    alongside_index: smooth(dv, 0.2, 0.6) * (1 - smooth(Math.min(tipIdxPip, tipIdxMcp), 0.3, 0.6)) * smooth(lt.u - lIdxPip.u, -0.15, 0.08),
    // thumb laid over the front of the curled fingers (S, I, R, X): in front of the palm plane,
    // somewhere between the pinky knuckle and the index knuckle, at or above the knuckle line
    across_fingers: smooth(lt.n - lMidMcp.n, 0.05, 0.25) * bell(lt.u - lPinkyMcp.u, 0.0, 0.95, 0.15) * bell(lt.v - mcpV, -0.1, 0.6, 0.15) * smooth(tipIdx, 0.2, 0.4),
    // thumb folded flat across the palm (B, U, V, W): tip toward the pinky side, below the knuckle line
    across_palm: smooth(lMidMcp.u - lt.u, -0.1, 0.15) * bell(lt.v - mcpV, -0.75, 0.25, 0.15) * smooth(tipIdx, 0.25, 0.45) * smooth(lt.n - lMidMcp.n, -0.15, 0.05),
    under_index: betweenU(lMidPip.u, lIdxPip.u) * knuckleHeight * (1 - smooth(lt.n - lIdxPip.n, 0.3, 0.5)),
    under_middle: betweenU(lRingPip.u, lMidPip.u) * knuckleHeight * (1 - smooth(lt.n - lIdxPip.n, 0.3, 0.5)),
    under_ring: betweenU(lPinkyPip.u - 0.2, lRingPip.u) * knuckleHeight * (1 - smooth(lt.n - lIdxPip.n, 0.3, 0.5)),
    between_index_middle: (1 - smooth(dist(tt, mid(W[INDEX_PIP], W[MIDDLE_PIP])) / pw, 0.25, 0.5)) * (curl.index === 'extended' ? 1 : 0.3),
    alongside_fingers: smooth(dv, 0.0, 0.5) * bell(tipIdx, 0.4, 1.3) * smooth(tBend, 20, 50) * (1 - smooth(tBend, 100, 140)) * smooth(lt.u - lIdxMcp.u, -0.3, -0.05),
    pinned_by_index: smooth(idxDirCos, 0.75, 0.95) * thumbExt * (1 - smooth(tipIdxPip, 0.35, 0.7)),
    other: 0.15,
  };
  let position: ThumbPosition = 'other';
  let best = -1;
  for (const [k, s] of Object.entries(scores) as [ThumbPosition, number][]) {
    if (s > best) { best = s; position = k; }
  }

  // ---- palm facing ----
  let palmFacing: PalmFacing;
  if (n.z < -T.palm.frontal) palmFacing = 'forward';
  else if (n.z > T.palm.frontal) palmFacing = 'back';
  else if (Math.abs(n.y) > Math.abs(n.x)) palmFacing = n.y > 0 ? 'down' : 'up';
  else palmFacing = 'side';

  // ---- pointing direction (image space, canonical) ----
  const extended = FINGERS.filter((f) => curl[f] === 'extended');
  const pointing = extended.length ? extended : FINGERS.filter((f) => curl[f] === 'half');
  const useFingers = pointing.length ? pointing : (['middle'] as FingerName[]);
  let dx = 0, dy = 0, fwd = 0;
  for (const f of useFingers) {
    // knuckle -> first joint: the base of the finger says where it points even when the tip hooks
    const [m, p] = FINGER_JOINTS[f];
    const d2 = { x: I[p].x - I[m].x, y: I[p].y - I[m].y };
    const l2 = Math.hypot(d2.x, d2.y) || 1e-6;
    dx += d2.x / l2; dy += d2.y / l2;
    fwd += (W[m].z - W[p].z) / pw; // positive when the finger comes toward the camera
  }
  dx /= useFingers.length; dy /= useFingers.length; fwd /= useFingers.length;
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360; // 0 = up, 90 = right, 180 = down
  const dirLabel: Direction = pointing.length === 0 ? 'none'
    : fwd > T.direction.forwardDepth ? 'forward'
    : angle < 45 || angle > 315 ? 'up'
    : angle > 135 && angle < 225 ? 'down'
    : 'side';

  // ---- spread (world, MCP->TIP vectors) ----
  const spread = {
    'index-middle': angleDeg(fingerDir.index, fingerDir.middle),
    'middle-ring': angleDeg(fingerDir.middle, fingerDir.ring),
    'ring-pinky': angleDeg(fingerDir.ring, fingerDir.pinky),
  };

  // ---- fingertip contacts ----
  const contact = (f: FingerName) => { const [, pp, dd, t] = FINGER_JOINTS[f]; return Math.min(D(pp), D(dd), D(t)); };
  const touch: Record<string, number> = {
    'thumb-index': contact('index'), 'thumb-middle': contact('middle'), 'thumb-ring': contact('ring'), 'thumb-pinky': contact('pinky'),
    'index-middle': dist(W[INDEX_TIP], W[MIDDLE_TIP]) / pw,
  };

  // ---- crossed index/middle (tips swap sides across the palm) ----
  const lIdxTip = L(INDEX_TIP), lMidTip = L(MIDDLE_TIP);
  let crossed: HandFeatures['crossed'] = '';
  if (curl.index !== 'curled' && curl.middle !== 'curled' && lIdxTip.u < lMidTip.u - 0.04) {
    crossed = lIdxTip.n > lMidTip.n ? 'index-over-middle' : 'middle-over-index';
  }

  return {
    curl, bend,
    thumb: { curl: tCurl, bend: tBend, position, scores },
    palmFacing, palmNormal: n,
    fingerDirection: dirLabel,
    pointing: { angle, forward: fwd, dir: dirLabel },
    spread, touch, crossed,
    palmWidth: pw,
    hand: frame.hand,
    thumbLocal: lt,
    thumbDir: { u: du, v: dv, n: dn },
    tipsV,
  };
}

/** short human-readable summary, used by the debug readout */
export function describeFeatures(f: ExtractedFeatures): string {
  const c = (x: number) => x.toFixed(0).padStart(3);
  const lines = [
    `hand ${f.hand}  palm ${f.palmFacing} (nz ${f.palmNormal.z.toFixed(2)} ny ${f.palmNormal.y.toFixed(2)})`,
    `point ${f.pointing.dir} ${c(f.pointing.angle)}deg fwd ${f.pointing.forward.toFixed(2)}`,
    `index  ${f.curl.index.padEnd(8)} ${c(f.bend.index)}`,
    `middle ${f.curl.middle.padEnd(8)} ${c(f.bend.middle)}`,
    `ring   ${f.curl.ring.padEnd(8)} ${c(f.bend.ring)}`,
    `pinky  ${f.curl.pinky.padEnd(8)} ${c(f.bend.pinky)}`,
    `thumb  ${f.thumb.curl.padEnd(8)} ${c(f.thumb.bend)}  -> ${f.thumb.position} (${(f.thumb.scores[f.thumb.position] ?? 0).toFixed(2)})`,
    `thumb local u ${f.thumbLocal.u.toFixed(2)} v ${f.thumbLocal.v.toFixed(2)} n ${f.thumbLocal.n.toFixed(2)}`,
    `spread i-m ${c(f.spread['index-middle'])} m-r ${c(f.spread['middle-ring'])} r-p ${c(f.spread['ring-pinky'])}`,
    `touch t-i ${f.touch['thumb-index'].toFixed(2)} t-m ${f.touch['thumb-middle'].toFixed(2)} t-r ${f.touch['thumb-ring'].toFixed(2)} t-p ${f.touch['thumb-pinky'].toFixed(2)}`,
    `crossed ${f.crossed || '-'}`,
  ];
  return lines.join('\n');
}

export { clamp, len };
