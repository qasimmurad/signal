/**
 * Voice as a nudge channel, through the browser's own speech recognition. Short words halt or move
 * the gripper; whole sentences become instructions. No audio leaves the page except through the
 * browser's recognizer.
 */
import { type V3, v3 } from '../sim/vec';

export type Nudge =
  | { kind: 'stop' }
  | { kind: 'go' }
  | { kind: 'move'; delta: V3 }
  | { kind: 'approve' }
  | { kind: 'reject' }
  | { kind: 'skip' };

export function parseNudge(text: string): Nudge | null {
  const t = text.toLowerCase().trim();
  if (/^(stop|halt|wait|freeze|hold on|hold it)\b/.test(t)) return { kind: 'stop' };
  if (/^(yes|approve|approved|go ahead|do it|confirm)\b/.test(t)) return { kind: 'approve' };
  if (/^(go|continue|carry on|resume|ok go|okay go|okay|ok)$/.test(t)) return { kind: 'go' };
  if (/^(no|reject|cancel|don't|do not)\b/.test(t)) return { kind: 'reject' };
  if (/^(skip|give up|next)\b/.test(t)) return { kind: 'skip' };
  const amount = /\b(a lot|more|further|way)\b/.test(t) ? 0.05 : /\b(a bit|a little|slightly|a touch)\b/.test(t) ? 0.02 : 0.03;
  const m = t.match(/\b(left|right|up|down|in|out|closer|back|forward|backward|higher|lower)\b/);
  if (m && t.split(' ').length <= 5) {
    const w = m[1];
    const d = v3();
    if (w === 'left') d.x = -amount; if (w === 'right') d.x = amount;
    if (w === 'up' || w === 'higher') d.y = amount; if (w === 'down' || w === 'lower') d.y = -amount;
    if (w === 'in' || w === 'closer' || w === 'forward') d.z = -amount; if (w === 'out' || w === 'back' || w === 'backward') d.z = amount;
    return { kind: 'move', delta: d };
  }
  return null;
}

export class Voice {
  private rec: any = null;
  listening = false;
  readonly supported: boolean;
  constructor(private onText: (text: string) => void, private onState: (listening: boolean) => void) {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.supported = !!Ctor;
    if (!Ctor) return;
    this.rec = new Ctor();
    this.rec.continuous = true;
    this.rec.interimResults = false;
    this.rec.lang = 'en-US';
    this.rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) this.onText(String(e.results[i][0].transcript));
    };
    this.rec.onend = () => { if (this.listening) { try { this.rec.start(); } catch { /* restarted too fast */ } } else this.onState(false); };
    this.rec.onerror = (e: any) => { if (e?.error === 'not-allowed') { this.listening = false; this.onState(false); } };
  }
  toggle(): void { if (this.listening) this.stop(); else this.start(); }
  start(): void { if (!this.rec || this.listening) return; this.listening = true; this.onState(true); try { this.rec.start(); } catch { /* already started */ } }
  stop(): void { if (!this.rec) return; this.listening = false; this.onState(false); try { this.rec.stop(); } catch { /* not started */ } }
}
