/** Canvas renderer: tiles, bodies, particles and the camera. */
import {
  ARROW,
  CRUSH,
  DIRT,
  GEMS,
  GOLDV,
  ICE,
  ICICLE,
  ITEMS,
  LADDER,
  LAVA,
  PLAT,
  ROCK,
  SPIKES,
  TS,
  ZONES,
  isSolid,
} from './data';
import type { Ent, Ev, World } from './world';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  text?: string;
  ring?: number;
  grav: number;
}

const tileHash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
};

export class Renderer {
  particles: Particle[] = [];
  camX = 0;
  camY = 0;
  shake = 0;
  lookDown = 0;
  viewW = 320;
  viewH = 200;
  private snapped = false;

  reset(): void {
    this.particles = [];
    this.snapped = false;
    this.shake = 0;
    this.lookDown = 0;
  }

  fx(ev: Ev): void {
    if (ev.kind === 'shake') {
      this.shake = Math.max(this.shake, ev.amt);
      return;
    }
    if (ev.kind !== 'fx') return;
    const { x, y } = ev;
    const burst = (n: number, color: string, speed: number, size: number, life: number, grav = 0.15): void => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.8);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.4, life, max: life, color, size, grav });
      }
    };
    switch (ev.fx) {
      case 'float':
        this.particles.push({ x, y, vx: 0, vy: -0.5, life: 50, max: 50, color: ev.color ?? '#fff', size: 6, text: ev.text, grav: 0 });
        break;
      case 'dust':
        burst(6, '#9a8f86', 1.2, 2, 18, 0.02);
        break;
      case 'blood':
        burst(8, '#ef476f', 2, 2, 24);
        break;
      case 'hit':
        burst(5, '#fff6d5', 2.2, 1.5, 12, 0);
        break;
      case 'poof':
        burst(10, '#d8d0c8', 1.4, 2.5, 22, -0.02);
        if (ev.text) this.particles.push({ x, y, vx: 0, vy: -0.8, life: 26, max: 26, color: '#fff', size: 9, text: ev.text, grav: 0 });
        break;
      case 'debris':
        burst(9, ev.color ?? '#a0522d', 2, 2, 26);
        break;
      case 'boom':
        burst(26, '#ffb703', 3.2, 3, 28, 0.05);
        burst(14, '#fb5607', 2.2, 4, 34, -0.02);
        burst(10, '#444', 1.5, 4, 40, -0.03);
        this.particles.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, color: '#fff3c4', size: 2, ring: 44, grav: 0 });
        break;
      case 'jet':
        this.particles.push({ x: x + (Math.random() - 0.5) * 4, y, vx: 0, vy: 1.5, life: 12, max: 12, color: '#ffb703', size: 2, grav: 0 });
        break;
      case 'flash':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 6, max: 6, color: '#fff3c4', size: 1.5, ring: 10, grav: 0 });
        break;
      case 'wave':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 22, max: 22, color: '#e9c46a', size: 2, ring: 7 * TS, grav: 0 });
        break;
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  /** One 60 Hz tick of particles and the camera. */
  tick(w: World, holdDown: boolean): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.4);
    const p = w.p;
    const still = p.onGround && Math.abs(p.vx) < 0.3;
    this.lookDown = holdDown && still ? Math.min(56, this.lookDown + 1.5) : Math.max(0, this.lookDown - 4);
    const tx = p.x + p.w / 2 + p.facing * 20 - this.viewW / 2;
    const ty = p.y + p.h / 2 - this.viewH / 2 + this.lookDown + 8;
    const k = this.snapped ? 0.12 : 1;
    this.snapped = true;
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * (k * 1.2 > 1 ? 1 : k * 1.2);
    const maxX = w.w * TS - this.viewW;
    const maxY = w.h * TS - this.viewH;
    this.camX = maxX < 0 ? maxX / 2 : Math.max(0, Math.min(maxX, this.camX));
    this.camY = maxY < 0 ? maxY / 2 : Math.max(0, Math.min(maxY, this.camY));
  }

  draw(ctx: CanvasRenderingContext2D, w: World, scale: number, dpr: number): void {
    const zone = ZONES[w.level.zone];
    const s = scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = zone.bg;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const ox = Math.round((-this.camX + sx) * s) / s;
    const oy = Math.round((-this.camY + sy) * s) / s;
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);

    const x0 = Math.max(0, Math.floor(this.camX / TS) - 1);
    const y0 = Math.max(0, Math.floor(this.camY / TS) - 1);
    const x1 = Math.min(w.w - 1, Math.ceil((this.camX + this.viewW) / TS) + 1);
    const y1 = Math.min(w.h - 1, Math.ceil((this.camY + this.viewH) / TS) + 1);
    const frame = w.frame;

    // Background: faint rock texture.
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const h = tileHash(x, y);
        if (h % 5 === 0) {
          ctx.fillStyle = zone.bg2;
          ctx.fillRect(x * TS + (h % 7), y * TS + ((h >> 3) % 9), 5 + (h % 4), 3);
        }
      }

    this.drawDoors(ctx, w);

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.drawTile(ctx, w, x, y, frame);

    // Ropes.
    for (const r of w.ropes) {
      const rx = r.x * TS + 8;
      ctx.strokeStyle = '#c9a26b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, r.top * TS + 1);
      ctx.lineTo(rx, (r.bottom + 1) * TS - 2);
      ctx.stroke();
      ctx.fillStyle = '#8d6e46';
      for (let y = r.top * TS + 6; y < (r.bottom + 1) * TS; y += 8) ctx.fillRect(rx - 1.5, y, 3, 2);
      ctx.fillStyle = '#777';
      ctx.fillRect(rx - 2, r.top * TS, 4, 2);
    }

    // Boss landing shadow.
    for (const e of w.ents) {
      if (e.def?.brain === 'boss' && e.state === 'air') {
        const lx = w.bossLanding(e);
        const fy = (w.h - 2) * TS;
        const k = Math.max(0.2, 1 - (fy - (e.y + e.h)) / 120);
        ctx.fillStyle = `rgba(0,0,0,${0.45 * k})`;
        ctx.beginPath();
        ctx.ellipse(lx, fy - 1, (e.w / 2) * k + 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const e of w.ents) if (e.kind !== 'ghost') this.drawEnt(ctx, w, e, frame);
    this.drawPlayer(ctx, w, frame);
    for (const e of w.ents) if (e.kind === 'ghost') this.drawEnt(ctx, w, e, frame);

    // Particles.
    for (const p of this.particles) {
      const a = Math.min(1, p.life / (p.max * 0.5));
      ctx.globalAlpha = a;
      if (p.ring) {
        const k = 1 - p.life / p.max;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * (1 - k) + 0.5;
        ctx.beginPath();
        if (p.ring > 50) ctx.ellipse(p.x, p.y, p.ring * k, 6 * (1 - k) + 1, 0, Math.PI, 0);
        else ctx.arc(p.x, p.y, p.ring * k, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.text) {
        ctx.font = `bold ${p.size}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    // Lantern light: darker toward the edges of the view.
    {
      const p = w.p;
      const lx = p.x + p.w / 2;
      const ly = p.y + p.h / 2;
      const rad = Math.max(this.viewW, this.viewH) * 0.75;
      const g = ctx.createRadialGradient(lx, ly, rad * 0.25, lx, ly, rad);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(this.camX - 20, this.camY - 20, this.viewW + 40, this.viewH + 40);
    }

    // Compass arrow toward the exit.
    if (w.has('compass') && w.exitOpen) {
      const ex = w.level.exit.x * TS + 8;
      const ey = w.level.exit.y * TS + 8;
      const inView = ex > this.camX && ex < this.camX + this.viewW && ey > this.camY && ey < this.camY + this.viewH;
      if (!inView) {
        const cx = this.camX + this.viewW / 2;
        const cy = this.camY + this.viewH / 2;
        const a = Math.atan2(ey - cy, ex - cx);
        const r = Math.min(this.viewW, this.viewH) / 2 - 12;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.rotate(a);
        ctx.fillStyle = '#e9c46a';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawDoors(ctx: CanvasRenderingContext2D, w: World): void {
    const door = (tx: number, ty: number, lit: boolean): void => {
      const x = tx * TS;
      const y = ty * TS;
      ctx.fillStyle = '#4a4038';
      ctx.fillRect(x - 2, y - 6, TS + 4, TS + 6);
      ctx.fillStyle = lit ? '#2b1a08' : '#0c0a08';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + TS);
      ctx.lineTo(x + 2, y + 2);
      ctx.arc(x + 8, y + 2, 6, Math.PI, 0);
      ctx.lineTo(x + 14, y + TS);
      ctx.fill();
      if (lit) {
        const g = ctx.createRadialGradient(x + 8, y + 10, 1, x + 8, y + 10, 14);
        g.addColorStop(0, 'rgba(255,209,102,0.85)');
        g.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 8, y - 8, TS + 16, TS + 12);
      }
    };
    door(w.level.entrance.x, w.level.entrance.y, false);
    if (w.exitOpen) door(w.level.exit.x, w.level.exit.y, true);
  }

  private drawTile(ctx: CanvasRenderingContext2D, w: World, x: number, y: number, frame: number): void {
    const t = w.tile(x, y);
    if (t === 0) return;
    const zone = ZONES[w.level.zone];
    const px = x * TS;
    const py = y * TS;
    const h = tileHash(x, y);
    const openAbove = !isSolid(w.tile(x, y - 1));
    switch (t) {
      case DIRT:
      case GOLDV:
      case CRUSH:
      case ARROW: {
        let dx = 0;
        if (t === CRUSH) {
          const tr = w.traps.find((r) => r.x === x && r.y === y);
          if (tr?.state === 'shake') dx = Math.sin(frame * 2) * 1.2;
        }
        ctx.fillStyle = t === CRUSH || t === ARROW ? '#6b6158' : zone.dirt;
        ctx.fillRect(px + dx, py, TS, TS);
        ctx.fillStyle = t === CRUSH || t === ARROW ? '#4e463f' : zone.dark;
        ctx.fillRect(px + dx + (h % 9), py + ((h >> 4) % 10) + 3, 3, 2);
        ctx.fillRect(px + dx + ((h >> 7) % 11) + 2, py + ((h >> 11) % 9) + 5, 2, 2);
        if (!isSolid(w.tile(x, y + 1))) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px + dx, py + TS - 2, TS, 2);
        }
        if (openAbove && t === DIRT) {
          ctx.fillStyle = zone.edge;
          ctx.fillRect(px, py, TS, 2);
          if (w.level.zone === 1 && h % 3 === 0) ctx.fillRect(px + (h % 12), py + 2, 2, 3);
        }
        if (t === GOLDV) {
          ctx.fillStyle = '#ffd166';
          ctx.fillRect(px + 3 + (h % 4), py + 4, 3, 2);
          ctx.fillRect(px + 9 + (h % 3), py + 9, 2, 2);
          ctx.fillRect(px + 5, py + 11 + (h % 2), 2, 2);
        }
        if (t === CRUSH) {
          ctx.strokeStyle = '#3a332d';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + dx + 1.5, py + 1.5, TS - 3, TS - 3);
          ctx.fillStyle = '#2a2420';
          ctx.fillRect(px + dx + 4, py + 6, 3, 2);
          ctx.fillRect(px + dx + 9, py + 6, 3, 2);
          ctx.fillRect(px + dx + 5, py + 11, 6, 1);
        }
        if (t === ARROW) {
          const d = w.level.arrowDir.get(y * w.w + x) ?? 1;
          ctx.strokeStyle = '#3a332d';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, TS - 3, TS - 3);
          ctx.fillStyle = '#111';
          ctx.fillRect(d > 0 ? px + TS - 5 : px + 1, py + 6, 4, 4);
          ctx.fillStyle = '#8b0000';
          ctx.fillRect(px + 6, py + 4, 4, 2);
        }
        break;
      }
      case ROCK:
        ctx.fillStyle = zone.rock;
        ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(px, py, TS, 1);
        ctx.fillRect(px, py, 1, TS);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(px + (h % 10), py + ((h >> 5) % 10) + 2, 4, 2);
        break;
      case ICE:
        ctx.fillStyle = '#9fd3f0';
        ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = '#d8f1ff';
        ctx.fillRect(px, py, TS, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px + 3 + (h % 4), py + 4, 6, 1);
        ctx.fillRect(px + 2 + (h % 6), py + 9, 4, 1);
        ctx.fillStyle = 'rgba(30,80,120,0.3)';
        ctx.fillRect(px, py + TS - 2, TS, 2);
        break;
      case LADDER:
        ctx.fillStyle = '#9c6b3c';
        ctx.fillRect(px + 3, py, 2, TS);
        ctx.fillRect(px + 11, py, 2, TS);
        ctx.fillStyle = '#c08a52';
        for (let k = 2; k < TS; k += 5) ctx.fillRect(px + 3, py + k, 10, 1.5);
        break;
      case PLAT:
        ctx.fillStyle = '#a0703f';
        ctx.fillRect(px, py, TS, 4);
        ctx.fillStyle = '#6e4b29';
        ctx.fillRect(px, py + 4, TS, 1);
        ctx.fillRect(px + 2, py + 5, 2, 4);
        ctx.fillRect(px + 12, py + 5, 2, 4);
        break;
      case SPIKES:
        ctx.fillStyle = '#c9c9c9';
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(px + k * 4, py + TS);
          ctx.lineTo(px + k * 4 + 2, py + 8);
          ctx.lineTo(px + k * 4 + 4, py + TS);
          ctx.fill();
        }
        ctx.fillStyle = '#8a1c1c';
        ctx.fillRect(px + 5, py + 9, 1, 1);
        break;
      case LAVA: {
        const wave = Math.sin(frame * 0.08 + x) * 1.5;
        ctx.fillStyle = '#d62828';
        ctx.fillRect(px, py + 3 + wave, TS, TS - 3 - wave);
        ctx.fillStyle = '#f77f00';
        ctx.fillRect(px, py + 3 + wave, TS, 3);
        ctx.fillStyle = '#ffd166';
        if ((frame + h) % 50 < 20) ctx.fillRect(px + (h % 12), py + 8, 2, 2);
        const g = ctx.createLinearGradient(0, py - 12, 0, py + 4);
        g.addColorStop(0, 'rgba(247,127,0,0)');
        g.addColorStop(1, 'rgba(247,127,0,0.25)');
        ctx.fillStyle = g;
        ctx.fillRect(px, py - 12, TS, 16);
        break;
      }
      case ICICLE: {
        const tr = w.traps.find((r) => r.x === x && r.y === y);
        const dx = tr?.state === 'shake' ? Math.sin(frame * 2) : 0;
        ctx.fillStyle = '#cdeeff';
        ctx.beginPath();
        ctx.moveTo(px + 3 + dx, py);
        ctx.lineTo(px + 13 + dx, py);
        ctx.lineTo(px + 8 + dx, py + 13);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 6 + dx, py + 1, 2, 5);
        break;
      }
    }
  }

  private emoji(ctx: CanvasRenderingContext2D, icon: string, x: number, y: number, size: number, flip: boolean, alpha = 1): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 1);
    ctx.restore();
  }

  private drawEnt(ctx: CanvasRenderingContext2D, w: World, e: Ent, frame: number): void {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    switch (e.kind) {
      case 'enemy': {
        const def = e.def!;
        if (def.brain === 'boss') {
          this.drawBoss(ctx, e, frame);
          break;
        }
        const flash = e.hurtT > 0 && frame % 4 < 2;
        let size = Math.max(e.w, e.h) + 3;
        let y = cy;
        if (e.state === 'hang' && def.brain === 'spider') {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(cx, e.y - 2);
          ctx.lineTo(cx, e.y + 2);
          ctx.stroke();
        }
        if (def.brain === 'bat' && e.state !== 'hang') y += Math.sin(frame * 0.4 + e.id) * 1.5;
        if (e.state === 'charge') size += 1;
        // Emoji face left; flip when moving right.
        this.emoji(ctx, def.icon, cx, y, size, e.dir > 0 && def.brain !== 'bat', flash ? 0.4 : 1);
        if (e.state === 'charge' || e.state === 'rest') {
          ctx.fillStyle = e.state === 'charge' ? '#ef476f' : '#ffd166';
          ctx.font = 'bold 7px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(e.state === 'charge' ? '!' : 'z', cx, e.y - 4);
        }
        if (e.maxHp > 1 && e.hp < e.maxHp) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(cx - 7, e.y - 3, 14, 2);
          ctx.fillStyle = '#ef476f';
          ctx.fillRect(cx - 7, e.y - 3, (14 * e.hp) / e.maxHp, 2);
        }
        break;
      }
      case 'gold': {
        const big = e.value >= 300;
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(e.x + 1, e.y + 2, big ? 7 : 5, big ? 4 : 3);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(e.x + 1, e.y + 1, big ? 6 : 4, big ? 4 : 3);
        if (big) ctx.fillRect(e.x + 4, e.y - 1, 3, 3);
        if ((frame + e.id * 13) % 90 < 6) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(e.x + 2, e.y + 1, 1, 1);
        }
        break;
      }
      case 'gem': {
        const g = GEMS[e.value];
        ctx.fillStyle = g.color;
        ctx.beginPath();
        ctx.moveTo(cx, e.y);
        ctx.lineTo(e.x + e.w, e.y + 3);
        ctx.lineTo(cx, e.y + e.h);
        ctx.lineTo(e.x, e.y + 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(cx - 2, e.y + 2, 2, 1);
        break;
      }
      case 'crate':
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.strokeStyle = '#5c3a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(e.x + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
        ctx.beginPath();
        ctx.moveTo(e.x + 1, e.y + 1);
        ctx.lineTo(e.x + e.w - 1, e.y + e.h - 1);
        ctx.stroke();
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 6px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', cx, cy + 2);
        break;
      case 'pot':
        ctx.fillStyle = '#b5652d';
        ctx.beginPath();
        ctx.ellipse(cx, e.y + 6, 5, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(cx - 2.5, e.y, 5, 3);
        ctx.fillStyle = '#7d4219';
        ctx.fillRect(cx - 4, e.y + 5, 8, 1);
        break;
      case 'rock':
        ctx.fillStyle = '#8d8d8d';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 0.5, 4, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b5b5b5';
        ctx.fillRect(cx - 2, cy - 2, 2, 1);
        break;
      case 'bomb': {
        ctx.fillStyle = '#1b1b1b';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#555';
        ctx.fillRect(cx - 1.5, cy - 2.5, 1.5, 1.5);
        const blink = e.t < 50 ? frame % 6 < 3 : frame % 16 < 8;
        ctx.fillStyle = blink ? '#ffb703' : '#ef476f';
        ctx.fillRect(cx + 1, e.y - 2, 2, 2);
        if (e.t < 50 && blink) {
          ctx.fillStyle = 'rgba(239,71,111,0.35)';
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'arrow':
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x, cy);
        ctx.lineTo(e.x + e.w, cy);
        ctx.stroke();
        ctx.fillStyle = '#ddd';
        ctx.fillRect(e.dir > 0 ? e.x + e.w - 2 : e.x, cy - 1.5, 2, 3);
        break;
      case 'pellet':
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(e.x, e.y, 2.5, 2.5);
        break;
      case 'fall':
        if (e.state === 'icicle') {
          ctx.fillStyle = '#cdeeff';
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + e.w, e.y);
          ctx.lineTo(cx, e.y + e.h);
          ctx.fill();
        } else {
          ctx.fillStyle = '#6b6158';
          ctx.fillRect(e.x, e.y, e.w, e.h);
          ctx.strokeStyle = '#3a332d';
          ctx.strokeRect(e.x + 1.5, e.y + 1.5, e.w - 3, e.h - 3);
        }
        break;
      case 'item': {
        const bob = Math.sin(frame * 0.1 + e.id) * 1;
        this.emoji(ctx, ITEMS[e.eid].icon, cx, cy + bob, 11, false);
        break;
      }
      case 'ware': {
        ctx.fillStyle = '#3a2a18';
        ctx.fillRect(e.x - 1, e.y + e.h - 2, e.w + 2, 2);
        this.emoji(ctx, ITEMS[e.eid].icon, cx, cy - 1, 11, false);
        const near = Math.abs(w.p.x + w.p.w / 2 - cx) < 9 && Math.abs(w.p.y - e.y) < 12;
        ctx.font = 'bold 5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = w.gold >= e.value ? '#ffd166' : '#ef8a8a';
        ctx.fillText(`$${e.value}`, cx, e.y - 3);
        if (near) {
          ctx.fillStyle = '#fff';
          ctx.fillText(`↑ ${ITEMS[e.eid].name}`, cx, e.y - 10);
        }
        break;
      }
      case 'pet': {
        const hop = e.state === 'follow' ? Math.abs(Math.sin(frame * 0.2)) * 2 : 0;
        this.emoji(ctx, e.eid, cx, cy - hop, 11, w.p.x > e.x);
        if (e.state === 'wait' && frame % 120 < 50) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 5px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('help!', cx, e.y - 4);
        }
        break;
      }
      case 'keeper':
        this.emoji(ctx, '🧔', cx, cy, 15, e.dir > 0);
        ctx.fillStyle = '#e9c46a';
        ctx.font = 'bold 5px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SHOP', cx, e.y - 4);
        break;
      case 'ghost':
        this.emoji(ctx, '👻', cx, cy + Math.sin(frame * 0.05) * 2, 22, e.dir > 0, 0.75);
        break;
    }
  }

  private drawBoss(ctx: CanvasRenderingContext2D, e: Ent, frame: number): void {
    const flash = e.hurtT > 0 && frame % 4 < 2;
    const angry = e.hp <= e.maxHp / 2;
    ctx.fillStyle = flash ? '#fff' : '#8a7f6c';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = '#6d6455';
    ctx.fillRect(e.x, e.y + e.h - 6, e.w, 6);
    ctx.fillStyle = '#a69a83';
    ctx.fillRect(e.x, e.y, e.w, 2);
    // Crown.
    ctx.fillStyle = '#e9c46a';
    for (let k = 0; k < 4; k++) ctx.fillRect(e.x + 3 + k * 6, e.y - 4, 4, 4);
    // Eyes.
    ctx.fillStyle = '#1d1a16';
    ctx.fillRect(e.x + 5, e.y + 9, 7, 5);
    ctx.fillRect(e.x + e.w - 12, e.y + 9, 7, 5);
    ctx.fillStyle = angry ? '#ff3b3b' : '#ffd166';
    const look = e.dir > 0 ? 3 : 0;
    if (e.state !== 'wait') {
      ctx.fillRect(e.x + 6 + look, e.y + 10, 3, 3);
      ctx.fillRect(e.x + e.w - 11 + look, e.y + 10, 3, 3);
    }
    ctx.fillStyle = '#1d1a16';
    ctx.fillRect(e.x + 8, e.y + 19, e.w - 16, 3);
    // HP bar.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 2, e.y - 9, e.w + 4, 3);
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(e.x - 2, e.y - 9, ((e.w + 4) * e.hp) / e.maxHp, 3);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, w: World, frame: number): void {
    const p = w.p;
    if (!p.dead && p.invuln > 0 && p.invuln < 66 && frame % 6 < 3) return;
    const cx = p.x + p.w / 2;
    const f = p.facing;
    ctx.save();
    if (p.dead) {
      ctx.translate(cx, p.y + p.h - 3);
      ctx.rotate(-f * Math.PI / 2);
      ctx.translate(-cx, -(p.y + p.h - 3));
    }
    const moving = p.onGround && Math.abs(p.vx) > 0.4;
    const step = moving ? Math.floor(frame / 5) % 2 : 0;
    // Jetpack.
    if (w.has('jetpack')) {
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(cx - f * 6 - 2, p.y + 5, 4, 6);
    }
    if (w.has('cape')) {
      ctx.fillStyle = '#c1121f';
      ctx.fillRect(cx - f * 4 - 2, p.y + 5, 4, 8 + (p.vy > 0 ? 2 : 0));
    }
    // Legs.
    ctx.fillStyle = '#4a3b2a';
    if (p.state === 'climb') {
      ctx.fillRect(cx - 3, p.y + 11, 2, 3 + (Math.floor(p.y / 4) % 2));
      ctx.fillRect(cx + 1, p.y + 11, 2, 3 + (Math.floor(p.y / 4 + 1) % 2));
    } else if (!p.onGround) {
      ctx.fillRect(cx - 3, p.y + 10, 2, 3);
      ctx.fillRect(cx + 1, p.y + 11, 2, 3);
    } else {
      ctx.fillRect(cx - 3 + step, p.y + 11, 2, 3);
      ctx.fillRect(cx + 1 - step, p.y + 11, 2, 3);
    }
    // Body.
    ctx.fillStyle = '#c9a46a';
    ctx.fillRect(cx - 4, p.y + 6, 8, 6);
    ctx.fillStyle = '#7a5a33';
    ctx.fillRect(cx - 4, p.y + 10, 8, 1);
    // Arms.
    ctx.fillStyle = '#f1c27d';
    if (p.state === 'climb' || p.state === 'hang') {
      ctx.fillRect(cx - 5, p.y + 1, 2, 6);
      ctx.fillRect(cx + 3, p.y + 1, 2, 6);
    } else ctx.fillRect(cx + f * 3 - 1, p.y + 7, 2, 3);
    // Head and hat.
    ctx.fillStyle = '#f1c27d';
    ctx.fillRect(cx - 3, p.y + 1, 6, 5);
    if (p.state !== 'climb') {
      ctx.fillStyle = '#222';
      ctx.fillRect(cx + f * 1.5 - 0.5, p.y + 3, 1.2, 1.5);
    }
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(cx - 5, p.y + 1, 10, 1.5);
    ctx.fillRect(cx - 3, p.y - 2, 6, 3);
    ctx.fillStyle = '#3d2914';
    ctx.fillRect(cx - 3, p.y, 6, 1);
    // Scarf.
    ctx.fillStyle = '#e63946';
    ctx.fillRect(cx - 3, p.y + 6, 6, 1);
    ctx.restore();

    // Whip.
    if (p.whipT > 0 && !p.dead) {
      ctx.strokeStyle = '#8b5a2b';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      const hx = cx + f * 3;
      const hy = p.y + 7;
      if (p.whipT > 11) {
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx - f * 6, hy - 10, hx - f * 12, hy - 6);
      } else if (p.whipT > 3) {
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx + f * 10, hy - 6, hx + f * 18, hy + 1);
      } else {
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(hx + f * 8, hy + 2, hx + f * 12, hy + 6);
      }
      ctx.stroke();
    }
  }
}
