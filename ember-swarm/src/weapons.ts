import type { Game } from './game';
import type { PassiveId } from './items';
import { TAU, type Enemy } from './types';

export type WeaponId = 'bolt' | 'whip' | 'orbit' | 'aura' | 'chain' | 'firebomb';

export interface WeaponInst {
  id: WeaponId;
  level: number;
  evolved: boolean;
  timer: number;
  angle: number;
  radius: number;
  /** Last hit time per enemy id, for weapons that touch enemies continuously. */
  hitTimes: Map<number, number>;
  /** Positions computed in update, reused in draw. */
  pts: number[];
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  evolvedName: string;
  icon: string;
  color: string;
  maxLevel: number;
  evolveWith: PassiveId;
  /** desc[0] is the "new weapon" text, desc[n] the text for reaching level n + 1. */
  desc: string[];
  evolvedDesc: string;
  update(w: WeaponInst, g: Game, dt: number): void;
  drawUnder?(w: WeaponInst, g: Game, ctx: CanvasRenderingContext2D): void;
  drawOver?(w: WeaponInst, g: Game, ctx: CanvasRenderingContext2D): void;
}

/** Value for the current level from a per-level table. */
const L = (table: number[], level: number): number => table[Math.min(level, table.length) - 1];

const bolt: WeaponDef = {
  id: 'bolt',
  name: 'Ember Bolt',
  evolvedName: 'Phoenix Barrage',
  icon: '☄️',
  color: '#ffb347',
  maxLevel: 5,
  evolveWith: 'echo',
  desc: [
    'Fires a bolt at the nearest enemy.',
    'Damage +3. Fires faster.',
    '+1 bolt.',
    'Damage +4. Bolts pierce 1 more enemy.',
    '+1 bolt. Damage +5. Pierce +1.',
  ],
  evolvedDesc: 'A rapid stream of piercing phoenix fire.',
  update(w, g, dt) {
    w.timer -= dt;
    if (w.timer > 0) return;
    const s = g.stats;
    const ev = w.evolved;
    const count = (ev ? 1 : L([1, 1, 2, 2, 3], w.level)) + s.amount;
    const targets = g.nearestEnemies(count, 520);
    if (!targets.length) {
      w.timer = 0.1;
      return;
    }
    w.timer = (ev ? 0.2 : L([1.1, 1.0, 0.9, 0.8, 0.7], w.level)) * s.cooldown;
    const dmg = (ev ? 24 : L([10, 13, 13, 17, 22], w.level)) * s.might;
    const pierce = ev ? 5 : L([1, 1, 1, 2, 3], w.level);
    const speed = ev ? 620 : 430;
    const p = g.player;
    for (let i = 0; i < count; i++) {
      const t = targets[i % targets.length];
      const spread = i >= targets.length ? (Math.random() - 0.5) * 0.5 : 0;
      const a = Math.atan2(t.y - p.y, t.x - p.x) + spread;
      g.projectiles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: (ev ? 8 : 6) * Math.sqrt(s.area),
        damage: dmg,
        pierce,
        life: 1.4 * s.duration,
        color: ev ? '#ff5e3a' : this.color,
        knock: 70,
        hits: new Set(),
      });
    }
  },
};

const whip: WeaponDef = {
  id: 'whip',
  name: 'Flame Whip',
  evolvedName: 'Inferno Lash',
  icon: '🔥',
  color: '#ff7b54',
  maxLevel: 5,
  evolveWith: 'might',
  desc: [
    'Lashes horizontally in the direction you face.',
    'Also lashes behind you.',
    'Damage +4. Lashes faster.',
    'Damage +6. Longer reach.',
    'Damage +6. Lashes faster.',
  ],
  evolvedDesc: 'A huge double lash that burns the ground it strikes.',
  update(w, g, dt) {
    w.timer -= dt;
    if (w.timer > 0) return;
    const s = g.stats;
    const ev = w.evolved;
    w.timer = (ev ? 0.75 : L([1.4, 1.4, 1.25, 1.25, 1.1], w.level)) * s.cooldown;
    const dmg = (ev ? 45 : L([14, 14, 18, 24, 30], w.level)) * s.might;
    const range = (ev ? 210 : L([110, 110, 110, 135, 135], w.level)) * s.area;
    const height = (ev ? 64 : 38) * s.area * (1 + 0.2 * s.amount);
    const p = g.player;
    const dirs = ev || w.level >= 2 ? [p.faceX, -p.faceX] : [p.faceX];
    for (const d of dirs) {
      for (const e of g.grid.query(p.x + (d * range) / 2, p.y, range / 2 + height + 30)) {
        if (e.dead) continue;
        const dx = (e.x - p.x) * d;
        if (dx > -e.r && dx < range + e.r && Math.abs(e.y - p.y) < height / 2 + e.r) {
          g.damageEnemy(e, dmg, d * 160, 0);
        }
      }
      if (ev) {
        g.zones.push({
          x: p.x + (d * range) / 2,
          y: p.y,
          r: range / 3,
          life: 1.2,
          maxLife: 1.2,
          damage: 8 * s.might,
          tick: 0.3,
          timer: 0,
          color: '255,90,30',
        });
      }
      g.addEffect({ kind: 'slash', x: p.x, y: p.y, dir: d, range, height, life: 0.18, maxLife: 0.18, color: ev ? '#ff3d00' : this.color });
    }
  },
};

