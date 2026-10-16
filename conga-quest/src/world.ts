/** One wave in the arena: the hero line, enemies, shots and pickups. Pure logic, no DOM. */
import {
  CLASSES,
  DT,
  DX,
  DY,
  ENEMIES,
  GRID_H,
  GRID_W,
  MAX_PARTY,
  STAGES,
  heroStats,
  isBossWave,
  opposite,
  stageOf,
  synergyTiers,
  xpNeed,
  type ClassId,
  type Dir,
  type EnemyDef,
  type HeroStats,
  type SynergyTiers,
} from './data';
import { Rng, hash } from './rng';

/** Balance knobs. The sim changes them to tune the game. */
export const BAL = {
  move: 0.18,
  count: 7,
  countPer: 2.4,
  hpGrow: 0.24,
  dmgGrow: 0.2,
  bossHp: 0.7,
  contactCd: 0.9,
  cage: 0.4,
};

export interface HeroSave {
  cls: ClassId;
  hp: number;
  stars: number;
}

export interface Carry {
  heroes: HeroSave[];
  level: number;
  xp: number;
  coins: number;
  kills: number;
  gems: number;
}

export interface Hero {
  id: number;
  cls: ClassId;
  stars: number;
  hp: number;
  s: HeroStats;
  x: number;
  y: number;
  px: number;
  py: number;
  cd: number;
  flash: number;
}

export type EState = 'spawn' | 'walk' | 'wind' | 'charge' | 'stun';

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  dmg: number;
  moveT: number;
  moveI: number;
  atkT: number;
  shootT: number;
  specialT: number;
  summonT: number;
  slowT: number;
  state: EState;
  timer: number;
  dx: number;
  dy: number;
  hit: number[];
  flash: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  dmg: number;
  enemy: boolean;
  target: number;
  area: number;
  slow: number;
  crit: boolean;
  life: number;
  kind: 'arrow' | 'orb' | 'bomb' | 'ice' | 'bolt' | 'fire';
}

export type PickKind = 'gem' | 'coin' | 'food' | 'cage';

export interface Pickup {
  id: number;
  kind: PickKind;
  x: number;
  y: number;
  value: number;
  life: number;
  cls?: ClassId;
}

export type WorldEvent =
  | { kind: 'sfx'; name: string }
  | { kind: 'num'; x: number; y: number; text: string; color: string }
  | { kind: 'burst'; x: number; y: number; color: string; n: number }
  | { kind: 'ring'; x: number; y: number; r: number; color: string }
  | { kind: 'beam'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { kind: 'slash'; x: number; y: number; color: string }
  | { kind: 'shake'; amt: number }
  | { kind: 'toast'; text: string };

interface SpawnEntry {
  t: number;
  kind: string;
}

const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const manh = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);
const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

export class World {
  readonly wave: number;
  readonly stage: number;
  readonly boss: boolean;
  readonly rocks = new Uint8Array(GRID_W * GRID_H);
  heroes: Hero[] = [];
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  pickups: Pickup[] = [];
  events: WorldEvent[] = [];
  fallen: ClassId[] = [];
  recruits: ClassId[] = [];

  level: number;
  xp: number;
  coins: number;
  kills: number;
  gems: number;
  waveKills = 0;
  crashes = 0;
  levelUps = 0;

  heading: Dir = 0;
  queued: Dir | null = null;
  moveT: number = BAL.move;
  moveI: number = BAL.move;
  /** The line stands still while this runs: at the start and after a crash. */
  pauseT = 2.5;
  moves = 0;
  time = 0;
  done: 'clear' | 'dead' | null = null;
  bossId = -1;
  syn: SynergyTiers = {};
  /** BFS steps from every cell to the nearest hero. */
  dist = new Int16Array(GRID_W * GRID_H);

  private rng: Rng;
  private plan: SpawnEntry[] = [];
  private planIdx = 0;
  private nextId = 1;
  private hpMul: number;
  private dmgMul: number;
  private cageAt = -1;
  private unlocked: ClassId[];

  constructor(carry: Carry, wave: number, seed: string, unlocked: ClassId[]) {
    this.wave = wave;
    this.stage = stageOf(wave);
    this.boss = isBossWave(wave);
    this.rng = new Rng(hash(seed, 'wave', wave));
    this.level = carry.level;
    this.xp = carry.xp;
    this.coins = carry.coins;
    this.kills = carry.kills;
    this.gems = carry.gems;
    this.unlocked = unlocked;
    this.hpMul = 1 + BAL.hpGrow * (wave - 1);
    this.dmgMul = 1 + BAL.dmgGrow * (wave - 1);
    this.makeRocks();
    carry.heroes.forEach((h, i) => {
      const x = 8 - i;
      this.heroes.push({ id: this.nextId++, cls: h.cls, stars: h.stars, hp: h.hp, s: heroStats(h.cls, h.stars, 1, {}), x, y: 9, px: x, py: 9, cd: 0.4 + i * 0.05, flash: 0 });
    });
    this.restat(false);
    this.makePlan();
    this.calcDist();
  }

  // ---------- Setup ----------

