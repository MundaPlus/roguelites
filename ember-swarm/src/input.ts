/** Keyboard plus a drag joystick (touch, pen or mouse). */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.joy.active = false;
    });

    target.addEventListener('pointerdown', (e) => {
      if (this.joy.active) return;
      this.joy = { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      target.setPointerCapture(e.pointerId);
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.joy.active || e.pointerId !== this.joy.id) return;
      this.joy.x = e.clientX;
      this.joy.y = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.joy.id) this.joy.active = false;
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  move(): { x: number; y: number } {
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        const m = Math.min(1, d / 50);
        return { x: (dx / d) * m, y: (dy / d) * m };
      }
    }
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /** True once per key press. */
  consume(...codes: string[]): boolean {
    for (const c of codes) {
      if (this.pressed.delete(c)) return true;
    }
    return false;
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
