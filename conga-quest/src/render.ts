/** Canvas renderer: arena, hero line, enemies, shots, pickups and effects. */
import { CLASSES, DX, DY, GRID_H, GRID_W, STAGES } from './data';
import type { World, WorldEvent } from './world';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Shape {
  kind: 'ring' | 'beam' | 'slash';
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  color: string;
  life: number;
  max: number;
}

const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

export class Renderer {
  private parts: Particle[] = [];
  private floats: Float[] = [];
  private shapes: Shape[] = [];
  private shake = 0;
  private floor: HTMLCanvasElement | null = null;
  private floorKey = '';
  private lastT = 0;

  reset(): void {
    this.parts = [];
    this.floats = [];
    this.shapes = [];
    this.shake = 0;
    this.floorKey = '';
  }

  fx(ev: WorldEvent): void {
    switch (ev.kind) {
      case 'num':
        if (this.floats.length < 36) this.floats.push({ x: ev.x + (Math.random() - 0.5) * 0.3, y: ev.y, text: ev.text, color: ev.color, life: 0.9 });
        break;
      case 'burst':
        for (let i = 0; i < ev.n && this.parts.length < 400; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1.5 + Math.random() * 4;
          const life = 0.3 + Math.random() * 0.4;
          this.parts.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color: ev.color, size: 0.08 + Math.random() * 0.1 });
        }
        break;
      case 'ring':
        this.shapes.push({ kind: 'ring', x: ev.x, y: ev.y, x2: 0, y2: 0, r: ev.r, color: ev.color, life: 0.35, max: 0.35 });
        break;
      case 'beam':
        this.shapes.push({ kind: 'beam', x: ev.x1, y: ev.y1, x2: ev.x2, y2: ev.y2, r: 0, color: ev.color, life: 0.25, max: 0.25 });
        break;
      case 'slash':
        this.shapes.push({ kind: 'slash', x: ev.x, y: ev.y, x2: 0, y2: 0, r: Math.random() * Math.PI, color: ev.color, life: 0.18, max: 0.18 });
        break;
      case 'shake':
        this.shake = Math.max(this.shake, ev.amt);
        break;
    }
  }

  private makeFloor(w: World, cell: number, dpr: number): void {
    const key = `${w.wave}|${cell}|${dpr}`;
    if (this.floor && this.floorKey === key) return;
    this.floorKey = key;
    const c = document.createElement('canvas');
    c.width = Math.ceil(GRID_W * cell * dpr);
    c.height = Math.ceil(GRID_H * cell * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    const st = STAGES[w.stage];
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        g.fillStyle = st.floor[(x + y) % 2];
        g.fillRect(x * cell, y * cell, cell, cell);
      }
    // Small floor speckles.
    let s = w.wave * 9301;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 90; i++) g.fillRect(rnd() * GRID_W * cell, rnd() * GRID_H * cell, 2, 2);
    for (let y = 0; y < GRID_H; y++)
      for (let x = 0; x < GRID_W; x++) {
        if (!w.rocks[y * GRID_W + x]) continue;
        const px = x * cell;
        const py = y * cell;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.roundRect(px + 2, py + 4, cell - 3, cell - 3, cell * 0.25);
        g.fill();
        g.fillStyle = st.rock;
        g.beginPath();
        g.roundRect(px + 1, py + 1, cell - 2, cell - 3, cell * 0.25);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.roundRect(px + 3, py + 3, cell * 0.45, cell * 0.25, cell * 0.12);
        g.fill();
      }
    this.floor = c;
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cell: number, ox: number, oy: number, dpr: number, cw: number, ch: number): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, this.lastT ? now - this.lastT : 0);
    this.lastT = now;
    this.makeFloor(w, cell, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0912';
    ctx.fillRect(0, 0, cw, ch);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 30);
    }
    ctx.translate(ox + sx, oy + sy);
    // Arena border glow.
    ctx.fillStyle = '#8338ec33';
    ctx.fillRect(-4, -4, GRID_W * cell + 8, GRID_H * cell + 8);
    ctx.drawImage(this.floor!, 0, 0, GRID_W * cell, GRID_H * cell);

    const P = (x: number) => x * cell;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Pickups.
    for (const p of w.pickups) {
      const cx = P(p.x + 0.5);
      const cy = P(p.y + 0.5) + Math.sin(now * 4 + p.id) * cell * 0.06;
      if (p.life < 3 && Math.floor(now * 8) % 2 === 0) continue;
      if (p.kind === 'gem') {
        const r = cell * (p.value >= 5 ? 0.32 : 0.22);
        ctx.fillStyle = '#7fe3ff';
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r * 0.75, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r * 0.75, cy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(cx - r * 0.2, cy - r * 0.5, r * 0.25, r * 0.4);
      } else if (p.kind === 'coin') {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.ellipse(cx, cy, cell * 0.2 * Math.abs(Math.cos(now * 3 + p.id)) + 1, cell * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'food') {
        ctx.font = `${cell * 0.7}px ${EMOJI}`;
        ctx.fillText('🍖', cx, cy);
      } else {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * (0.55 + Math.sin(now * 5) * 0.06), 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${cell * 0.62}px ${EMOJI}`;
        ctx.fillText(CLASSES[p.cls!].icon, cx, cy);
        ctx.font = `${cell * 0.4}px ${EMOJI}`;
        ctx.fillText('🔒', cx + cell * 0.32, cy + cell * 0.3);
      }
    }

    // Hero line.
    const a = w.partyAlpha();
    const hp = w.heroes.map((h) => [P(h.px + (h.x - h.px) * a + 0.5), P(h.py + (h.y - h.py) * a + 0.5)]);
    if (hp.length > 1) {
      ctx.strokeStyle = 'rgba(131,56,236,0.55)';
      ctx.lineWidth = cell * 0.32;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(hp[0][0], hp[0][1]);
      for (let i = 1; i < hp.length; i++) ctx.lineTo(hp[i][0], hp[i][1]);
      ctx.stroke();
    }
    for (let i = w.heroes.length - 1; i >= 0; i--) {
      const h = w.heroes[i];
      const d = CLASSES[h.cls];
      const [cx, cy] = hp[i];
      const bob = Math.sin(now * 10 + i * 1.3) * cell * 0.04;
      const r = cell * (i === 0 ? 0.47 : 0.42);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.85, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = h.flash > 0 ? '#ffffff' : d.color;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = i === 0 ? '#ffd166' : 'rgba(0,0,0,0.45)';
      ctx.lineWidth = i === 0 ? 2.5 : 1.5;
      ctx.stroke();
      ctx.font = `${cell * 0.55}px ${EMOJI}`;
      ctx.fillText(d.icon, cx, cy + bob + 1);
      if (h.stars) {
        ctx.font = `bold ${Math.max(8, cell * 0.3)}px sans-serif`;
        ctx.fillStyle = '#ffd166';
        ctx.fillText('★'.repeat(h.stars), cx, cy - r - 2);
      }
      const ratio = Math.max(0, h.hp / h.s.maxHp);
      if (ratio < 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(cx - r, cy + r + 1, r * 2, 3);
        ctx.fillStyle = ratio > 0.5 ? '#7ee08a' : ratio > 0.25 ? '#ffd166' : '#ef476f';
        ctx.fillRect(cx - r, cy + r + 1, r * 2 * ratio, 3);
      }
    }
    // Leader direction arrow (queued turn or heading).
    if (w.heroes.length) {
      const [cx, cy] = hp[0];
      const d = w.queued ?? w.heading;
      const ax = cx + DX[d] * cell * 0.72;
      const ay = cy + DY[d] * cell * 0.72;
      ctx.fillStyle = w.queued !== null ? '#ffd166' : 'rgba(255,255,255,0.7)';
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate((d * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(cell * 0.16, 0);
      ctx.lineTo(-cell * 0.1, -cell * 0.13);
      ctx.lineTo(-cell * 0.1, cell * 0.13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (w.pauseT > 0 && w.moves === 0 && w.crashes === 0) {
        ctx.font = `bold ${Math.max(12, cell * 0.6)}px system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.fillStyle = '#ffd166';
        const txt = `Steer to start · ${Math.ceil(w.pauseT)}`;
        ctx.strokeText(txt, cx, cy - cell * 1.1);
        ctx.fillText(txt, cx, cy - cell * 1.1);
      } else if (w.pauseT > 0) {
        ctx.font = `bold ${cell * 0.6}px sans-serif`;
        ctx.fillStyle = '#ffd166';
        ctx.fillText('!', cx, cy - cell * 0.9);
      }
    }

    // Enemies.
    for (const e of w.enemies) {
      const ea = e.moveI > 0 ? Math.max(0, Math.min(1, 1 - e.moveT / e.moveI)) : 1;
      const moving = e.state === 'walk' || e.state === 'charge';
      const fx = moving ? e.px + (e.x - e.px) * ea : e.x;
      const fy = moving ? e.py + (e.y - e.py) * ea : e.y;
      const cx = P(fx + 0.5);
      const cy = P(fy + 0.5);
      const boss = !!e.def.boss;
      if (e.state === 'spawn') {
        const t = 1 - e.timer / (boss ? 1.4 : 0.9);
        ctx.strokeStyle = e.def.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4 + t * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * (boss ? 0.9 : 0.45) * (1.3 - t * 0.6), now * 6, now * 6 + Math.PI * 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const r = cell * (boss ? 0.85 : 0.42);
      if (e.state === 'wind') {
        ctx.strokeStyle = 'rgba(239,71,111,0.5)';
        ctx.lineWidth = cell * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + e.dx * cell * 4, cy + e.dy * cell * 4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.85, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.slowT > 0 ? '#9fe6f5' : boss ? '#2a1f33' : 'rgba(20,14,26,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = e.def.color;
      ctx.lineWidth = boss ? 3 : 2;
      ctx.stroke();
      const wob = e.state === 'stun' ? Math.sin(now * 20) * 0.2 : 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(wob);
      ctx.font = `${r * 1.25}px ${EMOJI}`;
      ctx.fillText(e.def.icon, 0, 1);
      ctx.restore();
      if (e.state === 'stun') {
        ctx.font = `${cell * 0.35}px ${EMOJI}`;
        ctx.fillText('💫', cx, cy - r - 2);
      }
      if (e.state === 'wind') {
        ctx.font = `bold ${cell * 0.55}px sans-serif`;
        ctx.fillStyle = '#ef476f';
        ctx.fillText('!', cx, cy - r - cell * 0.2);
      }
      if (e.hp < e.maxHp && !boss) {
        const ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(cx - r, cy - r - 4, r * 2, 3);
        ctx.fillStyle = '#ef476f';
        ctx.fillRect(cx - r, cy - r - 4, r * 2 * ratio, 3);
      }
    }

    // Shots.
    for (const s of w.shots) {
      const x = P(s.x);
      const y = P(s.y);
      switch (s.kind) {
        case 'arrow': {
          const l = cell * 0.35;
          const n = Math.hypot(s.vx, s.vy) || 1;
          ctx.strokeStyle = '#e9e4d4';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - (s.vx / n) * l, y - (s.vy / n) * l);
          ctx.lineTo(x, y);
          ctx.stroke();
          break;
        }
        case 'orb':
        case 'ice':
        case 'bomb':
        case 'fire':
        case 'bolt': {
          const col = { orb: '#c77dff', ice: '#9fe6f5', bomb: '#333', fire: '#ff8c42', bolt: '#f4ecdc' }[s.kind];
          const r = cell * (s.kind === 'bomb' ? 0.2 : s.kind === 'fire' ? 0.2 : 0.14);
          ctx.fillStyle = col;
          ctx.shadowColor = s.enemy ? '#ef476f' : col;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          if (s.kind === 'bomb') {
            ctx.fillStyle = '#ffd166';
            ctx.fillRect(x - 1, y - r - 3, 2, 3);
          }
          break;
        }
      }
    }

    // Effects.
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.shapes.splice(i, 1);
        continue;
      }
      const t = 1 - s.life / s.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = s.color;
      if (s.kind === 'ring') {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(P(s.x), P(s.y), P(s.r) * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.kind === 'beam') {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(P(s.x), P(s.y));
        ctx.lineTo(P(s.x2), P(s.y2));
        ctx.stroke();
      } else {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(P(s.x), P(s.y), cell * 0.45, s.r + t * 2, s.r + t * 2 + 1.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(P(p.x) - P(p.size) / 2, P(p.y) - P(p.size) / 2, P(p.size), P(p.size));
    }
    ctx.globalAlpha = 1;
    ctx.font = `bold ${Math.max(10, cell * 0.4)}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floats.splice(i, 1);
        continue;
      }
      f.y -= dt * 1.2;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.strokeText(f.text, P(f.x), P(f.y));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, P(f.x), P(f.y));
    }
    ctx.globalAlpha = 1;

    // Boss bar.
    const b = w.enemies.find((e) => e.def.boss && e.state !== 'spawn');
    if (b) {
      const bw = GRID_W * cell * 0.6;
      const bx = (GRID_W * cell - bw) / 2;
      const by = GRID_H * cell - 16;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
      ctx.fillStyle = '#ef476f';
      ctx.fillRect(bx, by, bw * Math.max(0, b.hp / b.maxHp), 8);
      ctx.font = `bold 11px system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(b.def.name, GRID_W * cell * 0.5, by - 9);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