  private makeRocks(): void {
    const st = STAGES[this.stage];
    for (let attempt = 0; attempt < 30; attempt++) {
      this.rocks.fill(0);
      const clusters = st.rocks + (this.boss ? -1 : this.rng.int(0, 1));
      for (let c = 0; c < clusters; c++) {
        let x = this.rng.int(2, GRID_W - 3);
        let y = this.rng.int(2, GRID_H - 3);
        const len = this.rng.int(2, 4);
        for (let k = 0; k < len; k++) {
          if (!(x <= 13 && y >= 7 && y <= 11) && inside(x, y)) this.rocks[y * GRID_W + x] = 1;
          if (this.rng.chance(0.5)) x += this.rng.pick([-1, 1]);
          else y += this.rng.pick([-1, 1]);
          x = Math.max(1, Math.min(GRID_W - 2, x));
          y = Math.max(1, Math.min(GRID_H - 2, y));
        }
      }
      if (this.connected()) return;
    }
    this.rocks.fill(0);
  }

  private connected(): boolean {
    let free = 0;
    for (let i = 0; i < this.rocks.length; i++) if (!this.rocks[i]) free++;
    const seen = new Uint8Array(this.rocks.length);
    const q = [9 * GRID_W + 8];
    seen[q[0]] = 1;
    let n = 0;
    while (q.length) {
      const c = q.pop()!;
      n++;
      const x = c % GRID_W;
      const y = (c - x) / GRID_W;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (!inside(nx, ny)) continue;
        const k = ny * GRID_W + nx;
        if (seen[k] || this.rocks[k]) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    return n === free;
  }

  private makePlan(): void {
    const st = STAGES[this.stage];
    const local = (this.wave - 1) % 5;
    let t = 1.2;
    if (this.boss) {
      this.plan.push({ t: 1.5, kind: st.boss });
      const adds = 3 + this.stage * 2;
      for (let i = 0; i < adds; i++) this.plan.push({ t: 6 + i * (22 / adds), kind: this.rng.weighted(st.pool) });
    } else {
      const count = Math.round(BAL.count + BAL.countPer * this.wave);
      let left = count;
      while (left > 0) {
        const g = Math.min(left, this.rng.int(1, 2 + Math.floor(local / 2)));
        for (let i = 0; i < g; i++) this.plan.push({ t: t + i * 0.25, kind: this.rng.weighted(st.pool) });
        left -= g;
        t += this.rng.next() * 1.4 + 2.2 - this.stage * 0.2;
      }
      if (this.rng.chance(BAL.cage) && this.wave > 1) this.cageAt = 4 + this.rng.next() * Math.max(4, t * 0.6);
    }
    this.plan.sort((a, b) => a.t - b.t);
  }

  /** Recomputes stats after a change of party, level or stars. Max HP gains also heal. */
  restat(heal = true): void {
    this.syn = synergyTiers(this.heroes.map((h) => h.cls));
    for (const h of this.heroes) {
      const old = h.s.maxHp;
      h.s = heroStats(h.cls, h.stars, this.level, this.syn);
      if (heal && h.s.maxHp > old) h.hp += h.s.maxHp - old;
      h.hp = Math.min(h.hp, h.s.maxHp);
    }
  }

  // ---------- Queries ----------

  isRock(x: number, y: number): boolean {
    return !inside(x, y) || this.rocks[y * GRID_W + x] === 1;
  }

  enemyAt(x: number, y: number, except?: Enemy): Enemy | undefined {
    return this.enemies.find((e) => e !== except && e.x === x && e.y === y);
  }

  heroAt(x: number, y: number): Hero | undefined {
    return this.heroes.find((h) => h.x === x && h.y === y);
  }

  get leader(): Hero | undefined {
    return this.heroes[0];
  }

  /** Progress (0..1) of the line between its last cell and the current cell. */
  partyAlpha(): number {
    if (this.pauseT > 0) return 1;
    return Math.max(0, Math.min(1, 1 - this.moveT / this.moveI));
  }

  remaining(): number {
    return this.plan.length - this.planIdx + this.enemies.length;
  }

  // ---------- Input ----------

  /** Queues one turn for the leader. A reverse turn is ignored. */
  queue(d: Dir): void {
    // The first turn of a wave starts the march at once.
    if (this.moves === 0 && this.crashes === 0 && this.pauseT > 0) {
      this.queued = d;
      this.pauseT = 0.001;
      return;
    }
    if (this.heroes.length > 1 && d === opposite(this.heading) && this.queued === null) return;
    if (d === this.heading && this.queued === null) return;
    this.queued = d;
  }

  // ---------- Step ----------

  step(): void {
    if (this.done) return;
    this.time += DT;
    this.spawnTick();
    this.partyTick();
    if (this.done) return;
    this.calcDist();
    this.heroAttacks();
    this.enemyTick();
    this.shotTick();
    this.pickupTick();
    for (const h of this.heroes) h.flash = Math.max(0, h.flash - DT);
    if (!this.done && this.planIdx >= this.plan.length && this.enemies.length === 0) this.clearWave();
  }

  private spawnTick(): void {
    while (this.planIdx < this.plan.length && this.plan[this.planIdx].t <= this.time) {
      const kind = this.plan[this.planIdx++].kind;
      this.spawn(kind);
    }
    if (this.cageAt > 0 && this.time >= this.cageAt) {
      this.cageAt = -1;
      if (this.heroes.length < MAX_PARTY) {
        const c = this.freeCell(5);
        if (c) {
          const cls = this.rng.pick(this.unlocked);
          this.pickups.push({ id: this.nextId++, kind: 'cage', x: c[0], y: c[1], value: 0, life: 22, cls });
          this.events.push({ kind: 'toast', text: `🔒 A captive ${CLASSES[cls].name} waits. Run over the cage to free it.` });
        }
      }
    }
  }

  /** A random free cell at least `minDist` steps from every hero. */
  private freeCell(minDist: number, edge = false): [number, number] | null {
    for (let k = 0; k < 80; k++) {
      let x: number;
      let y: number;
      if (edge) {
        const side = this.rng.int(0, 3);
        const p = this.rng.int(0, (side % 2 === 0 ? GRID_H : GRID_W) - 1);
        x = side === 0 ? 0 : side === 2 ? GRID_W - 1 : p;
        y = side === 1 ? 0 : side === 3 ? GRID_H - 1 : p;
      } else {
        x = this.rng.int(0, GRID_W - 1);
        y = this.rng.int(0, GRID_H - 1);
      }
      if (this.isRock(x, y) || this.enemyAt(x, y) || this.pickups.some((p) => p.x === x && p.y === y)) continue;
      if (this.heroes.some((h) => manh(h.x, h.y, x, y) < minDist)) continue;
      return [x, y];
    }
    return null;
  }

  spawn(kind: string, at?: [number, number], instant = false): Enemy | null {
    const def = ENEMIES[kind];
    const c = at ?? this.freeCell(def.boss ? 7 : 6, !def.boss && this.rng.chance(0.6)) ?? this.freeCell(3);
    if (!c) return null;
    const hp = def.hp * this.hpMul * (def.boss ? BAL.bossHp : 1);
    const e: Enemy = {
      id: this.nextId++,
      def,
      x: c[0],
      y: c[1],
      px: c[0],
      py: c[1],
      hp,
      maxHp: hp,
      dmg: Math.round(def.dmg * this.dmgMul),
      moveT: def.speed,
      moveI: def.speed,
      atkT: 0.5,
      shootT: 1 + this.rng.next() * 1.5,
      specialT: 3,
      summonT: 6,
      slowT: 0,
      state: instant ? 'walk' : 'spawn',
      timer: def.boss ? 1.4 : 0.9,
      dx: 0,
      dy: 0,
      hit: [],
      flash: 0,
    };
    this.enemies.push(e);
    if (def.boss) {
      this.bossId = e.id;
      this.events.push({ kind: 'sfx', name: 'boss' }, { kind: 'shake', amt: 6 });
    } else if (!instant) this.events.push({ kind: 'sfx', name: 'spawn' });
    return e;
  }

  // ---------- Party ----------

  private partyTick(): void {
    if (this.pauseT > 0) {
      this.pauseT -= DT;
      if (this.pauseT <= 0) {
        if (this.queued === null) this.heading = this.bestDir();
        this.moveT = 0;
      }
      return;
    }
    this.moveT -= DT;
    if (this.moveT > 0) return;
    this.moveT += BAL.move;
    this.moveI = BAL.move;
    this.moveParty();
  }

  /** Free-space score of each direction from the leader. Used after a crash and by the bot. */
  bestDir(): Dir {
    const h = this.heroes[0];
    let best: Dir = this.heading;
    let bestScore = -Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = h.x + DX[d];
      const ny = h.y + DY[d];
      if (this.isRock(nx, ny) || this.bodyAt(nx, ny)) continue;
      let run = 0;
      for (let k = 1; k <= 6; k++) {
        if (this.isRock(h.x + DX[d] * k, h.y + DY[d] * k) || this.bodyAt(h.x + DX[d] * k, h.y + DY[d] * k)) break;
        run++;
      }
      const s = run * 3 + (d === this.heading ? 1 : 0);
      if (s > bestScore) {
        bestScore = s;
        best = d as Dir;
      }
    }
    return best;
  }

