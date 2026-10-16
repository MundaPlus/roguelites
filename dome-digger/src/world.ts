/**
 * The whole game state of one run and its fixed-step simulation.
 * Pure data (JSON safe) plus pure functions. No DOM.
 *
 * Mine coordinates: 1 unit = 1 tile, y grows downward. Rows 0..GROUND-1 are the dome and the sky.
 * Arena coordinates (defense): the dome center is (0, 0), y grows upward.
 */
import {
  BOSS_WAVES,
  DOME_HP,
  GADGETS,
  GADGET_IDS,
  LAYERS,
  MONSTERS,
  ORE_HP,
  ORE_PIECES,
  ORE_RES,
  RES_IDS,
  WAVES,
  carryCap,
  drillPower,
  jetMax,
  jetThrust,
  laserDps,
  laserRot,
  layerAt,
  shieldMax,
  shieldRegen,
  slowPer,
  walkSpeed,
  type DomeId,
  type GadgetId,
  type Res,
  type UpId,
} from './data';
import { Rng, hash } from './rng';

export const W = 24;
export const GROUND = 3;
export const DEPTH = 72;
export const H = GROUND + DEPTH + 1;
export const DOME_L = 10;
export const DOME_R = 14;
export const HATCH = 12;
export const KW = 0.6;
export const KH = 0.7;
export const BEDROCK = -1;

export const DOME_RAD = 3;
export const GUN_Y = 2.2;
export const ARENA = 19;
export const SWORD_RANGE = 7.5;
export const SWORD_ARC = 0.5;
export const AIM_MIN = -0.6;
export const AIM_MAX = Math.PI + 0.6;

export interface Keeper {
  x: number;
  y: number;
  vx: number;
  vy: number;
  cargo: Res[];
  face: number;
  grounded: boolean;
  jet: boolean;
  /** Tile index being dug, or -1. */
  dig: number;
}

export interface Loose {
  x: number;
  y: number;
  res: Res;
}

export interface Mon {
  uid: number;
  id: string;
  x: number;
  y: number;
  hp: number;
  max: number;
  dmg: number;
  cd: number;
  flash: number;
  side: number;
  /** Fly target angle on the dome. */
  ang: number;
  /** Queen: summon timer. */
  t: number;
  touching: boolean;
}

export interface Spit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
}

export interface Fx {
  k: 'dig' | 'break' | 'ore' | 'deposit' | 'gadget' | 'alarm' | 'hit' | 'kill' | 'dome' | 'shield' | 'strike' | 'blast' | 'lift' | 'drone' | 'docked';
  x: number;
  y: number;
  text?: string;
  color?: string;
}

export interface Input {
  x: number;
  y: number;
  /** Rotate the weapon: -1 counter-clockwise (left), 1 clockwise (right). */
  rot: number;
  /** Target angle for the weapon, or null. */
  aim: number | null;
  fire: boolean;
}

export const NO_INPUT: Input = { x: 0, y: 0, rot: 0, aim: null, fire: false };

export type Phase = 'mine' | 'wave' | 'cleared' | 'won' | 'lost';

export interface World {
  v: 1;
  seed: string;
  dome: DomeId;
  /** Current or next wave, 1-based. */
  wave: number;
  phase: Phase;
  timer: number;
  /** Total time of this mining cycle, for the timer bar. */
  timerMax: number;
  time: number;
  hp: number[];
  max: number[];
  ore: number[];
  gadgetAt: Record<number, GadgetId>;
  loose: Loose[];
  k: Keeper;
  res: Record<Res, number>;
  lv: Record<UpId, number>;
  gadgets: GadgetId[];
  cool: Record<string, number>;
  domeHp: number;
  domeMax: number;
  shield: number;
  shieldT: number;
  angle: number;
  firing: boolean;
  /** Weapon hit point for drawing, arena coords. */
  beam: { x: number; y: number } | null;
  docked: boolean;
  /** Turret target uid. */
  tgt: number;
  strikeUsed: boolean;
  mons: Mon[];
  spits: Spit[];
  queue: { t: number; id: string; side: number }[];
  waveT: number;
  uid: number;
  stats: { dug: number; ore: number; kills: number; taken: number; gadgets: number };
}

