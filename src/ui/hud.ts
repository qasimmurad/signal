/** DOM side of the console. Nothing here decides anything; it shows state and forwards clicks. */
import type { Intent } from '../policy/policy';
import type { Agent, Queued } from '../policy/agent';
import { taskLabel, TASK_KINDS } from '../policy/tasks';
import type { Recorder } from '../data/recorder';
import { computeStats, recommend, autonomousRate, interventionRate, meanRecovery, calibrationGap, totals } from '../data/trust';
import type { HandFrame } from '../vision/types';
import { HAND_CONNECTIONS } from '../vision/landmarks';
import type { HandSignal } from '../control/hand';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
export type ModeKind = 'policy' | 'human' | 'idle' | 'waiting' | 'nudge';

export class Hud {
  mode = $('mode'); safety = $('safety');
  intentTask = $('intent-task'); intentStep = $('intent-step'); confFill = $('conf-fill'); confVal = $('conf-val'); intentStatus = $('intent-status');
  queue = $('queue'); approval = $('approval'); approvalText = $('approval-text');
  trustBody = $('trust').querySelector('tbody') as HTMLTableSectionElement; kpis = $('kpis');
  episodes = $('episodes'); exportMeta = $('export-meta');
  camBox = $('cam-box'); camStatus = $('cam-status'); handCanvas = $<HTMLCanvasElement>('hand');
  toasts = $('toasts'); voiceBtn = $<HTMLButtonElement>('btn-voice');

  setMode(kind: ModeKind, text: string): void { this.mode.dataset.kind = kind; this.mode.textContent = text; }

  setSafety(speedPct: number, zone: boolean, clamped: boolean, reachable: boolean): void {
    const parts = [`speed ${Math.round(speedPct)}%`];
    if (zone) parts.push('person in zone → slow');
    if (clamped) parts.push('target clamped to workspace');
    if (!reachable) parts.push('out of reach');
    if (!zone && !clamped && reachable) parts.push('workspace ok');
    this.safety.textContent = parts.join(' · ');
    this.safety.classList.toggle('warn', zone || clamped || !reachable);
  }

  setIntent(it: Intent, countdown: number | null): void {
    this.intentTask.textContent = it.task ? taskLabel(it.task) : 'idle';
    this.intentStep.textContent = it.task ? it.step : '';
    const pct = it.task ? Math.round(it.confidence * 100) : 0;
    (this.confFill as HTMLElement).style.width = `${pct}%`;
    this.confFill.classList.toggle('low', it.confidence < 0.45);
    this.confVal.textContent = it.task ? `${pct}%` : '--';
    let text = it.note, cls = '';
    if (it.status === 'stuck') { text = `stuck — ${it.note.replace(/^stuck: /, '')}. Nudge it.`; cls = 'warn'; }
    if (it.status === 'claimed_done') { text = 'reported success, but the panel disagrees. Nudge it or skip.'; cls = 'warn'; }
    if (it.status === 'done') { text = `done — ${it.note}`; cls = 'ok'; }
    if (countdown !== null && (it.status === 'stuck' || it.status === 'claimed_done')) text += ` (${Math.ceil(countdown)}s)`;
    if (it.failure && it.status === 'running') text += ` · injected: ${it.failure.replace('_', ' ')}`;
    this.intentStatus.textContent = text;
    this.intentStatus.className = `status ${cls}`;
  }

  setQueue(agent: Agent, running: boolean): void {
    this.queue.innerHTML = '';
    agent.queue.forEach((q, i) => {
      const li = document.createElement('li');
      li.textContent = `${taskLabel(q.task)}${q.needsApproval ? ` · risk ${q.risk.toFixed(2)}` : ''}${q.source ? ` · ${q.source}` : ''}`;
      if (i === 0 && running) li.classList.add('current');
      if (q.needsApproval && !q.approved) li.classList.add('held');
      this.queue.appendChild(li);
    });
  }

  setApproval(q: Queued | null): void {
    this.approval.classList.toggle('hidden', !q);
    if (q) this.approvalText.textContent = `"${taskLabel(q.task)}" carries risk ${q.risk.toFixed(2)}, above the ${'0.60'} threshold. Approve?`;
  }

