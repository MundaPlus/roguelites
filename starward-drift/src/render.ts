/** Canvas renderer for the two ships, projectiles and effects, plus hit tests for clicks. */
import { RACES, SYSTEMS, WEAPONS } from './data';
import type { CEvent, Combat, Side } from './combat';
import { capacity, evasion, layoutOf, maxLayers, sysPower, type Ship } from './ship';

export interface Float {
  side: Side;
  room: number;
  text: string;
  color: string;
  t: number;
}

interface Ring {
  side: Side;
  x: number;
  y: number;
  t: number;
  max: number;
  color: string;
}

interface BeamFx {
  side: Side;
  rooms: number[];
  t: number;
}

interface Frame {
  ox: number;
  oy: number;
  ts: number;
  flip: boolean;
}

export interface View {
  selCrew: Set<number>;
  selWeapon: number | null;
  hover: { x: number; y: number } | null;
}

const ACCENT = '#48cae4';

export class Renderer {
  floats: Float[] = [];
  rings: Ring[] = [];
  beams: BeamFx[] = [];
  shake = 0;
  flash = 0;
  frames: Record<Side, Frame> = { player: { ox: 0, oy: 0, ts: 30, flip: false }, enemy: { ox: 0, oy: 0, ts: 30, flip: true } };
  w = 0;
  h = 0;
  stacked = false;
  private time = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Size the frames for both ships. */
  layout(c: Combat, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stacked = w < 640;
    const lp = layoutOf(c.player.layout);
    const le = layoutOf(c.enemy.layout);
    const pad = 1.6;
    if (this.stacked) {
      const top = 26;
      const areaH = (h - top - 30) / 2;
      const tsP = Math.min((w - 12) / (lp.w + pad), areaH / (lp.h + pad + 0.6), 46);
      const tsE = Math.min((w - 12) / (le.w + pad), areaH / (le.h + pad + 0.6), 46);
      this.frames.player = { ts: tsP, flip: false, ox: (w - lp.w * tsP) / 2, oy: top + (areaH - lp.h * tsP) / 2 + 6 };
      this.frames.enemy = { ts: tsE, flip: true, ox: (w - le.w * tsE) / 2, oy: top + areaH + 24 + (areaH - le.h * tsE) / 2 };
    } else {
      const areaW = w / 2;
      const top = 34;
      const areaH = h - top - 10;
      const tsP = Math.min((areaW - 20) / (lp.w + pad), areaH / (lp.h + pad), 50);
      const tsE = Math.min((areaW - 20) / (le.w + pad), areaH / (le.h + pad), 50);
      this.frames.player = { ts: tsP, flip: false, ox: (areaW - lp.w * tsP) / 2, oy: top + (areaH - lp.h * tsP) / 2 };
      this.frames.enemy = { ts: tsE, flip: true, ox: areaW + (areaW - le.w * tsE) / 2, oy: top + (areaH - le.h * tsE) / 2 };
    }
  }

  private roomRect(ship: Ship, side: Side, i: number): [number, number, number, number] {
    const f = this.frames[side];
    const lay = layoutOf(ship.layout);
    const r = lay.def.rooms[i];
    const x = f.flip ? lay.w - r.x - r.w : r.x;
    return [f.ox + x * f.ts, f.oy + r.y * f.ts, r.w * f.ts, r.h * f.ts];
  }

  tileXY(ship: Ship, side: Side, tx: number, ty: number): [number, number] {
    const f = this.frames[side];
    const lay = layoutOf(ship.layout);
    const x = f.flip ? lay.w - 1 - tx : tx;
    return [f.ox + (x + 0.5) * f.ts, f.oy + (ty + 0.5) * f.ts];
  }

  roomCenter(ship: Ship, side: Side, i: number): [number, number] {
    const [x, y, w, h] = this.roomRect(ship, side, i);
    return [x + w / 2, y + h / 2];
  }

  roomAt(ship: Ship, side: Side, px: number, py: number): number {
    const lay = layoutOf(ship.layout);
    for (let i = 0; i < lay.def.rooms.length; i++) {
      const [x, y, w, h] = this.roomRect(ship, side, i);
      if (px >= x && px < x + w && py >= y && py < y + h) return i;
    }
    return -1;
  }

