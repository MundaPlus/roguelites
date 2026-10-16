/** Wave simulation: fixed-step inertia physics, rocks, enemies, bosses, collisions. No DOM. */
import { ENEMIES, HULLS, ROCK_INFO, ROCK_SIZE, bossFor, type EnemyKind, type RockKind } from './data';
import { Rng, hash } from './rng';

export const DT = 1 / 60;
export const WORLD_W = 960;
export const WORLD_H = 620;

export interface Input {
  /** -1 = left, 1 = right. Ignored when `aim` is set. */
  turn: number;
  /** 0..1 */
  thrust: number;
  fire: boolean;
  /** Target heading in radians (stick or mouse). The ship turns toward it at its turn speed. */
  aim: number | null;
  hyper: boolean;
}

export const NO_INPUT: Input = { turn: 0, thrust: 0, fire: false, aim: null, hyper: false };

export interface Stats {
  turn: number;
  accel: number;
  maxSpeed: number;
  drag: number;
  radius: number;
  fireCd: number;
  dmg: number;
  bulletSpeed: number;
  bulletLife: number;
  spread: number;
  rear: number;
  pierce: number;
  shieldCd: number;
  mineCd: number;
  tractor: number;
  creditMul: number;
  hyperCd: number;
  wingCd: number;
  nova: number;
}

const lv = (mods: Record<string, number>, id: string): number => mods[id] ?? 0;
const at = (arr: number[], l: number): number => (l > 0 ? arr[Math.min(l, arr.length) - 1] : 0);

export function statsFor(hullId: string, mods: Record<string, number>): Stats {
  const h = HULLS[hullId] ?? HULLS.arrow;
  const eng = lv(mods, 'engine');
  return {
    turn: h.turn * (1 + 0.1 * eng),
    accel: h.accel * (1 + 0.2 * eng),
    maxSpeed: h.maxSpeed * (1 + 0.1 * eng),
    drag: h.drag,
    radius: h.radius,
    fireCd: h.fireCd * Math.pow(0.85, lv(mods, 'rapid')),
    dmg: h.dmg * (1 + 0.3 * lv(mods, 'power')),
    bulletSpeed: h.bulletSpeed,
    bulletLife: hullId === 'lancer' ? 1.1 : 0.85,
    spread: lv(mods, 'spread'),
    rear: lv(mods, 'rear'),
    pierce: lv(mods, 'pierce'),
    shieldCd: at([16, 11, 7], lv(mods, 'shield')),
    mineCd: at([3.5, 2.6, 1.8], lv(mods, 'mines')),
    tractor: at([150, 230, 320], lv(mods, 'tractor')),
    creditMul: 1 + 0.15 * lv(mods, 'tractor'),
    hyperCd: at([12, 8, 5], lv(mods, 'hyper')),
    wingCd: at([0.9, 0.6, 0.4], lv(mods, 'wingman')),
    nova: at([150, 210, 280], lv(mods, 'nova')),
  };
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  r: number;
  alive: boolean;
  respawn: number;
  inv: number;
  shield: number;
  shieldT: number;
  fireT: number;
  hyperT: number;
  mineT: number;
  wingT: number;
  wingA: number;
  thrust: number;
}

export interface Rock {
  id: number;
  kind: RockKind;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  max: number;
  rot: number;
  spin: number;
  shape: number[];
  hit: number;
  dead: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  enemy: boolean;
  dmg: number;
  pierce: number;
  r: number;
  hits: number[];
  dead: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  max: number;
  t: number;
  fireT: number;
  a: number;
  /** Mines: arm timer (-1 = idle). Titan: next crack threshold. */
  arm: number;
  aux: number;
  warp: number;
  hit: number;
  dead: boolean;
}

export interface Gem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  val: number;
  life: number;
}

export interface PMine {
  x: number;
  y: number;
  life: number;
  arm: number;
}

interface Spawn {
  t: number;
  kind: EnemyKind;
  n: number;
}

interface Blast {
  x: number;
  y: number;
  r: number;
  dmg: number;
  ship: boolean;
  color: string;
}

export type Fx =
  | { k: 'boom'; x: number; y: number; r: number; color: string }
  | { k: 'hit'; x: number; y: number; color: string }
  | { k: 'shoot'; enemy: boolean }
  | { k: 'float'; x: number; y: number; text: string; color: string }
  | { k: 'gem'; x: number; y: number }
  | { k: 'lost'; x: number; y: number; cause: string }
  | { k: 'shield'; x: number; y: number }
  | { k: 'shieldUp' }
  | { k: 'hyper'; x: number; y: number; x2: number; y2: number }
  | { k: 'nova'; x: number; y: number; r: number }
  | { k: 'clink'; x: number; y: number }
  | { k: 'arm'; x: number; y: number }
  | { k: 'spawn'; kind: EnemyKind }
  | { k: 'bossDown'; x: number; y: number }
  | { k: 'clear' };

