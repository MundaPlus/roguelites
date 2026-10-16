/** Keyboard, mouse, gamepad and twin touch sticks. */
export interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouse = { x: 0, y: 0, down: false, right: false, moved: false };
  touch = false;
  moveStick: Stick | null = null;
  aimStick: Stick | null = null;
  autoFire = false;
  private padPrev: boolean[] = [];
  private padNow: boolean[] = [];
  pad: { mx: number; my: number; ax: number; ay: number } | null = null;

  constructor(private target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.mouse.right = false;
      this.moveStick = null;
      this.aimStick = null;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touch = true;
        const s: Stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
        if (e.clientX < window.innerWidth / 2) {
          if (!this.moveStick) this.moveStick = s;
        } else if (!this.aimStick) this.aimStick = s;
        target.setPointerCapture(e.pointerId);
        return;
      }
      this.touch = false;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) {
        this.mouse.right = true;
        this.pressed.add('MouseRight');
      }
    });
    target.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        for (const s of [this.moveStick, this.aimStick]) {
          if (s && s.id === e.pointerId) {
            s.x = e.clientX;
            s.y = e.clientY;
          }
        }
        return;
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = true;
    });
    const end = (e: PointerEvent) => {
      if (this.moveStick?.id === e.pointerId) this.moveStick = null;
      if (this.aimStick?.id === e.pointerId) this.aimStick = null;
      if (e.pointerType !== 'touch') {
        if (e.button === 0) this.mouse.down = false;
        if (e.button === 2) this.mouse.right = false;
      }
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  held(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** True once per key press. */
  consume(...codes: string[]): boolean {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }

  press(code: string): void {
    this.pressed.add(code);
  }

  /** Reads the first gamepad. Call once per frame before move() and aim(). */
  pollPad(): void {
    const gp = navigator.getGamepads?.().find((p) => p && p.connected) ?? null;
    if (!gp) {
      this.pad = null;
      return;
    }
    const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
    this.pad = { mx: dz(gp.axes[0] ?? 0), my: dz(gp.axes[1] ?? 0), ax: dz(gp.axes[2] ?? 0), ay: dz(gp.axes[3] ?? 0) };
    this.padPrev = this.padNow;
    this.padNow = gp.buttons.map((b) => b.pressed);
    const edge = (i: number) => this.padNow[i] && !this.padPrev[i];
    if (edge(0) || edge(5)) this.pressed.add('PadDodge');
    if (edge(1) || edge(4)) this.pressed.add('PadBomb');
    if (edge(9)) this.pressed.add('PadPause');
    if (edge(8)) this.pressed.add('PadMap');
  }

  move(): { x: number; y: number } {
    if (this.moveStick) {
      const dx = this.moveStick.x - this.moveStick.ox;
      const dy = this.moveStick.y - this.moveStick.oy;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const m = Math.min(1, d / 45);
        return { x: (dx / d) * m, y: (dy / d) * m };
      }
      return { x: 0, y: 0 };
    }
    if (this.pad && (this.pad.mx || this.pad.my)) {
      const d = Math.hypot(this.pad.mx, this.pad.my);
      const m = Math.min(1, d);
      return { x: (this.pad.mx / d) * m, y: (this.pad.my / d) * m };
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    if (this.keys.has('KeyW')) y -= 1;
    if (this.keys.has('KeyS')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  /**
   * Aim direction from arrow keys, the right stick or the aim touch stick.
   * Returns null when these give no direction. The mouse is handled by the game.
   */
  aimDir(): { x: number; y: number } | null {
    if (this.aimStick) {
      const dx = this.aimStick.x - this.aimStick.ox;
      const dy = this.aimStick.y - this.aimStick.oy;
      const d = Math.hypot(dx, dy);
      return d > 10 ? { x: dx / d, y: dy / d } : null;
    }
    if (this.pad && (this.pad.ax || this.pad.ay)) {
      const d = Math.hypot(this.pad.ax, this.pad.ay);
      return { x: this.pad.ax / d, y: this.pad.ay / d };
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('ArrowDown')) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : null;
  }

  wantsMouseFire(): boolean {
    return !this.touch && (this.mouse.down || this.autoFire);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  get element(): HTMLElement {
    return this.target;
  }
}
