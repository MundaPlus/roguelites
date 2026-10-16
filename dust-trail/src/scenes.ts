/** Real-time scenes: hunt, river crossing and bandit ambush. Pure state + fixed-step update, no DOM. */
import type { Res } from './data';
import { Rng } from './rng';
import type { SceneKind, SceneOutcome } from './run';

export const SW = 480;
export const SH = 360;
export const DT = 1 / 60;

export interface SceneSetup {
  kind: SceneKind;
  boss: boolean;
  easy: boolean;
  seed: number;
  hunt: number;
  scout: number;
  mech: number;
  fighters: { uid: number; lvl: number; brave: boolean }[];
  party: number[];
  ammo: number;
  sharp: boolean;
  strong: number;
  row: number;
  danger: number;
}

export interface Input {
  x: number;
  y: number;
  fire: boolean; // one shot request (edge)
  steer: number; // -1..1 for the river
}

export interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface Puff {
  x: number;
  y: number;
  t: number;
  r: number;
  color: string;
}

interface Base {
  setup: SceneSetup;
  rng: Rng;
  t: number;
  dur: number;
  done: boolean;
  ammo: number;
  shots: number;
  cool: number;
  floats: Float[];
  puffs: Puff[];
  shake: number;
  hurt: Map<number, number>;
  sounds: string[]; // sound names for the app to play
}

export interface Animal {
  x: number;
  y: number;
  vx: number;
  type: AnimalType;
  hp: number;
  dead: number; // >0 = dying timer
  bob: number;
}

export type AnimalType = 'rabbit' | 'deer' | 'bison' | 'turkey' | 'boar' | 'bird';

export const ANIMALS: Record<AnimalType, { icon: string; r: number; speed: number; meat: number; hp: number; sky?: boolean }> = {
  rabbit: { icon: '🐇', r: 11, speed: 120, meat: 3, hp: 1 },
  turkey: { icon: '🦃', r: 12, speed: 70, meat: 5, hp: 1 },
  deer: { icon: '🦌', r: 19, speed: 85, meat: 12, hp: 1 },
  boar: { icon: '🐗', r: 17, speed: 105, meat: 10, hp: 2 },
  bison: { icon: '🦬', r: 27, speed: 42, meat: 25, hp: 3 },
  bird: { icon: '🦆', r: 10, speed: 150, meat: 2, hp: 1, sky: true },
};

export interface HuntScene extends Base {
  kind: 'hunt';
  animals: Animal[];
  spawn: number;
  meat: number;
  cap: number;
  hits: number;
}

export interface Obstacle {
  x: number;
  y: number;
  vx: number;
  type: 'rock' | 'log' | 'snag';
  r: number;
  hit: boolean;
}

export interface RiverScene extends Base {
  kind: 'river';
  wx: number;
  wvx: number;
  obstacles: Obstacle[];
  spawn: number;
  flow: number; // scroll speed
  current: number;
  inv: number;
  scroll: number;
  wagonDmg: number;
  lost: Partial<Res>;
  hits: number;
}

export interface Bandit {
  id: number;
  x: number;
  y: number;
  type: BanditType;
  hp: number;
  state: 'come' | 'loot' | 'flee' | 'shoot' | 'dead';
  t: number;
  loots: number;
  carry: Partial<Res>;
  dead: number;
}

export type BanditType = 'thug' | 'rider' | 'gunman' | 'boss';

export const BANDITS: Record<BanditType, { icon: string; hp: number; speed: number; r: number; range: number }> = {
  thug: { icon: '🥷', hp: 1, speed: 42, r: 15, range: 0 },
  rider: { icon: '🏇', hp: 1, speed: 80, r: 17, range: 0 },
  gunman: { icon: '🤠', hp: 2, speed: 32, r: 15, range: 130 },
  boss: { icon: '🦹', hp: 8, speed: 26, r: 22, range: 150 },
};

export interface AmbushScene extends Base {
  kind: 'ambush';
  bandits: Bandit[];
  queue: { at: number; type: BanditType }[];
  nextId: number;
  autoT: number[];
  kills: number;
  stolen: Partial<Res>;
  money: number;
  tracers: { x1: number; y1: number; x2: number; y2: number; t: number; foe: boolean }[];
}

export type Scene = HuntScene | RiverScene | AmbushScene;

export const WAGON = { x: SW / 2, y: SH / 2 + 10, r: 30 };