export const idx = (x: number, y: number): number => y * W + x;
export const inDome = (w: World): boolean => w.k.y < GROUND;
export const depthOf = (w: World): number => Math.max(0, Math.floor(w.k.y - GROUND + 0.5));
export const cap = (w: World): number => carryCap(w.lv.carry);
export const has = (w: World, g: GadgetId): boolean => w.gadgets.includes(g);
export const mineTime = (w: World): number => 60 + Math.min(w.wave, 8) * 2.5 + (has(w, 'chrono') ? 15 : 0);
export const hpMul = (wave: number): number => 1 + 0.07 * (wave - 1);
export const dmgMul = (wave: number): number => 1 + 0.06 * (wave - 1);
export const weaponDps = (w: World): number => laserDps(w.lv.laser) * (w.dome === 'sword' ? 1.2 : w.dome === 'turret' ? 0.95 : 1);
export const weaponRot = (w: World): number => laserRot(w.lv.laser) * (w.dome === 'sword' ? 1.6 : w.dome === 'turret' ? 0.8 : 1);
export const strikeDmg = (w: World): number => 50 + 12 * w.wave;

export function solid(w: World, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= W || ty < 0 || ty >= H) return true;
  return w.hp[idx(tx, ty)] !== 0;
}

// ---------- Map generation ----------

export function newWorld(seed: string, dome: DomeId): World {
  const rng = new Rng(hash(seed, 'map'));
  const n = W * H;
  const hp = new Array<number>(n).fill(0);
  const max = new Array<number>(n).fill(0);
  const ore = new Array<number>(n).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (y < GROUND) {
        hp[i] = x >= DOME_L && x <= DOME_R ? 0 : BEDROCK;
      } else if (y === GROUND) {
        hp[i] = x === HATCH ? 0 : x >= DOME_L && x <= DOME_R ? BEDROCK : 0.7;
      } else if (x === 0 || x === W - 1 || y === H - 1) {
        hp[i] = BEDROCK;
      } else {
        const d = y - GROUND;
        hp[i] = LAYERS[layerAt(d)].hp * (0.85 + rng.next() * 0.3);
      }
      if (x === 0 || x === W - 1) hp[i] = y < GROUND && x >= DOME_L && x <= DOME_R ? 0 : BEDROCK;
    }
  }
  const inner = (x: number, y: number): boolean => x > 0 && x < W - 1 && y > GROUND + 1 && y < H - 1;
  // Caves.
  for (let c = 0; c < 9; c++) {
    let x = rng.int(2, W - 3);
    let y = GROUND + rng.int(7, DEPTH - 4);
    const len = rng.int(5, 13);
    for (let s = 0; s < len; s++) {
      if (inner(x, y)) hp[idx(x, y)] = 0;
      if (rng.chance(0.6)) x += rng.chance(0.5) ? 1 : -1;
      else y += rng.chance(0.5) ? 1 : -1;
      x = Math.max(1, Math.min(W - 2, x));
    }
  }
  // Ore veins.
  const vein = (code: number, count: number, dMin: number, dMax: number, sMin: number, sMax: number, bias: number): void => {
    for (let v = 0; v < count; v++) {
      let x = rng.int(1, W - 2);
      let y = GROUND + Math.floor(dMin + Math.pow(rng.next(), bias) * (dMax - dMin));
      const size = rng.int(sMin, sMax);
      for (let s = 0; s < size; s++) {
        if (inner(x, y)) {
          const i = idx(x, y);
          if (hp[i] === 0) hp[i] = LAYERS[layerAt(y - GROUND)].hp;
          ore[i] = code;
        }
        if (rng.chance(0.5)) x += rng.chance(0.5) ? 1 : -1;
        else y += rng.chance(0.5) ? 1 : -1;
      }
    }
  };
  vein(1, 36, 1, 55, 3, 6, 1.3);
  vein(2, 22, 6, 66, 2, 4, 1);
  vein(3, 14, 26, 70, 1, 3, 0.8);
  // Gadget chests: one per band, the gadget order comes from the seed.
  const pool = rng.shuffle([...GADGET_IDS]);
  const gadgetAt: Record<number, GadgetId> = {};
  [9, 19, 31, 44, 57].forEach((d, gi) => {
    const x = rng.int(2, W - 3);
    const y = GROUND + d + rng.int(-2, 2);
    const i = idx(x, y);
    ore[i] = 4;
    hp[i] = LAYERS[layerAt(d)].hp;
    gadgetAt[i] = pool[gi];
  });
  for (let i = 0; i < n; i++) {
    if (hp[i] > 0) {
      hp[i] *= ORE_HP[ore[i]];
      max[i] = hp[i];
    }
  }
  const w: World = {
    v: 1,
    seed,
    dome,
    wave: 1,
    phase: 'mine',
    timer: 0,
    timerMax: 0,
    time: 0,
    hp,
    max,
    ore,
    gadgetAt,
    loose: [],
    k: { x: 11, y: GROUND - KH / 2 - 0.001, vx: 0, vy: 0, cargo: [], face: 1, grounded: true, jet: false, dig: -1 },
    res: { iron: 0, water: 0, crystal: 0 },
    lv: { drill: 1, carry: 1, jet: 1, laser: 1, shield: 1 },
    gadgets: [],
    cool: {},
    domeHp: DOME_HP,
    domeMax: DOME_HP,
    shield: shieldMax(1),
    shieldT: 0,
    angle: Math.PI / 2,
    firing: false,
    beam: null,
    docked: false,
    tgt: -1,
    strikeUsed: false,
    mons: [],
    spits: [],
    queue: [],
    waveT: 0,
    uid: 1,
    stats: { dug: 0, ore: 0, kills: 0, taken: 0, gadgets: 0 },
  };
  w.timer = w.timerMax = mineTime(w);
  return w;
}

