/** Canvas drawing for the mine view and the defense view. Reads the World, never changes it. */
import { GADGETS, LAYERS, MONSTERS, RES, layerAt, shieldMax } from './data';
import { hash } from './rng';
import {
  ARENA,
  DOME_RAD,
  GROUND,
  GUN_Y,
  H,
  HATCH,
  KH,
  KW,
  SWORD_ARC,
  SWORD_RANGE,
  W,
  idx,
  type Keeper,
  type Mon,
  type World,
} from './world';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  max: number;
  color: string;
  size: number;
  scene: 'mine' | 'def';
}

export interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
  scene: 'mine' | 'def';
}

export interface MineView {
  ts: number;
  camY: number;
}

export interface DefView {
  s: number;
  cx: number;
  gy: number;
}

const ORE_COLOR = ['', RES.iron.color, RES.water.color, RES.crystal.color, '#ffe66d'];

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

/** Tile colors are cached per layer and variant. */
const tileCache = new Map<string, string>();
function tileColor(layer: number, v: number, depth: number): string {
  const key = `${layer}|${v}|${Math.floor(depth / 4)}`;
  let c = tileCache.get(key);
  if (!c) {
    c = shade(LAYERS[layer].color, (0.85 + v * 0.06) * (1 - Math.min(depth, 70) / 200));
    tileCache.set(key, c);
  }
  return c;
}

function stars(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, t: number): void {
  for (let i = 0; i < 50; i++) {
    const hx = hash(seed, i);
    const x = (hx % 1000) / 1000 * w;
    const y = ((hx >>> 10) % 1000) / 1000 * h;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i));
    ctx.globalAlpha = tw * 0.8;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