function base(setup: SceneSetup, dur: number): Base {
  return {
    setup,
    rng: new Rng(setup.seed),
    t: 0,
    dur,
    done: false,
    ammo: setup.ammo,
    shots: 0,
    cool: 0,
    floats: [],
    puffs: [],
    shake: 0,
    hurt: new Map(),
    sounds: [],
  };
}

export function createScene(setup: SceneSetup): Scene {
  switch (setup.kind) {
    case 'hunt':
      return { ...base(setup, 20), kind: 'hunt', animals: [], spawn: 0.3, meat: 0, cap: 50 + 20 * setup.strong, hits: 0 };
    case 'river': {
      const s: RiverScene = {
        ...base(setup, setup.easy ? 13 : 16),
        kind: 'river',
        wx: SW / 2,
        wvx: 0,
        obstacles: [],
        spawn: 0.8,
        flow: setup.easy ? 95 : 125,
        current: 0,
        inv: 0,
        scroll: 0,
        wagonDmg: 0,
        lost: {},
        hits: 0,
      };
      return s;
    }
    case 'ambush': {
      const s: AmbushScene = {
        ...base(setup, setup.boss ? 45 : 32),
        kind: 'ambush',
        bandits: [],
        queue: [],
        nextId: 1,
        autoT: setup.fighters.map((_, i) => 1 + i * 0.4),
        kills: 0,
        stolen: {},
        money: 0,
        tracers: [],
      };
      const n = setup.boss ? 16 : 4 + setup.danger + Math.floor(setup.row / 3);
      const span = s.dur * 0.6;
      for (let i = 0; i < n; i++) {
        const roll = s.rng.next();
        const type: BanditType = roll < 0.5 ? 'thug' : roll < 0.75 ? 'rider' : 'gunman';
        s.queue.push({ at: 0.5 + (i / n) * span + s.rng.next() * 0.8, type });
      }
      if (setup.boss) s.queue.push({ at: span * 0.5, type: 'boss' });
      s.queue.sort((a, b) => a.at - b.at);
      return s;
    }
  }
}

function float(s: Base, x: number, y: number, text: string, color: string): void {
  s.floats.push({ x, y, text, color, t: 0 });
}

function puff(s: Base, x: number, y: number, color: string, r = 14): void {
  s.puffs.push({ x, y, t: 0, r, color });
}

function hurtSomeone(s: Base, n: number): void {
  if (!s.setup.party.length) return;
  const uid = s.rng.pick(s.setup.party);
  s.hurt.set(uid, (s.hurt.get(uid) ?? 0) + n);
}

const hitR = (s: Base): number => (s.setup.sharp ? 10 : 0);

export function update(s: Scene, dt: number, inp: Input): void {
  if (s.done) return;
  s.t += dt;
  s.cool = Math.max(0, s.cool - dt);
  s.shake = Math.max(0, s.shake - dt * 3);
  for (const f of s.floats) {
    f.t += dt;
    f.y -= 30 * dt;
  }
  s.floats = s.floats.filter((f) => f.t < 1.1);
  for (const p of s.puffs) p.t += dt;
  s.puffs = s.puffs.filter((p) => p.t < 0.5);
  if (s.kind === 'hunt') updateHunt(s, dt, inp);
  else if (s.kind === 'river') updateRiver(s, dt, inp);
  else updateAmbush(s, dt, inp);
}

// ---------- Hunt ----------