  /** True if a hero other than the leader and the tail stands there. */
  bodyAt(x: number, y: number): boolean {
    const n = this.heroes.length;
    for (let i = 1; i < n - 1; i++) if (this.heroes[i].x === x && this.heroes[i].y === y) return true;
    return false;
  }

  private moveParty(): void {
    if (this.queued !== null) {
      if (this.heroes.length === 1 || this.queued !== opposite(this.heading)) {
        if (this.queued !== this.heading) this.events.push({ kind: 'sfx', name: 'turn' });
        this.heading = this.queued;
      }
      this.queued = null;
    }
    const h = this.heroes[0];
    const nx = h.x + DX[this.heading];
    const ny = h.y + DY[this.heading];
    if (this.isRock(nx, ny)) {
      this.crash(inside(nx, ny) ? 'hit a rock' : 'hit the wall');
      return;
    }
    if (this.bodyAt(nx, ny)) {
      this.crash('ran into the line');
      return;
    }
    this.moves++;
    for (let i = this.heroes.length - 1; i >= 0; i--) {
      const a = this.heroes[i];
      a.px = a.x;
      a.py = a.y;
      if (i > 0) {
        a.x = this.heroes[i - 1].x;
        a.y = this.heroes[i - 1].y;
      }
    }
    h.x = nx;
    h.y = ny;
    // Ram: the leader shoves through an enemy and hits it.
    const e = this.enemyAt(nx, ny);
    if (e && e.state !== 'spawn') this.hurtEnemy(e, Math.max(1, h.s.dmg * 0.5), false);
    this.collect();
  }