// ---------- Keeper ----------

function boxHits(w: World, x: number, y: number): boolean {
  const x0 = Math.floor(x - KW / 2);
  const x1 = Math.floor(x + KW / 2 - 1e-6);
  const y0 = Math.floor(y - KH / 2);
  const y1 = Math.floor(y + KH / 2 - 1e-6);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(w, tx, ty)) return true;
  return false;
}

function addPiece(w: World, res: Res, x: number, y: number, fx: Fx[]): void {
  if (w.k.cargo.length < cap(w)) {
    w.k.cargo.push(res);
    fx.push({ k: 'ore', x, y, text: '+1', color: '#fff' });
  } else {
    w.loose.push({ x: x + (Math.random() - 0.5) * 0.4, y, res });
  }
}

export function breakTile(w: World, i: number, fx: Fx[]): void {
  if (w.hp[i] <= 0) return;
  const tx = i % W;
  const ty = Math.floor(i / W);
  w.hp[i] = 0;
  w.stats.dug++;
  const code = w.ore[i];
  w.ore[i] = 0;
  fx.push({ k: 'break', x: tx + 0.5, y: ty + 0.5 });
  const res = ORE_RES[code];
  if (res) for (let p = 0; p < ORE_PIECES[code]; p++) addPiece(w, res, tx + 0.5, ty + 0.5, fx);
  const g = w.gadgetAt[i];
  if (code === 4 && g) {
    delete w.gadgetAt[i];
    if (!w.gadgets.includes(g)) {
      w.gadgets.push(g);
      w.stats.gadgets++;
      fx.push({ k: 'gadget', x: tx + 0.5, y: ty + 0.5, text: `${GADGETS[g].icon} ${GADGETS[g].name}` });
    }
  }
}

