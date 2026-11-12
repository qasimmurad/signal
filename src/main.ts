/**
 * Signal: a cobot that reads hand signs. A simulated arm packs parts into boxes. Four one-handed
 * signs from a webcam control it: STOP, GO, SLOW and GIVE ME. The robot answers on its stack light
 * and with a caption, and the screen measures how fast it obeyed.
 */
import './style.css';
import { World } from './sim/world';
import { Cycle, SPEED } from './sim/cycle';
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

let signFrame: SignFrame = { fired: null, active: null, firstSeenMs: null, frames: 0, score: 0, scores: {}, nearest: null, features: null };
let lastHand: HandFrame[] = [];
let signsRead = 0;
const reactions: number[] = [];
let lastReaction: number | null = null;
/** a STOP is being timed: from the first frame the hand was in the sign until the tip stands still */
let stopTimer: { sinceMs: number } | null = null;
/** when the last STOP fired, so a SLOW right after it reads as "two hands, the second arrived late" */
let lastStopMs = -Infinity;
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
      lastStopMs = nowMs();
      detail = 'robot stopped';
      hud.showCaption('STOP', 'STOP', 'robot stopped · show 👍 to resume');
      break;
    case 'GO':
      if (prev === 'running') { detail = 'already running'; break; }
      cycle.setMode('running', tip);
      detail = prev === 'stopped' ? 'resumed from stop' : 'back to full speed';
      hud.showCaption('GO', 'GO', detail);
      break;
    case 'SLOW':
      if (prev === 'stopped' && nowMs() - lastStopMs > 700) { detail = 'ignored while stopped'; break; }
      cycle.setMode('slow', tip);
      detail = prev === 'stopped' ? 'both hands: slow, not stop' : 'a third of the speed';
      hud.showCaption('SLOW', 'SLOW', 'robot running at a third of its speed');
      break;
    case 'GIVE': {
      const ok = cycle.requestHandover();
      detail = !ok ? 'already bringing you one' : prev === 'stopped' ? 'will bring you the next part after GO' : 'bringing you the next part';
      hud.showCaption('GIVE', 'GIVE ME', detail);
      break;
    }
  }
  if (source === 'sign') signsRead++;
  hud.addLog({ t: world.t, sign: source === 'key' ? 'KEY' : sign, detail: source === 'key' ? `${SIGNS.find((s) => s.name === sign)!.label.toLowerCase()} · ${detail}` : detail });
}

/** fixed simulation step, so sim time tracks wall time whatever the display's frame rate */
const STEP = 1 / 120;
let acc = 0;
let last = nowMs();
function loop(): void {
  const t = nowMs();
  acc += Math.min(0.6, (t - last) / 1000); last = t;

  world.speedScale = SPEED[cycle.mode];
  while (acc >= STEP) {
    const target = cycle.tick(STEP, world.tip, world.t);
    world.step(STEP, target);
    acc -= STEP;
    if (stopTimer && world.tipSpeed < 0.001) {
      const ms = t - stopTimer.sinceMs;
      stopTimer = null; reactions.push(ms); lastReaction = ms;
      hud.addLog({ t: world.t, sign: 'STOP', detail: 'standstill', reactionMs: ms });
    }
  }
  for (const e of cycle.events.splice(0)) {
    if (e.kind === 'offered') hud.showCaption('GIVE', 'HERE YOU GO', `take the ${e.part.color} part`);
    if (e.kind === 'taken') hud.addLog({ t: world.t, sign: 'GIVE', detail: `${e.part.color} part taken · back to packing` });
  }

  scene.update(world, cycle, cycle.mode);
  scene.render();
  hud.setMode(cycle.mode, cycle.phase);
  hud.setStats({ boxes: world.cell.boxesShipped, parts: world.cell.partsPacked, handovers: world.cell.handedOver, signs: signsRead, stops: reactions.length, medianReaction: median(reactions), lastReaction });
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
  if (k === 'g') apply('GO', null, 'key');
  if (k === 'l') apply('SLOW', null, 'key');
  if (k === 'h') apply('GIVE', null, 'key');
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
    const tracker = await HandTracker.create({ numHands: 2 });
    hud.setCam(`reading signs · ${tracker.delegate}`, true);
    onEveryVideoFrame(video, (ms) => {
      lastHand = tracker.detect(video, ms);
      signFrame = recognizer.update(lastHand, ms);
      hud.setSigns(signFrame);
      hud.drawHand(lastHand, signFrame);
      if (signFrame.fired) apply(signFrame.fired, signFrame.firstSeenMs, 'sign');
    });
  } catch (e) {
    camOn = false;
    const err = e as Error;
    const why = err.name === 'NotAllowedError' ? 'camera permission denied — allow it in the address bar and click again'
      : err.name === 'NotFoundError' ? 'no camera found on this device'
      : err.name === 'NotReadableError' ? 'camera is in use by another app'
      : err.message;
    hud.setCam(`camera off · ${why} · keys still work`, false);
    hud.toast(`Camera: ${why}`, 'warn');
  }
}
document.getElementById('btn-cam')!.addEventListener('click', () => void enableCamera());

hud.toast('Show ✋ to stop the robot, 🙌 to slow it. Keys S G L H work without a camera.');
requestAnimationFrame(loop);
