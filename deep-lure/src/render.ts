/** Canvas renderer for the sea, the minimap and the reel minigame. */
import { FISH_BY_ID, LAMPS, PORTS, REGIONS } from './data';
import { darkness, lightRadius, type Run } from './game';
import type { Reel } from './reel';
import { hash } from './rng';
import { CELL, GH, GW, WH, WW, type World } from './world';

export interface View {
  cx: number;
  cy: number;
  scale: number;
  w: number;
  h: number;
}

export interface Fx {
  floats: { x: number; y: number; text: string; color: string; t: number }[];
  rings: { x: number; y: number; t: number; max: number; color: string }[];
  wake: { x: number; y: number; t: number }[];
}

export const newFx = (): Fx => ({ floats: [], rings: [], wake: [] });

const SPOT_COLOR = ['', '#8be9fd', '#4ea8de', '#b388ff'];

let darkLayer: HTMLCanvasElement | null = null;

export function drawSea(ctx: CanvasRenderingContext2D, run: Run, w: World, v: View, time: number, fx: Fx, fishable: number): void {
  const { scale: s } = v;
  const toX = (x: number): number => (x - v.cx) * s + v.w / 2;
  const toY = (y: number): number => (y - v.cy) * s + v.h / 2;
  const x0 = v.cx - v.w / 2 / s;
  const y0 = v.cy - v.h / 2 / s;
  const x1 = v.cx + v.w / 2 / s;
  const y1 = v.cy + v.h / 2 / s;
  ctx.fillStyle = '#05080d';
  ctx.fillRect(0, 0, v.w, v.h);
  const rect = (cx: number, cy: number): void => {
    const ax = Math.round(toX(cx * CELL));
    const ay = Math.round(toY(cy * CELL));
    ctx.fillRect(ax, ay, Math.round(toX((cx + 1) * CELL)) - ax, Math.round(toY((cy + 1) * CELL)) - ay);
  };
  const c0 = Math.max(0, Math.floor(x0 / CELL));
  const c1 = Math.min(GW - 1, Math.floor(x1 / CELL));
  const r0 = Math.max(0, Math.floor(y0 / CELL));
  const r1 = Math.min(GH - 1, Math.floor(y1 / CELL));
  // Water by region.
  for (let cy = r0; cy <= r1; cy++)
    for (let cx = c0; cx <= c1; cx++) {
      ctx.fillStyle = REGIONS[w.region[cy * GW + cx]].water;
      rect(cx, cy);
    }
  // Waves.
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  for (let cy = r0; cy <= r1; cy++)
    for (let cx = c0; cx <= c1; cx++) {
      const h = hash('wave', cx, cy);
      const wx = cx * CELL + (h % 50) + Math.sin(time * 0.6 + h) * 6;
      const wy = cy * CELL + ((h >> 8) % 50);
      ctx.beginPath();
      ctx.moveTo(toX(wx - 8), toY(wy));
      ctx.quadraticCurveTo(toX(wx - 4), toY(wy - 4), toX(wx), toY(wy));
      ctx.quadraticCurveTo(toX(wx + 4), toY(wy + 4), toX(wx + 8), toY(wy));
      ctx.stroke();
    }
  const vis = (x: number, y: number, r: number): boolean => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
  // Fishing spots.
  w.spots.forEach((sp, i) => {
    if (!vis(sp.x, sp.y, 60)) return;
    const stock = run.stock[i];
    const col = SPOT_COLOR[sp.depth];
    ctx.globalAlpha = stock > 0 ? 1 : 0.25;
    for (let k = 0; k < 3; k++) {
      const p = (time * 0.45 + k / 3) % 1;
      ctx.strokeStyle = col;
      ctx.globalAlpha = (stock > 0 ? 0.7 : 0.2) * (1 - p);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(sp.x), toY(sp.y), (8 + p * sp.r) * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = stock > 0 ? 0.55 : 0.15;
    for (let k = 0; k < Math.min(stock, 4); k++) {
      const a = time * (0.8 + k * 0.2) + k * 2;
      const fx2 = sp.x + Math.cos(a) * 16;
      const fy2 = sp.y + Math.sin(a) * 10;
      ctx.fillStyle = '#02121b';
      ctx.beginPath();
      ctx.ellipse(toX(fx2), toY(fy2), 6 * s, 2.5 * s, a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (i === fishable) {
      ctx.strokeStyle = '#ffd166';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(sp.x), toY(sp.y), (sp.r + 26) * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Depth pips and stock.
    ctx.fillStyle = col;
    ctx.font = `${Math.round(10 * Math.max(0.9, s))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`${'▾'.repeat(sp.depth)} ${stock > 0 ? '🐟'.repeat(Math.min(stock, 4)) : '—'}`, toX(sp.x), toY(sp.y + sp.r + 16));
  });
  // Islands and ports.
  for (const is of w.islands) {
    if (!vis(is.x, is.y, is.r + 20)) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(toX(is.x), toY(is.y), (is.r + 6 + Math.sin(time * 1.5 + is.x) * 2) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8a77a';
    ctx.beginPath();
    ctx.arc(toX(is.x), toY(is.y), is.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = is.port >= 0 ? '#566b47' : '#47573c';
    ctx.beginPath();
    ctx.arc(toX(is.x), toY(is.y), (is.r - 11) * s, 0, Math.PI * 2);
    ctx.fill();
    const hh = hash('isl', is.x, is.y);
    ctx.font = `${Math.round(16 * s)}px system-ui`;
    ctx.textAlign = 'center';
    for (let k = 0; k < 3; k++) {
      const a = ((hh >> (k * 4)) % 16) * 0.4;
      const d = (is.r - 30) * (0.3 + (((hh >> (k * 3)) % 7) / 10));
      ctx.fillText(is.port >= 0 && k === 0 ? '🏠' : '🌲', toX(is.x + Math.cos(a) * d), toY(is.y + Math.sin(a) * d) + 6 * s);
    }
  }
  PORTS.forEach((p) => {
    if (!vis(p.dx, p.dy, 200)) return;
    ctx.strokeStyle = '#7f5539';
    ctx.lineWidth = 8 * s;
    ctx.beginPath();
    const a = Math.atan2(p.dy - p.iy, p.dx - p.ix);
    ctx.moveTo(toX(p.ix + Math.cos(a) * (p.ir - 15)), toY(p.iy + Math.sin(a) * (p.ir - 15)));
    ctx.lineTo(toX(p.dx - Math.cos(a) * 14), toY(p.dy - Math.sin(a) * 14));
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    ctx.font = `bold ${Math.round(13 * Math.max(0.85, s))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`⚓ ${p.name}`, toX(p.dx), toY(p.dy) - 22 * s);
  });
  // Rocks.
  for (const r of w.rocks) {
    if (!vis(r.x, r.y, r.r + 10)) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(toX(r.x), toY(r.y), (r.r + 4) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d4248';
    ctx.beginPath();
    ctx.arc(toX(r.x), toY(r.y), r.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c636b';
    ctx.beginPath();
    ctx.arc(toX(r.x - r.r * 0.3), toY(r.y - r.r * 0.3), r.r * 0.45 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const r of run.phantoms) {
    ctx.globalAlpha = Math.min(1, r.life / 4) * (0.6 + 0.3 * Math.sin(time * 9 + r.x));
    ctx.fillStyle = '#2b1838';
    ctx.beginPath();
    ctx.arc(toX(r.x), toY(r.y), r.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b388ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Wake.
  for (const p of fx.wake) {
    ctx.fillStyle = `rgba(230,245,255,${0.35 * (1 - p.t)})`;
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.y), (2 + p.t * 7) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Boat.
  if (run.docked < 0) drawBoat(ctx, toX(run.boat.x), toY(run.boat.y), run.boat.heading, s, run.boat.inv > 0 && Math.floor(time * 12) % 2 === 0);
  // Shades.
  for (const sh of run.shades) {
    const x = toX(sh.x);
    const y = toY(sh.y);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#05000a';
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rr = (16 + Math.sin(time * 5 + k * 2 + sh.wob) * 4) * s;
      if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Rings (splashes, bumps).
  for (const r of fx.rings) {
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - r.t;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(r.x), toY(r.y), r.max * r.t * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Unexplored fog and locked regions.
  for (let cy = r0; cy <= r1; cy++)
    for (let cx = c0; cx <= c1; cx++) {
      const c = cy * GW + cx;
      const locked = !run.unlocked.includes(w.region[c]);
      if (!locked && run.explored[c]) continue;
      const h = hash('fog', cx, cy);
      ctx.fillStyle = locked ? `rgba(42,30,58,${0.86 + Math.sin(time + (h % 10)) * 0.06})` : 'rgba(14,22,30,0.82)';
      rect(cx, cy);
    }
  REGIONS.forEach((reg, i) => {
    if (run.unlocked.includes(i) || !vis(reg.cx, reg.cy, 300)) return;
    ctx.fillStyle = 'rgba(220,200,255,0.55)';
    ctx.font = `bold ${Math.round(15 * Math.max(0.85, s))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(`🔒 ${reg.name}`, toX(reg.cx), toY(reg.cy));
    ctx.font = `${Math.round(11 * Math.max(0.85, s))}px system-ui`;
    const key = FISH_BY_ID[reg.key!];
    ctx.fillText(`Thick fog. Land a ${key.name} to find the way.`, toX(reg.cx), toY(reg.cy) + 18);
  });
  // Darkness with the lamp light.
  const dark = darkness(run.minute);
  if (dark > 0.02) {
    if (!darkLayer) darkLayer = document.createElement('canvas');
    if (darkLayer.width !== ctx.canvas.width || darkLayer.height !== ctx.canvas.height) {
      darkLayer.width = ctx.canvas.width;
      darkLayer.height = ctx.canvas.height;
    }
    const dc = darkLayer.getContext('2d')!;
    const k = ctx.canvas.width / v.w;
    dc.setTransform(k, 0, 0, k, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.clearRect(0, 0, v.w, v.h);
    dc.fillStyle = `rgba(3,6,16,${dark})`;
    dc.fillRect(0, 0, v.w, v.h);
    dc.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a: number): void => {
      const g = dc.createRadialGradient(x, y, r * 0.25, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.beginPath();
      dc.arc(x, y, r, 0, Math.PI * 2);
      dc.fill();
    };
    if (run.docked < 0) hole(toX(run.boat.x), toY(run.boat.y), lightRadius(run) * s * (1 + Math.sin(time * 7) * 0.015), 1);
    PORTS.forEach((p) => vis(p.dx, p.dy, 300) && hole(toX(p.dx), toY(p.dy), 170 * s, 0.85));
    ctx.drawImage(darkLayer, 0, 0, v.w, v.h);
    if (run.docked < 0) {
      const g = ctx.createRadialGradient(toX(run.boat.x), toY(run.boat.y), 0, toX(run.boat.x), toY(run.boat.y), LAMPS[run.gear.lamp].radius * s);
      g.addColorStop(0, `rgba(255,200,120,${0.12 * dark})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, v.w, v.h);
    }
  }
  // Shade eyes glow through the dark.
  for (const sh of run.shades) {
    const x = toX(sh.x);
    const y = toY(sh.y);
    ctx.globalAlpha = Math.max(0.35, sh.hp / 3) * (0.8 + 0.2 * Math.sin(time * 6 + sh.wob));
    ctx.fillStyle = 'rgba(255,40,80,0.25)';
    ctx.beginPath();
    ctx.arc(x, y - 2 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(x - 5 * s, y - 2 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.arc(x + 5 * s, y - 2 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Panic vignette.
  if (run.panic > 15 && run.docked < 0) {
    const p = Math.min(1, run.panic / 100);
    const g = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    g.addColorStop(0, 'rgba(80,0,40,0)');
    g.addColorStop(1, `rgba(90,0,50,${p * 0.7 + Math.sin(time * 3) * 0.05 * p})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.w, v.h);
  }
  // Floating text.
  ctx.textAlign = 'center';
  for (const f of fx.floats) {
    ctx.globalAlpha = Math.min(1, 2 * (1 - f.t));
    ctx.fillStyle = f.color;
    ctx.font = 'bold 15px system-ui';
    ctx.fillText(f.text, toX(f.x), toY(f.y) - f.t * 40);
  }
  ctx.globalAlpha = 1;
}

export function drawBoat(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, s: number, blink: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(s, s);
  ctx.globalAlpha = blink ? 0.4 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 19, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8d5a3b';
  ctx.strokeStyle = '#3b2416';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.quadraticCurveTo(10, -9, -14, -8);
  ctx.lineTo(-16, 0);
  ctx.lineTo(-14, 8);
  ctx.quadraticCurveTo(10, 9, 20, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e9d8a6';
  ctx.fillRect(-9, -5, 11, 10);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawMinimap(ctx: CanvasRenderingContext2D, run: Run, w: World, x: number, y: number, mw: number): void {
  const k = mw / WW;
  const mh = WH * k;
  ctx.fillStyle = 'rgba(4,10,16,0.85)';
  ctx.fillRect(x - 2, y - 2, mw + 4, mh + 4);
  const cw = CELL * k;
  for (let c = 0; c < GW * GH; c++) {
    const cx = c % GW;
    const cy = Math.floor(c / GW);
    const locked = !run.unlocked.includes(w.region[c]);
    if (locked) ctx.fillStyle = '#2a1e3a';
    else if (!run.explored[c]) continue;
    else ctx.fillStyle = REGIONS[w.region[c]].water;
    ctx.fillRect(x + cx * cw, y + cy * cw, cw + 0.5, cw + 0.5);
  }
  ctx.fillStyle = '#b8a77a';
  for (const is of w.islands) {
    if (!run.explored[Math.floor(is.y / CELL) * GW + Math.floor(is.x / CELL)]) continue;
    ctx.beginPath();
    ctx.arc(x + is.x * k, y + is.y * k, Math.max(1.5, is.r * k), 0, Math.PI * 2);
    ctx.fill();
  }
  w.spots.forEach((s, i) => {
    if (!run.explored[Math.floor(s.y / CELL) * GW + Math.floor(s.x / CELL)] || run.stock[i] <= 0) return;
    ctx.fillStyle = SPOT_COLOR[s.depth];
    ctx.fillRect(x + s.x * k - 1, y + s.y * k - 1, 2.5, 2.5);
  });
  PORTS.forEach((p) => {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x + p.dx * k - 2, y + p.dy * k - 2, 4, 4);
  });
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + run.boat.x * k, y + run.boat.y * k, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 2, y - 2, mw + 4, mh + 4);
}

/** Reel overlay at the bottom of the canvas. */
export function drawReel(ctx: CanvasRenderingContext2D, r: Reel, W: number, H: number, time: number): void {
  const pw = Math.min(360, W - 24);
  const ph = 150;
  const px = (W - pw) / 2;
  const py = H - ph - 12;
  ctx.fillStyle = 'rgba(6,16,26,0.92)';
  ctx.strokeStyle = 'rgba(0,150,199,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  if (r.wait > 0) {
    ctx.fillStyle = '#cfe8f3';
    ctx.font = '15px system-ui';
    ctx.fillText('Waiting for a bite…', W / 2, py + 40);
    const by = py + 90 + Math.sin(time * 4) * 5;
    ctx.fillStyle = '#ef476f';
    ctx.beginPath();
    ctx.arc(W / 2, by, 9, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(W / 2, by, 9, 0, Math.PI);
    ctx.fill();
    return;
  }
  // Tension bar.
  const bx = px + 16;
  const bw = pw - 32;
  const by = py + 34;
  const bh = 22;
  ctx.fillStyle = '#10222f';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = 'rgba(126,224,138,0.45)';
  ctx.fillRect(bx + bw * r.lo, by, bw * (r.hi - r.lo), bh);
  ctx.fillStyle = 'rgba(239,71,111,0.35)';
  ctx.fillRect(bx + bw * r.hi, by, bw * (1 - r.hi), bh);
  const tx = bx + bw * r.tension;
  const inZone = r.tension >= r.lo && r.tension <= r.hi;
  ctx.fillStyle = inZone ? '#7ee08a' : r.tension > r.hi ? '#ef476f' : '#ffd166';
  ctx.fillRect(tx - 3, by - 5, 6, bh + 10);
  ctx.fillStyle = '#cfe8f3';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('Tension', bx, by - 7);
  ctx.textAlign = 'right';
  ctx.fillStyle = r.pull > 0.8 ? '#ef476f' : '#8fb3c4';
  ctx.fillText(r.pull > 0.8 ? 'The fish pulls hard!' : r.pull < 0 ? 'The fish swims toward you' : 'The fish pulls', bx + bw, by - 7);
  // Progress bar.
  const gy = by + bh + 18;
  ctx.fillStyle = '#10222f';
  ctx.fillRect(bx, gy, bw, 12);
  ctx.fillStyle = '#0096c7';
  ctx.fillRect(bx, gy, bw * Math.max(0, Math.min(1, r.progress)), 12);
  // Strain bar.
  const sy = gy + 20;
  ctx.fillStyle = '#10222f';
  ctx.fillRect(bx, sy, bw, 8);
  ctx.fillStyle = r.strain > 0.6 ? '#ef476f' : '#ff9f43';
  ctx.fillRect(bx, sy, bw * Math.min(1, r.strain), 8);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8fb3c4';
  ctx.font = '11px system-ui';
  ctx.fillText('Catch', bx, gy - 3);
  ctx.fillText('Line strain', bx, sy + 20);
  ctx.textAlign = 'right';
  ctx.fillStyle = r.reeling ? '#7ee08a' : '#cfe8f3';
  ctx.font = 'bold 13px system-ui';
  ctx.fillText(r.reeling ? 'REELING' : 'Hold to reel', bx + bw, sy + 22);
  // Wobbling fish shadow.
  const fx = bx + bw * Math.max(0.05, Math.min(0.95, 1 - r.progress));
  ctx.textAlign = 'center';
  ctx.font = '20px system-ui';
  ctx.globalAlpha = 0.85;
  ctx.fillText(r.aberrant ? '👁️' : '🐟', fx + Math.sin(time * 14) * r.pull * 4, py + ph - 16);
  ctx.globalAlpha = 1;
}
