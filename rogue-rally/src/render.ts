/** Canvas renderer for a race: track tiles, cars, effects and the HUD. */
import { LAPS, SURFACES, THEMES } from './data';
import { CAR_R, COUNTDOWN, standings, type Car, type Race, type RaceEvent } from './race';
import { EDGE, HALF, RAD, T, type Tile, type Track } from './track';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  grow: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

interface Banner {
  text: string;
  sub: string;
  color: string;
  t: number;
  max: number;
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
export const ordinal = (i: number): string => ORD[i] ?? `${i + 1}th`;

export class RaceView {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private parts: Particle[] = [];
  private floats: Float[] = [];
  private skids: number[] = [];
  private skidColor: string[] = [];
  private lastWheel = new Map<number, [number, number, number, number]>();
  private banner: Banner | null = null;
  shake = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.zoom = Math.max(0.55, Math.min(1.35, Math.min(this.w, this.h * 1.3) / 640));
  }

  reset(r: Race): void {
    this.parts = [];
    this.floats = [];
    this.skids = [];
    this.skidColor = [];
    this.lastWheel.clear();
    this.banner = null;
    const p = r.cars.find((c) => c.isPlayer)!;
    this.camX = p.x;
    this.camY = p.y;
  }

  showBanner(text: string, sub = '', color = '#fff', max = 1.4): void {
    this.banner = { text, sub, color, t: 0, max };
  }