function stepKeeper(w: World, inp: Input, dt: number, fx: Fx[]): void {
  const k = w.k;
  const slow = 1 / (1 + slowPer(w.lv.carry) * k.cargo.length);
  const ix = Math.sign(inp.x);
  const iy = Math.sign(inp.y);
  if (ix) k.face = ix;
  // Horizontal velocity.
  if (ix) {
    const target = ix * walkSpeed(w.lv.jet) * slow;
    k.vx += Math.max(-40 * dt, Math.min(40 * dt, target - k.vx));
  } else if (iy) {
    // Center on the column so the keeper fits the shaft.
    const cx = Math.floor(k.x) + 0.5;
    k.vx = Math.max(-3, Math.min(3, (cx - k.x) * 10));
  } else {
    k.vx *= Math.max(0, 1 - 18 * dt);
  }
  // Vertical velocity.
  k.jet = iy < 0;
  k.vy += 22 * dt;
  if (k.jet) {
    k.vy -= jetThrust(w.lv.jet) * dt;
    k.vy = Math.max(k.vy, -jetMax(w.lv.jet) * slow);
  }
  k.vy = Math.min(k.vy, 14);
  // Move X.
  k.x += k.vx * dt;
  if (boxHits(w, k.x, k.y)) {
    if (k.vx > 0) k.x = Math.floor(k.x + KW / 2) - KW / 2 - 1e-4;
    else k.x = Math.floor(k.x - KW / 2) + 1 + KW / 2 + 1e-4;
    k.vx = 0;
  }
  // Move Y.
  let blockY = 0;
  k.grounded = false;
  k.y += k.vy * dt;
  if (boxHits(w, k.x, k.y)) {
    if (k.vy > 0) {
      k.y = Math.floor(k.y + KH / 2) - KH / 2 - 1e-4;
      k.grounded = true;
    } else k.y = Math.floor(k.y - KH / 2) + 1 + KH / 2 + 1e-4;
    blockY = Math.sign(k.vy);
    k.vy = 0;
  }
  // Dig.
  let target = -1;
  if (ix) {
    const tx = Math.floor(k.x + ix * (KW / 2 + 0.03));
    const rows = [Math.floor(k.y), Math.floor(k.y - KH / 2 + 0.01), Math.floor(k.y + KH / 2 - 0.01)];
    for (const ty of rows) {
      if (tx >= 0 && tx < W && ty >= 0 && ty < H && w.hp[idx(tx, ty)] > 0) {
        target = idx(tx, ty);
        break;
      }
    }
  } else if (iy > 0 && k.grounded) {
    const tx = Math.floor(k.x);
    const ty = Math.floor(k.y + KH / 2 + 0.03);
    if (ty < H && w.hp[idx(tx, ty)] > 0) target = idx(tx, ty);
  } else if (iy < 0 && (blockY < 0 || k.vy === 0)) {
    const tx = Math.floor(k.x);
    const ty = Math.floor(k.y - KH / 2 - 0.03);
    if (ty >= 0 && w.hp[idx(tx, ty)] > 0) target = idx(tx, ty);
  }
  // Do not dig the dome floor or the sky from inside the dome.
  if (target >= 0 && Math.floor(target / W) <= GROUND && k.y < GROUND) target = -1;
  k.dig = target;
  if (target >= 0) {
    w.hp[target] -= drillPower(w.lv.drill) * dt;
    if (w.hp[target] <= 0) {
      w.hp[target] = 1e-9;
      breakTile(w, target, fx);
      k.dig = -1;
    }
  }
  // Pick up loose items.
  for (let i = w.loose.length - 1; i >= 0 && k.cargo.length < cap(w); i--) {
    const l = w.loose[i];
    if (Math.abs(l.x - k.x) < 0.6 && Math.abs(l.y - k.y) < 0.7) {
      k.cargo.push(l.res);
      w.loose.splice(i, 1);
      fx.push({ k: 'ore', x: l.x, y: l.y, text: '+1', color: '#fff' });
    }
  }
  // Deposit at the dome.
  if (inDome(w) && k.cargo.length) deposit(w, fx);
}

function deposit(w: World, fx: Fx[]): void {
  const k = w.k;
  const n = k.cargo.length;
  for (const r of k.cargo) w.res[r]++;
  w.stats.ore += n;
  k.cargo = [];
  fx.push({ k: 'deposit', x: k.x, y: k.y - 0.6, text: `+${n}`, color: '#ffd166' });
}