  crewAt(ship: Ship, side: Side, px: number, py: number): number | null {
    const f = this.frames[side];
    let best: number | null = null;
    let bd = f.ts * 0.45;
    for (const c of ship.crew) {
      const [x, y] = this.tileXY(ship, side, c.x, c.y);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  }

  /** Turn sim events into effects. */
  absorb(c: Combat, ev: CEvent[]): void {
    for (const e of ev) {
      const ship = e.side === 'player' ? c.player : c.enemy;
      const room = e.room ?? -1;
      const at = (text: string, color: string): void => {
        if (room >= 0) this.floats.push({ side: e.side, room, text, color, t: 0 });
      };
      if (e.k === 'hit') {
        at(e.n ? `-${e.n}` : 'hit', e.n ? '#ff6b6b' : '#ffd166');
        if (room >= 0) {
          const [x, y] = this.roomCenter(ship, e.side, room);
          this.rings.push({ side: e.side, x, y, t: 0, max: this.frames[e.side].ts * (0.8 + (e.n ?? 0) * 0.3), color: '#ff9f43' });
        }
        if (e.side === 'player' && e.n) {
          this.shake = Math.min(14, this.shake + 4 + e.n * 2);
          this.flash = 0.25;
        }
      } else if (e.k === 'miss') at('MISS', '#b8c0cc');
      else if (e.k === 'block') {
        at('BLOCK', ACCENT);
        if (room >= 0) {
          const [x, y] = this.roomCenter(ship, e.side, room);
          this.rings.push({ side: e.side, x, y, t: 0, max: this.frames[e.side].ts * 1.2, color: ACCENT });
        }
      } else if (e.k === 'ion') at('ION', '#7b9cff');
      else if (e.k === 'death') at('💀', '#fff');
      else if (e.k === 'fixed') at('✔', '#7ee08a');
      else if (e.k === 'firestart') at('🔥', '#ff9f43');
      else if (e.k === 'beam' && e.rooms) this.beams.push({ side: e.side, rooms: e.rooms, t: 0 });
      else if (e.k === 'boom') {
        const f = this.frames[e.side];
        const lay = layoutOf(ship.layout);
        for (let k = 0; k < 6; k++)
          this.rings.push({ side: e.side, x: f.ox + Math.random() * lay.w * f.ts, y: f.oy + Math.random() * lay.h * f.ts, t: -k * 0.12, max: f.ts * 2.2, color: k % 2 ? '#ffd166' : '#ef476f' });
        this.shake = 16;
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.floats.forEach((f) => (f.t += dt));
    this.floats = this.floats.filter((f) => f.t < 1.2);
    this.rings.forEach((r) => (r.t += dt));
    this.rings = this.rings.filter((r) => r.t < 0.6);
    this.beams.forEach((b) => (b.t += dt));
    this.beams = this.beams.filter((b) => b.t < 0.5);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt);
  }

  draw(c: Combat, view: View): void {
    const g = this.ctx;
    g.save();
    g.clearRect(0, 0, this.w, this.h);
    // Stars.
    g.fillStyle = '#05080f';
    g.fillRect(0, 0, this.w, this.h);
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97.3 + this.time * (4 + (i % 3) * 3)) % (this.w + 10)) - 5;
      const y = (i * 53.7) % this.h;
      g.fillStyle = `rgba(255,255,255,${0.15 + (i % 4) * 0.12})`;
      g.fillRect(this.w - x, y, 1.5, 1.5);
    }
    if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.drawShip(c, c.player, 'player', view);
    this.drawShip(c, c.enemy, 'enemy', view);
    this.drawShots(c);
    for (const b of this.beams) {
      const ship = b.side === 'player' ? c.player : c.enemy;
      g.strokeStyle = `rgba(255,80,80,${1 - b.t * 2})`;
      g.lineWidth = 5;
      g.beginPath();
      b.rooms.forEach((r, i) => {
        const [x, y] = this.roomCenter(ship, b.side, r);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      if (b.rooms.length === 1) {
        const [x, y] = this.roomCenter(ship, b.side, b.rooms[0]);
        g.moveTo(x - 20, y - 10);
        g.lineTo(x + 20, y + 10);
      }
      g.stroke();
    }
    for (const r of this.rings) {
      if (r.t < 0) continue;
      const k = r.t / 0.6;
      g.strokeStyle = r.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(r.x, r.y, r.max * (0.3 + k), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    for (const f of this.floats) {
      const ship = f.side === 'player' ? c.player : c.enemy;
      if (f.room >= layoutOf(ship.layout).def.rooms.length) continue;
      const [x, y] = this.roomCenter(ship, f.side, f.room);
      g.globalAlpha = Math.max(0, 1 - f.t / 1.2);
      g.font = 'bold 15px system-ui, sans-serif';
      g.fillStyle = '#000';
      g.fillText(f.text, x + 1, y - f.t * 30 + 1);
      g.fillStyle = f.color;
      g.fillText(f.text, x, y - f.t * 30);
      g.globalAlpha = 1;
    }
    g.restore();
    if (this.flash > 0) {
      g.fillStyle = `rgba(239,71,111,${this.flash * 0.5})`;
      g.fillRect(0, 0, this.w, this.h);
    }
    // Labels.
    g.textAlign = 'left';
    g.font = 'bold 13px system-ui, sans-serif';
    const pf = this.frames.player;
    const ef = this.frames.enemy;
    this.label(`YOU · hull ${Math.max(0, c.player.hull)}/${c.player.maxHull} · evade ${evasion(c.player)}%`, pf.ox, pf.oy - 14 - (this.stacked ? 0 : 4), '#9be7f5');
    this.label(`${c.enemy.name.toUpperCase()} · hull ${Math.max(0, c.enemy.hull)}/${c.enemy.maxHull} · evade ${evasion(c.enemy)}%`, ef.ox, ef.oy - 14 - (this.stacked ? 0 : 4), '#ff8fa3');
    if (c.boss) this.label(`Phase ${c.boss}/2`, ef.ox, ef.oy - 30, '#ffd166');
    if (c.paused && !c.result) {
      g.textAlign = 'center';
      g.font = 'bold 16px system-ui, sans-serif';
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(this.w / 2 - 120, 2, 240, 22);
      g.fillStyle = '#ffd166';
      g.fillText('⏸ PAUSED · Space to resume', this.w / 2, 18);
    }
    if (view.selWeapon !== null && !c.result) {
      g.textAlign = 'center';
      g.font = 'bold 13px system-ui, sans-serif';
      g.fillStyle = '#ffd166';
      const w = c.player.weapons[view.selWeapon];
      if (w) g.fillText(`🎯 Pick a target room for ${WEAPONS[w.id].name}`, this.w / 2, this.stacked ? this.frames.enemy.oy - 34 : this.h - 6);
    }
  }

  private label(text: string, x: number, y: number, color: string): void {
    const g = this.ctx;
    g.fillStyle = color;
    g.fillText(text, Math.max(4, x), y);
  }

  private drawShip(c: Combat, ship: Ship, side: Side, view: View): void {
    const g = this.ctx;
    const f = this.frames[side];
    const lay = layoutOf(ship.layout);
    const ts = f.ts;
    const dead = side === 'enemy' ? c.enemy.hull <= 0 : c.player.hull <= 0;
    // Hull.
    g.save();
    if (dead) g.globalAlpha = 0.35;
    const hx = f.ox - ts * 0.45;
    const hy = f.oy - ts * 0.4;
    const hw = lay.w * ts + ts * 0.9;
    const hh = lay.h * ts + ts * 0.8;
    g.fillStyle = side === 'player' ? '#1b3a4b' : '#4a1f2b';
    g.strokeStyle = side === 'player' ? '#3fa7c4' : '#c45a6e';
    g.lineWidth = 2;
    roundRect(g, hx, hy, hw, hh, ts * 0.6);
    g.fill();
    g.stroke();
    // Nose.
    g.beginPath();
    const noseX = f.flip ? hx : hx + hw;
    const dir = f.flip ? -1 : 1;
    g.moveTo(noseX, hy + hh * 0.25);
    g.lineTo(noseX + dir * ts * 0.7, hy + hh / 2);
    g.lineTo(noseX, hy + hh * 0.75);
    g.fill();
    g.stroke();
    // Shields.
    const layers = ship.shields;
    const ml = maxLayers(ship);
    if (ml > 0 || layers > 0) {
      const cx = hx + hw / 2 + dir * ts * 0.35;
      const cy = hy + hh / 2;
      for (let k = 0; k < Math.max(layers, 0); k++) {
        g.strokeStyle = `rgba(72,202,228,${0.55 - k * 0.1})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(cx, cy, hw / 2 + ts * (0.6 + k * 0.22), hh / 2 + ts * (0.3 + k * 0.22), 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(72,202,228,0.05)';
      if (layers > 0) {
        g.beginPath();
        g.ellipse(cx, cy, hw / 2 + ts * 0.6, hh / 2 + ts * 0.3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Rooms.
    lay.def.rooms.forEach((rd, i) => {
      const [x, y, w, h] = this.roomRect(ship, side, i);
      const room = ship.rooms[i];
      const low = Math.max(0, Math.min(1, (60 - room.o2) / 60));
      g.fillStyle = mix([42, 52, 66], [140, 40, 55], low);
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#0b1220';
      g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      // Fire and breaches on tiles.
      const tiles = lay.roomTiles[i];
      const fires = Math.ceil(room.fire - 0.05);
      tiles.forEach((t, k) => {
        const [tx, ty] = this.tileXY(ship, side, t % lay.w, Math.floor(t / lay.w));
        if (k < fires) {
          const fl = 0.5 + 0.5 * Math.sin(this.time * 12 + k * 2 + i);
          g.fillStyle = `rgba(255,${120 + fl * 60},40,${0.55 + fl * 0.25})`;
          g.fillRect(tx - ts / 2 + 3, ty - ts / 2 + 3, ts - 6, ts - 6);
        }
        if (k < room.breach) {
          g.fillStyle = '#000';
          g.beginPath();
          g.arc(tx + ts * 0.2, ty + ts * 0.2, ts * 0.16, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#9ad1ff';
          g.lineWidth = 1;
          g.stroke();
        }
      });
      // System icon and bars.
      if (rd.sys) {
        const s = ship.systems[rd.sys];
        if (s) {
          g.font = `${Math.round(ts * 0.42)}px system-ui, sans-serif`;
          g.textAlign = 'center';
          g.globalAlpha = 0.85;
          g.fillText(SYSTEMS[rd.sys].icon, x + w / 2, y + h / 2 + ts * 0.15);
          g.globalAlpha = dead ? 0.35 : 1;
          const pw = rd.sys === 'pilot' ? capacity(s) : sysPower(ship, rd.sys);
          const bw = Math.min(6, (w - 6) / s.level - 1);
          for (let k = 0; k < s.level; k++) {
            const broken = k >= s.level - s.dmg;
            const ion = k < pw && k >= pw - s.ion;
            g.fillStyle = broken ? '#ef476f' : ion ? '#7b9cff' : k < pw ? '#7ee08a' : 'rgba(255,255,255,0.2)';
            g.fillRect(x + 3 + k * (bw + 1), y + h - 7, bw, 4);
          }
          if (s.dmg > 0 && s.repair > 0) {
            g.fillStyle = '#ffd166';
            g.fillRect(x + 3, y + h - 11, (w - 6) * s.repair, 2);
          }
        }
      }
      if (room.breach > 0 && room.breachProg > 0) {
        g.fillStyle = '#9ad1ff';
        g.fillRect(x + 3, y + 3, (w - 6) * room.breachProg, 2);
      }
    });
    // Doors.
    g.fillStyle = '#c9a227';
    for (const d of lay.doors) {
      const [ax, ay] = this.tileXY(ship, side, d.ta % lay.w, Math.floor(d.ta / lay.w));
      const [bx, by] = this.tileXY(ship, side, d.tb % lay.w, Math.floor(d.tb / lay.w));
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      if (Math.abs(ax - bx) > 1) g.fillRect(mx - 2, my - ts * 0.2, 4, ts * 0.4);
      else g.fillRect(mx - ts * 0.2, my - 2, ts * 0.4, 4);
    }
    // Hover and targets.
    if (side === 'enemy' && view.hover && !dead) {
      const r = this.roomAt(ship, side, view.hover.x, view.hover.y);
      if (r >= 0) {
        const [x, y, w, h] = this.roomRect(ship, side, r);
        g.strokeStyle = view.selWeapon !== null ? '#ffd166' : 'rgba(255,209,102,0.5)';
        g.lineWidth = 2;
        g.strokeRect(x + 2, y + 2, w - 4, h - 4);
      }
    }
    if (side === 'enemy' && !dead) {
      c.player.weapons.forEach((w, i) => {
        if (w.target === null || w.target >= lay.def.rooms.length) return;
        const [cx, cy] = this.roomCenter(ship, side, w.target);
        const off = (i - 1.5) * ts * 0.22;
        const r = ts * 0.2;
        g.strokeStyle = w.charge >= 1 ? '#ffd166' : '#ff6b6b';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx + off, cy - ts * 0.25, r, 0, Math.PI * 2);
        g.moveTo(cx + off - r * 1.4, cy - ts * 0.25);
        g.lineTo(cx + off + r * 1.4, cy - ts * 0.25);
        g.stroke();
        g.font = `bold ${Math.round(ts * 0.26)}px system-ui, sans-serif`;
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(String(i + 1), cx + off, cy - ts * 0.25 - r - 2);
      });
    }
    // Crew.
    for (const cr of ship.crew) {
      const [x, y] = this.tileXY(ship, side, cr.x, cr.y);
      const rad = ts * 0.24;
      g.fillStyle = RACES[cr.race].color;
      g.beginPath();
      g.arc(x, y + ts * 0.08, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = side === 'player' ? (view.selCrew.has(cr.id) ? '#fff' : '#0b1220') : '#ef476f';
      g.lineWidth = view.selCrew.has(cr.id) && side === 'player' ? 3 : 1.5;
      g.stroke();
      const k = Math.max(0, cr.hp / cr.max);
      g.fillStyle = '#000';
      g.fillRect(x - rad, y - rad - 2, rad * 2, 3);
      g.fillStyle = k > 0.5 ? '#7ee08a' : k > 0.25 ? '#ffd166' : '#ef476f';
      g.fillRect(x - rad, y - rad - 2, rad * 2 * k, 3);
    }
    g.restore();
  }

  private drawShots(c: Combat): void {
    const g = this.ctx;
    for (const s of c.shots) {
      if (s.delay > 0) continue;
      const fromShip = s.from === 'player' ? c.player : c.enemy;
      const toSide: Side = s.from === 'player' ? 'enemy' : 'player';
      const toShip = s.from === 'player' ? c.enemy : c.player;
      if (s.target >= layoutOf(toShip.layout).def.rooms.length) continue;
      const [ax, ay] = this.roomCenter(fromShip, s.from, Math.min(s.src, layoutOf(fromShip.layout).def.rooms.length - 1));
      const [bx, by] = this.roomCenter(toShip, toSide, s.target);
      const p = 1 - s.t / s.dur;
      const x = ax + (bx - ax) * p;
      const y = ay + (by - ay) * p - Math.sin(p * Math.PI) * (this.stacked ? 0 : 40) * (s.from === 'player' ? 1 : -1);
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      if (s.kind === 'laser' || s.kind === 'flak') {
        g.strokeStyle = s.kind === 'flak' ? '#d0d0d0' : s.from === 'player' ? '#7bff9c' : '#ff5c7a';
        g.lineWidth = s.kind === 'flak' ? 4 : 3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - (dx / len) * 14, y - (dy / len) * 14);
        g.stroke();
      } else if (s.kind === 'missile') {
        g.fillStyle = '#ffb703';
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255,183,3,0.4)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - (dx / len) * 22, y - (dy / len) * 22);
        g.stroke();
      } else if (s.kind === 'ion') {
        g.fillStyle = '#7b9cff';
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      } else if (s.kind === 'beam') {
        g.strokeStyle = `rgba(255,80,80,${0.3 + p * 0.5})`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(x, y);
        g.stroke();
      }
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function mix(a: number[], b: number[], k: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
}