export interface Game {
  W: number;
  H: number;
  wave: number;
  hull: string;
  rng: Rng;
  st: Stats;
  ship: Ship;
  rocks: Rock[];
  bullets: Bullet[];
  enemies: Enemy[];
  gems: Gem[];
  pmines: PMine[];
  spawns: Spawn[];
  blasts: Blast[];
  time: number;
  lives: number;
  credits: number;
  score: number;
  /** Credits and score gained in this wave. */
  gained: { credits: number; score: number; kills: number };
  state: 'play' | 'clear' | 'over';
  bossId: number | null;
  fx: Fx[];
  nextId: number;
  /** Difficulty factor for the bot sims. 1 = normal. */
  diff: number;
}

export interface WaveSetup {
  seed: string;
  wave: number;
  hull: string;
  mods: Record<string, number>;
  lives: number;
  credits: number;
  score: number;
  W?: number;
  H?: number;
}

// ---------- Helpers ----------

/** Shortest delta from a to b on a wrapping axis. */
export function wd(a: number, b: number, size: number): number {
  let d = b - a;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

export function dist2(g: Game, ax: number, ay: number, bx: number, by: number): number {
  const dx = wd(ax, bx, g.W);
  const dy = wd(ay, by, g.H);
  return dx * dx + dy * dy;
}

export function angleDiff(target: number, cur: number): number {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function wrap(g: Game, o: { x: number; y: number }): void {
  if (o.x < 0) o.x += g.W;
  else if (o.x >= g.W) o.x -= g.W;
  if (o.y < 0) o.y += g.H;
  else if (o.y >= g.H) o.y -= g.H;
}

const hpScale = (wave: number): number => 1 + 0.12 * (wave - 1);

// ---------- Setup ----------

function rockShape(rng: Rng): number[] {
  const n = 10;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(0.75 + rng.next() * 0.3);
  return out;
}

function makeRock(g: Game, kind: RockKind, size: number, x: number, y: number, vx: number, vy: number): Rock {
  const sz = ROCK_SIZE[size];
  const hp = sz.hp * ROCK_INFO[kind].hp * hpScale(g.wave);
  const rock: Rock = {
    id: g.nextId++, kind, size, x, y, vx, vy, r: sz.r, hp, max: hp,
    rot: g.rng.next() * 6.28, spin: (g.rng.next() - 0.5) * 1.6, shape: rockShape(g.rng), hit: 0, dead: false,
  };
  g.rocks.push(rock);
  return rock;
}

function farPoint(g: Game, minD: number): { x: number; y: number } {
  let best = { x: 0, y: 0 };
  let bestD = -1;
  for (let i = 0; i < 12; i++) {
    const p = { x: g.rng.next() * g.W, y: g.rng.next() * g.H };
    const d = dist2(g, p.x, p.y, g.ship.x, g.ship.y);
    if (d >= minD * minD) return p;
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function rockKind(rng: Rng, wave: number): RockKind {
  return rng.weighted<RockKind>([
    ['stone', 8],
    ['metal', wave >= 2 ? Math.min(3.5, 0.3 * wave) : 0],
    ['explosive', wave >= 3 ? 1.6 : 0],
    ['crystal', wave >= 2 ? 1.1 : 0],
  ]);
}

export function newGame(s: WaveSetup): Game {
  const W = s.W ?? WORLD_W;
  const H = s.H ?? WORLD_H;
  const st = statsFor(s.hull, s.mods);
  const g: Game = {
    W, H, wave: s.wave, hull: s.hull, rng: new Rng(hash(s.seed, 'wave', s.wave)), st,
    ship: {
      x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, r: st.radius, alive: true, respawn: 0, inv: 2,
      shield: st.shieldCd > 0 ? 1 : 0, shieldT: 0, fireT: 0, hyperT: 0, mineT: st.mineCd, wingT: 0, wingA: 0, thrust: 0,
    },
    rocks: [], bullets: [], enemies: [], gems: [], pmines: [], spawns: [], blasts: [],
    time: 0, lives: s.lives, credits: s.credits, score: s.score, gained: { credits: 0, score: 0, kills: 0 },
    state: 'play', bossId: null, fx: [], nextId: 1, diff: 1,
  };
  const w = s.wave;
  const boss = bossFor(w);
  const bigs = boss ? 2 : Math.min(10, 2 + Math.ceil(w * 0.6));
  const spd = 1 + 0.06 * w;
  for (let i = 0; i < bigs; i++) {
    const p = farPoint(g, 230);
    const a = g.rng.next() * Math.PI * 2;
    const v = ROCK_SIZE[3].speed * spd * (0.7 + g.rng.next() * 0.6);
    makeRock(g, rockKind(g.rng, w), 3, p.x, p.y, Math.cos(a) * v, Math.sin(a) * v);
  }
  if (boss) {
    g.spawns.push({ t: 1.2, kind: boss, n: 1 });
    if (w >= 10) g.spawns.push({ t: 1.2, kind: 'mine', n: 3 });
  } else {
    if (w >= 2) for (let i = 0; i < 1 + Math.floor((w - 2) / 3); i++) g.spawns.push({ t: 6 + i * 9, kind: 'saucer', n: 1 });
    if (w >= 3) for (let i = 0; i < 1 + Math.floor((w - 3) / 3); i++) g.spawns.push({ t: 10 + i * 12, kind: 'drone', n: 2 + Math.floor(w / 4) });
    if (w >= 4) g.spawns.push({ t: 0.5, kind: 'mine', n: 2 + Math.floor(w / 3) });
    if (w >= 7) for (let i = 0; i < 1 + Math.floor((w - 7) / 2); i++) g.spawns.push({ t: 16 + i * 10, kind: 'hunter', n: 1 });
  }
  return g;
}

function spawnEnemy(g: Game, kind: EnemyKind, x?: number, y?: number): Enemy {
  const d = ENEMIES[kind];
  const p = x !== undefined && y !== undefined ? { x, y } : farPoint(g, d.boss ? 320 : 260);
  const hp = d.hp * (d.boss ? g.diff : hpScale(g.wave));
  const e: Enemy = {
    id: g.nextId++, kind, x: p.x, y: p.y, vx: 0, vy: 0, r: d.r, hp, max: hp, t: 0,
    fireT: 1.2 + g.rng.next(), a: g.rng.next() * 6.28, arm: -1, aux: 0, warp: d.boss ? 1.4 : 0.8, hit: 0, dead: false,
  };
  if (kind === 'saucer') {
    e.vx = (g.rng.chance(0.5) ? 1 : -1) * (70 + g.wave * 3);
    e.vy = (g.rng.next() - 0.5) * 60;
  } else if (kind === 'mine') {
    const a = g.rng.next() * 6.28;
    e.vx = Math.cos(a) * 22;
    e.vy = Math.sin(a) * 22;
  } else if (kind === 'mother') {
    e.vx = 34;
  } else if (kind === 'titan') {
    const a = g.rng.next() * 6.28;
    e.vx = Math.cos(a) * 26;
    e.vy = Math.sin(a) * 26;
    e.aux = 0.75;
    e.a = 0;
  }
  g.enemies.push(e);
  if (d.boss) g.bossId = e.id;
  return e;
}

// ---------- Combat ----------

function addGem(g: Game, x: number, y: number, val: number): void {
  if (val <= 0) return;
  const a = g.rng.next() * 6.28;
  const v = 30 + g.rng.next() * 50;
  g.gems.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, val, life: 10 });
}

function addScore(g: Game, n: number): void {
  g.score += n;
  g.gained.score += n;
}

function breakRock(g: Game, rock: Rock): void {
  if (rock.dead) return;
  rock.dead = true;
  const info = ROCK_INFO[rock.kind];
  const sz = ROCK_SIZE[rock.size];
  addScore(g, Math.round(sz.score * (rock.kind === 'stone' ? 1 : 1.5)));
  g.gained.kills++;
  if (g.rng.chance(0.4)) addGem(g, rock.x, rock.y, sz.credit * info.credit);
  g.fx.push({ k: 'boom', x: rock.x, y: rock.y, r: rock.r, color: info.color });
  if (rock.kind === 'explosive') {
    g.blasts.push({ x: rock.x, y: rock.y, r: 60 + rock.size * 18, dmg: 3, ship: true, color: info.color });
    return;
  }
  if (rock.size <= 1) return;
  const n = rock.kind === 'crystal' ? 3 : 2;
  const child = ROCK_SIZE[rock.size - 1];
  const base = g.rng.next() * 6.28;
  for (let i = 0; i < n; i++) {
    const a = base + (i * Math.PI * 2) / n + (g.rng.next() - 0.5) * 0.6;
    const v = child.speed * (1 + 0.06 * g.wave) * (0.8 + g.rng.next() * 0.5);
    makeRock(g, rock.kind, rock.size - 1, rock.x + Math.cos(a) * child.r * 0.6, rock.y + Math.sin(a) * child.r * 0.6, rock.vx * 0.4 + Math.cos(a) * v, rock.vy * 0.4 + Math.sin(a) * v);
  }
}

function damageRock(g: Game, rock: Rock, dmg: number): void {
  if (rock.dead) return;
  rock.hp -= dmg;
  rock.hit = 0.1;
  if (rock.hp <= 0.001) breakRock(g, rock);
  else if (rock.kind === 'metal') g.fx.push({ k: 'clink', x: rock.x, y: rock.y });
}

function killEnemy(g: Game, e: Enemy, reward: boolean): void {
  if (e.dead) return;
  e.dead = true;
  const d = ENEMIES[e.kind];
  g.fx.push({ k: 'boom', x: e.x, y: e.y, r: e.r * 1.4, color: d.color });
  if (!reward) return;
  addScore(g, d.score);
  g.gained.kills++;
  if (d.boss) {
    g.fx.push({ k: 'bossDown', x: e.x, y: e.y });
    for (let i = 0; i < 8; i++) addGem(g, e.x, e.y, Math.round(d.credit / 8));
  } else addGem(g, e.x, e.y, d.credit);
  g.fx.push({ k: 'float', x: e.x, y: e.y - e.r, text: `+${d.score}`, color: d.color });
}

function damageEnemy(g: Game, e: Enemy, dmg: number): void {
  if (e.dead || e.warp > 0) return;
  e.hp -= dmg;
  e.hit = 0.1;
  if (e.kind === 'titan') {
    // Crack at 75%, 50%, 25%: shed big rocks.
    while (e.aux > 0 && e.hp <= e.max * e.aux) {
      e.aux -= 0.25;
      for (let i = 0; i < 2; i++) {
        const a = g.rng.next() * 6.28;
        makeRock(g, i === 0 ? 'explosive' : 'stone', 3, e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, Math.cos(a) * 70, Math.sin(a) * 70);
      }
      g.fx.push({ k: 'boom', x: e.x, y: e.y, r: 90, color: ENEMIES.titan.color });
    }
  }
  if (e.hp <= 0.001) {
    if (e.kind === 'mine') g.blasts.push({ x: e.x, y: e.y, r: 70, dmg: 3, ship: true, color: ENEMIES.mine.color });
    killEnemy(g, e, true);
  } else g.fx.push({ k: 'hit', x: e.x, y: e.y, color: ENEMIES[e.kind].color });
}

function hurtShip(g: Game, cause: string): void {
  const s = g.ship;
  if (!s.alive || s.inv > 0) return;
  if (g.st.nova > 0) {
    g.blasts.push({ x: s.x, y: s.y, r: g.st.nova, dmg: 6, ship: false, color: '#ffd166' });
    g.fx.push({ k: 'nova', x: s.x, y: s.y, r: g.st.nova });
  }
  if (s.shield > 0) {
    s.shield = 0;
    s.shieldT = g.st.shieldCd;
    s.inv = 1.2;
    g.fx.push({ k: 'shield', x: s.x, y: s.y });
    return;
  }
  s.alive = false;
  s.respawn = 1.8;
  g.lives--;
  g.fx.push({ k: 'lost', x: s.x, y: s.y, cause });
  g.fx.push({ k: 'boom', x: s.x, y: s.y, r: 40, color: HULLS[g.hull]?.color ?? '#8ecae6' });
}

function runBlasts(g: Game): void {
  let guard = 0;
  while (g.blasts.length && guard++ < 40) {
    const b = g.blasts.shift()!;
    g.fx.push({ k: 'boom', x: b.x, y: b.y, r: b.r, color: b.color });
    for (const rock of g.rocks) {
      if (rock.dead) continue;
      const rr = b.r + rock.r * 0.5;
      if (dist2(g, b.x, b.y, rock.x, rock.y) < rr * rr) damageRock(g, rock, b.dmg);
    }
    for (const e of g.enemies) {
      if (e.dead) continue;
      const rr = b.r + e.r * 0.5;
      if (dist2(g, b.x, b.y, e.x, e.y) < rr * rr) damageEnemy(g, e, ENEMIES[e.kind].boss ? b.dmg * 2 : b.dmg);
    }
    if (b.ship) {
      const rr = b.r * 0.85 + g.ship.r;
      if (dist2(g, b.x, b.y, g.ship.x, g.ship.y) < rr * rr) hurtShip(g, 'blast');
    }
  }
}

function fireBullet(g: Game, x: number, y: number, a: number, speed: number, enemy: boolean, dmg = 1, pierce = 0, life = 2.2, carry = 0): void {
  const s = g.ship;
  g.bullets.push({
    x, y, vx: Math.cos(a) * speed + s.vx * carry, vy: Math.sin(a) * speed + s.vy * carry,
    life, enemy, dmg, pierce, r: enemy ? 4 : 3, hits: [], dead: false,
  });
}

function aimAt(g: Game, fx: number, fy: number, tx: number, ty: number): number {
  return Math.atan2(wd(fy, ty, g.H), wd(fx, tx, g.W));
}

/** Aim with lead: where the target will be when a bullet of `speed` arrives. */
export function leadAngle(g: Game, fx: number, fy: number, tx: number, ty: number, tvx: number, tvy: number, speed: number): number {
  const dx = wd(fx, tx, g.W);
  const dy = wd(fy, ty, g.H);
  const a = tvx * tvx + tvy * tvy - speed * speed;
  const b = 2 * (dx * tvx + dy * tvy);
  const c = dx * dx + dy * dy;
  let t = 0;
  const disc = b * b - 4 * a * c;
  if (Math.abs(a) > 1e-6 && disc >= 0) {
    const t1 = (-b - Math.sqrt(disc)) / (2 * a);
    const t2 = (-b + Math.sqrt(disc)) / (2 * a);
    t = Math.min(...[t1, t2].filter((v) => v > 0), 3);
    if (!isFinite(t)) t = 0;
  }
  return Math.atan2(dy + tvy * t, dx + tvx * t);
}

// ---------- Step ----------

function safeSpot(g: Game): { x: number; y: number } {
  let best = { x: g.W / 2, y: g.H / 2 };
  let bestD = -1;
  for (let i = 0; i < 24; i++) {
    const p = { x: 40 + g.rng.next() * (g.W - 80), y: 40 + g.rng.next() * (g.H - 80) };
    let near = Infinity;
    for (const r of g.rocks) near = Math.min(near, Math.sqrt(dist2(g, p.x, p.y, r.x, r.y)) - r.r);
    for (const e of g.enemies) near = Math.min(near, Math.sqrt(dist2(g, p.x, p.y, e.x, e.y)) - e.r - 40);
    for (const b of g.bullets) if (b.enemy) near = Math.min(near, Math.sqrt(dist2(g, p.x, p.y, b.x, b.y)) - 30);
    if (near > bestD) {
      bestD = near;
      best = p;
    }
  }
  return best;
}

function updateShip(g: Game, inp: Input): void {
  const s = g.ship;
  const st = g.st;
  if (!s.alive) {
    if (g.lives <= 0) return;
    s.respawn -= DT;
    if (s.respawn <= 0) {
      const p = safeSpot(g);
      Object.assign(s, { alive: true, x: p.x, y: p.y, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2.5, shield: st.shieldCd > 0 ? 1 : 0, shieldT: 0 });
    }
    return;
  }
  if (inp.aim !== null) {
    const d = angleDiff(inp.aim, s.a);
    const m = st.turn * DT;
    s.a += Math.max(-m, Math.min(m, d));
  } else s.a += Math.max(-1, Math.min(1, inp.turn)) * st.turn * DT;
  s.thrust = Math.max(0, Math.min(1, inp.thrust));
  s.vx += Math.cos(s.a) * st.accel * s.thrust * DT;
  s.vy += Math.sin(s.a) * st.accel * s.thrust * DT;
  const k = 1 - st.drag * DT;
  s.vx *= k;
  s.vy *= k;
  const sp = Math.hypot(s.vx, s.vy);
  if (sp > st.maxSpeed) {
    s.vx *= st.maxSpeed / sp;
    s.vy *= st.maxSpeed / sp;
  }
  s.x += s.vx * DT;
  s.y += s.vy * DT;
  wrap(g, s);
  s.inv = Math.max(0, s.inv - DT);
  if (st.shieldCd > 0 && s.shield === 0) {
    s.shieldT -= DT;
    if (s.shieldT <= 0) {
      s.shield = 1;
      g.fx.push({ k: 'shieldUp' });
    }
  }
  // Guns.
  s.fireT -= DT;
  if (inp.fire && s.fireT <= 0) {
    s.fireT = st.fireCd;
    const nx = s.x + Math.cos(s.a) * s.r;
    const ny = s.y + Math.sin(s.a) * s.r;
    const n = 1 + 2 * st.spread;
    const step = st.spread >= 3 ? 0.09 : 0.12;
    for (let i = 0; i < n; i++) {
      const side = i !== (n - 1) / 2;
      fireBullet(g, nx, ny, s.a + (i - (n - 1) / 2) * step, st.bulletSpeed, false, side ? st.dmg * 0.5 : st.dmg, st.pierce, side ? st.bulletLife * 0.7 : st.bulletLife, 0.5);
    }
    for (let i = 0; i < st.rear; i++) fireBullet(g, s.x - Math.cos(s.a) * s.r, s.y - Math.sin(s.a) * s.r, s.a + Math.PI + (i - (st.rear - 1) / 2) * 0.16, st.bulletSpeed, false, st.dmg, st.pierce, st.bulletLife, 0.5);
    g.fx.push({ k: 'shoot', enemy: false });
  }
  // Mines.
  if (st.mineCd > 0) {
    s.mineT -= DT;
    if (s.mineT <= 0) {
      s.mineT = st.mineCd;
      g.pmines.push({ x: s.x, y: s.y, life: 12, arm: 0.6 });
      if (g.pmines.length > 10) g.pmines.shift();
    }
  }
  // Hyperspace.
  s.hyperT = Math.max(0, s.hyperT - DT);
  if (inp.hyper && st.hyperCd > 0 && s.hyperT <= 0) {
    const p = safeSpot(g);
    g.fx.push({ k: 'hyper', x: s.x, y: s.y, x2: p.x, y2: p.y });
    s.x = p.x;
    s.y = p.y;
    s.vx *= 0.3;
    s.vy *= 0.3;
    s.inv = Math.max(s.inv, 0.8);
    s.hyperT = st.hyperCd;
  }
  // Wingman.
  if (st.wingCd > 0) {
    s.wingA += 2.4 * DT;
    s.wingT -= DT;
    if (s.wingT <= 0) {
      const wx = s.x + Math.cos(s.wingA) * 34;
      const wy = s.y + Math.sin(s.wingA) * 34;
      let best: { x: number; y: number; vx: number; vy: number } | null = null;
      let bd = 420 * 420;
      for (const e of g.enemies) {
        if (e.dead || e.warp > 0) continue;
        const d = dist2(g, wx, wy, e.x, e.y) * 0.5;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      for (const r of g.rocks) {
        const d = dist2(g, wx, wy, r.x, r.y);
        if (d < bd) {
          bd = d;
          best = r;
        }
      }
      if (best) {
        s.wingT = st.wingCd;
        fireBullet(g, wx, wy, leadAngle(g, wx, wy, best.x, best.y, best.vx, best.vy, 520), 520, false, Math.max(1, st.dmg * 0.8), 0, 0.9);
      }
    }
  }
}

function updateEnemy(g: Game, e: Enemy): void {
  const s = g.ship;
  e.t += DT;
  e.hit = Math.max(0, e.hit - DT);
  if (e.warp > 0) {
    e.warp -= DT;
    return;
  }
  const dx = wd(e.x, s.x, g.W);
  const dy = wd(e.y, s.y, g.H);
  const d = Math.hypot(dx, dy) || 1;
  const toShip = Math.atan2(dy, dx);
  const canShoot = s.alive;
  e.fireT -= DT;
  switch (e.kind) {
    case 'saucer': {
      if (e.t % 1.6 < DT) e.vy = (g.rng.next() - 0.5) * 120;
      if (e.fireT <= 0 && canShoot) {
        e.fireT = Math.max(1.1, 2.2 - g.wave * 0.06);
        fireBullet(g, e.x, e.y, toShip + (g.rng.next() - 0.5) * 0.9, 220, true);
        g.fx.push({ k: 'shoot', enemy: true });
      }
      break;
    }
    case 'hunter': {
      const want = d > 200 ? toShip : toShip + Math.PI / 2;
      e.vx += Math.cos(want) * 170 * DT;
      e.vy += Math.sin(want) * 170 * DT;
      const max = 140 + g.wave * 3;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > max) {
        e.vx *= max / sp;
        e.vy *= max / sp;
      }
      if (e.fireT <= 0 && canShoot && d < 520) {
        e.fireT = Math.max(1.0, 1.7 - g.wave * 0.03);
        fireBullet(g, e.x, e.y, leadAngle(g, e.x, e.y, s.x, s.y, s.vx, s.vy, 260) + (g.rng.next() - 0.5) * 0.25, 260, true);
        g.fx.push({ k: 'shoot', enemy: true });
      }
      break;
    }
    case 'mine': {
      if (e.arm < 0 && s.alive && d < 95) {
        e.arm = 0.8;
        g.fx.push({ k: 'arm', x: e.x, y: e.y });
      }
      if (e.arm >= 0) {
        e.arm -= DT;
        if (e.arm < 0) {
          g.blasts.push({ x: e.x, y: e.y, r: 75, dmg: 3, ship: true, color: ENEMIES.mine.color });
          killEnemy(g, e, false);
        }
      }
      break;
    }
    case 'drone': {
      const want = s.alive ? toShip : e.a;
      e.a = want;
      e.vx += Math.cos(want) * 230 * DT;
      e.vy += Math.sin(want) * 230 * DT;
      const max = 150 + g.wave * 4;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > max) {
        e.vx *= max / sp;
        e.vy *= max / sp;
      }
      break;
    }
    case 'mother': {
      e.vy = Math.sin(e.t * 0.7) * 40;
      const angry = e.hp < e.max * 0.5;
      if (e.fireT <= 0 && canShoot) {
        e.fireT = angry ? 2.1 : 2.8;
        const n = angry ? 12 : 10;
        e.a += 0.3;
        for (let i = 0; i < n; i++) fireBullet(g, e.x, e.y, e.a + (i * Math.PI * 2) / n, 160, true, 1, 0, 3.5);
        g.fx.push({ k: 'shoot', enemy: true });
      }
      if (e.t - e.arm >= 5.5) {
        e.arm = e.t;
        const drones = g.enemies.filter((x) => x.kind === 'drone' && !x.dead).length;
        if (drones < 7) for (let i = 0; i < 2; i++) spawnEnemy(g, 'drone', e.x + (i ? 30 : -30), e.y + 30).warp = 0.3;
      }
      break;
    }
    case 'titan': {
      e.a += 0.4 * DT;
      if (e.fireT <= 0 && canShoot) {
        e.fireT = e.hp < e.max * 0.5 ? 2.4 : 3.2;
        for (let i = -1; i <= 1; i += 2) {
          const a = toShip + i * 0.25;
          makeRock(g, 'stone', 1, e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, Math.cos(a) * 170, Math.sin(a) * 170);
        }
        g.fx.push({ k: 'shoot', enemy: true });
      }
      break;
    }
    case 'warden': {
      const ph = e.hp > e.max * 0.66 ? 0 : e.hp > e.max * 0.33 ? 1 : 2;
      const want = d > 260 ? toShip : toShip + Math.PI / 2;
      e.vx += Math.cos(want) * 150 * DT;
      e.vy += Math.sin(want) * 150 * DT;
      const max = 110 + ph * 20;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > max) {
        e.vx *= max / sp;
        e.vy *= max / sp;
      }
      e.a = toShip;
      if (e.fireT <= 0 && canShoot) {
        e.fireT = ph === 2 ? 2.6 : 1.9;
        for (let i = -1; i <= 1; i++) fireBullet(g, e.x, e.y, toShip + i * 0.28, 220, true, 1, 0, 2.6);
        g.fx.push({ k: 'shoot', enemy: true });
      }
      if (ph >= 1 && e.t - e.arm >= 6.5) {
        e.arm = e.t;
        for (let i = 0; i < 3; i++) spawnEnemy(g, 'drone', e.x, e.y).warp = 0.3;
      }
      if (ph === 2) {
        e.aux += DT;
        if (e.aux >= 0.22) {
          e.aux = 0;
          fireBullet(g, e.x, e.y, e.t * 1.9, 140, true, 1, 0, 3);
          fireBullet(g, e.x, e.y, e.t * 1.9 + Math.PI, 140, true, 1, 0, 3);
        }
      }
      break;
    }
  }
  if (e.kind === 'saucer' || e.kind === 'mine' || e.kind === 'mother' || e.kind === 'titan' || e.kind === 'drone' || e.kind === 'hunter' || e.kind === 'warden') {
    e.x += e.vx * DT;
    e.y += e.vy * DT;
    wrap(g, e);
  }
}