const orbit: WeaponDef = {
  id: 'orbit',
  name: 'Cinder Orbit',
  evolvedName: 'Solar Halo',
  icon: '🌀',
  color: '#ffd166',
  maxLevel: 5,
  evolveWith: 'reach',
  desc: [
    'An ember circles you and burns what it touches.',
    '+1 ember.',
    'Damage +3. Spins faster.',
    '+1 ember. Damage +3.',
    '+1 ember. Damage +4.',
  ],
  evolvedDesc: 'Six suns orbit you in a pulsing ring.',
  update(w, g, dt) {
    const s = g.stats;
    const ev = w.evolved;
    const count = (ev ? 6 : L([1, 2, 2, 3, 4], w.level)) + s.amount;
    const dmg = (ev ? 30 : L([8, 8, 11, 14, 18], w.level)) * s.might;
    const spin = ev ? 4 : L([2.8, 2.8, 3.4, 3.4, 3.6], w.level);
    w.radius = (ev ? 100 + Math.sin(g.time * 2) * 30 : 78) * s.area;
    const er = (ev ? 15 : 10) * Math.sqrt(s.area);
    w.angle += spin * dt;
    w.pts.length = 0;
    const p = g.player;
    for (let i = 0; i < count; i++) {
      const a = w.angle + (i * TAU) / count;
      const x = p.x + Math.cos(a) * w.radius;
      const y = p.y + Math.sin(a) * w.radius;
      w.pts.push(x, y, er);
      for (const e of g.grid.query(x, y, er + 30)) {
        if (e.dead) continue;
        if (Math.hypot(e.x - x, e.y - y) > er + e.r) continue;
        const last = w.hitTimes.get(e.id) ?? -99;
        if (g.time - last < 0.45) continue;
        w.hitTimes.set(e.id, g.time);
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        g.damageEnemy(e, dmg, (dx / d) * 90, (dy / d) * 90);
      }
    }
    if (w.hitTimes.size > 3000) w.hitTimes.clear();
  },
  drawOver(w, g, ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < w.pts.length; i += 3) {
      const x = w.pts[i];
      const y = w.pts[i + 1];
      const r = w.pts[i + 2];
      ctx.fillStyle = w.evolved ? 'rgba(255,200,60,0.25)' : 'rgba(255,150,40,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r * 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = w.evolved ? '#fff3b0' : '#ffd166';
      ctx.beginPath();
      ctx.arc(x, y, r * (0.9 + Math.sin(g.time * 20 + i) * 0.1), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const aura: WeaponDef = {
  id: 'aura',
  name: 'Heat Haze',
  evolvedName: 'Inferno Heart',
  icon: '♨️',
  color: '#ff6b35',
  maxLevel: 5,
  evolveWith: 'regen',
  desc: [
    'Scorches and slows enemies near you.',
    'Bigger radius. Damage +1.',
    'Bigger radius. Damage +2.',
    'Bigger radius. Damage +2.',
    'Bigger radius. Damage +3.',
  ],
  evolvedDesc: 'A vast aura. Each pulse heals you for the enemies it burns.',
  update(w, g, dt) {
    const s = g.stats;
    const ev = w.evolved;
    w.radius = (ev ? 135 : L([55, 62, 70, 78, 88], w.level)) * s.area;
    const p = g.player;
    const near = g.grid.query(p.x, p.y, w.radius + 30);
    for (const e of near) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < w.radius + e.r) e.slowT = 0.15;
    }
    w.timer -= dt;
    if (w.timer > 0) return;
    w.timer = 0.5;
    const dmg = (ev ? 16 : L([4, 5, 7, 9, 12], w.level)) * s.might;
    let hits = 0;
    for (const e of near) {
      if (e.dead || Math.hypot(e.x - p.x, e.y - p.y) > w.radius + e.r) continue;
      g.damageEnemy(e, dmg, 0, 0);
      hits++;
    }
    if (ev && hits) g.heal(Math.min(3, hits) * 0.5, false);
  },
  drawUnder(w, g, ctx) {
    const p = g.player;
    const pulse = 1 + Math.sin(g.time * 6) * 0.03;
    const r = w.radius * pulse;
    const grad = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
    grad.addColorStop(0, 'rgba(255,107,53,0.02)');
    grad.addColorStop(0.8, w.evolved ? 'rgba(255,60,20,0.22)' : 'rgba(255,107,53,0.14)');
    grad.addColorStop(1, 'rgba(255,107,53,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  },
};

const chain: WeaponDef = {
  id: 'chain',
  name: 'Arc Lightning',
  evolvedName: 'Storm Crown',
  icon: '⚡',
  color: '#90e0ef',
  maxLevel: 5,
  evolveWith: 'focus',
  desc: [
    'Lightning strikes an enemy and jumps to others.',
    '+1 jump. Damage +4.',
    'Strikes faster. Damage +5.',
    '+1 jump. Damage +6.',
    '+1 jump. Strikes faster. Damage +7.',
  ],
  evolvedDesc: 'Three strikes at a time, each with long chains.',
  update(w, g, dt) {
    w.timer -= dt;
    if (w.timer > 0) return;
    const s = g.stats;
    const ev = w.evolved;
    const range = Math.max(g.w, g.h) / 2 + 40;
    if (!g.randomEnemy(range)) {
      w.timer = 0.2;
      return;
    }
    w.timer = (ev ? 0.9 : L([2.2, 2.2, 1.9, 1.9, 1.6], w.level)) * s.cooldown;
    const dmg = (ev ? 45 : L([18, 22, 27, 33, 40], w.level)) * s.might;
    const jumps = (ev ? 7 : L([2, 3, 3, 4, 5], w.level)) + s.amount;
    const strikes = ev ? 3 : 1;
    const hop = 130 * s.area;
    for (let k = 0; k < strikes; k++) {
      let cur = g.randomEnemy(range);
      if (!cur) break;
      const seen = new Set<number>();
      const pts = [cur.x, cur.y - 400];
      for (let j = 0; j <= jumps && cur; j++) {
        seen.add(cur.id);
        pts.push(cur.x, cur.y);
        g.damageEnemy(cur, dmg, 0, 0);
        let best: Enemy | null = null;
        let bestD = hop;
        for (const e of g.grid.query(cur.x, cur.y, hop)) {
          if (e.dead || seen.has(e.id)) continue;
          const d = Math.hypot(e.x - cur.x, e.y - cur.y);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        cur = best;
      }
      g.addEffect({ kind: 'bolt', pts, life: 0.22, maxLife: 0.22, color: ev ? '#caf0f8' : this.color });
    }
  },
};

const firebomb: WeaponDef = {
  id: 'firebomb',
  name: 'Firebomb',
  evolvedName: 'Hellfire Rain',
  icon: '💣',
  color: '#f77f00',
  maxLevel: 5,
  evolveWith: 'persistence',
  desc: [
    'Throws a bomb that leaves burning ground.',
    'Bigger fire. Damage +2.',
    '+1 bomb.',
    'Bigger fire. Damage +2.',
    '+1 bomb. Bigger fire. Throws faster.',
  ],
  evolvedDesc: 'A storm of firebombs rains down around you.',
  update(w, g, dt) {
    w.timer -= dt;
    if (w.timer > 0) return;
    const s = g.stats;
    const ev = w.evolved;
    w.timer = (ev ? 2 : L([3, 3, 3, 3, 2.5], w.level)) * s.cooldown;
    const count = (ev ? 6 : L([1, 1, 2, 2, 3], w.level)) + s.amount;
    const r = (ev ? 80 : L([45, 52, 52, 60, 68], w.level)) * s.area;
    const dmg = (ev ? 18 : L([6, 8, 8, 10, 12], w.level)) * s.might;
    const dur = (ev ? 4 : 2.5) * s.duration;
    const p = g.player;
    for (let i = 0; i < count; i++) {
      const t = g.randomEnemy(320);
      const a = Math.random() * TAU;
      const x = t ? t.x : p.x + Math.cos(a) * 140;
      const y = t ? t.y : p.y + Math.sin(a) * 140;
      g.zones.push({ x, y, r, life: dur, maxLife: dur, damage: dmg, tick: 0.3, timer: 0, color: '255,120,20' });
      g.addEffect({ kind: 'ring', x, y, r, life: 0.3, maxLife: 0.3, color: '#ffba08' });
    }
  },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = { bolt, whip, orbit, aura, chain, firebomb };
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export function newWeapon(id: WeaponId): WeaponInst {
  return { id, level: 1, evolved: false, timer: 0.3, angle: 0, radius: 0, hitTimes: new Map(), pts: [] };
}
