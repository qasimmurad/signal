/**
 * Nudge: a shared-autonomy console. A scripted policy works a BusyBox-style panel with a simulated
 * arm; when it goes wrong you take the gripper with a pinch, a word, a pointer or the keys, and the
 * console records what it was trying to do, what you did, and whether that fixed it.
 */
import './style.css';
import { World } from './sim/world';
import { Policy } from './policy/policy';
import { Agent, parseInstruction } from './policy/agent';
import { goalMet, taskLabel, type Task } from './policy/tasks';
import { Recorder, type Modality, type CompletedBy, type Outcome } from './data/recorder';
import { Scene } from './ui/scene';
import { Hud, type ModeKind } from './ui/hud';
import { HandController, type HandSignal } from './control/hand';
import { KeyboardController } from './control/keyboard';
import { Voice, parseNudge } from './control/voice';
import { Dwell } from './control/dwell';
import { startCamera, onEveryVideoFrame } from './vision/camera';
import { HandTracker } from './vision/tracker';
import { type V3, add, scale, copy } from './sim/vec';
import type { ButtonColor, PanelState } from './sim/panel';

const world = new World();
const policy = new Policy(7);
/** carries out tasks a person chose by pointer or voice; its motion is attributed to the human */
const assist = new Policy(99);
const agent = new Agent();
const recorder = new Recorder();
const hud = new Hud();
const scene = new Scene(document.getElementById('scene') as HTMLCanvasElement);
const hand = new HandController();
const keys = new KeyboardController(() => document.activeElement instanceof HTMLInputElement);
const dwell = new Dwell(750);

const WAIT_S = 14;
let chaos = 0.55;
let handSignal: HandSignal = { present: false, pinching: false, inZone: false, delta: null, cursor: null, pinchAmount: 0 };
let humanAnchor: V3 | null = null;
let voiceHold: { until: number; target: V3 } | null = null;
let assistModality: Modality = 'dwell';
let wasHuman = false;
let completedBy: CompletedBy = null;
let goalSeen = false;
let claimed = false;
let waitSince: number | null = null;
let uiTick = 0;

const now = () => performance.now() / 1000;

// ---------- episodes ----------
function startTask(task: Task): void {
  policy.start(task, world.panel.state, chaos);
  recorder.startEpisode(task, policy.intent.failure, world.t);
  goalSeen = false; completedBy = null; claimed = false; waitSince = null;
  hud.toast(`Policy: ${taskLabel(task)}`);
}

function closeEpisode(outcome: Outcome): void {
  const ep = recorder.current;
  if (!ep) return;
  if (recorder.interventionOpen) recorder.endIntervention(world.t, world.tip, world.panel.snapshot(), outcome === 'success' ? 'Task completed by the human.' : 'Task abandoned.');
  const by: CompletedBy = outcome === 'success' ? (completedBy ?? (ep.interventions.length ? 'policy_after_nudge' : 'policy')) : null;
  recorder.endEpisode(world.t, outcome, by, claimed);
  agent.shift();
  policy.stop();
  waitSince = null;
  hud.toast(`${ep.label}: ${outcome}${by ? ` (${by.replace(/_/g, ' ')})` : ''}`, outcome === 'success' ? 'ok' : 'warn');
  hud.setEpisodes(recorder); hud.setTrust(recorder);
}

function taskFromKey(key: string, s: PanelState): Task | null {
  const [kind, val] = key.split(':');
  if (kind === 'button') return { kind: 'press', color: val as ButtonColor };
  if (kind === 'switch') return { kind: 'switch', up: !s.switchUp };
  if (kind === 'knob') return { kind: 'knob', to: (s.knob + 1) % 6 };
  if (kind === 'slider') return { kind: 'slider', to: parseFloat(val ?? '0.5') };
  return null;
}

function runAssist(task: Task, modality: Modality): void {
  assistModality = modality;
  assist.start(task, world.panel.state, 0, { force: true });
  hud.toast(`You (${modality}): ${taskLabel(task)}`, 'human');
}

function instruct(text: string, source: string): void {
  const tasks = parseInstruction(text, world.panel.state);
  if (!tasks.length) { hud.toast(`Didn't catch a task in "${text}"`, 'warn'); return; }
  const added = agent.enqueue(tasks, source);
  const held = added.filter((q) => q.needsApproval).length;
  hud.toast(`Queued ${tasks.length} task${tasks.length === 1 ? '' : 's'}${held ? `, ${held} waiting for approval` : ''}`);
  hud.setQueue(agent, policy.active);
}

