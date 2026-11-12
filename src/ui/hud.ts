/** DOM side of the cell screen: caption, vocabulary, log, shift numbers, camera view. */
import { SIGNS, type SignName } from '../signs/vocabulary';
import type { SignFrame } from '../signs/recognizer';
import type { Mode, Phase } from '../sim/cycle';
import type { HandFrame } from '../vision/types';
import { HAND_CONNECTIONS, INDEX_TIP } from '../vision/landmarks';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface LogEntry { t: number; sign: SignName | 'KEY'; detail: string; reactionMs?: number }

export class Hud {
  private mode = $('mode'); private phase = $('phase');
  private caption = $('caption'); private capEmoji = $('caption-emoji'); private capText = $('caption-text'); private capSub = $('caption-sub');
  private vocab = $('vocab'); private rows = new Map<SignName, HTMLLIElement>();
  private kpis = $('kpis'); private reaction = $('reaction');
  private log = $('log');
  private camBox = $('cam-box'); private camStatus = $('cam-status'); private camSign = $('cam-sign'); private handCanvas = $<HTMLCanvasElement>('hand');
  private debug = $('debug'); private toasts = $('toasts');
  private captionTimer = 0;

  constructor() {
    for (const s of SIGNS) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="e">${s.emoji}</span><span class="n">${s.name === 'POINT' ? 'THAT ONE' : s.name}<small>${s.hand}</small></span><span class="r">${s.robot}</span><span class="bar"><i></i></span>`;
      this.vocab.appendChild(li); this.rows.set(s.name, li);
    }
  }

  setMode(m: Mode, phase: Phase): void {
    this.mode.dataset.mode = m;
    this.mode.textContent = m === 'stopped' ? 'STOPPED · show 👍 to resume' : m === 'hold' ? 'HOLD' : m === 'slow' ? 'SLOW' : 'RUNNING';
    this.phase.textContent = phase;
  }

  showCaption(sign: SignName, text: string, sub: string): void {
    const spec = SIGNS.find((s) => s.name === sign)!;
    this.caption.dataset.kind = sign;
    this.capEmoji.textContent = spec.emoji; this.capText.textContent = text; this.capSub.textContent = sub;
    this.caption.classList.add('show');
    clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.caption.classList.remove('show'), sign === 'STOP' ? 4000 : 2200);
  }

  setSigns(sf: SignFrame): void {
    for (const [name, li] of this.rows) {
      const v = sf.scores[name] ?? 0;
      (li.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(v * 100)}%`;
      li.classList.toggle('active', sf.active === name);
      if (sf.fired === name) { li.classList.add('fired'); setTimeout(() => li.classList.remove('fired'), 600); }
    }
    const label = (n: SignName) => (n === 'POINT' ? '☝️ THAT ONE' : `${SIGNS.find((s) => s.name === n)!.emoji} ${n}`);
    if (sf.active) this.camSign.textContent = label(sf.active);
    else if (sf.nearest && sf.nearest.score > 0.2) this.camSign.textContent = `almost ${label(sf.nearest.name)} · ${Math.round(sf.nearest.score * 100)}%`;
    else this.camSign.textContent = sf.features ? 'no sign' : '';
    this.camSign.classList.toggle('almost', !sf.active);
    this.camBox.classList.toggle('active', !!sf.active);
    this.camBox.classList.toggle('STOP', sf.active === 'STOP');
  }

  setStats(s: { boxes: number; parts: number; signs: number; stops: number; medianReaction: number | null; lastReaction: number | null }): void {
    this.kpis.innerHTML = [['boxes shipped', s.boxes], ['parts packed', s.parts], ['signs read', s.signs]].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
    const r = s.lastReaction ?? s.medianReaction;
    this.reaction.innerHTML = `<b>${r === null ? '–' : Math.round(r)}</b><span>ms from STOP sign to standstill${s.medianReaction !== null && s.stops > 1 ? ` · median ${Math.round(s.medianReaction)} over ${s.stops} stops` : ''}</span>`;
  }

  addLog(e: LogEntry): void {
    const li = document.createElement('li');
    const mm = Math.floor(e.t / 60), ss = Math.floor(e.t % 60);
    li.innerHTML = `<span class="t">${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}</span><span><span class="s ${e.sign}">${e.sign === 'POINT' ? 'THAT ONE' : e.sign}</span> <span class="d">${e.detail}</span></span><span class="r">${e.reactionMs !== undefined ? `${Math.round(e.reactionMs)} ms` : ''}</span>`;
    this.log.prepend(li);
    while (this.log.children.length > 60) this.log.lastElementChild?.remove();
  }

  setCam(text: string, on: boolean): void { this.camStatus.textContent = text; this.camBox.classList.toggle('on', on); }
  setDebug(text: string | null): void { this.debug.classList.toggle('hidden', text === null); if (text !== null) this.debug.textContent = text; }
  toast(msg: string, kind: '' | 'warn' = ''): void {
    const d = document.createElement('div'); d.className = `toast ${kind}`; d.textContent = msg; this.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3300);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
  }

  drawHand(frames: HandFrame[], sf: SignFrame): void {
    const c = this.handCanvas;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const f = frames[0];
    if (!f) return;
    const P = (i: number) => ({ x: (1 - f.landmarks[i].x) * w, y: f.landmarks[i].y * h });
    const color = sf.active === 'STOP' ? '#ff3b3b' : sf.active ? '#19d3ff' : 'rgba(223,230,243,0.55)';
    g.lineWidth = 2; g.strokeStyle = color; g.fillStyle = color;
    g.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) { const p = P(a), q = P(b); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
    g.stroke();
    for (let i = 0; i < 21; i++) { const p = P(i); g.beginPath(); g.arc(p.x, p.y, 2.5, 0, Math.PI * 2); g.fill(); }
    if (sf.pointer) { const p = P(INDEX_TIP); g.beginPath(); g.arc(p.x, p.y, 12, 0, Math.PI * 2); g.strokeStyle = '#19d3ff'; g.stroke(); }
  }
}
