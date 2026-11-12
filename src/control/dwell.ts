/**
 * Dwell selection: rest a pointer on a control for a moment and it is chosen. Any device that moves
 * a pointer works, including eye-trackers and head mice, which is the point.
 */
export class Dwell {
  private key: string | null = null;
  private since = 0;
  private fired = false;
  constructor(public ms = 750) {}
  /** feed the key under the pointer (or null); returns the key once when the dwell completes */
  update(key: string | null, now: number): string | null {
    const base = key ? key.split(':').slice(0, 2).join(':') : null; // slider:0.63 → slider:0.63 counts as a new key only when it moves a lot
    const same = base !== null && this.key !== null && sameTarget(this.key, base);
    if (!same) { this.key = base; this.since = now; this.fired = false; return null; }
    if (!this.fired && now - this.since >= this.ms) { this.fired = true; return key; }
    return null;
  }
  get progress(): number { return this.key ? Math.min(1, (performance.now() - this.since) / this.ms) : 0; }
  get target(): string | null { return this.key; }
  reset(): void { this.key = null; this.fired = false; }
}

function sameTarget(a: string, b: string): boolean {
  if (a === b) return true;
  const [ka, va] = a.split(':'), [kb, vb] = b.split(':');
  if (ka !== kb) return false;
  if (ka === 'slider' && va !== undefined && vb !== undefined) return Math.abs(parseFloat(va) - parseFloat(vb)) < 0.12;
  return false;
}