// ---------- the loop ----------
let last = now();
function loop(): void {
  const t = now();
  const dt = Math.min(0.05, t - last); last = t;

  if (policy.intent.status === 'done') closeEpisode('success');
  if (policy.intent.status === 'idle') { const q = agent.next(); if (q) startTask(q.task); }

  // who is driving this frame
  let humanTarget: V3 | null = null;
  let modality: Modality = 'hand';
  if (handSignal.pinching && handSignal.delta) {
    if (!humanAnchor) humanAnchor = copy(world.target);
    humanTarget = add(humanAnchor, handSignal.delta); modality = 'hand';
  } else humanAnchor = null;
  if (!humanTarget && keys.active) { humanTarget = add(world.target, scale(keys.velocity(), dt)); modality = 'keyboard'; }
  if (!humanTarget && voiceHold) {
    if (t < voiceHold.until) { humanTarget = voiceHold.target; modality = 'voice'; } else voiceHold = null;
  }
  if (!humanTarget && assist.active) {
    const at = assist.tick(dt, world.tip, world.panel.state);
    if (at) { humanTarget = at; modality = assistModality; }
    else assist.stop();
  }
  const humanActive = !!humanTarget;

  if (humanActive && !wasHuman) {
    recorder.beginIntervention(world.t, modality, policy.intent, world.tip, world.panel.snapshot());
    if (policy.active) hud.toast(`You took over (${modality}) while the policy was "${policy.intent.step}"`, 'human');
  }
  if (!humanActive && wasHuman) {
    const r = policy.active ? policy.handback(world.tip, world.panel.state) : 'resumed';
    const note = r === 'done' ? 'Task completed by the human.' : r === 'replanned' ? 'Policy replanned from the nudge and continued.' : 'Policy resumed.';
    const iv = recorder.endIntervention(world.t, world.tip, world.panel.snapshot(), note);
    if (iv) hud.toast(`Handed back · ${note}`, r === 'done' ? 'ok' : '');
    waitSince = null;
    hud.setEpisodes(recorder);
  }
  wasHuman = humanActive;

  const zone = handSignal.inZone;
  world.speedScale = zone ? 0.35 : 1;

  if (humanActive) world.step(dt, humanTarget, 'human');
  else { const pt = policy.tick(dt, world.tip, world.panel.state); world.step(dt, pt, pt ? 'policy' : 'idle'); }

  // episode bookkeeping
  const ep = recorder.current;
  let countdown: number | null = null;
  if (ep) {
    if (!goalSeen && goalMet(ep.task, world.panel.state)) {
      goalSeen = true;
      completedBy = world.controller === 'human' ? 'human' : ep.interventions.length || recorder.interventionOpen ? 'policy_after_nudge' : 'policy';
    }
    recorder.frame(dt, world.t, world.controller, world.controller === 'idle' ? null : world.target, world.tip, world.arm.joints, policy.intent);
    const st = policy.intent.status;
    if (st === 'claimed_done') claimed = true;
    if (st === 'done') closeEpisode('success');
    else if ((st === 'stuck' || st === 'claimed_done') && !humanActive) {
      if (waitSince === null) { waitSince = world.t; hud.toast(st === 'claimed_done' ? 'Policy reported success. The panel disagrees.' : 'Policy is stuck and asking for a nudge.', 'warn'); }
      countdown = WAIT_S - (world.t - waitSince);
      if (countdown <= 0) closeEpisode('failed');
    }
  }

  // view
  scene.update(world, world.controller, zone, dwell.progress);
  scene.render();
  const it = policy.intent;
  const mode: [ModeKind, string] = humanActive ? ['human', `YOU ARE DRIVING · ${modality}`]
    : agent.waiting && !policy.active ? ['waiting', 'WAITING FOR APPROVAL']
    : it.status === 'stuck' || it.status === 'claimed_done' ? ['nudge', 'NEEDS A NUDGE']
    : policy.active ? ['policy', 'POLICY DRIVING'] : ['idle', 'IDLE · give an instruction'];
  hud.setMode(mode[0], mode[1]);
  hud.setSafety(world.speedScale * 100, zone, world.clamped && world.controller !== 'idle', world.reachable);
  hud.setIntent(it, countdown);
  if ((uiTick++ & 15) === 0) { hud.setQueue(agent, policy.active); hud.setApproval(agent.waiting && !policy.active ? agent.waiting : null); }
  requestAnimationFrame(loop);
}