  private crash(why: string): void {
    const h = this.heroes.shift()!;
    this.crashes++;
    this.fallen.push(h.cls);
    this.events.push(
      { kind: 'sfx', name: 'crash' },
      { kind: 'shake', amt: 8 },
      { kind: 'burst', x: h.x + 0.5, y: h.y + 0.5, color: CLASSES[h.cls].color, n: 18 },
      { kind: 'num', x: h.x + 0.5, y: h.y, text: 'CRASH!', color: '#ff5a5a' },
      { kind: 'toast', text: `💥 The ${CLASSES[h.cls].name} ${why}.` },
    );
    if (!this.heroes.length) {
      this.done = 'dead';
      return;
    }
    for (const a of this.heroes) {
      a.px = a.x;
      a.py = a.y;
    }
    // Point the heading from the second hero to the new leader, so a reverse is impossible.
    const nl = this.heroes[0];
    if (this.heroes.length > 1) {
      const b = this.heroes[1];
      const d = [0, 1, 2, 3].find((k) => b.x + DX[k] === nl.x && b.y + DY[k] === nl.y);
      if (d !== undefined) this.heading = d as Dir;
    }
    this.queued = null;
    this.pauseT = 0.9;
    this.restat(false);
  }

  private killHero(h: Hero): void {
    const i = this.heroes.indexOf(h);
    if (i < 0) return;
    this.fallen.push(h.cls);
    this.events.push(
      { kind: 'sfx', name: 'crash' },
      { kind: 'burst', x: h.x + 0.5, y: h.y + 0.5, color: CLASSES[h.cls].color, n: 14 },
      { kind: 'toast', text: `☠️ The ${CLASSES[h.cls].name} fell.` },
    );
    // Heroes behind it close the gap.
    for (let j = this.heroes.length - 1; j > i; j--) {
      const a = this.heroes[j];
      a.px = a.x;
      a.py = a.y;
      a.x = this.heroes[j - 1].x;
      a.y = this.heroes[j - 1].y;
    }
    this.heroes.splice(i, 1);
    if (!this.heroes.length) {
      this.done = 'dead';
      return;
    }
    if (i === 0) {
      const nl = this.heroes[0];
      if (this.heroes.length > 1) {
        const b = this.heroes[1];
        const d = [0, 1, 2, 3].find((k) => b.x + DX[k] === nl.x && b.y + DY[k] === nl.y);
        if (d !== undefined && this.queued === null) this.heading = d as Dir;
      }
    }
    this.restat(false);
  }

  hurtHero(h: Hero, dmg: number): void {
    const red = this.syn.knight ?? 0;
    const d = Math.max(1, Math.round(dmg) - red);
    h.hp -= d;
    h.flash = 0.25;
    this.events.push({ kind: 'num', x: h.x + 0.5, y: h.y, text: `-${d}`, color: '#ff6b6b' }, { kind: 'sfx', name: 'hurt' });
    if (h.hp <= 0) this.killHero(h);
  }