// ---------- Gadgets ----------

export function canUse(w: World, g: GadgetId): boolean {
  if (!has(w, g) || (w.cool[g] ?? 0) > 0) return false;
  if (g === 'lift') return !inDome(w) && (w.phase === 'mine' || (w.phase === 'wave' && !w.docked));
  if (g === 'blast') return !inDome(w) && (w.phase === 'mine' || (w.phase === 'wave' && !w.docked));
  if (g === 'strike') return w.phase === 'wave' && !w.strikeUsed && (w.mons.length > 0 || w.queue.length > 0);
  return false;
}

export function useGadget(w: World, g: GadgetId, fx: Fx[]): boolean {
  if (!canUse(w, g)) return false;
  const k = w.k;
  if (g === 'lift') {
    fx.push({ k: 'lift', x: k.x, y: k.y });
    k.x = HATCH + 0.5;
    k.y = GROUND - KH / 2 - 0.3;
    k.vx = k.vy = 0;
    if (k.cargo.length) deposit(w, fx);
  } else if (g === 'blast') {
    for (let ty = Math.floor(k.y) - 2; ty <= Math.floor(k.y) + 2; ty++) {
      for (let tx = Math.floor(k.x) - 2; tx <= Math.floor(k.x) + 2; tx++) {
        if (tx <= 0 || tx >= W - 1 || ty <= GROUND || ty >= H - 1) continue;
        if (Math.hypot(tx + 0.5 - k.x, ty + 0.5 - k.y) > 1.9) continue;
        if (w.hp[idx(tx, ty)] > 0) breakTile(w, idx(tx, ty), fx);
      }
    }
    fx.push({ k: 'blast', x: k.x, y: k.y });
  } else if (g === 'strike') {
    w.strikeUsed = true;
    const d = strikeDmg(w);
    for (const m of w.mons) hurtMon(w, m, d, fx);
    fx.push({ k: 'strike', x: 0, y: 8, text: `-${d}` });
    cleanup(w, fx);
  }
  if (GADGETS[g].cool) w.cool[g] = GADGETS[g].cool!;
  return true;
}

// ---------- Waves ----------

export function buildWave(w: World): void {
  const n = w.wave;
  const rng = new Rng(hash(w.seed, 'wave', n));
  let budget = 10 + 5 * n + 0.12 * n * n;
  const pool = Object.values(MONSTERS).filter((m) => m.cost > 0 && m.from <= n);
  const spread = 6 + n * 1.2;
  const q: World['queue'] = [];
  const boss = BOSS_WAVES[n];
  if (boss) {
    q.push({ t: spread * 0.35, id: boss, side: rng.chance(0.5) ? 1 : -1 });
    budget *= boss === 'queen' ? 0.3 : 0.5;
  }
  while (budget > 0) {
    const m = rng.weighted(pool.map((p) => [p, p.from >= n - 2 ? 1.6 : 1] as const));
    budget -= m.cost;
    q.push({ t: rng.next() * spread, id: m.id, side: rng.chance(0.5) ? 1 : -1 });
  }
  q.sort((a, b) => a.t - b.t);
  w.queue = q;
  w.waveT = 0;
}

function spawn(w: World, id: string, side: number, rng: () => number): Mon {
  const d = MONSTERS[id];
  const flying = d.kind === 'fly' || d.kind === 'dive' || d.kind === 'queen';
  const hpM = hpMul(w.wave) * (d.kind === 'titan' && w.wave >= 10 ? 1.35 : 1);
  const m: Mon = {
    uid: w.uid++,
    id,
    x: side * (ARENA + 1),
    y: flying ? 7 + rng() * 6 : d.size / 2,
    hp: d.hp * hpM,
    max: d.hp * hpM,
    dmg: d.dmg * dmgMul(w.wave),
    cd: d.rate * 0.5,
    flash: 0,
    side,
    ang: 0.25 + rng() * 1.1,
    t: 3,
    touching: false,
  };
  w.mons.push(m);
  return m;
}