// ---------- inputs ----------
const form = document.getElementById('instruct-form') as HTMLFormElement;
const input = document.getElementById('instruct') as HTMLInputElement;
form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) { instruct(input.value, 'typed'); input.value = ''; input.blur(); } });
document.querySelectorAll<HTMLButtonElement>('.chips button').forEach((b) => b.addEventListener('click', () => instruct(b.dataset.say ?? '', 'click')));
document.getElementById('btn-demo')!.addEventListener('click', () => instruct('press the red button, then flip the switch up, turn the knob to 3, set the slider to 75%, press the blue button, then press the green button', 'demo'));
const chaosEl = document.getElementById('chaos') as HTMLInputElement;
chaosEl.addEventListener('input', () => { chaos = Number(chaosEl.value) / 100; document.getElementById('chaos-val')!.textContent = `${chaosEl.value}%`; });
document.getElementById('btn-approve')!.addEventListener('click', () => { agent.approve(); hud.setApproval(null); });
document.getElementById('btn-reject')!.addEventListener('click', () => { const q = agent.reject(); if (q) hud.toast(`Rejected: ${taskLabel(q.task)}`, 'warn'); hud.setQueue(agent, policy.active); });
document.getElementById('btn-skip')!.addEventListener('click', () => { if (recorder.current) closeEpisode('skipped'); });
document.getElementById('btn-export')!.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(recorder.export(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nudge-dataset-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

window.addEventListener('keydown', (e) => {
  if (document.activeElement instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (k === 'y') { agent.approve(); hud.setApproval(null); }
  if (k === 'n') { const q = agent.reject(); if (q) hud.toast(`Rejected: ${taskLabel(q.task)}`, 'warn'); }
  if (k === 'x' && recorder.current) closeEpisode('skipped');
  if (k === 'v') voice.toggle();
  if (k === 'c') void enableCamera();
});

// voice
const voice = new Voice((text) => {
  const n = parseNudge(text);
  hud.toast(`heard: "${text.trim()}"`);
  if (n) {
    if (n.kind === 'stop') voiceHold = { until: now() + 4, target: copy(world.tip) };
    if (n.kind === 'go') voiceHold = null;
    if (n.kind === 'move') voiceHold = { until: now() + 1.1, target: add(voiceHold ? voiceHold.target : world.target, n.delta) };
    if (n.kind === 'approve') { agent.approve(); hud.setApproval(null); }
    if (n.kind === 'reject') agent.reject();
    if (n.kind === 'skip' && recorder.current) closeEpisode('skipped');
    return;
  }
  const tasks = parseInstruction(text, world.panel.state);
  if (tasks.length === 1 && policy.active) runAssist(tasks[0], 'voice'); // "the red one" while the policy is confused
  else instruct(text, 'voice');
}, (listening) => hud.setVoice(listening, voice.supported));
hud.setVoice(false, voice.supported);
document.getElementById('btn-voice')!.addEventListener('click', () => voice.toggle());

// dwell pointer
const sceneCanvas = document.getElementById('scene') as HTMLCanvasElement;
sceneCanvas.addEventListener('pointermove', (e) => {
  if (e.buttons !== 0) { dwell.reset(); scene.setHover(null); return; }
  const key = scene.pick(e.clientX, e.clientY);
  scene.setHover(key);
  const fired = dwell.update(key, performance.now());
  if (fired) { const task = taskFromKey(fired, world.panel.state); if (task) runAssist(task, 'dwell'); }
});
sceneCanvas.addEventListener('pointerleave', () => { dwell.reset(); scene.setHover(null); });

// camera + hand tracking
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
    hud.setCam(`hand control on · ${tracker.delegate}`, true);
    onEveryVideoFrame(video, (nowMs) => {
      const frames = tracker.detect(video, nowMs);
      handSignal = hand.update(frames, nowMs);
      hud.drawHand(frames, handSignal);
    });
  } catch (e) {
    camOn = false;
    hud.setCam('camera unavailable', false);
    hud.toast(`Camera: ${(e as Error).message}`, 'warn');
  }
}
document.getElementById('btn-cam')!.addEventListener('click', () => void enableCamera());

hud.setTrust(recorder); hud.setEpisodes(recorder);
hud.toast('Give the robot a task, then nudge it when it gets it wrong.');
requestAnimationFrame(loop);