export function drawKeeper(ctx: CanvasRenderingContext2D, k: Keeper, px: number, py: number, ts: number, t: number): void {
  const bw = KW * ts;
  const bh = KH * ts;
  ctx.save();
  ctx.translate(px, py);
  // Jetpack flame.
  if (k.jet) {
    const fl = (0.35 + Math.random() * 0.25) * ts;
    const g = ctx.createLinearGradient(0, bh / 2, 0, bh / 2 + fl);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.4, '#ff9f1c');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.28 * -k.face - bw * 0.12, bh * 0.25);
    ctx.lineTo(-bw * 0.28 * -k.face + bw * 0.12, bh * 0.25);
    ctx.lineTo(-bw * 0.28 * -k.face, bh / 2 + fl);
    ctx.fill();
  }
  // Pack.
  ctx.fillStyle = '#6c757d';
  ctx.fillRect(-k.face * bw * 0.5 - bw * 0.12, -bh * 0.25, bw * 0.24, bh * 0.5);
  // Body.
  ctx.fillStyle = '#e9c46a';
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bh * 0.15, bw, bh * 0.65, bw * 0.15);
  ctx.fill();
  // Head and helmet.
  ctx.fillStyle = '#f4d6b0';
  ctx.beginPath();
  ctx.arc(0, -bh * 0.28, bw * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f77f00';
  ctx.beginPath();
  ctx.arc(0, -bh * 0.32, bw * 0.33, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#fff8c4';
  ctx.beginPath();
  ctx.arc(k.face * bw * 0.25, -bh * 0.38, bw * 0.08, 0, Math.PI * 2);
  ctx.fill();
  // Eye.
  ctx.fillStyle = '#222';
  ctx.fillRect(k.face * bw * 0.12 - 1, -bh * 0.3, 2, 2);
  // Drill: points the way the keeper digs.
  let dx = k.face;
  let dy = 0;
  if (k.dig >= 0) {
    const tx = k.dig % W;
    const ty = Math.floor(k.dig / W);
    const ddx = tx + 0.5 - k.x;
    const ddy = ty + 0.5 - k.y;
    if (Math.abs(ddy) > Math.abs(ddx)) {
      dx = 0;
      dy = Math.sign(ddy);
    } else dx = Math.sign(ddx);
  }
  const jit = k.dig >= 0 ? Math.sin(t * 80) * ts * 0.03 : 0;
  ctx.save();
  ctx.translate(dx * bw * 0.45 + jit, bh * 0.15 + dy * bh * 0.35);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = '#adb5bd';
  ctx.beginPath();
  ctx.moveTo(0, -bh * 0.13);
  ctx.lineTo(bw * 0.45, 0);
  ctx.lineTo(0, bh * 0.13);
  ctx.fill();
  ctx.strokeStyle = '#6c757d';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(bw * 0.12 * i, -bh * 0.1 + i * 2);
    ctx.lineTo(bw * 0.12 * i + 3, bh * 0.1 - i * 2);
    ctx.stroke();
  }
  ctx.restore();
  // Cargo stack above the head.
  const cs = Math.max(4, ts * 0.22);
  k.cargo.forEach((r, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    ctx.fillStyle = RES[r].color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.rect(-cs * 2 + col * cs, -bh * 0.75 - row * cs - cs, cs - 1, cs - 1);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

export function drawMine(
  ctx: CanvasRenderingContext2D,
  w: World,
  cw: number,
  ch: number,
  camY: number,
  parts: Particle[],
  floats: Float[],
  t: number,
): MineView {
  const ts = cw / W;
  const rows = ch / ts;
  const sy = (y: number): number => (y - camY) * ts;
  // Sky.
  const skyBottom = sy(GROUND);
  if (skyBottom > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, skyBottom);
    g.addColorStop(0, '#0b1026');
    g.addColorStop(1, w.phase === 'wave' ? '#5a1a24' : '#2b2340');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, skyBottom);
    stars(ctx, cw, skyBottom, 7, t);
  }
  // Tunnel background.
  ctx.fillStyle = '#1a120d';
  ctx.fillRect(0, Math.max(0, skyBottom), cw, ch);
  const y0 = Math.max(0, Math.floor(camY));
  const y1 = Math.min(H - 1, Math.ceil(camY + rows));
  for (let y = y0; y <= y1; y++) {
    const py = sy(y);
    const depth = y - GROUND;
    const layer = layerAt(Math.max(0, depth));
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const hp = w.hp[i];
      const px = x * ts;
      if (y < GROUND) continue;
      if (hp === 0) {
        // Dug tunnel: a dark back wall with a faint texture.
        ctx.fillStyle = (x + y) % 2 ? '#22170f' : '#1d140d';
        ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
        continue;
      }
      if (hp < 0) {
        ctx.fillStyle = y === GROUND ? '#3a3a46' : '#141018';
        ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
        if (y === GROUND) {
          ctx.fillStyle = '#565666';
          ctx.fillRect(px, py, ts + 0.5, ts * 0.2);
        }
        continue;
      }
      const v = hash(x, y) % 4;
      ctx.fillStyle = tileColor(layer, v, depth);
      ctx.fillRect(px, py, ts + 0.5, ts + 0.5);
      // Pebbles.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px + ((v * 7) % 10) / 14 * ts, py + ((v * 3) % 10) / 14 * ts, ts * 0.12, ts * 0.1);
      if (y === GROUND) {
        ctx.fillStyle = '#4f772d';
        ctx.fillRect(px, py, ts + 0.5, ts * 0.22);
      }
      const ore = w.ore[i];
      if (ore === 4) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 4 + x);
        ctx.fillStyle = `rgba(255,230,109,${0.35 * pulse})`;
        ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
        ctx.strokeStyle = '#ffe66d';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + ts * 0.22, py + ts * 0.22, ts * 0.56, ts * 0.56);
        ctx.fillStyle = '#ffe66d';
        ctx.font = `bold ${Math.round(ts * 0.45)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', px + ts / 2, py + ts / 2 + 1);
      } else if (ore) {
        ctx.fillStyle = ORE_COLOR[ore];
        const n = ore === 1 ? 3 : 2;
        for (let g = 0; g < n; g++) {
          const hx = hash(x, y, g);
          const gx = px + ts * (0.2 + ((hx % 60) / 100));
          const gy = py + ts * (0.2 + (((hx >>> 8) % 60) / 100));
          const r = ts * (ore === 3 ? 0.16 : 0.13);
          ctx.beginPath();
          ctx.moveTo(gx, gy - r);
          ctx.lineTo(gx + r, gy);
          ctx.lineTo(gx, gy + r);
          ctx.lineTo(gx - r, gy);
          ctx.fill();
        }
        if (ore === 3) {
          ctx.fillStyle = `rgba(224,86,253,${0.15 + 0.1 * Math.sin(t * 3 + x * y)})`;
          ctx.fillRect(px, py, ts, ts);
        }
      }
      // Cracks while digging.
      const dmg = 1 - hp / w.max[i];
      if (dmg > 0.05) {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = Math.max(1, ts * 0.06);
        ctx.beginPath();
        const c = ts / 2;
        ctx.moveTo(px + c, py + c);
        ctx.lineTo(px + c - ts * 0.35 * dmg, py + c - ts * 0.3 * dmg);
        ctx.moveTo(px + c, py + c);
        ctx.lineTo(px + c + ts * 0.4 * dmg, py + c - ts * 0.1 * dmg);
        ctx.moveTo(px + c, py + c);
        ctx.lineTo(px + c + ts * 0.1 * dmg, py + c + ts * 0.4 * dmg);
        ctx.stroke();
      }
    }
  }
  // Edge shading between rock and tunnel.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = Math.max(GROUND + 1, y0); y <= y1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (w.hp[idx(x, y)] !== 0) continue;
      if (w.hp[idx(x, y - 1)] !== 0) ctx.fillRect(x * ts, sy(y), ts, ts * 0.12);
    }
  }
  // Dome.
  const dcx = (HATCH + 0.5) * ts;
  const dcy = sy(GROUND);
  const dr = 2.55 * ts;
  ctx.fillStyle = 'rgba(140, 200, 255, 0.12)';
  ctx.strokeStyle = 'rgba(180, 220, 255, 0.7)';
  ctx.lineWidth = Math.max(2, ts * 0.1);
  ctx.beginPath();
  ctx.arc(dcx, dcy, dr, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180, 220, 255, 0.25)';
  ctx.lineWidth = 1;
  for (let a = 1; a < 4; a++) {
    ctx.beginPath();
    ctx.moveTo(dcx, dcy);
    ctx.lineTo(dcx + Math.cos(Math.PI + (a * Math.PI) / 4) * dr, dcy + Math.sin(Math.PI + (a * Math.PI) / 4) * dr);
    ctx.stroke();
  }
  // Loose items.
  for (const l of w.loose) {
    ctx.fillStyle = RES[l.res].color;
    const x = l.x * ts;
    const y = sy(l.y) + Math.sin(t * 4 + l.x) * 2;
    ctx.beginPath();
    ctx.arc(x, y, ts * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  // Keeper.
  drawKeeper(ctx, w.k, w.k.x * ts, sy(w.k.y), ts, t);
  // Particles and floats.
  drawParts(ctx, parts, 'mine', (x) => x * ts, sy, ts);
  // Darkness: light around the keeper, more ambient light near the top.
  const kx = w.k.x * ts;
  const ky = sy(w.k.y);
  const depthK = Math.max(0, w.k.y - GROUND);
  const amb = Math.min(0.82, 0.25 + depthK / 60);
  const rad = ts * (5.5 + 0.5 * w.lv.drill);
  const g = ctx.createRadialGradient(kx, ky, rad * 0.25, kx, ky, rad);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amb})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, skyBottom), cw, ch);
  drawFloats(ctx, floats, 'mine', (x) => x * ts, sy, ts);
  return { ts, camY };
}

function drawParts(
  ctx: CanvasRenderingContext2D,
  parts: Particle[],
  scene: 'mine' | 'def',
  sx: (x: number) => number,
  sy: (y: number) => number,
  unit: number,
): void {
  for (const p of parts) {
    if (p.scene !== scene) continue;
    ctx.globalAlpha = Math.max(0, p.t / p.max);
    ctx.fillStyle = p.color;
    const s = p.size * unit;
    ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawFloats(
  ctx: CanvasRenderingContext2D,
  floats: Float[],
  scene: 'mine' | 'def',
  sx: (x: number) => number,
  sy: (y: number) => number,
  unit: number,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    if (f.scene !== scene) continue;
    const a = Math.min(1, f.t / 0.4);
    ctx.globalAlpha = a;
    ctx.font = `bold ${Math.round(Math.max(12, unit * 0.5) * f.size)}px system-ui`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(f.text, sx(f.x), sy(f.y));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx(f.x), sy(f.y));
  }
  ctx.globalAlpha = 1;
}

// ---------- Defense ----------

export function defScale(cw: number, ch: number): number {
  return Math.max(cw / (ARENA * 2), Math.min(cw / 23, ch / 14));
}

function drawMonster(ctx: CanvasRenderingContext2D, m: Mon, x: number, y: number, s: number, t: number): void {
  const d = MONSTERS[m.id];
  const r = (d.size / 2) * s;
  const face = m.x > 0 ? -1 : 1;
  const flying = d.kind === 'fly' || d.kind === 'dive' || d.kind === 'queen';
  ctx.save();
  ctx.translate(x, y);
  const body = m.flash > 0 ? '#ffffff' : d.color;
  if (flying) {
    // Wings.
    const flap = Math.sin(t * (d.kind === 'queen' ? 8 : 18) + m.uid) * 0.6;
    ctx.fillStyle = m.flash > 0 ? '#fff' : shade(d.color, 0.7);
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sd * r * 0.8, -r * 0.3, r * 0.9, r * 0.35, sd * (0.4 + flap), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Legs.
    ctx.strokeStyle = shade(d.color, 0.55);
    ctx.lineWidth = Math.max(1.5, r * 0.15);
    const step = Math.sin(t * d.speed * 6 + m.uid);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.5, r * 0.3);
      ctx.lineTo(i * r * 0.6 + step * r * 0.2 * (i === 0 ? -1 : 1), r);
      ctx.stroke();
    }
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  if (d.kind === 'dive') {
    ctx.moveTo(face * r * 1.1, 0);
    ctx.lineTo(-face * r * 0.8, -r * 0.7);
    ctx.lineTo(-face * r * 0.8, r * 0.7);
    ctx.closePath();
  } else if (d.kind === 'titan') {
    ctx.roundRect(-r, -r, r * 2, r * 1.8, r * 0.35);
  } else {
    ctx.ellipse(0, 0, r, r * (flying ? 0.75 : 0.8), 0, 0, Math.PI * 2);
  }
  ctx.fill();
  // Spots or armor plates.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  if (d.kind === 'titan' || d.id === 'brute' || d.id === 'hornet') {
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * r * 0.5 - r * 0.15, -r * 0.6, r * 0.3, r * 0.9);
  }
  if (d.kind === 'queen') {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * r * 0.6, -r * 0.6 + Math.sin(a) * r * 0.5 - (i % 2) * r * 0.25);
    }
    ctx.fill();
  }
  // Eyes.
  ctx.fillStyle = '#fff';
  const ex = face * r * 0.45;
  ctx.beginPath();
  ctx.arc(ex, -r * 0.2, Math.max(2, r * 0.22), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = d.kind === 'queen' || d.kind === 'dive' ? '#d00000' : '#111';
  ctx.beginPath();
  ctx.arc(ex + face * r * 0.06, -r * 0.2, Math.max(1, r * 0.11), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // HP bar.
  if (m.hp < m.max) {
    const bw = Math.max(18, r * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - bw / 2, y - r - 9, bw, 4);
    ctx.fillStyle = '#ef476f';
    ctx.fillRect(x - bw / 2, y - r - 9, (bw * Math.max(0, m.hp)) / m.max, 4);
  }
}

export function drawDefense(
  ctx: CanvasRenderingContext2D,
  w: World,
  cw: number,
  ch: number,
  parts: Particle[],
  floats: Float[],
  t: number,
  hurt: number,
): DefView {
  const s = defScale(cw, ch);
  const cx = cw / 2;
  const gy = Math.min(ch - 56, ch * 0.4 + 9.5 * s);
  const sx = (x: number): number => cx + x * s;
  const sy = (y: number): number => gy - y * s;
  // Sky.
  const g = ctx.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, '#0b0f24');
  g.addColorStop(1, '#4a2131');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, gy);
  stars(ctx, cw, gy * 0.7, 3, t);
  // Moon.
  ctx.fillStyle = 'rgba(255,240,200,0.85)';
  ctx.beginPath();
  ctx.arc(cw * 0.82, gy * 0.18, Math.max(10, s * 1.2), 0, Math.PI * 2);
  ctx.fill();
  // Far hills.
  ctx.fillStyle = '#2a1830';
  ctx.beginPath();
  ctx.moveTo(0, gy);
  for (let x = 0; x <= cw; x += 20) ctx.lineTo(x, gy - 30 - Math.sin(x * 0.013) * 18 - Math.sin(x * 0.041) * 8);
  ctx.lineTo(cw, gy);
  ctx.fill();
  // Ground.
  ctx.fillStyle = '#4f772d';
  ctx.fillRect(0, gy, cw, 5);
  const gg = ctx.createLinearGradient(0, gy, 0, ch);
  gg.addColorStop(0, '#8a5a3a');
  gg.addColorStop(1, '#3a2418');
  ctx.fillStyle = gg;
  ctx.fillRect(0, gy + 5, cw, ch - gy);
  // Rock strata and ore glints below the ground.
  for (let i = 1; i < 6; i++) {
    const y = gy + 5 + i * s * 1.6;
    if (y > ch) break;
    ctx.fillStyle = `rgba(0,0,0,${0.06 * i})`;
    ctx.fillRect(0, y, cw, s * 1.6);
    for (let j = 0; j < 8; j++) {
      const hx = hash(i, j, 11);
      const col = j % 4 === 0 ? RES.water.color : j % 5 === 0 ? RES.crystal.color : RES.iron.color;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.fillRect((hx % 1000) / 1000 * cw, y + ((hx >>> 10) % 100) / 100 * s * 1.4, 3, 3);
    }
    ctx.globalAlpha = 1;
  }
  // Hatch shaft below the dome.
  ctx.fillStyle = '#1a120d';
  ctx.fillRect(cx - s * 0.5, gy + 5, s, ch - gy);
  // Spits.
  for (const sp of w.spits) {
    ctx.fillStyle = '#a7f070';
    ctx.beginPath();
    ctx.arc(sx(sp.x), sy(sp.y), Math.max(3, s * 0.25), 0, Math.PI * 2);
    ctx.fill();
  }
  // Monsters, with arrows at the edge for the ones still out of view.
  for (const m of w.mons) {
    const x = sx(m.x);
    if (x < -10 || x > cw + 10) {
      const ex = x < 0 ? 6 : cw - 6;
      const ey = Math.max(40, Math.min(gy - 6, sy(m.y)));
      const dir = x < 0 ? -1 : 1;
      ctx.fillStyle = MONSTERS[m.id].color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(ex + dir * 4, ey);
      ctx.lineTo(ex - dir * 6, ey - 6);
      ctx.lineTo(ex - dir * 6, ey + 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    drawMonster(ctx, m, x, sy(m.y), s, t);
  }
  // Weapon.
  const ox = sx(0);
  const oy = sy(GUN_Y);
  const dx = Math.cos(w.angle);
  const dy = -Math.sin(w.angle);
  const active = w.docked || w.dome === 'turret';
  if (w.dome === 'sword') {
    const py = sy(1);
    const len = SWORD_RANGE * s;
    if (w.firing) {
      ctx.fillStyle = 'rgba(255,220,150,0.18)';
      ctx.beginPath();
      ctx.moveTo(ox, py);
      ctx.arc(ox, py, len, -w.angle - SWORD_ARC, -w.angle + SWORD_ARC);
      ctx.closePath();
      ctx.fill();
    }
    ctx.save();
    ctx.translate(ox, py);
    ctx.rotate(-w.angle + (w.firing ? Math.sin(t * 30) * SWORD_ARC * 0.8 : 0));
    ctx.fillStyle = '#ced4da';
    ctx.beginPath();
    ctx.moveTo(DOME_RAD * s * 0.6, -s * 0.18);
    ctx.lineTo(len, 0);
    ctx.lineTo(DOME_RAD * s * 0.6, s * 0.18);
    ctx.fill();
    ctx.fillStyle = '#9c6644';
    ctx.fillRect(DOME_RAD * s * 0.4, -s * 0.3, s * 0.5, s * 0.6);
    ctx.restore();
  } else {
    // Aim guide.
    ctx.strokeStyle = active ? 'rgba(255,120,120,0.22)' : 'rgba(255,255,255,0.08)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + dx * cw, oy + dy * cw);
    ctx.stroke();
    ctx.setLineDash([]);
    if (w.firing) {
      const end = w.beam ? { x: sx(w.beam.x), y: sy(w.beam.y) } : { x: ox + dx * cw * 1.5, y: oy + dy * cw * 1.5 };
      const turret = w.dome === 'turret';
      const col = turret ? '255,209,102' : '255,70,90';
      const wid = turret ? 2 + Math.random() * 2 : Math.max(3, s * 0.28) + Math.sin(t * 50) * 1.2;
      if (!turret || Math.sin(t * 40) > 0) {
        ctx.strokeStyle = `rgba(${col},0.35)`;
        ctx.lineWidth = wid * 3;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.strokeStyle = turret ? '#fff3c4' : '#ffd6dc';
        ctx.lineWidth = wid;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      if (w.beam) {
        ctx.fillStyle = `rgba(${col},0.8)`;
        ctx.beginPath();
        ctx.arc(end.x, end.y, s * 0.35 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Barrel.
    ctx.strokeStyle = '#adb5bd';
    ctx.lineWidth = Math.max(4, s * 0.35);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + dx * s * 1.3, oy + dy * s * 1.3);
    ctx.stroke();
  }
  // Dome glass, shield bubble and hull.
  const dr = DOME_RAD * s;
  const dcy = sy(0);
  const hpF = Math.max(0, w.domeHp / w.domeMax);
  ctx.fillStyle = hurt > 0 ? `rgba(255,80,80,${0.25 + hurt})` : 'rgba(140,200,255,0.16)';
  ctx.strokeStyle = shade('#b4dcff', 0.5 + hpF * 0.5);
  ctx.lineWidth = Math.max(2, s * 0.15);
  ctx.beginPath();
  ctx.arc(ox, dcy, dr, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (hpF < 0.5) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox - dr * 0.4, dcy - dr * 0.7);
    ctx.lineTo(ox - dr * 0.15, dcy - dr * 0.45);
    ctx.lineTo(ox - dr * 0.3, dcy - dr * 0.2);
    if (hpF < 0.25) {
      ctx.moveTo(ox + dr * 0.3, dcy - dr * 0.8);
      ctx.lineTo(ox + dr * 0.5, dcy - dr * 0.5);
    }
    ctx.stroke();
  }
  const shF = w.shield / Math.max(1, shieldMax(w.lv.shield));
  if (shF > 0.02) {
    ctx.strokeStyle = `rgba(122,215,255,${0.25 + 0.55 * shF})`;
    ctx.lineWidth = 2 + shF * 3;
    ctx.beginPath();
    ctx.arc(ox, dcy, dr + s * 0.45, Math.PI, 0);
    ctx.stroke();
  }
  // Keeper inside the dome or a hint that the keeper is away.
  if (w.docked) {
    const ts = s * 0.9;
    drawKeeper(ctx, { ...w.k, face: Math.cos(w.angle) >= 0 ? 1 : -1, jet: false, dig: -1, cargo: [] }, ox - s * 1.2, dcy - (KH / 2) * ts, ts, t);
  }
  drawParts(ctx, parts, 'def', sx, sy, s);
  drawFloats(ctx, floats, 'def', sx, sy, s);
  return { s, cx, gy };
}

/** Top overlay: wave timer bar, always visible in both views. */
export function drawHud(ctx: CanvasRenderingContext2D, w: World, cw: number, t: number, view: 'mine' | 'def'): void {
  const pad = 8;
  const bh = 22;
  ctx.fillStyle = 'rgba(10,8,6,0.7)';
  ctx.beginPath();
  ctx.roundRect(pad, pad, cw - pad * 2, bh, 8);
  ctx.fill();
  let label = '';
  let frac = 0;
  let col = '#d4a373';
  if (w.phase === 'mine') {
    frac = Math.max(0, w.timer / w.timerMax);
    const sec = Math.ceil(w.timer);
    label = `Wave ${w.wave} in ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    col = w.timer < 10 ? (Math.sin(t * 10) > 0 ? '#ef476f' : '#ff8fa3') : w.timer < 20 ? '#ff9f43' : '#d4a373';
  } else {
    const left = w.mons.length + w.queue.length;
    label = `Wave ${w.wave} — ${left} monster${left === 1 ? '' : 's'} left`;
    frac = 1;
    col = '#ef476f';
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(pad + 2, pad + 2, Math.max(0, (cw - pad * 2 - 4) * frac), bh - 4, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(label, cw / 2, pad + bh / 2 + 1);
  ctx.fillText(label, cw / 2, pad + bh / 2 + 1);
  // Second line: depth and cargo in the mine, HP and shield in the defense.
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  const y2 = pad + bh + 12;
  if (view === 'mine') {
    const depth = Math.max(0, Math.floor(w.k.y - GROUND));
    const capN = 3 + 2 * (w.lv.carry - 1);
    const txt = `Depth ${depth} m · ${LAYERS[layerAt(depth)].name} · Cargo ${w.k.cargo.length}/${capN}`;
    ctx.strokeText(txt, pad + 2, y2);
    ctx.fillStyle = '#f1e3d3';
    ctx.fillText(txt, pad + 2, y2);
  }
  if (w.phase === 'wave' && view === 'mine') {
    const a = 0.6 + 0.4 * Math.sin(t * 8);
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    const msg = w.dome === 'turret' ? '⚠ Wave! The turret fights. Get back to the dome ↑' : '⚠ Wave! Get back to the dome to fight ↑';
    ctx.globalAlpha = a;
    ctx.strokeText(msg, cw / 2, y2 + 20);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(msg, cw / 2, y2 + 20);
    ctx.globalAlpha = 1;
  }
  if (view === 'def') {
    // Gadget hint for the strike.
    if (w.gadgets.includes('strike') && !w.strikeUsed) {
      ctx.font = '12px system-ui';
      ctx.textAlign = 'right';
      const txt = `${GADGETS.strike.icon} ready (F)`;
      ctx.strokeText(txt, cw - pad - 2, y2);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(txt, cw - pad - 2, y2);
    }
  }
}
