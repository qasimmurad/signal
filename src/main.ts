/**
 * Signal: a cobot that reads hand signs. A simulated arm packs parts into boxes. Five one-handed
 * signs from a webcam control it: STOP, HOLD, GO, SLOW and "that one". The robot answers on its
 * stack light and with a caption, and the screen measures how fast it obeyed.
 */
import './style.css';
import { World } from './sim/world';
import { Cycle, SPEED, type Mode } from './sim/cycle';
import { TRAY, type Part } from './sim/cell';
import { SignRecognizer, type SignFrame } from './signs/recognizer';
import { SIGNS, type SignName } from './signs/vocabulary';
import { Scene } from './ui/scene';
import { Hud } from './ui/hud';
import { startCamera, onEveryVideoFrame } from './vision/camera';
import { HandTracker } from './vision/tracker';
import { describeFeatures } from './vision/features';
import type { HandFrame } from './vision/types';

const world = new World();
const cycle = new Cycle(world.cell);
const recognizer = new SignRecognizer();
const scene = new Scene(document.getElementById('scene') as HTMLCanvasElement);
const hud = new Hud();

let signFrame: SignFrame = { fired: null, active: null, firstSeenMs: null, frames: 0, score: 0, scores: {}, pointer: null, features: null };
let lastHand: HandFrame[] = [];
let signsRead = 0;
const reactions: number[] = [];
let lastReaction: number | null = null;
/** a STOP is being timed: from the first frame the hand was in the sign until the tip stands still */
let stopTimer: { sinceMs: number } | null = null;
let candidate: Part | null = null;
let candidateSince = 0;
let selected: Part | null = null;
let showDebug = false;

const nowMs = () => performance.now();