function updateHunt(s: HuntScene, dt: number, inp: Input): void {
  const slow = 1 - 0.08 * s.setup.hunt;
  s.spawn -= dt;
  if (s.spawn <= 0 && s.t < s.dur - 2) {
    s.spawn = 0.7 + s.rng.next() * 0.8;
    const type = s.rng.weighted<AnimalType>([
      ['rabbit', 4],
      ['turkey', 3],
      ['deer', 4],
      ['boar', 2],
      ['bison', 1.5],
      ['bird', 2],
    ]);
    const d = ANIMALS[type];
    const left = s.rng.chance(0.5);
    const y = d.sky ? 30 + s.rng.next() * 60 : 130 + s.rng.next() * 210;
    s.animals.push({ x: left ? -30 : SW + 30, y, vx: (left ? 1 : -1) * d.speed * slow * (0.8 + s.rng.next() * 0.4), type, hp: d.hp, dead: 0, bob: s.rng.next() * 6 });
  }
  for (const a of s.animals) {
    if (a.dead) {
      a.dead += dt;
      continue;
    }
    a.x += a.vx * dt;
    a.bob += dt * (ANIMALS[a.type].speed / 12);
  }
  s.animals = s.animals.filter((a) => (a.dead ? a.dead < 0.8 : a.x > -60 && a.x < SW + 60));
  if (inp.fire && s.cool <= 0 && s.ammo > 0) {
    s.cool = 0.45;
    s.ammo--;
    s.shots++;
    s.sounds.push('shot');
    puff(s, inp.x, inp.y, '#fff', 8);
    const bonus = 4 + 4 * s.setup.hunt + hitR(s);
    let target: Animal | null = null;
    let bd = 1e9;
    for (const a of s.animals) {
      if (a.dead) continue;
      const d = Math.hypot(a.x - inp.x, a.y - inp.y);
      if (d < ANIMALS[a.type].r + bonus && d < bd) {
        bd = d;
        target = a;
      }
    }
    if (target) {
      target.hp--;
      s.hits++;
      if (target.hp <= 0) {
        target.dead = 0.001;
        const meat = ANIMALS[target.type].meat;
        s.meat += meat;
        float(s, target.x, target.y - 20, `+${meat} 🍖`, '#ffd166');
        puff(s, target.x, target.y, '#e63946', 20);
        s.sounds.push('kill');
      } else {
        float(s, target.x, target.y - 20, 'hit!', '#ffffff');
        target.vx *= 1.3;
        s.sounds.push('hit');
      }
    } else float(s, inp.x, inp.y - 12, 'miss', '#a9a9a9');
  }
  if (s.t >= s.dur || (s.ammo <= 0 && s.cool <= 0 && s.t > 1)) s.done = true;
}

// ---------- River ----------

function updateRiver(s: RiverScene, dt: number, inp: Input): void {
  const scout = s.setup.scout;
  s.scroll += s.flow * dt;
  s.current = Math.sin(s.t * 0.9) * 50 + Math.sin(s.t * 2.3 + 1) * 25 + 25;
  s.spawn -= dt;
  if (s.spawn <= 0 && s.t < s.dur - 1.5) {
    const rate = (s.setup.easy ? 0.95 : 0.6) * (1 + 0.15 * scout);
    s.spawn = rate * (0.6 + s.rng.next() * 0.8);
    const type = s.rng.weighted<Obstacle['type']>([
      ['rock', 5],
      ['log', 3],
      ['snag', 2],
    ]);
    const r = type === 'rock' ? 18 + s.rng.next() * 10 : type === 'log' ? 16 : 12;
    s.obstacles.push({ x: 50 + s.rng.next() * (SW - 100), y: -30, vx: type === 'log' ? (s.rng.next() - 0.3) * 40 : 0, type, r, hit: false });
  }
  for (const o of s.obstacles) {
    o.y += s.flow * dt;
    o.x += o.vx * dt;
  }
  s.obstacles = s.obstacles.filter((o) => o.y < SH + 40);
  const steer = Math.max(-1, Math.min(1, inp.steer));
  s.wvx += (steer * 520 - s.wvx * 3.2 + s.current) * dt;
  s.wx += s.wvx * dt;
  s.inv = Math.max(0, s.inv - dt);
  const WY = SH - 80;
  if (s.wx < 44 || s.wx > SW - 44) {
    s.wx = Math.max(44, Math.min(SW - 44, s.wx));
    s.wvx *= -0.4;
    if (s.inv <= 0) {
      s.inv = 0.8;
      s.wagonDmg += 5;
      s.shake = 0.5;
      float(s, s.wx, WY - 30, 'scrape -5 🛞', '#ff9f43');
      s.sounds.push('bump');
    }
  }
  for (const o of s.obstacles) {
    if (o.hit || s.inv > 0) continue;
    const dx = Math.abs(o.x - s.wx);
    const dy = Math.abs(o.y - WY);
    const hw = o.type === 'log' ? 34 : o.r;
    if (dx < hw + 20 && dy < o.r + 22) {
      o.hit = true;
      s.inv = 1;
      s.hits++;
      s.shake = 1;
      const dmg = Math.max(3, (o.type === 'rock' ? 14 : o.type === 'log' ? 9 : 6) - 2 * s.setup.mech);
      s.wagonDmg += dmg;
      const key = s.rng.pick<keyof Res>(['food', 'water', 'ammo', 'food', 'med', 'parts']);
      const amt = key === 'food' ? 8 : key === 'water' ? 6 : key === 'ammo' ? 5 : 1;
      s.lost[key] = (s.lost[key] ?? 0) - amt;
      float(s, s.wx, WY - 34, `-${dmg} 🛞  -${amt} ${RES_ICON[key]}`, '#ef476f');
      if (o.type === 'rock' && s.rng.chance(0.45)) {
        hurtSomeone(s, 2);
        float(s, s.wx, WY - 54, 'someone fell in!', '#8ecae6');
      }
      puff(s, o.x, o.y, '#cfe8ff', 24);
      s.wvx += (s.wx < o.x ? -1 : 1) * 160;
      s.sounds.push('crash');
    }
  }
  if (s.t >= s.dur) s.done = true;
}