  setTrust(recorder: Recorder): void {
    const st = computeStats(recorder.episodes);
    this.trustBody.innerHTML = '';
    for (const k of TASK_KINDS) {
      const s = st[k];
      const rec = recommend(s);
      const gap = calibrationGap(s);
      const rec_s = meanRecovery(s);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${k}</td><td>${s.attempts}</td><td>${s.attempts ? Math.round(autonomousRate(s) * 100) + '%' : '–'}</td><td>${s.attempts ? interventionRate(s).toFixed(1) : '–'}</td><td>${rec_s === null ? '–' : rec_s.toFixed(1) + 's'}</td><td class="${gap !== null && gap > 0.15 ? 'over' : ''}">${gap === null ? '–' : (gap >= 0 ? '+' : '') + gap.toFixed(2)}</td><td><span class="lvl ${rec.level.replace(' ', '-')}" title="${rec.reason}">${rec.level}</span></td>`;
      this.trustBody.appendChild(tr);
    }
    const t = totals(recorder.episodes);
    this.kpis.innerHTML = [
      ['attempts', String(t.attempts)],
      ['succeeded', String(t.successes)],
      ['nudges/min', t.interventionsPerMin.toFixed(1)],
      ['recovery', t.recoveryS === null ? '–' : `${t.recoveryS.toFixed(1)}s`],
    ].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  setEpisodes(recorder: Recorder): void {
    const eps = recorder.episodes.slice().reverse();
    this.episodes.innerHTML = '';
    for (const e of eps) {
      const li = document.createElement('li');
      const by = e.completedBy ? ` · by ${e.completedBy.replace(/_/g, ' ')}` : '';
      const inj = e.failureInjected ? ` · injected ${e.failureInjected.replace('_', ' ')}` : '';
      const claimed = e.claimedSuccess ? ' · policy claimed success' : '';
      li.innerHTML = `<div class="head"><span class="idx">#${e.index + 1}</span><span>${e.label}</span><span class="out ${e.outcome}">${e.outcome}</span></div><div class="meta">${(e.tEnd - e.tStart).toFixed(1)}s${by}${inj}${claimed} · ${e.interventions.length} nudge${e.interventions.length === 1 ? '' : 's'}</div>`;
      for (const iv of e.interventions) { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = iv.label; li.appendChild(d); }
      this.episodes.appendChild(li);
    }
    const n = recorder.episodes.length, f = recorder.episodes.reduce((a, e) => a + e.frames.length, 0), c = recorder.episodes.reduce((a, e) => a + e.interventions.length, 0);
    this.exportMeta.textContent = `${n} episode${n === 1 ? '' : 's'} · ${f} frames · ${c} correction${c === 1 ? '' : 's'}`;
  }

  setVoice(listening: boolean, supported: boolean): void {
    this.voiceBtn.textContent = !supported ? '🎤 voice n/a' : listening ? '🎤 listening…' : '🎤 voice off';
    this.voiceBtn.disabled = !supported;
  }

  setCam(text: string, on: boolean): void { this.camStatus.textContent = text; this.camBox.classList.toggle('on', on); }

  toast(msg: string, kind: '' | 'warn' | 'human' | 'ok' = ''): void {
    const d = document.createElement('div');
    d.className = `toast ${kind}`; d.textContent = msg;
    this.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3500);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }

  drawHand(frames: HandFrame[], sig: HandSignal): void {
    const c = this.handCanvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    this.camBox.classList.toggle('pinch', sig.pinching);
    this.camBox.classList.toggle('zone', sig.inZone);
    const f = frames[0];
    if (!f) return;
    const P = (i: number) => ({ x: (1 - f.landmarks[i].x) * w, y: f.landmarks[i].y * h });
    g.lineWidth = 2; g.strokeStyle = sig.pinching ? '#ff3bd4' : 'rgba(25,211,255,0.8)';
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) { const p = P(a), q = P(b); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
    g.stroke();
    g.fillStyle = g.strokeStyle;
    for (let i = 0; i < 21; i++) { const p = P(i); g.beginPath(); g.arc(p.x, p.y, 2.5, 0, Math.PI * 2); g.fill(); }
    if (sig.cursor) {
      const r = 10 + (1 - sig.pinchAmount) * 10;
      g.beginPath(); g.arc(sig.cursor.x * w, sig.cursor.y * h, r, 0, Math.PI * 2);
      g.strokeStyle = sig.pinching ? '#ff3bd4' : '#ffa02e'; g.lineWidth = 2; g.stroke();
    }
  }
}
