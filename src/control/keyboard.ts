/** Keyboard fallback: arrows move across the panel, W pushes in, S pulls out. Holding any of them is driving. */
import { type V3, v3 } from '../sim/vec';

export class KeyboardController {
  private down = new Set<string>();
  private lastInput = -Infinity;
  speed = 0.12; // m/s
  constructor(private isTypingIn: () => boolean) {
    window.addEventListener('keydown', (e) => {
      if (this.isTypingIn()) return;
      if (this.keys.has(e.key)) { this.down.add(e.key); this.lastInput = performance.now(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.key); if (this.down.size) this.lastInput = performance.now(); });
    window.addEventListener('blur', () => this.down.clear());
  }
  private keys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S']);
  /** true while a key is held or for a short grace period after */
  get active(): boolean { return this.down.size > 0 || performance.now() - this.lastInput < 350; }
  velocity(): V3 {
    const d = this.down;
    const v = v3();
    if (d.has('ArrowLeft')) v.x -= 1;
    if (d.has('ArrowRight')) v.x += 1;
    if (d.has('ArrowUp')) v.y += 1;
    if (d.has('ArrowDown')) v.y -= 1;
    if (d.has('w') || d.has('W')) v.z -= 1;
    if (d.has('s') || d.has('S')) v.z += 1;
    return v3(v.x * this.speed, v.y * this.speed, v.z * this.speed);
  }
}