const RES_ICON: Record<keyof Res, string> = { food: '🍖', water: '💧', parts: '⚙️', med: '💊', money: '💲', ammo: '🧨' };

// ---------- Ambush ----------

function spawnBandit(s: AmbushScene, type: BanditType): void {
  const side = s.rng.int(0, 3);
  const x = side === 0 ? -20 : side === 1 ? SW + 20 : s.rng.next() * SW;
  const y = side === 2 ? -20 : side === 3 ? SH + 20 : 20 + s.rng.next() * (SH - 40);
  s.bandits.push({ id: s.nextId++, x, y, type, hp: BANDITS[type].hp, state: 'come', t: 0, loots: 0, carry: {}, dead: 0 });
}

function killBandit(s: AmbushScene, b: Bandit): void {
  b.state = 'dead';
  b.dead = 0.001;
  s.kills++;
  const coin = s.rng.int(2, 7) + (b.type === 'boss' ? 40 : 0);
  s.money += coin;
  for (const [k, v] of Object.entries(b.carry) as [keyof Res, number][]) s.stolen[k] = (s.stolen[k] ?? 0) + v;
  const back = Object.values(b.carry).some((v) => v);
  float(s, b.x, b.y - 22, back ? 'loot back!' : `+${coin} 💲`, '#ffd166');
  puff(s, b.x, b.y, '#e63946', 18);
  s.sounds.push('kill');
}

function damage(s: AmbushScene, b: Bandit, n: number): void {
  b.hp -= n;
  if (b.hp <= 0) killBandit(s, b);
  else {
    float(s, b.x, b.y - 22, 'hit', '#fff');
    s.sounds.push('hit');
  }
}