  float(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, t: 0 });
  }

  private puff(x: number, y: number, n: number, color: string, speed: number, size: number, life = 0.6, grow = 10): void {
    for (let i = 0; i < n && this.parts.length < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * speed;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.6 + Math.random() * 0.6), color, grow });
    }
  }

  /** Effects for race events. */
  onEvent(r: Race, e: RaceEvent): void {
    const c = r.cars[e.car];
    switch (e.kind) {
      case 'crash':
        this.puff(e.x, e.y, 8, '#ffd166', 220, 3, 0.35, 0);
        if (c.isPlayer || r.cars.some((x) => x.isPlayer && Math.hypot(x.x - e.x, x.y - e.y) < 40)) this.shake = Math.min(12, this.shake + e.amt / 40);
        break;
      case 'wall':
        this.puff(e.x, e.y, 6, '#ffb703', 180, 3, 0.3, 0);
        if (c.isPlayer) this.shake = Math.min(10, this.shake + e.amt / 50);
        break;
      case 'mine':
        this.puff(e.x, e.y, 18, '#ff7b00', 260, 6, 0.5, 20);
        this.puff(e.x, e.y, 10, '#555', 90, 10, 1, 25);
        if (c.isPlayer) this.shake = 14;
        break;
      case 'oil':
        if (c.isPlayer) this.float(c.x, c.y - 20, 'OIL!', '#9b8cff');
        break;
      case 'jump':
        this.puff(e.x, e.y, 6, '#ddd', 60, 6, 0.4, 12);
        break;
      case 'land':
        this.puff(e.x, e.y, 8, '#bbb', 90, 6, 0.4, 14);
        if (c.isPlayer) this.shake = Math.min(8, this.shake + 4);
        break;
      case 'boost':
        if (c.isPlayer) this.float(c.x, c.y - 20, 'BOOST!', '#4cc9f0');
        break;
      case 'wreck':
        this.puff(e.x, e.y, 14, '#333', 80, 12, 1.2, 25);
        if (c.isPlayer) this.float(c.x, c.y - 24, 'WRECKED! −32% speed', '#ef476f');
        break;
      case 'shield':
        this.puff(e.x, e.y, 10, '#80ffdb', 160, 4, 0.4, 0);
        break;
      case 'lap':
        if (c.isPlayer) this.showBanner(e.amt === LAPS ? 'FINAL LAP' : `LAP ${e.amt}/${LAPS}`, '', e.amt === LAPS ? '#ffd166' : '#fff');
        break;
      case 'finish':
        if (c.isPlayer) this.showBanner('FINISH!', r.trial ? '' : `${ordinal(standings(r).indexOf(e.car))} place`, '#ffd166', 3);
        break;
      default:
        break;
    }
  }

  /** Called after each physics step: skid marks, exhaust, smoke. */
  afterStep(r: Race): void {
    r.cars.forEach((c, i) => {
      const fx = Math.cos(c.a);
      const fy = Math.sin(c.a);
      const lx = c.x - fx * 11 - fy * 7;
      const ly = c.y - fy * 11 + fx * 7;
      const rx = c.x - fx * 11 + fy * 7;
      const ry = c.y - fy * 11 - fx * 7;
      const last = this.lastWheel.get(i);
      if (c.drifting && c.air <= 0 && last) {
        const tile = r.track.tiles[c.k];
        const col = tile.surface === 'ice' ? 'rgba(80,120,150,0.35)' : tile.surface === 'dirt' ? 'rgba(60,35,15,0.35)' : 'rgba(15,15,20,0.4)';
        this.skids.push(last[0], last[1], lx, ly, last[2], last[3], rx, ry);
        this.skidColor.push(col);
        if (this.skidColor.length > 1200) {
          this.skids.splice(0, 8);
          this.skidColor.shift();
        }
        if (Math.random() < 0.35) this.puff(c.x - fx * 14, c.y - fy * 14, 1, tile.surface === 'dirt' ? 'rgba(170,120,70,0.5)' : 'rgba(220,220,220,0.45)', 30, 7, 0.6, 18);
      }
      this.lastWheel.set(i, [lx, ly, rx, ry]);
      if (c.nitroOn && Math.random() < 0.8) this.parts.push({ x: c.x - fx * 18, y: c.y - fy * 18, vx: -fx * 120 + (Math.random() - 0.5) * 40, vy: -fy * 120 + (Math.random() - 0.5) * 40, life: 0.22, max: 0.22, size: 5, color: Math.random() < 0.5 ? '#4cc9f0' : '#ffd166', grow: -10 });
      if (c.hp <= 0 && Math.random() < 0.15) this.puff(c.x, c.y, 1, 'rgba(40,40,40,0.6)', 20, 8, 1, 16);
    });
  }

  draw(r: Race, dt: number, follow: number): void {
    const ctx = this.ctx;
    this.time += dt;
    const me = r.cars[follow];
    const sp = Math.hypot(me.vx, me.vy);
    const look = Math.min(0.45, 0.2 + sp / 2000);
    const tx = me.x + me.vx * look;
    const ty = me.y + me.vy * look;
    const k = 1 - Math.exp(-dt * 5);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.shake = Math.max(0, this.shake - dt * 30);
    const z = this.zoom * (1 - Math.min(0.12, sp / 5000));
    const th = THEMES[r.track.theme];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = th.grass;
    ctx.fillRect(0, 0, this.w, this.h);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    ctx.scale(z, z);
    ctx.translate(-this.camX, -this.camY);
    const vx0 = this.camX - this.w / 2 / z - T;
    const vx1 = this.camX + this.w / 2 / z + T;
    const vy0 = this.camY - this.h / 2 / z - T;
    const vy1 = this.camY + this.h / 2 / z + T;
    const tr = r.track;
    // Ground checker.
    ctx.fillStyle = th.grass2;
    for (let gy = Math.max(-2, Math.floor(vy0 / T)); gy <= Math.ceil(vy1 / T); gy++)
      for (let gx = Math.max(-2, Math.floor(vx0 / T)); gx <= Math.ceil(vx1 / T); gx++) if ((gx + gy) % 2 === 0) ctx.fillRect(gx * T, gy * T, T, T);
    // Out of bounds frame.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, tr.gw * T, tr.gh * T);
    const visible = tr.tiles.filter((t) => t.gx * T + T >= vx0 && t.gx * T <= vx1 && t.gy * T + T >= vy0 && t.gy * T <= vy1);
    for (const t of visible) this.tileBase(t, th.shoulder);
    for (const t of visible) this.tileRoad(t);
    for (const t of visible) this.tileDetail(t, tr);
    // Skid marks.
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < this.skidColor.length; i++) {
      const b = i * 8;
      if (this.skids[b] < vx0 || this.skids[b] > vx1 || this.skids[b + 1] < vy0 || this.skids[b + 1] > vy1) continue;
      ctx.strokeStyle = this.skidColor[i];
      ctx.beginPath();
      ctx.moveTo(this.skids[b], this.skids[b + 1]);
      ctx.lineTo(this.skids[b + 2], this.skids[b + 3]);
      ctx.moveTo(this.skids[b + 4], this.skids[b + 5]);
      ctx.lineTo(this.skids[b + 6], this.skids[b + 7]);
      ctx.stroke();
    }
    // Oil and mines.
    for (const o of r.oils) {
      ctx.globalAlpha = Math.min(1, o.ttl / 2);
      ctx.fillStyle = '#15121f';
      ctx.beginPath();
      ctx.ellipse(o.x, o.y, o.r, o.r * 0.75, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(155,140,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(o.x - 6, o.y - 5, o.r * 0.45, o.r * 0.25, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const m of r.mines) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.sin(this.time * 12) > 0 ? '#ff2d55' : '#661122';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Decor.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of tr.decor) {
      if (d.x < vx0 || d.x > vx1 || d.y < vy0 || d.y > vy1) continue;
      ctx.font = `${d.size}px serif`;
      ctx.fillText(d.icon, d.x, d.y);
    }
    // Cars: ground first, then airborne.
    const order = r.cars.map((_, i) => i).sort((a, b) => r.cars[a].air - r.cars[b].air);
    for (const i of order) this.car(r.cars[i], i === follow);
    // Particles.
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size + p.grow * (1 - p.life / p.max)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Floating text.
    ctx.font = 'bold 15px system-ui, sans-serif';
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1, f.y - f.t * 30 + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 30);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Update effects.
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.2);
    this.hud(r, follow, dt);
  }

  private tileBase(t: Tile, shoulder: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = shoulder;
    this.band(t, EDGE + 6);
    ctx.fill();
  }

  private tileRoad(t: Tile): void {
    const ctx = this.ctx;
    ctx.fillStyle = SURFACES[t.surface].color;
    this.band(t, HALF);
    ctx.fill();
  }

  /** Path of the band ±w around the center line of a tile. */
  private band(t: Tile, w: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (t.turn === 0) {
      const mx = (t.gx + 0.5) * T;
      const my = (t.gy + 0.5) * T;
      const ax = mx - t.dx * (T / 2 + 1);
      const ay = my - t.dy * (T / 2 + 1);
      const bx = mx + t.dx * (T / 2 + 1);
      const by = my + t.dy * (T / 2 + 1);
      const lx = t.dy * w;
      const ly = -t.dx * w;
      ctx.moveTo(ax + lx, ay + ly);
      ctx.lineTo(bx + lx, by + ly);
      ctx.lineTo(bx - lx, by - ly);
      ctx.lineTo(ax - lx, ay - ly);
      ctx.closePath();
    } else {
      const ccw = t.sweep < 0;
      const ext = 0.01 * (ccw ? -1 : 1);
      ctx.arc(t.cx, t.cy, RAD + w, t.a0 - ext, t.a0 + t.sweep + ext, ccw);
      ctx.arc(t.cx, t.cy, Math.max(0.1, RAD - w), t.a0 + t.sweep + ext, t.a0 - ext, !ccw);
      ctx.closePath();
    }
  }

  private line(t: Tile, off: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (t.turn === 0) {
      const mx = (t.gx + 0.5) * T;
      const my = (t.gy + 0.5) * T;
      const lx = t.dy * off;
      const ly = -t.dx * off;
      ctx.moveTo(mx - (t.dx * T) / 2 + lx, my - (t.dy * T) / 2 + ly);
      ctx.lineTo(mx + (t.dx * T) / 2 + lx, my + (t.dy * T) / 2 + ly);
    } else {
      // off is left-positive; convert to a radius.
      const r = t.turn > 0 ? RAD - off : RAD + off;
      ctx.arc(t.cx, t.cy, Math.max(0.1, r), t.a0, t.a0 + t.sweep, t.sweep < 0);
    }
  }

  private tileDetail(t: Tile, tr: Track): void {
    const ctx = this.ctx;
    // Curbs on curves.
    if (t.turn !== 0) {
      ctx.lineWidth = 6;
      ctx.setLineDash([10, 10]);
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#e63946';
        this.line(t, side * (HALF - 3));
        ctx.stroke();
        ctx.strokeStyle = '#f1faee';
        ctx.lineDashOffset = 10;
        this.line(t, side * (HALF - 3));
        ctx.stroke();
        ctx.lineDashOffset = 0;
      }
    } else if (t.surface === 'asphalt') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([22, 22]);
      this.line(t, 0);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Edge lines.
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    this.line(t, HALF);
    ctx.stroke();
    this.line(t, -HALF);
    ctx.stroke();
    // Barriers (tire walls).
    ctx.lineWidth = 9;
    for (const side of [-1, 1]) {
      ctx.strokeStyle = '#1d1d1f';
      ctx.setLineDash([]);
      this.line(t, side * (EDGE + 3));
      ctx.stroke();
      ctx.strokeStyle = t.surface === 'ice' ? '#48cae4' : '#e85d04';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 12]);
      this.line(t, side * (EDGE + 3));
      ctx.stroke();
      ctx.lineWidth = 9;
    }
    ctx.setLineDash([]);
    if (t.turn !== 0) return;
    const mx = (t.gx + 0.5) * T;
    const my = (t.gy + 0.5) * T;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(t.dy, t.dx));
    // Start line on tile 0.
    if (tr.tiles[0] === t) {
      const sq = 10;
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
          ctx.fillRect(-T / 2 + j * sq, -HALF + i * sq, sq, sq);
        }
    }
    if (t.feature === 'boost') {
      ctx.fillStyle = 'rgba(76,201,240,0.25)';
      ctx.fillRect(-0.12 * T, -28, 0.24 * T, 56);
      ctx.strokeStyle = '#4cc9f0';
      ctx.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        const x = -0.1 * T + i * 16 + ((this.time * 40) % 16);
        ctx.beginPath();
        ctx.moveTo(x, -18);
        ctx.lineTo(x + 12, 0);
        ctx.lineTo(x, 18);
        ctx.stroke();
      }
    }
    if (t.feature === 'jump') {
      // Ramp from s 0.3 to 0.4, gap from 0.47 to 0.8.
      const x0 = (0.3 - 0.5) * T;
      const x1 = (0.4 - 0.5) * T;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#6b4f2a');
      g.addColorStop(1, '#d9b26f');
      ctx.fillStyle = g;
      ctx.fillRect(x0, -HALF, x1 - x0, HALF * 2);
      ctx.fillStyle = '#ffd166';
      for (let i = 0; i < 6; i++) ctx.fillRect(x1 - 4, -HALF + i * 20, 4, 10);
      ctx.fillStyle = t.surface === 'ice' ? '#1d4e89' : '#3a2a1a';
      ctx.fillRect((0.47 - 0.5) * T, -EDGE, 0.33 * T, EDGE * 2);
      ctx.fillStyle = t.surface === 'ice' ? 'rgba(144,224,239,0.4)' : 'rgba(120,80,40,0.6)';
      for (let i = 0; i < 5; i++) ctx.fillRect((0.5 - 0.5) * T + i * 12, -EDGE + 10 + ((i * 37) % 120), 8, 4);
    }
    ctx.restore();
  }

  private car(c: Car, me: boolean): void {
    const ctx = this.ctx;
    const air = c.air > 0 ? Math.sin(Math.PI * (1 - c.air / c.airMax)) : 0;
    const sc = 1 + air * 0.45;
    // Shadow.
    ctx.save();
    ctx.translate(c.x + 4 + air * 14, c.y + 5 + air * 14);
    ctx.rotate(c.a);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-16, -9, 32, 18);
    ctx.restore();
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.shield > 0) {
      ctx.strokeStyle = `rgba(128,255,219,${0.5 + 0.3 * Math.sin(this.time * 20)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, CAR_R + 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (me) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, CAR_R + 5 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.scale(sc, sc);
    ctx.rotate(c.a);
    // Wheels.
    ctx.fillStyle = '#111';
    ctx.fillRect(-13, -11, 8, 4);
    ctx.fillRect(-13, 7, 8, 4);
    ctx.fillRect(6, -11, 8, 4);
    ctx.fillRect(6, 7, 8, 4);
    // Body.
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-16, -9, 32, 18, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Stripe and windows.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-14, -1.5, 28, 3);
    ctx.fillStyle = '#1b263b';
    ctx.beginPath();
    ctx.roundRect(1, -7, 7, 14, 2);
    ctx.fill();
    ctx.fillRect(-11, -6, 4, 12);
    // Lights.
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(14, -7, 2, 4);
    ctx.fillRect(14, 3, 2, 4);
    if (c.hp <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-16, -9, 32, 18);
    }
    ctx.restore();
    // Driver icon above rivals.
    if (!me) {
      ctx.font = '14px serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.icon, c.x, c.y - 22 - air * 10);
    }
  }

  private hud(r: Race, follow: number, dt: number): void {
    const ctx = this.ctx;
    const me = r.cars[follow];
    const W = this.w;
    const H = this.h;
    const small = W < 600;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textBaseline = 'alphabetic';
    // Position and lap.
    const st = standings(r);
    const pos = st.indexOf(follow);
    const lap = Math.max(1, Math.min(LAPS, me.lap));
    ctx.fillStyle = 'rgba(10,8,14,0.6)';
    ctx.beginPath();
    ctx.roundRect(8, 8, small ? 150 : 190, small ? 92 : 104, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${small ? 26 : 32}px system-ui, sans-serif`;
    ctx.fillText(r.trial ? '⏱️' : `${ordinal(pos)}`, 18, small ? 38 : 44);
    ctx.font = `600 ${small ? 13 : 15}px system-ui, sans-serif`;
    ctx.fillStyle = '#ccc';
    ctx.fillText(r.trial ? 'Time trial' : `of ${r.cars.length}`, small ? 80 : 96, small ? 38 : 44);
    ctx.fillText(`Lap ${me.finished ? LAPS : lap}/${LAPS}  ${fmtTime(r.clock)}`, 18, small ? 58 : 66);
    // Bars.
    const bw = small ? 128 : 166;
    bar(ctx, 18, small ? 66 : 74, bw, 9, me.hp / me.stats.hp, me.hp > me.stats.hp * 0.3 ? '#7ee08a' : '#ef476f');
    bar(ctx, 18, small ? 79 : 88, bw, 9, me.nitro / me.stats.nitroCap, me.nitroOn ? '#ffd166' : '#4cc9f0');
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`HP ${Math.ceil(me.hp)}`, 22, small ? 74 : 82);
    ctx.fillText('NITRO', 22, small ? 87 : 96);
    if (me.gadget) {
      ctx.font = `600 ${small ? 13 : 14}px system-ui, sans-serif`;
      const icon = { mine: '💣', oil: '🛢️', shield: '🔰', can: '🥫' }[me.gadget];
      ctx.fillText(`${icon}×${me.charges}`, small ? 100 : 130, small ? 58 : 66);
    }
    // Mini map.
    this.minimap(r, follow, small);
    // Countdown.
    ctx.textAlign = 'center';
    if (r.t < COUNTDOWN + 0.6) {
      const n = Math.ceil(COUNTDOWN - r.t);
      const text = n > 0 ? String(n) : 'GO!';
      const f = r.t < COUNTDOWN ? 1 - (r.t % 1) : 1 - (r.t - COUNTDOWN) / 0.6;
      ctx.globalAlpha = Math.max(0, f);
      ctx.font = `900 ${Math.round(70 + 40 * (1 - f))}px system-ui, sans-serif`;
      ctx.fillStyle = n > 0 ? '#ffd166' : '#7ee08a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 6;
      ctx.strokeText(text, W / 2, H * 0.38);
      ctx.fillText(text, W / 2, H * 0.38);
      ctx.globalAlpha = 1;
    }
    if (this.banner) {
      const b = this.banner;
      b.t += dt;
      const a = Math.min(1, b.t * 5, (b.max - b.t) * 3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `900 ${small ? 34 : 46}px system-ui, sans-serif`;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 6;
      ctx.strokeText(b.text, W / 2, H * 0.3);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, W / 2, H * 0.3);
      if (b.sub) {
        ctx.font = `700 ${small ? 18 : 24}px system-ui, sans-serif`;
        ctx.strokeText(b.sub, W / 2, H * 0.3 + 34);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.sub, W / 2, H * 0.3 + 34);
      }
      ctx.globalAlpha = 1;
      if (b.t > b.max) this.banner = null;
    }
    if (me.wrong > 0.8 && !me.finished) {
      ctx.font = '900 28px system-ui, sans-serif';
      ctx.fillStyle = Math.sin(this.time * 10) > 0 ? '#ef476f' : '#fff';
      ctx.fillText('WRONG WAY', W / 2, H * 0.22);
    }
  }

  private minimap(r: Race, follow: number, small: boolean): void {
    const ctx = this.ctx;
    const tr = r.track;
    const size = small ? 96 : 150;
    const s = size / Math.max(tr.gw, tr.gh) / T;
    const ox = this.w - size - 10;
    const oy = 10;
    ctx.fillStyle = 'rgba(10,8,14,0.55)';
    ctx.beginPath();
    ctx.roundRect(ox - 4, oy - 4, size + 8, (tr.gh * T * s) + 8, 8);
    ctx.fill();
    ctx.lineWidth = small ? 3 : 4;
    ctx.lineJoin = 'round';
    for (const t of tr.tiles) {
      ctx.strokeStyle = t.surface === 'asphalt' ? '#aaa' : t.surface === 'dirt' ? '#c08552' : '#90e0ef';
      ctx.beginPath();
      const mx = (t.gx + 0.5) * T;
      const my = (t.gy + 0.5) * T;
      const ex = mx - (t.dx * T) / 2;
      const ey = my - (t.dy * T) / 2;
      const xx = mx + (t.ox * T) / 2;
      const xy = my + (t.oy * T) / 2;
      ctx.moveTo(ox + ex * s, oy + ey * s);
      if (t.turn === 0) ctx.lineTo(ox + xx * s, oy + xy * s);
      else ctx.quadraticCurveTo(ox + mx * s, oy + my * s, ox + xx * s, oy + xy * s);
      ctx.stroke();
    }
    r.cars.forEach((c, i) => {
      if (i === follow) return;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(ox + c.x * s, oy + c.y * s, small ? 2.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    const me = r.cars[follow];
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox + me.x * s, oy + me.y * s, small ? 3.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
}

export function fmtTime(t: number): string {
  if (t < 0) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** SVG preview of a track for the map screen. */
export function trackSvg(tr: Track): string {
  const segs = tr.tiles
    .map((t) => {
      const mx = t.gx + 0.5;
      const my = t.gy + 0.5;
      const ex = mx - t.dx / 2;
      const ey = my - t.dy / 2;
      const xx = mx + t.ox / 2;
      const xy = my + t.oy / 2;
      const col = t.surface === 'asphalt' ? '#c9c9d1' : t.surface === 'dirt' ? '#c08552' : '#90e0ef';
      const d = t.turn === 0 ? `M${ex} ${ey}L${xx} ${xy}` : `M${ex} ${ey}Q${mx} ${my} ${xx} ${xy}`;
      const feat = t.feature === 'jump' ? `<circle cx="${mx}" cy="${my}" r="0.22" fill="#ffd166"/>` : t.feature === 'boost' ? `<circle cx="${mx}" cy="${my}" r="0.22" fill="#4cc9f0"/>` : '';
      return `<path d="${d}" stroke="${col}"/>${feat}`;
    })
    .join('');
  const s = tr.tiles[0];
  const start = `<circle cx="${s.gx + 0.5 - s.dx / 2}" cy="${s.gy + 0.5 - s.dy / 2}" r="0.3" fill="#fff" stroke="#000" stroke-width="0.1"/>`;
  return `<svg class="tsvg" viewBox="0.5 0.5 ${tr.gw - 1} ${tr.gh - 1}" fill="none" stroke-width="0.32" stroke-linecap="round">${segs}${start}</svg>`;
}