function hurtDome(w: World, dmg: number, x: number, y: number, fx: Fx[]): void {
  w.shieldT = 0;
  w.stats.taken += dmg;
  const s = Math.min(w.shield, dmg);
  w.shield -= s;
  const rest = dmg - s;
  if (s > 0) fx.push({ k: 'shield', x, y, text: `-${Math.round(s)}`, color: '#7ad7ff' });
  if (rest > 0) {
    w.domeHp -= rest;
    fx.push({ k: 'dome', x, y, text: `-${Math.round(rest)}`, color: '#ff6b6b' });
  }
}

function hurtMon(w: World, m: Mon, d: number, fx: Fx[]): void {
  if (m.hp <= 0) return;
  m.hp -= d;
  m.flash = 0.12;
  if (m.hp <= 0) {
    w.stats.kills++;
    fx.push({ k: 'kill', x: m.x, y: m.y, color: MONSTERS[m.id].color });
  }
}

function cleanup(w: World, _fx: Fx[]): void {
  w.mons = w.mons.filter((m) => m.hp > 0);
}

/** Weapon angle that points at arena point (x, y). 0 is right, PI/2 up, PI left. */
export function angleTo(x: number, y: number, oy = GUN_Y): number {
  const a = Math.atan2(y - oy, x);
  return a < -Math.PI / 2 ? a + Math.PI * 2 : a;
}

/** Distance along the beam to monster m, or -1 if the beam misses. */
export function rayHit(angle: number, m: Mon): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const cx = m.x;
  const cy = m.y - GUN_Y;
  const t = cx * dx + cy * dy;
  if (t < 0) return -1;
  const r = MONSTERS[m.id].size / 2;
  const perp2 = cx * cx + cy * cy - t * t;
  return perp2 < r * r ? t : -1;
}