function median(xs: number[]): number | null { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

function apply(sign: SignName, firstSeenMs: number | null, source: 'sign' | 'key'): void {
  const tip = world.tip;
  const prev = cycle.mode;
  let detail = '';
  switch (sign) {
    case 'STOP':
      cycle.setMode('stopped', tip);
      stopTimer = { sinceMs: firstSeenMs ?? nowMs() };
      detail = 'robot stopped';
      hud.showCaption('STOP', 'STOP', 'robot stopped · show 👍 to resume');
      break;
    case 'HOLD':
      if (prev === 'stopped') { detail = 'already stopped'; break; }
      cycle.setMode('hold', tip);
      detail = 'robot holding';
      hud.showCaption('HOLD', 'HOLD', 'robot holding in place');
      break;
    case 'GO':
      if (prev === 'running') { detail = 'already running'; break; }
      cycle.setMode('running', tip);
      detail = prev === 'stopped' ? 'resumed from stop' : prev === 'hold' ? 'resumed from hold' : 'back to full speed';
      hud.showCaption('GO', 'GO', detail);
      break;
    case 'SLOW':
      if (prev === 'stopped') { detail = 'ignored while stopped'; break; }
      cycle.setMode('slow', tip);
      detail = 'a third of the speed';
      hud.showCaption('SLOW', 'SLOW', 'robot running at a third of its speed');
      break;
    case 'POINT':
      return; // handled continuously
  }
  if (source === 'sign') signsRead++;
  hud.addLog({ t: world.t, sign: source === 'key' ? 'KEY' : sign, detail: source === 'key' ? `${sign.toLowerCase()} · ${detail}` : detail });
}

/** map the pointing fingertip onto the tray grid and pick the nearest remaining part */
function partUnderPointer(p: { x: number; y: number }): Part | null {
  const rem = world.cell.remaining;
  if (!rem.length) return null;
  const gx = TRAY.center.x + (p.x - 0.5) * 0.22; // left/right of the frame → left/right of the tray
  const gz = TRAY.center.z + (p.y - 0.5) * 0.22; // high in the frame → far row
  let best: Part | null = null, bd = Infinity;
  for (const part of rem) { const d = Math.hypot(part.pos.x - gx, part.pos.z - gz); if (d < bd) { bd = d; best = part; } }
  return best;
}

function thatOne(part: Part, source: 'sign' | 'key'): void {
  if (part.placed) return;
  selected = part;
  cycle.requestNext(part);
  if (source === 'sign') signsRead++;
  hud.showCaption('POINT', 'THAT ONE', `the ${part.color} part goes next`);
  hud.addLog({ t: world.t, sign: source === 'key' ? 'KEY' : 'POINT', detail: `${part.color} part next` });
}

let last = nowMs();
function loop(): void {
  const t = nowMs();
  const dt = Math.min(0.05, (t - last) / 1000); last = t;

  // pointing selects continuously; a steady point on the same part for 600 ms confirms it
  if (signFrame.active === 'POINT' && signFrame.pointer) {
    const c = partUnderPointer(signFrame.pointer);
    if (c !== candidate) { candidate = c; candidateSince = t; }
    else if (candidate && t - candidateSince > 600 && selected !== candidate) thatOne(candidate, 'sign');
  } else { candidate = null; }
  if (selected && (selected.placed || selected.held)) selected = null;

  world.speedScale = SPEED[cycle.mode];
  const target = cycle.tick(dt, world.tip, world.t);
  world.step(dt, target);

  if (stopTimer && world.tipSpeed < 0.001) {
    const ms = t - stopTimer.sinceMs;
    stopTimer = null; reactions.push(ms); lastReaction = ms;
    hud.addLog({ t: world.t, sign: 'STOP', detail: 'standstill', reactionMs: ms });
  }

  const blink = Math.floor(t / 500) % 2 === 0;
  scene.update(world, cycle, cycle.mode, candidate, selected, blink);
  scene.render();
  hud.setMode(cycle.mode, cycle.phase);
  hud.setStats({ boxes: world.cell.boxesShipped, parts: world.cell.partsPacked, signs: signsRead, stops: reactions.length, medianReaction: median(reactions), lastReaction });
  if (showDebug) {
    const f = signFrame.features;
    const sc = SIGNS.map((s) => `${s.name.padEnd(5)} ${(signFrame.scores[s.name] ?? 0).toFixed(2)}`).join('  ');
    hud.setDebug(`${sc}\nactive ${signFrame.active ?? '-'} frames ${signFrame.frames}\n${f ? describeFeatures(f) : 'no hand'}`);
  }
  requestAnimationFrame(loop);
}

// keyboard fallback
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 's') apply('STOP', null, 'key');
  if (k === 'h') apply('HOLD', null, 'key');
  if (k === 'g') apply('GO', null, 'key');
  if (k === 'l') apply('SLOW', null, 'key');
  if (k >= '1' && k <= '4') { const p = world.cell.parts.find((x) => x.slot === Number(k) - 1 && !x.placed); if (p) thatOne(p, 'key'); }
  if (k === 'd') { showDebug = !showDebug; if (!showDebug) hud.setDebug(null); }
  if (k === 'c') void enableCamera();
});

// camera + signs
let camOn = false;
async function enableCamera(): Promise<void> {
  if (camOn) return;
  camOn = true;
  const video = document.getElementById('cam') as HTMLVideoElement;
  try {
    hud.setCam('starting camera…', true);
    await startCamera(video, { width: 640, height: 480, fps: 30 });
    hud.setCam('loading hand model…', true);
    const tracker = await HandTracker.create({ numHands: 1 });
    hud.setCam(`reading signs · ${tracker.delegate}`, true);
    onEveryVideoFrame(video, (ms) => {
      lastHand = tracker.detect(video, ms);
      signFrame = recognizer.update(lastHand, ms);
      hud.setSigns(signFrame);
      hud.drawHand(lastHand, signFrame);
      if (signFrame.fired && signFrame.fired !== 'POINT') apply(signFrame.fired, signFrame.firstSeenMs, 'sign');
    });
  } catch (e) {
    camOn = false;
    hud.setCam('camera unavailable · keys still work', false);
    hud.toast(`Camera: ${(e as Error).message}`, 'warn');
  }
}
document.getElementById('btn-cam')!.addEventListener('click', () => void enableCamera());

hud.toast('Show ✋ to stop the robot. Keys S H G L work without a camera.');
requestAnimationFrame(loop);