function updateAmbush(s: AmbushScene, dt: number, inp: Input): void {
  while (s.queue.length && s.queue[0].at <= s.t) spawnBandit(s, s.queue.shift()!.type);
  for (const tr of s.tracers) tr.t += dt;
  s.tracers = s.tracers.filter((tr) => tr.t < 0.15);
  const live = s.bandits.filter((b) => b.state !== 'dead');
  for (const b of s.bandits) {
    const d = BANDITS[b.type];
    b.t += dt;
    if (b.state === 'dead') {
      b.dead += dt;
      continue;
    }
    const dx = WAGON.x - b.x;
    const dy = WAGON.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (b.state === 'come') {
      if (d.range && dist < d.range) {
        b.state = 'shoot';
        b.t = 0;
      } else if (dist < WAGON.r + d.r) {
        b.state = 'loot';
        b.t = 0;
      } else {
        b.x += (dx / dist) * d.speed * dt;
        b.y += (dy / dist) * d.speed * dt;
      }
    } else if (b.state === 'shoot') {
      if (b.t > (b.type === 'boss' ? 1.6 : 2.6)) {
        b.t = 0;
        s.tracers.push({ x1: b.x, y1: b.y, x2: WAGON.x + (s.rng.next() - 0.5) * 40, y2: WAGON.y + (s.rng.next() - 0.5) * 30, t: 0, foe: true });
        s.sounds.push('foe');
        if (s.rng.chance(s.setup.boss ? 0.5 : 0.4)) {
          hurtSomeone(s, 1);
          s.shake = 0.6;
          float(s, WAGON.x, WAGON.y - 40, '-1 ❤️', '#ef476f');
        }
      }
    } else if (b.state === 'loot') {
      if (b.t > 1.4) {
        b.t = 0;
        b.loots++;
        const key = s.rng.pick<keyof Res>(['food', 'water', 'ammo', 'money', 'food', 'med']);
        const amt = key === 'food' ? 8 : key === 'water' ? 6 : key === 'ammo' ? 5 : key === 'money' ? 12 : 1;
        s.stolen[key] = (s.stolen[key] ?? 0) - amt;
        b.carry[key] = (b.carry[key] ?? 0) + amt;
        float(s, b.x, b.y - 24, `-${amt} ${RES_ICON[key]}`, '#ff9f43');
        s.sounds.push('loot');
        if (s.rng.chance(s.setup.boss ? 0.55 : 0.35)) {
          hurtSomeone(s, s.setup.boss ? 2 : 1);
          s.shake = 0.6;
        }
        if (b.loots >= 2) b.state = 'flee';
      }
    } else if (b.state === 'flee') {
      b.x -= (dx / dist) * d.speed * 1.3 * dt;
      b.y -= (dy / dist) * d.speed * 1.3 * dt;
      if (b.x < -40 || b.x > SW + 40 || b.y < -40 || b.y > SH + 40) {
        b.state = 'dead';
        b.dead = 99;
        float(s, Math.max(20, Math.min(SW - 20, b.x)), Math.max(20, Math.min(SH - 20, b.y)), 'got away', '#a9a9a9');
      }
    }
  }
  s.bandits = s.bandits.filter((b) => b.state !== 'dead' || b.dead < 0.8);
  // Player shot.
  if (inp.fire && s.cool <= 0) {
    const noAmmo = s.ammo <= 0;
    s.cool = noAmmo ? 0.9 : 0.32;
    if (!noAmmo) {
      s.ammo--;
      s.shots++;
    }
    s.sounds.push(noAmmo ? 'throw' : 'shot');
    s.tracers.push({ x1: WAGON.x, y1: WAGON.y - 10, x2: inp.x, y2: inp.y, t: 0, foe: false });
    puff(s, inp.x, inp.y, '#fff', 8);
    let target: Bandit | null = null;
    let bd = 1e9;
    for (const b of live) {
      if (b.state === 'dead') continue;
      const dd = Math.hypot(b.x - inp.x, b.y - inp.y);
      if (dd < BANDITS[b.type].r + 8 + hitR(s) && dd < bd && (!noAmmo || Math.hypot(b.x - WAGON.x, b.y - WAGON.y) < 110)) {
        bd = dd;
        target = b;
      }
    }
    if (target) damage(s, target, 1);
  }
  // Travelers shoot by themselves.
  s.setup.fighters.forEach((f, i) => {
    s.autoT[i] -= dt;
    if (s.autoT[i] > 0) return;
    s.autoT[i] = Math.max(0.8, 3.3 - 0.6 * f.lvl - (f.brave ? 0.5 : 0));
    if (s.ammo <= 0) return;
    const targets = s.bandits.filter((b) => b.state !== 'dead' && b.x > 0 && b.x < SW && b.y > 0 && b.y < SH);
    if (!targets.length) return;
    targets.sort((a, b) => Math.hypot(a.x - WAGON.x, a.y - WAGON.y) - Math.hypot(b.x - WAGON.x, b.y - WAGON.y));
    const t = targets[0];
    s.ammo--;
    s.shots++;
    s.tracers.push({ x1: WAGON.x + (i - 1) * 10, y1: WAGON.y, x2: t.x, y2: t.y, t: 0, foe: false });
    s.sounds.push('shot');
    if (s.rng.chance(0.45 + 0.12 * f.lvl)) damage(s, t, 1);
  });
  const alive = s.bandits.some((b) => b.state !== 'dead');
  if ((!alive && !s.queue.length) || s.t >= s.dur) {
    // Bandits still on the field flee with what they carry.
    s.done = true;
  }
}

// ---------- Results ----------