/** Advance the wave by one fixed step of `DT` seconds. */
export function step(g: Game, inp: Input): void {
  if (g.state !== 'play') return;
  g.time += DT;
  updateShip(g, inp);
  const s = g.ship;

  // Scheduled spawns. Only while rocks or a boss remain.
  const bossAlive = g.bossId !== null && g.enemies.some((e) => e.id === g.bossId && !e.dead);
  if (g.rocks.length === 0 && !bossAlive && g.spawns.every((sp) => !ENEMIES[sp.kind].boss)) g.spawns.length = 0;
  for (let i = g.spawns.length - 1; i >= 0; i--) {
    const sp = g.spawns[i];
    if (g.time < sp.t) continue;
    g.spawns.splice(i, 1);
    const p = farPoint(g, 280);
    for (let k = 0; k < sp.n; k++) spawnEnemy(g, sp.kind, sp.kind === 'drone' ? p.x + k * 24 : undefined, sp.kind === 'drone' ? p.y + (k % 2) * 20 : undefined);
    g.fx.push({ k: 'spawn', kind: sp.kind });
  }

  for (const r of g.rocks) {
    r.x += r.vx * DT;
    r.y += r.vy * DT;
    r.rot += r.spin * DT;
    r.hit = Math.max(0, r.hit - DT);
    wrap(g, r);
  }
  for (let i = 0; i < g.enemies.length; i++) updateEnemy(g, g.enemies[i]);
  for (const b of g.bullets) {
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    if (b.life <= 0) b.dead = true;
    wrap(g, b);
  }

  // Bullets vs things.
  for (const b of g.bullets) {
    if (b.dead) continue;
    if (b.enemy) {
      if (s.alive && s.inv <= 0) {
        const rr = b.r + s.r * 0.8;
        if (dist2(g, b.x, b.y, s.x, s.y) < rr * rr) {
          b.dead = true;
          hurtShip(g, 'bullet');
        }
      }
      continue;
    }
    const nRocks = g.rocks.length;
    for (let i = 0; i < nRocks && !b.dead; i++) {
      const r = g.rocks[i];
      if (r.dead || b.hits.includes(r.id)) continue;
      const rr = b.r + r.r * 0.92;
      if (dist2(g, b.x, b.y, r.x, r.y) < rr * rr) {
        damageRock(g, r, b.dmg);
        g.fx.push({ k: 'hit', x: b.x, y: b.y, color: ROCK_INFO[r.kind].color });
        if (b.pierce > 0) {
          b.pierce--;
          b.hits.push(r.id);
        } else b.dead = true;
      }
    }
    for (let i = 0; i < g.enemies.length && !b.dead; i++) {
      const e = g.enemies[i];
      if (e.dead || e.warp > 0 || b.hits.includes(e.id)) continue;
      const rr = b.r + e.r;
      if (dist2(g, b.x, b.y, e.x, e.y) < rr * rr) {
        damageEnemy(g, e, b.dmg);
        if (b.pierce > 0 && !ENEMIES[e.kind].boss) {
          b.pierce--;
          b.hits.push(e.id);
        } else b.dead = true;
      }
    }
  }

  // Ship vs rocks and enemies.
  if (s.alive && s.inv <= 0) {
    for (const r of g.rocks) {
      if (r.dead) continue;
      const rr = s.r * 0.85 + r.r * 0.85;
      if (dist2(g, s.x, s.y, r.x, r.y) < rr * rr) {
        hurtShip(g, 'rock');
        damageRock(g, r, 2);
        break;
      }
    }
  }
  if (s.alive && s.inv <= 0) {
    for (const e of g.enemies) {
      if (e.dead || e.warp > 0) continue;
      const rr = s.r * 0.85 + e.r * 0.9;
      if (dist2(g, s.x, s.y, e.x, e.y) < rr * rr) {
        hurtShip(g, e.kind);
        if (e.kind === 'mine') {
          g.blasts.push({ x: e.x, y: e.y, r: 75, dmg: 3, ship: false, color: ENEMIES.mine.color });
          killEnemy(g, e, false);
        } else if (!ENEMIES[e.kind].boss) damageEnemy(g, e, 3);
        break;
      }
    }
  }

  // Player mines.
  for (const m of g.pmines) {
    m.life -= DT;
    m.arm -= DT;
    if (m.arm > 0 || m.life <= 0) continue;
    let boom = false;
    for (const r of g.rocks) if (!r.dead && dist2(g, m.x, m.y, r.x, r.y) < (r.r + 10) ** 2) boom = true;
    for (const e of g.enemies) if (!e.dead && e.warp <= 0 && dist2(g, m.x, m.y, e.x, e.y) < (e.r + 12) ** 2) boom = true;
    if (boom) {
      m.life = 0;
      g.blasts.push({ x: m.x, y: m.y, r: 60, dmg: 3, ship: false, color: '#90f1a4' });
    }
  }
  g.pmines = g.pmines.filter((m) => m.life > 0);

  runBlasts(g);

  // Credits.
  for (const gm of g.gems) {
    gm.life -= DT;
    gm.vx *= 1 - 1.5 * DT;
    gm.vy *= 1 - 1.5 * DT;
    if (s.alive) {
      const dx = wd(gm.x, s.x, g.W);
      const dy = wd(gm.y, s.y, g.H);
      const d = Math.hypot(dx, dy) || 1;
      if (g.st.tractor > 0 && d < g.st.tractor) {
        gm.vx += (dx / d) * 900 * DT;
        gm.vy += (dy / d) * 900 * DT;
      }
      if (d < s.r + 16) {
        gm.life = 0;
        const v = Math.round(gm.val * g.st.creditMul);
        g.credits += v;
        g.gained.credits += v;
        g.fx.push({ k: 'gem', x: gm.x, y: gm.y });
        g.fx.push({ k: 'float', x: gm.x, y: gm.y - 10, text: `+${v}¢`, color: '#ffd166' });
      }
    }
    gm.x += gm.vx * DT;
    gm.y += gm.vy * DT;
    wrap(g, gm);
  }
  g.gems = g.gems.filter((gm) => gm.life > 0);

  g.rocks = g.rocks.filter((r) => !r.dead);
  g.enemies = g.enemies.filter((e) => !e.dead);
  g.bullets = g.bullets.filter((b) => !b.dead);

  // Boss down: the rest of the field breaks up.
  if (g.bossId !== null && !g.enemies.some((e) => e.id === g.bossId)) {
    g.bossId = null;
    for (const e of g.enemies) killEnemy(g, e, false);
    for (const r of g.rocks) g.fx.push({ k: 'boom', x: r.x, y: r.y, r: r.r, color: ROCK_INFO[r.kind].color });
    g.enemies = [];
    g.rocks = [];
    g.spawns = [];
    g.bullets = g.bullets.filter((b) => !b.enemy);
  }

  if (g.lives <= 0 && !s.alive) {
    g.state = 'over';
    return;
  }
  if (g.rocks.length === 0 && g.enemies.length === 0 && g.spawns.length === 0 && s.alive) {
    // Collect the credits that are still floating.
    let left = 0;
    for (const gm of g.gems) left += Math.round(gm.val * g.st.creditMul);
    g.gems = [];
    const bonus = 10 + 2 * g.wave + left;
    g.credits += bonus;
    g.gained.credits += bonus;
    addScore(g, 100 * g.wave);
    g.state = 'clear';
    g.fx.push({ k: 'clear' });
  }
}

/** Ship alive and not in a warp: the bot and the HUD use this. */
export const shipReady = (g: Game): boolean => g.ship.alive;
export { aimAt };