  private collect(): void {
    const h = this.heroes[0];
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const r = p.kind === 'cage' || p.kind === 'food' ? 0 : 1;
      if (cheb(p.x, p.y, h.x, h.y) > r) continue;
      this.pickups.splice(i, 1);
      this.take(p);
    }
  }

  private take(p: Pickup): void {
    const x = p.x + 0.5;
    const y = p.y + 0.5;
    switch (p.kind) {
      case 'gem':
        this.gems += p.value;
        this.addXp(p.value);
        this.events.push({ kind: 'sfx', name: 'gem' }, { kind: 'num', x, y, text: `+${p.value}💎`, color: '#7fe3ff' });
        break;
      case 'coin':
        this.coins += p.value;
        this.events.push({ kind: 'sfx', name: 'coin' }, { kind: 'num', x, y, text: `+${p.value}🪙`, color: '#ffd166' });
        break;
      case 'food':
        for (const a of this.heroes) a.hp = Math.min(a.s.maxHp, a.hp + Math.ceil(a.s.maxHp * 0.35));
        this.events.push({ kind: 'sfx', name: 'heal' }, { kind: 'num', x, y, text: 'Feast!', color: '#7ee08a' });
        break;
      case 'cage': {
        const cls = p.cls!;
        if (this.heroes.length >= MAX_PARTY) {
          this.coins += 10;
          break;
        }
        const t = this.heroes[this.heroes.length - 1];
        const s = heroStats(cls, 0, this.level, this.syn);
        this.heroes.push({ id: this.nextId++, cls, stars: 0, hp: s.maxHp, s, x: t.x, y: t.y, px: t.x, py: t.y, cd: 0.5, flash: 0 });
        this.recruits.push(cls);
        this.restat(false);
        this.events.push({ kind: 'sfx', name: 'recruit' }, { kind: 'num', x, y, text: `${CLASSES[cls].icon} joins!`, color: '#ffd166' }, { kind: 'ring', x, y, r: 2, color: '#ffd166' });
        break;
      }
    }
  }

  addXp(v: number): void {
    this.xp += v;
    while (this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      this.levelUps++;
      this.restat(true);
      for (const a of this.heroes) a.hp = Math.min(a.s.maxHp, a.hp + Math.ceil(a.s.maxHp * 0.25));
      const l = this.heroes[0];
      if (l) this.events.push({ kind: 'ring', x: l.x + 0.5, y: l.y + 0.5, r: 3, color: '#7fe3ff' });
      this.events.push({ kind: 'sfx', name: 'level' }, { kind: 'toast', text: `⬆️ Party level ${this.level}! All heroes get stronger.` });
    }
  }

  // ---------- Hero attacks ----------

  private nearestEnemy(x: number, y: number, range: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.state === 'spawn') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= range + 0.01 && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private heroAttacks(): void {
    for (const h of [...this.heroes]) {
      if (!this.heroes.includes(h)) continue;
      h.cd -= DT;
      if (h.cd > 0) continue;
      const d = CLASSES[h.cls];
      const cx = h.x + 0.5;
      const cy = h.y + 0.5;
      switch (d.pattern) {
        case 'melee': {
          const list = this.enemies.filter((e) => e.state !== 'spawn' && cheb(e.x, e.y, h.x, h.y) <= 1).sort((a, b) => a.hp - b.hp);
          if (!list.length) {
            h.cd = 0;
            break;
          }
          const n = h.cls === 'knight' ? 2 : 1;
          for (const e of list.slice(0, n)) {
            const crit = this.rng.chance(h.s.crit);
            this.events.push({ kind: 'slash', x: e.x + 0.5, y: e.y + 0.5, color: d.color });
            this.hurtEnemy(e, h.s.dmg * (crit ? 2 : 1), crit);
          }
          this.events.push({ kind: 'sfx', name: 'slash' });
          h.cd = h.s.cd;
          break;
        }
        case 'shot':
        case 'blast': {
          const e = this.nearestEnemy(h.x, h.y, h.s.range);
          if (!e) {
            h.cd = 0;
            break;
          }
          const kind = h.cls === 'archer' ? 'arrow' : h.cls === 'frost' ? 'ice' : h.cls === 'bomber' ? 'bomb' : 'orb';
          this.shots.push({ x: cx, y: cy, vx: 0, vy: 0, speed: kind === 'bomb' ? 9 : 14, dmg: h.s.dmg, enemy: false, target: e.id, area: h.s.area, slow: h.s.slow, crit: false, life: 1.5, kind });
          this.events.push({ kind: 'sfx', name: kind === 'arrow' ? 'arrow' : kind === 'ice' ? 'frost' : 'magic' });
          h.cd = h.s.cd;
          break;
        }
        case 'heal': {
          let low: Hero | undefined;
          let lr = 1;
          for (const a of this.heroes) {
            const r = a.hp / a.s.maxHp;
            if (r < lr - 0.001) {
              lr = r;
              low = a;
            }
          }
          if (low) {
            const amt = Math.min(h.s.heal, low.s.maxHp - low.hp);
            low.hp += amt;
            this.events.push(
              { kind: 'beam', x1: cx, y1: cy, x2: low.x + 0.5, y2: low.y + 0.5, color: '#ffd166' },
              { kind: 'num', x: low.x + 0.5, y: low.y, text: `+${amt}`, color: '#7ee08a' },
              { kind: 'sfx', name: 'heal' },
            );
            if ((this.syn.cleric ?? 0) >= 2) for (const a of this.heroes) a.hp = Math.min(a.s.maxHp, a.hp + 1);
            h.cd = h.s.cd;
            break;
          }
          const e = this.nearestEnemy(h.x, h.y, h.s.range);
          if (!e) {
            h.cd = 0;
            break;
          }
          this.events.push({ kind: 'beam', x1: cx, y1: cy, x2: e.x + 0.5, y2: e.y + 0.5, color: '#fff3b0' });
          this.hurtEnemy(e, h.s.dmg, false);
          h.cd = h.s.cd;
          break;
        }
      }
    }
  }

  hurtEnemy(e: Enemy, dmg: number, crit: boolean): void {
    if (!this.enemies.includes(e)) return;
    e.hp -= dmg;
    e.flash = 0.12;
    this.events.push({ kind: 'num', x: e.x + 0.5, y: e.y, text: `${crit ? '💥' : ''}${Math.max(1, Math.round(dmg))}`, color: crit ? '#ffd166' : '#ffffff' });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    this.kills++;
    this.waveKills++;
    this.events.push({ kind: 'burst', x: e.x + 0.5, y: e.y + 0.5, color: e.def.color, n: e.def.boss ? 40 : 10 }, { kind: 'sfx', name: e.def.boss ? 'boom' : 'kill' });
    if (e.def.boss) {
      this.events.push({ kind: 'shake', amt: 10 });
      for (let k = 0; k < 6; k++) this.drop('gem', e.x + this.rng.int(-1, 1), e.y + this.rng.int(-1, 1), Math.ceil(e.def.xp / 6));
      this.drop('coin', e.x, e.y, 15 + this.stage * 5);
    } else {
      this.drop('gem', e.x, e.y, e.def.xp);
      if (this.rng.chance(0.22)) this.drop('coin', e.x, e.y, this.rng.int(1, 2 + this.stage));
      if (this.rng.chance(0.035)) this.drop('food', e.x, e.y, 1);
    }
    if (e.def.split) {
      for (let k = 0; k < e.def.split; k++) {
        const c = this.adjFree(e.x, e.y);
        if (c) this.spawn('slime', c, true);
      }
    }
  }

  private drop(kind: PickKind, x: number, y: number, value: number): void {
    x = Math.max(0, Math.min(GRID_W - 1, x));
    y = Math.max(0, Math.min(GRID_H - 1, y));
    if (this.isRock(x, y)) {
      const c = this.adjFree(x, y);
      if (!c) return;
      [x, y] = c;
    }
    const same = this.pickups.find((p) => p.kind === kind && p.x === x && p.y === y);
    if (same) {
      same.value += value;
      same.life = 14;
      return;
    }
    this.pickups.push({ id: this.nextId++, kind, x, y, value, life: kind === 'food' ? 12 : 14 });
  }

  private adjFree(x: number, y: number): [number, number] | null {
    const opts: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && !this.isRock(nx, ny) && !this.enemyAt(nx, ny) && !this.heroAt(nx, ny)) opts.push([nx, ny]);
      }
    return opts.length ? this.rng.pick(opts) : null;
  }

  // ---------- Enemies ----------

  private calcDist(): void {
    const D = this.dist;
    D.fill(999);
    const q: number[] = [];
    for (const h of this.heroes) {
      const k = h.y * GRID_W + h.x;
      if (D[k] !== 0) {
        D[k] = 0;
        q.push(k);
      }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const x = c % GRID_W;
      const y = (c - x) / GRID_W;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (!inside(nx, ny)) continue;
        const k = ny * GRID_W + nx;
        if (this.rocks[k] || D[k] <= D[c] + 1) continue;
        D[k] = D[c] + 1;
        q.push(k);
      }
    }
  }

  private nearestHero(x: number, y: number): Hero | undefined {
    let best: Hero | undefined;
    let bd = Infinity;
    for (const h of this.heroes) {
      const d = manh(h.x, h.y, x, y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  private canStep(e: Enemy, x: number, y: number): boolean {
    if (!inside(x, y)) return false;
    if (e.def.brain !== 'ghost' && this.rocks[y * GRID_W + x]) return false;
    if (this.enemyAt(x, y, e)) return false;
    if (this.heroAt(x, y)) return false;
    return true;
  }

  /** Moves one cell. `sign` 1 goes closer to the heroes, -1 goes away. */
  private stepEnemy(e: Enemy, sign: 1 | -1): void {
    let best: number[] = [];
    let bs = Infinity;
    const h = this.nearestHero(e.x, e.y);
    for (let d = 0; d < 4; d++) {
      const nx = e.x + DX[d];
      const ny = e.y + DY[d];
      if (!this.canStep(e, nx, ny)) continue;
      let v: number;
      if (e.def.brain === 'ghost' || this.rocks[ny * GRID_W + nx]) v = h ? manh(nx, ny, h.x, h.y) : 0;
      else v = this.dist[ny * GRID_W + nx];
      v *= sign;
      if (v < bs) {
        bs = v;
        best = [d];
      } else if (v === bs) best.push(d);
    }
    const cur = (e.def.brain === 'ghost' ? (h ? manh(e.x, e.y, h.x, h.y) : 0) : this.dist[e.y * GRID_W + e.x]) * sign;
    if (!best.length || bs > cur) return;
    const d = this.rng.pick(best);
    e.x += DX[d];
    e.y += DY[d];
  }

  private randomStep(e: Enemy): void {
    const d = this.rng.int(0, 3);
    if (this.canStep(e, e.x + DX[d], e.y + DY[d])) {
      e.x += DX[d];
      e.y += DY[d];
    }
  }

  private enemyTick(): void {
    for (const e of [...this.enemies]) {
      if (!this.enemies.includes(e)) continue;
      e.flash = Math.max(0, e.flash - DT);
      if (e.state === 'spawn') {
        e.timer -= DT;
        if (e.timer <= 0) e.state = 'walk';
        continue;
      }
      if (!this.heroes.length) return;
      const slowed = e.slowT > 0;
      e.slowT -= DT;
      const tick = slowed ? DT * (e.def.boss ? 0.7 : 0.5) : DT;
      e.atkT -= tick;
      const boss = !!e.def.boss;
      // Contact damage.
      if (e.atkT <= 0 && e.state !== 'charge' && e.state !== 'wind') {
        const target = this.heroes.find((h) => (boss ? cheb(h.x, h.y, e.x, e.y) <= 1 : manh(h.x, h.y, e.x, e.y) <= 1));
        if (target) {
          this.hurtHero(target, e.dmg);
          e.atkT = BAL.contactCd;
          if (!this.heroes.length) return;
        }
      }
      if (boss) this.bossSpecial(e, tick);
      if (e.def.brain === 'ranged') this.rangedShoot(e, tick);
      if (e.def.brain === 'charger') {
        if (this.chargerTick(e, tick)) continue;
      }
      e.moveT -= tick;
      if (e.moveT > 0) continue;
      e.moveT = e.def.speed;
      e.moveI = e.def.speed / (slowed ? 0.5 : 1);
      e.px = e.x;
      e.py = e.y;
      const h = this.nearestHero(e.x, e.y);
      const d = h ? manh(h.x, h.y, e.x, e.y) : 99;
      if (!boss && d <= 1) continue;
      if (boss && h && cheb(h.x, h.y, e.x, e.y) <= 1) continue;
      switch (e.def.brain) {
        case 'erratic':
          if (this.rng.chance(0.45)) this.randomStep(e);
          else this.stepEnemy(e, 1);
          break;
        case 'ranged':
          if (d < 3) this.stepEnemy(e, -1);
          else if (d > 5) this.stepEnemy(e, 1);
          else if (this.rng.chance(0.3)) this.randomStep(e);
          break;
        default:
          this.stepEnemy(e, 1);
      }
    }
  }

  private rangedShoot(e: Enemy, tick: number): void {
    e.shootT -= tick;
    if (e.shootT > 0) return;
    const h = this.nearestHero(e.x, e.y);
    if (!h) return;
    const dist = Math.hypot(h.x - e.x, h.y - e.y);
    if (dist > 6.5) {
      e.shootT = 0.3;
      return;
    }
    e.shootT = e.def.boss ? 1.6 : 2.4 + this.rng.next() * 0.6;
    this.enemyShot(e, h.x + 0.5, h.y + 0.5, e.def.id === 'imp' ? 'fire' : 'bolt', e.dmg);
  }

  private enemyShot(e: Enemy, tx: number, ty: number, kind: 'bolt' | 'fire', dmg: number, angle = 0): void {
    const sx = e.x + 0.5;
    const sy = e.y + 0.5;
    let a = Math.atan2(ty - sy, tx - sx) + angle;
    if (!isFinite(a)) a = 0;
    const speed = kind === 'fire' ? 5.5 : 6.5;
    this.shots.push({ x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed, dmg, enemy: true, target: -1, area: 0, slow: 0, crit: false, life: 3, kind });
    this.events.push({ kind: 'sfx', name: 'enemyShot' });
  }

  /** Returns true when the charger used its turn (wind-up, charge, stun). */
  private chargerTick(e: Enemy, tick: number): boolean {
    if (e.state === 'wind') {
      e.timer -= tick;
      if (e.timer <= 0) {
        e.state = 'charge';
        e.moveT = 0;
        e.hit = [];
      }
      return true;
    }
    if (e.state === 'stun') {
      e.timer -= tick;
      if (e.timer <= 0) e.state = 'walk';
      return true;
    }
    if (e.state === 'charge') {
      e.moveT -= tick;
      if (e.moveT > 0) return true;
      e.moveT = e.def.boss ? 0.08 : 0.075;
      e.moveI = e.moveT;
      e.px = e.x;
      e.py = e.y;
      const nx = e.x + e.dx;
      const ny = e.y + e.dy;
      if (this.isRock(nx, ny) || this.enemyAt(nx, ny, e)) {
        e.state = 'stun';
        e.timer = e.def.boss ? 1.6 : 1.3;
        e.atkT = 0.4;
        this.events.push({ kind: 'shake', amt: e.def.boss ? 6 : 3 }, { kind: 'burst', x: nx + 0.5, y: ny + 0.5, color: '#bbb', n: 6 });
        return true;
      }
      e.x = nx;
      e.y = ny;
      for (const h of [...this.heroes]) {
        if (manh(h.x, h.y, e.x, e.y) <= (e.def.boss ? 1 : 0) && !e.hit.includes(h.id)) {
          e.hit.push(h.id);
          this.hurtHero(h, e.dmg + 1);
        }
      }
      return true;
    }
    // Walking: look along the rows and columns for a hero.
    e.specialT -= tick;
    if (e.specialT <= 0) {
      for (let d = 0; d < 4; d++) {
        for (let k = 1; k <= 7; k++) {
          const x = e.x + DX[d] * k;
          const y = e.y + DY[d] * k;
          if (this.isRock(x, y)) break;
          if (this.heroAt(x, y)) {
            e.state = 'wind';
            e.timer = e.def.boss ? 0.45 : 0.6;
            e.dx = DX[d];
            e.dy = DY[d];
            e.specialT = e.def.boss ? 2.5 : 3;
            this.events.push({ kind: 'sfx', name: 'charge' });
            return true;
          }
        }
      }
    }
    return false;
  }

  private bossSpecial(e: Enemy, tick: number): void {
    e.summonT -= tick;
    const id = e.def.id;
    if (id === 'king' && e.summonT <= 0) {
      e.summonT = 4.5;
      if (this.enemies.length < 24) for (let k = 0; k < 2; k++) {
        const c = this.adjFree(e.x, e.y);
        if (c) this.spawn('slime', c, true);
      }
    }
    if (id === 'lord') {
      if (e.summonT <= 0) {
        e.summonT = 8;
        if (this.enemies.length < 20) for (let k = 0; k < 2; k++) this.spawn('archer');
      }
      e.specialT -= tick;
      if (e.specialT <= 0) {
        e.specialT = 3.6;
        const off = this.rng.next() * Math.PI;
        for (let k = 0; k < 8; k++) this.enemyShot(e, e.x + 0.5 + Math.cos(off + (k * Math.PI) / 4), e.y + 0.5 + Math.sin(off + (k * Math.PI) / 4), 'bolt', e.dmg - 1);
        this.events.push({ kind: 'ring', x: e.x + 0.5, y: e.y + 0.5, r: 1.5, color: '#e9e4d4' });
      }
    }
    if (id === 'drake' && e.summonT <= 0 && e.state === 'walk') {
      e.summonT = 3.4;
      const h = this.nearestHero(e.x, e.y);
      if (h) for (const a of [-0.35, 0, 0.35]) this.enemyShot(e, h.x + 0.5, h.y + 0.5, 'fire', e.dmg - 1, a);
    }
  }

  // ---------- Shots ----------

  private shotTick(): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= DT;
      if (s.enemy) {
        s.x += s.vx * DT;
        s.y += s.vy * DT;
        const cx = Math.floor(s.x);
        const cy = Math.floor(s.y);
        if (s.life <= 0 || this.isRock(cx, cy)) {
          this.shots.splice(i, 1);
          continue;
        }
        const h = this.heroes.find((a) => Math.hypot(a.x + 0.5 - s.x, a.y + 0.5 - s.y) < 0.5);
        if (h) {
          this.shots.splice(i, 1);
          this.hurtHero(h, s.dmg);
          this.events.push({ kind: 'burst', x: s.x, y: s.y, color: s.kind === 'fire' ? '#ff8c42' : '#e9e4d4', n: 5 });
          if (!this.heroes.length) return;
        }
        continue;
      }
      const t = this.enemies.find((e) => e.id === s.target);
      if (!t || s.life <= 0) {
        this.shots.splice(i, 1);
        continue;
      }
      const tx = t.x + 0.5;
      const ty = t.y + 0.5;
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy);
      const stepLen = s.speed * DT;
      if (d <= Math.max(0.35, stepLen)) {
        this.shots.splice(i, 1);
        this.shotHit(s, t);
        continue;
      }
      s.vx = (dx / d) * s.speed;
      s.vy = (dy / d) * s.speed;
      s.x += s.vx * DT;
      s.y += s.vy * DT;
    }
  }

  private shotHit(s: Shot, t: Enemy): void {
    if (s.area > 0) {
      const cx = t.x;
      const cy = t.y;
      this.events.push({ kind: 'ring', x: cx + 0.5, y: cy + 0.5, r: s.area, color: s.kind === 'bomb' ? '#ff8c42' : s.kind === 'ice' ? '#5ad1e8' : '#b04cff' });
      if (s.kind === 'bomb') this.events.push({ kind: 'sfx', name: 'boom' }, { kind: 'shake', amt: 2 });
      for (const e of [...this.enemies]) {
        if (e.state === 'spawn' || cheb(e.x, e.y, cx, cy) > 1) continue;
        if (s.slow) e.slowT = Math.max(e.slowT, s.slow);
        this.hurtEnemy(e, s.dmg, false);
      }
      return;
    }
    if (s.slow) t.slowT = Math.max(t.slowT, s.slow);
    this.hurtEnemy(t, s.dmg, false);
  }

  // ---------- Pickups ----------

  private pickupTick(): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= DT;
      if (p.life <= 0) this.pickups.splice(i, 1);
    }
  }

  private clearWave(): void {
    // The leftover gems and coins fly to the party.
    for (const p of [...this.pickups]) if (p.kind === 'gem' || p.kind === 'coin') this.take(p);
    this.pickups = [];
    this.done = 'clear';
    this.events.push({ kind: 'sfx', name: 'wave' });
  }

  /** The party as save data. */
  carry(): Carry {
    return {
      heroes: this.heroes.map((h) => ({ cls: h.cls, hp: Math.max(1, Math.round(h.hp)), stars: h.stars })),
      level: this.level,
      xp: this.xp,
      coins: this.coins,
      kills: this.kills,
      gems: this.gems,
    };
  }
}