function turretTarget(w: World): Mon | null {
  const cur = w.mons.find((m) => m.uid === w.tgt && m.hp > 0 && Math.abs(m.x) < ARENA - 0.5);
  if (cur) return cur;
  let best: Mon | null = null;
  let bd = Infinity;
  for (const m of w.mons) {
    if (Math.abs(m.x) > ARENA - 0.5) continue;
    const d = Math.hypot(m.x, m.y) + Math.abs(angleTo(m.x, m.y) - w.angle) * 4;
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  w.tgt = best?.uid ?? -1;
  return best;
}

function stepWeapon(w: World, inp: Input, dt: number, fx: Fx[]): void {
  const auto = w.dome === 'turret';
  const active = w.docked || auto;
  let aim = inp.aim;
  let fire = inp.fire;
  if (auto) {
    const t = turretTarget(w);
    aim = t ? angleTo(t.x, t.y) : null;
    fire = !!t;
  }
  const rot = weaponRot(w) * dt;
  if (aim !== null) {
    const a = Math.max(AIM_MIN, Math.min(AIM_MAX, aim));
    const diff = a - w.angle;
    w.angle += Math.max(-rot, Math.min(rot, diff));
  } else if (inp.rot) {
    w.angle -= inp.rot * rot;
  }
  w.angle = Math.max(AIM_MIN, Math.min(AIM_MAX, w.angle));
  w.firing = active && fire;
  w.beam = null;
  if (!w.firing) return;
  const dmg = weaponDps(w) * dt;
  if (w.dome === 'sword') {
    for (const m of w.mons) {
      const d = Math.hypot(m.x, m.y - 1);
      if (d - MONSTERS[m.id].size / 2 > SWORD_RANGE) continue;
      const a = angleTo(m.x, m.y, 1);
      if (Math.abs(a - w.angle) < SWORD_ARC + MONSTERS[m.id].size / 2 / Math.max(1, d)) hurtMon(w, m, dmg, fx);
    }
    return;
  }
  let best: Mon | null = null;
  let bt = Infinity;
  for (const m of w.mons) {
    const t = rayHit(w.angle, m);
    if (t >= 0 && t < bt) {
      bt = t;
      best = m;
    }
  }
  // The beam also burns acid spit out of the air.
  const dx = Math.cos(w.angle);
  const dy = Math.sin(w.angle);
  for (let i = w.spits.length - 1; i >= 0; i--) {
    const s = w.spits[i];
    const t = s.x * dx + (s.y - GUN_Y) * dy;
    if (t < 0 || t > bt) continue;
    const px = s.x - dx * t;
    const py = s.y - GUN_Y - dy * t;
    if (px * px + py * py < 0.45 * 0.45) {
      w.spits.splice(i, 1);
      fx.push({ k: 'hit', x: s.x, y: s.y, color: '#a7f070' });
    }
  }
  if (best) {
    hurtMon(w, best, dmg, fx);
    w.beam = { x: dx * bt, y: GUN_Y + dy * bt };
  }
}

function stepMonsters(w: World, dt: number, fx: Fx[]): void {
  const spikes = has(w, 'spikes');
  for (const m of [...w.mons]) {
    const d = MONSTERS[m.id];
    m.flash = Math.max(0, m.flash - dt);
    m.touching = false;
    if (m.hp <= 0) continue;
    const r = d.size / 2;
    if (d.kind === 'ground' || d.kind === 'titan' || d.kind === 'ranged') {
      const stop = d.kind === 'ranged' ? 8 : DOME_RAD + r - 0.2;
      const dist = Math.abs(m.x);
      if (dist > stop) {
        m.x -= m.side * Math.min(d.speed * dt, dist - stop);
      } else if ((m.cd -= dt) <= 0) {
        m.cd = d.rate;
        if (d.kind === 'ranged') {
          const tx = 0;
          const ty = DOME_RAD * 0.7;
          const len = Math.hypot(tx - m.x, ty - m.y);
          w.spits.push({ x: m.x, y: m.y, vx: ((tx - m.x) / len) * 7, vy: ((ty - m.y) / len) * 7, dmg: m.dmg });
        } else hurtDome(w, m.dmg, m.side * DOME_RAD, r, fx);
      }
      if (d.kind !== 'ranged' && dist <= stop + 0.01) m.touching = true;
    } else if (d.kind === 'fly' || d.kind === 'dive') {
      const R = DOME_RAD + r - 0.1;
      const tx = Math.cos(m.side > 0 ? m.ang : Math.PI - m.ang) * R;
      const ty = Math.sin(m.ang) * R;
      const dx = tx - m.x;
      const dy = ty - m.y;
      const len = Math.hypot(dx, dy);
      const sp = d.speed * dt;
      if (len > 0.05) {
        const wob = d.kind === 'fly' ? Math.sin(w.time * 5 + m.uid) * 0.6 * dt : 0;
        m.x += (dx / len) * Math.min(sp, len);
        m.y += (dy / len) * Math.min(sp, len) + wob;
      }
      if (len <= 0.3) {
        m.touching = true;
        if (d.kind === 'dive') {
          hurtDome(w, m.dmg, m.x, m.y, fx);
          m.hp = 0;
          fx.push({ k: 'kill', x: m.x, y: m.y, color: d.color });
        } else if ((m.cd -= dt) <= 0) {
          m.cd = d.rate;
          hurtDome(w, m.dmg, m.x, m.y, fx);
        }
      }
    } else if (d.kind === 'queen') {
      const hx = m.side * (4 + Math.sin(w.time * 0.4 + m.uid) * 2);
      const hy = 5.8 + Math.sin(w.time * 0.9) * 1.2;
      const dx = hx - m.x;
      const dy = hy - m.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.05) {
        m.x += (dx / len) * Math.min(d.speed * dt * 2, len);
        m.y += (dy / len) * Math.min(d.speed * dt * 2, len);
      }
      if (Math.abs(m.x) < ARENA - 2) {
        if ((m.cd -= dt) <= 0) {
          m.cd = d.rate;
          const len2 = Math.hypot(m.x, m.y - DOME_RAD * 0.7);
          w.spits.push({ x: m.x, y: m.y, vx: (-m.x / len2) * 6, vy: ((DOME_RAD * 0.7 - m.y) / len2) * 6, dmg: m.dmg });
        }
        if ((m.t -= dt) <= 0) {
          m.t = 8;
          const rng = new Rng(hash(w.seed, 'brood', m.uid, Math.floor(w.time)));
          for (let b = 0; b < 2; b++) {
            const bat = spawn(w, 'bat', m.side, () => rng.next());
            bat.x = m.x;
            bat.y = m.y;
          }
        }
      }
    }
    if (spikes && m.touching) hurtMon(w, m, 8 * dt, fx);
  }
  for (let i = w.spits.length - 1; i >= 0; i--) {
    const s = w.spits[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (Math.hypot(s.x, s.y) < DOME_RAD + 0.1) {
      hurtDome(w, s.dmg, s.x, s.y, fx);
      w.spits.splice(i, 1);
    }
  }
}

function startWave(w: World, fx: Fx[]): void {
  w.phase = 'wave';
  w.timer = 0;
  w.strikeUsed = false;
  w.docked = inDome(w);
  if (w.docked) dock(w, fx);
  buildWave(w);
  fx.push({ k: 'alarm', x: 0, y: 0, text: `Wave ${w.wave}!` });
}

function dock(w: World, fx: Fx[]): void {
  const k = w.k;
  w.docked = true;
  if (k.cargo.length) deposit(w, fx);
  k.x = HATCH + 0.5;
  k.y = GROUND - KH / 2 - 0.001;
  k.vx = k.vy = 0;
  k.dig = -1;
  k.jet = false;
  fx.push({ k: 'docked', x: 0, y: 0 });
}

/** Advance the world by dt seconds. */
export function stepWorld(w: World, inp: Input, dt: number, fx: Fx[]): void {
  if (w.phase === 'cleared' || w.phase === 'won' || w.phase === 'lost') return;
  w.time += dt;
  for (const g of Object.keys(w.cool)) w.cool[g] = Math.max(0, w.cool[g] - dt);
  // Shield regen.
  w.shieldT += dt;
  if (w.shieldT > 3) w.shield = Math.min(shieldMax(w.lv.shield), w.shield + shieldRegen(w.lv.shield) * dt);
  if (w.phase === 'mine') {
    stepKeeper(w, inp, dt, fx);
    if (has(w, 'drone')) {
      if (w.cool.drone === undefined) w.cool.drone = 8;
      if (w.cool.drone <= 0 && w.k.cargo.length && !inDome(w)) {
        const r = w.k.cargo.pop()!;
        w.res[r]++;
        w.stats.ore++;
        w.cool.drone = 8;
        fx.push({ k: 'drone', x: w.k.x, y: w.k.y - 0.8, text: '🛸', color: '#ffd166' });
      }
    }
    w.timer -= dt;
    if (w.timer <= 0) startWave(w, fx);
    return;
  }
  // Wave phase.
  if (!w.docked) {
    stepKeeper(w, inp, dt, fx);
    if (inDome(w)) dock(w, fx);
  }
  w.waveT += dt;
  while (w.queue.length && w.queue[0].t <= w.waveT) {
    const q = w.queue.shift()!;
    const rng = new Rng(hash(w.seed, 'spawn', w.uid));
    spawn(w, q.id, q.side, () => rng.next());
  }
  stepWeapon(w, inp, dt, fx);
  stepMonsters(w, dt, fx);
  cleanup(w, fx);
  if (w.domeHp <= 0) {
    w.domeHp = 0;
    w.phase = 'lost';
    return;
  }
  if (!w.queue.length && !w.mons.length) {
    w.spits = [];
    w.firing = false;
    w.beam = null;
    w.phase = w.wave >= WAVES ? 'won' : 'cleared';
    if (has(w, 'repair')) w.domeHp = Math.min(w.domeMax, w.domeHp + 12);
  }
}

/** Start the next mining cycle after the workshop. */
export function nextCycle(w: World): void {
  if (w.phase !== 'cleared') return;
  w.wave++;
  w.phase = 'mine';
  w.docked = false;
  w.timer = w.timerMax = mineTime(w);
  w.shield = shieldMax(w.lv.shield);
}

export const totalRes = (w: World): number => RES_IDS.reduce((a, r) => a + w.res[r], 0);