export function outcome(s: Scene): SceneOutcome {
  const hurt = [...s.hurt.entries()];
  const spent = s.setup.ammo - s.ammo;
  if (s.kind === 'hunt') {
    const meat = Math.min(s.meat, s.cap);
    const extra = s.meat > s.cap ? ` You could only carry ${s.cap} back to the wagon.` : '';
    const text =
      s.meat === 0 ? `${s.shots} shots and nothing to show for it.` : `${s.hits} hits with ${s.shots} shots. ${s.meat} pounds of meat.${extra}`;
    return { res: { food: meat, ammo: -spent }, wagon: 0, hurt, kills: 0, meat, text };
  }
  if (s.kind === 'river') {
    const text = s.hits === 0 && s.wagonDmg === 0 ? 'A clean crossing. Not a drop of water in the wagon.' : `The wagon hit ${s.hits} obstacle${s.hits === 1 ? '' : 's'} on the way across.`;
    return { res: { ...s.lost }, wagon: -s.wagonDmg, hurt, kills: 0, meat: 0, text };
  }
  const res: Partial<Res> = { ...s.stolen };
  res.ammo = (res.ammo ?? 0) - spent;
  res.money = (res.money ?? 0) + s.money;
  const fled = s.bandits.filter((b) => b.state !== 'dead').length;
  const text = `You shot ${s.kills} bandit${s.kills === 1 ? '' : 's'}${fled ? `, ${fled} got away` : ''}. ${s.setup.boss && s.kills > 0 ? 'The raiders break and scatter.' : ''}`;
  return { res, wagon: 0, hurt, kills: s.kills, meat: 0, text };
}

// ---------- Bot input ----------

/** Simple bot input. `smart` aims well; otherwise it shoots and steers at random. */
export function botInput(s: Scene, smart: boolean, rng: Rng): Input {
  const inp: Input = { x: SW / 2, y: SH / 2, fire: false, steer: 0 };
  if (s.kind === 'hunt') {
    if (s.cool > 0) return inp;
    if (!smart) {
      if (rng.chance(0.08)) {
        inp.fire = true;
        inp.x = rng.next() * SW;
        inp.y = 30 + rng.next() * (SH - 30);
      }
      return inp;
    }
    const cands = s.animals.filter((a) => !a.dead && a.x > 10 && a.x < SW - 10);
    if (!cands.length || s.meat >= s.cap) return inp;
    cands.sort((a, b) => ANIMALS[b.type].meat / ANIMALS[b.type].hp - ANIMALS[a.type].meat / ANIMALS[a.type].hp);
    const a = cands[0];
    if (ANIMALS[a.type].meat < 5 && s.ammo < 8) return inp;
    inp.fire = true;
    inp.x = a.x + a.vx * 0.03 + (rng.next() - 0.5) * 10;
    inp.y = a.y + (rng.next() - 0.5) * 10;
    return inp;
  }
  if (s.kind === 'river') {
    if (!smart) {
      inp.steer = Math.sin(s.t * 1.3 + rng.next()) * 1;
      return inp;
    }
    const WY = SH - 80;
    let bestX = s.wx;
    let bestScore = -1e9;
    for (let x = 60; x <= SW - 60; x += 20) {
      let sc = -Math.abs(x - s.wx) * 0.15 - Math.abs(x - SW / 2) * 0.05;
      for (const o of s.obstacles) {
        if (o.hit || o.y > WY + 30 || o.y < WY - 220) continue;
        const dx = Math.abs(o.x - x);
        if (dx < 70) sc -= (70 - dx) * (1 + (o.y - (WY - 220)) / 100);
      }
      if (sc > bestScore) {
        bestScore = sc;
        bestX = x;
      }
    }
    const want = (bestX - s.wx) / 40 - s.wvx / 200 - s.current / 520;
    inp.steer = Math.max(-1, Math.min(1, want));
    return inp;
  }
  if (s.cool > 0) return inp;
  const live = s.bandits.filter((b) => b.state !== 'dead' && b.x > 0 && b.x < SW && b.y > 0 && b.y < SH);
  if (!live.length) return inp;
  if (!smart) {
    if (rng.chance(0.1)) {
      const b = rng.pick(live);
      inp.fire = true;
      inp.x = b.x + (rng.next() - 0.5) * 70;
      inp.y = b.y + (rng.next() - 0.5) * 70;
    }
    return inp;
  }
  const prio = (b: Bandit): number => Math.hypot(b.x - WAGON.x, b.y - WAGON.y) - (b.state === 'loot' || b.state === 'flee' ? 200 : 0) - (b.state === 'shoot' ? 80 : 0);
  live.sort((a, b) => prio(a) - prio(b));
  const b = live[0];
  inp.fire = true;
  inp.x = b.x + (rng.next() - 0.5) * 12;
  inp.y = b.y + (rng.next() - 0.5) * 12;
  return inp;
}
