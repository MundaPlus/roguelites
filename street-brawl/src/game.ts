/** Pure beat 'em up simulation. One call of `step` is one fixed 60 Hz frame. No DOM. */
import { DISTRICTS, ENEMIES, FIGHTERS, FOODS, SPECIALS, WEAPONS, WEAPON_IDS, type EMove, type EnemyDef, type FighterDef, type MoveDef } from './data';
import { Rng, hash } from './rng';

/** View size in world px. */
export const W = 480;
export const H = 270;
/** Screen y of the far edge of the street (z = 0). */
export const GY = 150;
/** Depth of the walkable street band. */
export const DEPTH = 96;
export const GRAV = 0.38;

export interface Input {
  mx: number;
  mz: number;
  light: boolean;
  heavy: boolean;
  jump: boolean;
  grab: boolean;
  sp1: boolean;
  sp2: boolean;
}

export const emptyInput = (): Input => ({ mx: 0, mz: 0, light: false, heavy: false, jump: false, grab: false, sp1: false, sp2: false });

type Act = 'light' | 'heavy' | 'jump' | 'grab' | 'sp1' | 'sp2';

export type ActState = 'idle' | 'attack' | 'jump' | 'hit' | 'air' | 'down' | 'getup' | 'grab' | 'throw' | 'held' | 'thrown' | 'dead';

export interface Actor {
  id: number;
  team: 'p' | 'e';
  kind: string;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  f: 1 | -1;
  hp: number;
  max: number;
  st: ActState;
  t: number;
  move: MoveDef | null;
  /** What kind of move runs: 'chain', 'heavy', 'launch', 'air', 'weapon', 'wthrow', 'special', 'enemy'. */
  mk: string;
  /** Target id -> frame of the last hit by the current move. */
  hits: Record<number, number>;
  stun: number;
  inv: number;
  flash: number;
  sq: number;
  juggle: number;
  launched: boolean;
  airAtk: boolean;
  holder: number;
  held: number;
  knees: number;
  weapon: { id: string; dur: number } | null;
  poise: number;
  size: number;
  dmgMul: number;
  boss: boolean;
  // Enemy AI
  token: boolean;
  tokenT: number;
  cd: number;
  side: 1 | -1;
  spot: number;
  plan: number;
  entering: boolean;
  summons: number;
  // Player
  hitCount: number;
  hitT: number;
  /** Throw damage carried by a thrown body. */
  carry: number;
  /** Frame when a dead actor is removed. */
  gone: number;
}

export interface Item {
  id: number;
  kind: 'weapon' | 'food' | 'cash';
  type: string;
  x: number;
  z: number;
  y: number;
  vx: number;
  vy: number;
  val: number;
  t: number;
}

export interface Prop {
  id: number;
  type: string;
  x: number;
  z: number;
  hp: number;
  drop: string;
  flash: number;
}

export interface Proj {
  id: number;
  team: 'p' | 'e';
  kind: 'knife' | 'bottle' | 'wave' | 'bullet' | 'weapon';
  icon: string;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  dmg: number;
  life: number;
  rot: number;
  weapon?: string;
  hit: number[];
}

export interface Particle {
  x: number;
  z: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'spark' | 'dust' | 'shard' | 'ring' | 'star';
}

export interface Float {
  x: number;
  z: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

export interface WaveSpec {
  at: number;
  list: string[];
  max: number;
  boss?: string;
}

export type StageKind = 'street' | 'alley' | 'boss';

export interface StageOpts {
  seed: number;
  district: number;
  kind: StageKind;
  name: string;
  fighter: string;
  hp: number;
  maxHp: number;
  perks: Record<string, number>;
  specials: string[];
  weapon: string | null;
  lives: number;
}

const SPIN_EVERY = 8;
/** Enemy HP and damage multipliers per district. */
const ENEMY_HP = [1, 1.28, 1.5, 2.15, 2.7];
const ENEMY_DMG = [1, 1.2, 1.32, 1.85, 2.2];

export class Game {
  readonly o: StageOpts;
  readonly fd: FighterDef;
  readonly rng: Rng;
  readonly length: number;
  readonly waves: WaveSpec[];
  readonly tokens: number;
  frame = 0;
  /** Simulated frames (without hit-stop). */
  tick = 0;
  p: Actor;
  enemies: Actor[] = [];
  items: Item[] = [];
  props: Prop[] = [];
  projs: Proj[] = [];
  parts: Particle[] = [];
  floats: Float[] = [];
  camX = 0;
  lock = false;
  lockX = 0;
  waveIdx = 0;
  active: { queue: string[]; max: number; spawnCd: number; boss?: string } | null = null;
  bossId = -1;
  freeze = 0;
  shake = 0;
  done: 'clear' | 'dead' | null = null;
  doneT = 0;
  ev: string[] = [];
  cash = 0;
  kills = 0;
  combo = 0;
  comboT = 0;
  maxCombo = 0;
  dmgTaken = 0;
  /** Damage taken by source, for balance checks. */
  hurtBy: Record<string, number> = {};
  cds: number[];
  lives: number;
  banner: { text: string; sub: string; t: number } | null = null;
  go = 0;
  private nextId = 1;
  private buf: Act | null = null;
  private bufT = 0;
  private chainIdx = 0;
  private chainUntil = 0;
  private chainLen = 0;
  private lightMoves: MoveDef[];
  private rangedCd = 0;
  private reviveT = 0;

  constructor(o: StageOpts) {
    this.o = o;
    this.fd = FIGHTERS[o.fighter];
    this.rng = new Rng(o.seed);
    this.lives = o.lives;
    const d = o.district;
    const light = this.fd.light.slice();
    if (this.perk('combo')) light.splice(light.length - 1, 0, light[0]);
    this.lightMoves = light;
    this.chainLen = light.length;
    this.cds = o.specials.map(() => 0);
    this.tokens = [1, 1, 2, 2, 3][d] ?? 3;

    // Stage layout
    const r = this.rng;
    const dist = DISTRICTS[d];
    const pick = (): string => r.weighted(dist.pool);
    const waves: WaveSpec[] = [];
    const nWaves = o.kind === 'boss' ? 2 : 3;
    const extra = o.kind === 'alley' ? 2 : 0;
    const maxAlive = Math.min(5, 3 + Math.floor(d / 2) + (o.kind === 'alley' ? 1 : 0));
    for (let i = 0; i < nWaves; i++) {
      const n = 2 + Math.floor(d * 0.5) + i + extra;
      const list: string[] = [];
      for (let k = 0; k < n; k++) list.push(o.kind === 'alley' && k === 0 && d > 0 ? 'heavy' : pick());
      waves.push({ at: 330 + i * 520, list, max: maxAlive });
    }
    if (o.kind === 'boss') {
      const adds: string[] = [];
      for (let k = 0; k < 1 + Math.floor(d / 2); k++) adds.push(pick());
      waves.push({ at: 330 + nWaves * 520, list: adds, max: 4, boss: dist.boss });
    }
    this.waves = waves;
    this.length = waves[waves.length - 1].at + (o.kind === 'boss' ? 300 : 520);

    // Breakable props and a weapon on the ground
    const nProps = 3 + r.int(0, 2) + (o.kind === 'alley' ? 2 : 0);
    for (let i = 0; i < nProps; i++) {
      const roll = r.next();
      const drop = roll < 0.45 ? r.pick(['apple', 'burger', 'burger', 'chicken']) : roll < 0.7 ? 'cash' : r.pick(WEAPON_IDS);
      this.props.push({ id: this.nextId++, type: r.pick(['crate', 'barrel', 'trash']), x: 220 + r.next() * (this.length - 400), z: r.pick([4, 10, 86, 92]), hp: 1, drop, flash: 0 });
    }
    const wx = 160 + r.next() * 300;
    this.items.push(this.mkItem('weapon', r.pick(['pipe', 'bottle', 'chair', 'bat']), wx, 20 + r.next() * 60));

    // Player
    this.p = this.mkActor('p', o.fighter, 60, 48, o.hp, o.maxHp, 1);
    if (o.weapon) this.p.weapon = { id: o.weapon, dur: this.weaponDur(o.weapon) };
    this.banner = { text: `${dist.icon} ${o.name}`, sub: o.kind === 'boss' ? 'Boss street' : o.kind === 'alley' ? 'Tough street: more enemies, more cash' : dist.name, t: 0 };
  }

  perk(id: string): number {
    return this.o.perks[id] ?? 0;
  }

  private weaponDur(id: string): number {
    return Math.round(WEAPONS[id].dur * (1 + 0.5 * this.perk('weapons')));
  }

  private mkActor(team: 'p' | 'e', kind: string, x: number, z: number, hp: number, max: number, size: number): Actor {
    return {
      id: this.nextId++,
      team,
      kind,
      x,
      z,
      y: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      f: 1,
      hp,
      max,
      st: 'idle',
      t: 0,
      move: null,
      mk: '',
      hits: {},
      stun: 0,
      inv: 0,
      flash: 0,
      sq: 0,
      juggle: 0,
      launched: false,
      airAtk: false,
      holder: -1,
      held: -1,
      knees: 0,
      weapon: null,
      poise: 0,
      size,
      dmgMul: 1,
      boss: false,
      token: false,
      tokenT: 0,
      cd: 30,
      side: 1,
      spot: 0,
      plan: -1,
      entering: false,
      summons: 0,
      hitCount: 0,
      hitT: 0,
      carry: 0,
      gone: 0,
    };
  }

  private mkItem(kind: Item['kind'], type: string, x: number, z: number, val = 0): Item {
    return { id: this.nextId++, kind, type, x, z, y: 0, vx: 0, vy: 0, val, t: 0 };
  }

  edef(a: Actor): EnemyDef {
    return ENEMIES[a.kind];
  }

  /** Enemies that still fight. */
  alive(): Actor[] {
    return this.enemies.filter((e) => e.hp > 0 && e.st !== 'dead');
  }

  boss(): Actor | null {
    return this.enemies.find((e) => e.id === this.bossId) ?? null;
  }

  // ---------- Main step ----------

  step(inp: Input): void {
    this.ev.length = 0;
    this.frame++;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.6);
    this.updateFx();
    if (this.freeze > 0) {
      this.freeze--;
      return;
    }
    this.tick++;
    if (this.banner) {
      this.banner.t++;
      if (this.banner.t > 150) this.banner = null;
    }
    if (this.go > 0) this.go--;
    if (this.rangedCd > 0) this.rangedCd--;
    for (let i = 0; i < this.cds.length; i++) if (this.cds[i] > 0) this.cds[i]--;

    this.updatePlayer(this.done ? emptyInput() : inp);
    for (const e of this.enemies) this.updateEnemy(e);
    this.physics(this.p);
    for (const e of this.enemies) this.physics(e);
    this.attacks();
    this.updateProjs();
    this.updateItems();
    this.updateWaves();
    this.updateCamera();

    this.comboT++;
    if (this.combo > 0 && this.comboT > 90) this.endCombo();
    this.enemies = this.enemies.filter((e) => !(e.st === 'dead' && this.tick >= e.gone));

    if (this.done) this.doneT++;
  }

  // ---------- Player ----------

  private updatePlayer(inp: Input): void {
    const p = this.p;
    const fd = this.fd;
    const press: [Act, boolean][] = [
      ['light', inp.light],
      ['heavy', inp.heavy],
      ['jump', inp.jump],
      ['grab', inp.grab],
      ['sp1', inp.sp1],
      ['sp2', inp.sp2],
    ];
    for (const [a, on] of press)
      if (on) {
        this.buf = a;
        this.bufT = 10;
      }
    if (this.bufT > 0) this.bufT--;
    else this.buf = null;
    if (p.inv > 0) p.inv--;
    if (p.flash > 0) p.flash--;
    if (p.sq > 0) p.sq--;
    if (p.hitT > 0) p.hitT--;
    else p.hitCount = 0;
    p.t++;

    if (this.reviveT > 0) {
      this.reviveT--;
      if (this.reviveT === 0) this.revive();
      return;
    }

    const mx = Math.max(-1, Math.min(1, inp.mx));
    const mz = Math.max(-1, Math.min(1, inp.mz));
    const sp = this.buf === 'sp1' ? 0 : this.buf === 'sp2' ? 1 : -1;
    const canSpecial = sp >= 0 && sp < this.o.specials.length && this.cds[sp] <= 0;

    switch (p.st) {
      case 'idle': {
        p.vx = mx * fd.speed;
        p.vz = mz * fd.zspeed;
        if (mx > 0.2) p.f = 1;
        else if (mx < -0.2) p.f = -1;
        if (canSpecial) return this.doSpecial(sp);
        if (!this.buf) return;
        const b = this.buf;
        this.buf = null;
        if (b === 'jump') {
          p.st = 'jump';
          p.t = 0;
          p.vy = fd.jump;
          p.vx = mx * fd.speed * 1.15;
          p.vz = mz * fd.zspeed;
          p.airAtk = false;
          this.ev.push('jump');
        } else if (b === 'light') {
          if (p.weapon) this.startMove(p, WEAPONS[p.weapon.id].swing, 'weapon');
          else this.lightAttack();
        } else if (b === 'heavy') {
          if (p.weapon) this.startMove(p, { name: 'Throw', pose: 'throw', su: 7, act: 1, rec: 12, dmg: 0, reach: 0, zr: 0, stun: 0, kb: 0 }, 'wthrow');
          else if (this.tick <= this.chainUntil && this.chainIdx >= 2) {
            this.chainIdx = 0;
            this.startMove(p, fd.launcher, 'launch');
          } else this.startMove(p, fd.heavy, 'heavy');
        } else if (b === 'grab') this.grabOrPick();
        return;
      }
      case 'attack': {
        const m = p.move!;
        const end = m.su + m.act + m.rec;
        if (m.dash && p.t >= m.su && p.t < m.su + m.act) p.vx = p.f * m.dash;
        else if (p.y <= 0) {
          p.vx *= 0.75;
          p.vz *= 0.75;
        }
        if (p.mk === 'wthrow' && p.t === m.su) this.throwWeapon();
        if (canSpecial && p.mk !== 'special' && p.t >= m.su + m.act) return this.doSpecial(sp);
        if (p.t >= m.su + m.act && p.y <= 0 && (this.buf === 'light' || this.buf === 'heavy') && (p.mk === 'chain' || p.mk === 'weapon')) {
          const b = this.buf;
          this.buf = null;
          if (b === 'light') {
            if (p.weapon) this.startMove(p, WEAPONS[p.weapon.id].swing, 'weapon');
            else if (p.mk === 'chain') this.lightAttack();
          } else if (p.weapon) this.startMove(p, { name: 'Throw', pose: 'throw', su: 7, act: 1, rec: 12, dmg: 0, reach: 0, zr: 0, stun: 0, kb: 0 }, 'wthrow');
          else if (this.chainIdx >= 2) {
            this.chainIdx = 0;
            this.startMove(p, fd.launcher, 'launch');
          } else this.startMove(p, fd.heavy, 'heavy');
          return;
        }
        if (p.t >= end) {
          if (p.y > 0) {
            p.st = 'jump';
            p.airAtk = true;
          } else p.st = 'idle';
          p.t = 0;
          p.move = null;
        }
        return;
      }
      case 'jump': {
        p.vx += mx * 0.08;
        p.vx = Math.max(-fd.speed * 1.3, Math.min(fd.speed * 1.3, p.vx));
        if (canSpecial) return this.doSpecial(sp);
        if (!p.airAtk && (this.buf === 'light' || this.buf === 'heavy')) {
          const b = this.buf;
          this.buf = null;
          p.airAtk = true;
          const keep = { vx: p.vx, vz: p.vz };
          this.startMove(p, b === 'light' ? fd.jumpL : fd.jumpH, 'air');
          p.vx = keep.vx;
          p.vz = keep.vz;
          if (b === 'heavy') p.vy = Math.min(p.vy, -1.5);
        }
        return;
      }
      case 'hit':
        p.vx *= 0.8;
        if (canSpecial) return this.doSpecial(sp);
        if (--p.stun <= 0) {
          p.st = 'idle';
          p.t = 0;
        }
        return;
      case 'grab': {
        const e = this.enemies.find((x) => x.id === p.held);
        p.vx = 0;
        p.vz = 0;
        if (!e || e.st !== 'held') {
          p.st = 'idle';
          p.held = -1;
          return;
        }
        if (p.knees > 0 && p.t < 14) {
          if (p.t === 5) {
            const k = fd.knee;
            this.damage(p, e, { ...k, dmg: k.dmg * (1 + 0.4 * this.perk('grip')) }, 'knee');
            if (e.hp > 0) {
              e.st = 'held';
              e.move = null;
              e.vx = e.vy = 0;
            } else {
              e.holder = -1;
              p.held = -1;
              p.st = 'idle';
            }
          }
          return;
        }
        if (this.buf === 'light' && p.knees < 3) {
          this.buf = null;
          p.knees++;
          p.t = 0;
          return;
        }
        if (this.buf === 'heavy' || this.buf === 'grab' || p.knees >= 3) {
          this.buf = null;
          if (mx * p.f < -0.3) p.f = p.f === 1 ? -1 : 1;
          p.st = 'throw';
          p.t = 0;
          return;
        }
        if (p.t > 110 + 30 * this.perk('grip')) {
          // The enemy breaks free.
          this.release(e);
          e.st = 'hit';
          e.stun = 6;
          e.vx = p.f * 3;
          p.st = 'hit';
          p.stun = 10;
          p.vx = -p.f * 2;
        }
        return;
      }
      case 'throw': {
        const e = this.enemies.find((x) => x.id === p.held);
        if (p.t === 6 && e) {
          this.release(e);
          e.st = 'thrown';
          e.t = 0;
          e.f = p.f === 1 ? -1 : 1;
          e.x = p.x + p.f * 12;
          e.y = 14;
          e.vx = p.f * (fd.strongGrab ? 7.5 : 6.5);
          e.vy = 3.4;
          e.carry = fd.throwDmg * (1 + 0.6 * this.perk('grip'));
          e.hits = {};
          this.ev.push('throw');
          this.shake = Math.max(this.shake, 3);
        }
        if (p.t >= 18) {
          p.st = 'idle';
          p.t = 0;
        }
        return;
      }
      case 'air':
      case 'down':
      case 'getup':
      case 'dead':
        return;
    }
  }

  private lightAttack(): void {
    const p = this.p;
    if (this.tick > this.chainUntil || this.chainIdx >= this.chainLen) this.chainIdx = 0;
    const m = this.lightMoves[this.chainIdx];
    this.chainIdx++;
    this.startMove(p, m, 'chain');
    this.chainUntil = this.tick + m.su + m.act + m.rec + 14;
    if (this.chainIdx >= this.chainLen) this.chainIdx = this.chainLen;
  }

  private startMove(a: Actor, m: MoveDef, mk: string): void {
    if (a.st !== 'jump' && a.st !== 'attack') a.airAtk = false;
    a.st = 'attack';
    a.t = 0;
    a.move = m;
    a.mk = mk;
    a.hits = {};
    if (m.hop) a.vy = m.hop;
    if (m.inv) a.inv = Math.max(a.inv, m.su + m.act + 2);
    if (a.team === 'p') this.ev.push(m.big || mk === 'special' ? 'swingH' : 'swing');
  }

  private doSpecial(slot: number): void {
    const p = this.p;
    const def = SPECIALS[this.o.specials[slot]];
    this.buf = null;
    if (p.st === 'grab' || p.st === 'throw') return;
    this.cds[slot] = Math.round(def.cd * (1 - 0.2 * this.perk('focus')));
    if (p.y > 0 && !def.move.hop) p.vy = Math.max(p.vy, 2);
    this.startMove(p, def.move, 'special');
    if (def.heal) this.heal(def.heal);
    this.ev.push('special');
    this.flashText(p, def.name.toUpperCase(), '#ffd166', 12);
    this.ring(p.x, p.z, 0, def.move.reach || 40, '#ffd166');
  }

  private grabOrPick(): void {
    const p = this.p;
    if (!p.weapon) {
      const it = this.items.find((i) => i.kind === 'weapon' && Math.abs(i.x - p.x) < 24 && Math.abs(i.z - p.z) < 14 && i.y <= 2);
      if (it) {
        p.weapon = { id: it.type, dur: it.val || this.weaponDur(it.type) };
        this.items = this.items.filter((i) => i !== it);
        this.ev.push('pickup');
        this.flashText(p, WEAPONS[it.type].name, '#8ecae6', 10);
        return;
      }
    }
    let best: Actor | null = null;
    let bd = 1e9;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.boss) continue;
      if (!(e.st === 'idle' || e.st === 'hit' || (e.st === 'attack' && !e.move?.armor))) continue;
      if (!this.edef(e).grab && !this.fd.strongGrab) continue;
      const dx = (e.x - p.x) * p.f;
      if (dx < -6 || dx > 32 || Math.abs(e.z - p.z) > 11 || e.y > 8) continue;
      if (dx < bd) {
        bd = dx;
        best = e;
      }
    }
    if (best) {
      if (p.weapon) this.dropWeapon();
      this.releaseToken(best);
      best.st = 'held';
      best.t = 0;
      best.holder = p.id;
      best.move = null;
      p.held = best.id;
      p.st = 'grab';
      p.t = 0;
      p.knees = 0;
      this.ev.push('grab');
      return;
    }
    if (p.weapon) this.dropWeapon();
  }

  private dropWeapon(): void {
    const p = this.p;
    if (!p.weapon) return;
    const it = this.mkItem('weapon', p.weapon.id, p.x + p.f * 10, p.z, p.weapon.dur);
    it.y = 20;
    this.items.push(it);
    p.weapon = null;
  }

  private throwWeapon(): void {
    const p = this.p;
    if (!p.weapon) return;
    const w = WEAPONS[p.weapon.id];
    this.projs.push({
      id: this.nextId++,
      team: 'p',
      kind: 'weapon',
      icon: w.icon,
      x: p.x + p.f * 14,
      z: p.z,
      y: 28,
      vx: p.f * 7.5,
      vz: 0,
      dmg: w.throwDmg * (1 + 0.25 * this.perk('weapons')),
      life: 70,
      rot: 0,
      weapon: w.glass ? undefined : w.id,
      hit: [],
    });
    p.weapon = null;
    this.ev.push('throw');
  }

  private release(e: Actor): void {
    const p = this.p;
    if (p.held === e.id) p.held = -1;
    e.holder = -1;
    if (e.st === 'held') {
      e.st = 'idle';
      e.y = 0;
    }
  }

  private revive(): void {
    const p = this.p;
    this.lives--;
    p.hp = Math.round(p.max * 0.6);
    p.st = 'idle';
    p.t = 0;
    p.inv = 150;
    this.ev.push('revive');
    this.flashText(p, 'BACK UP!', '#7ee08a', 14);
    this.ring(p.x, p.z, 0, 120, '#7ee08a');
    for (const e of this.alive())
      if (Math.abs(e.x - p.x) < 140 && !e.boss) {
        this.releaseToken(e);
        e.st = 'air';
        e.vy = 3;
        e.vx = Math.sign(e.x - p.x || 1) * 4;
        e.launched = true;
        e.move = null;
      }
  }

  // ---------- Enemies ----------

  spawn(kind: string, side: 1 | -1, boss = false): Actor {
    const d = this.o.district;
    const def = ENEMIES[kind];
    const hpMul = boss ? 1 + 0.08 * d : ENEMY_HP[d];
    const hp = Math.round(def.hp * hpMul);
    const x = side > 0 ? this.camX + W + 26 : this.camX - 26;
    const e = this.mkActor('e', kind, x, 8 + this.rng.next() * (DEPTH - 16), hp, hp, def.size);
    e.dmgMul = boss ? 1 + 0.15 * d : ENEMY_DMG[d];
    e.side = side;
    e.f = side > 0 ? -1 : 1;
    e.entering = true;
    e.boss = boss;
    e.poise = def.poise;
    e.spot = this.rng.int(0, 5);
    e.cd = 30 + this.rng.int(0, 60);
    this.enemies.push(e);
    if (boss) {
      this.bossId = e.id;
      this.banner = { text: `${def.icon} ${def.name}`, sub: def.text, t: 0 };
      this.ev.push('boss');
    }
    return e;
  }

  private releaseToken(e: Actor): void {
    if (e.token) {
      e.token = false;
      e.cd = 45 + this.rng.int(0, 60) - this.o.district * 6;
    }
    e.plan = -1;
  }

  private tokensUsed(): number {
    let n = 0;
    for (const e of this.enemies) if (e.token) n++;
    return n;
  }

  private updateEnemy(e: Actor): void {
    e.t++;
    if (e.flash > 0) e.flash--;
    if (e.sq > 0) e.sq--;
    if (e.inv > 0) e.inv--;
    if (e.cd > 0) e.cd--;
    if (e.token) e.tokenT++;
    const def = this.edef(e);
    if (e.boss && e.poise < def.poise && e.st === 'idle') e.poise = Math.min(def.poise, e.poise + 0.15);
    switch (e.st) {
      case 'idle':
        return this.think(e, def);
      case 'attack':
        return this.enemyAttack(e);
      case 'hit':
        e.vx *= 0.8;
        if (--e.stun <= 0) {
          e.st = 'idle';
          e.t = 0;
          if (e.boss) e.poise = def.poise;
        }
        return;
      case 'held':
        if (e.holder < 0) e.st = 'idle';
        return;
    }
  }

  private moveTo(e: Actor, tx: number, tz: number, speed: number): boolean {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const dist = Math.hypot(dx, dz * 1.6);
    if (dist < 3) {
      e.vx = 0;
      e.vz = 0;
      return true;
    }
    e.vx = (dx / dist) * speed;
    e.vz = (dz / dist) * speed * 0.7;
    return false;
  }

  private think(e: Actor, def: EnemyDef): void {
    const p = this.p;
    const dx = p.x - e.x;
    const adx = Math.abs(dx);
    const dz = p.z - e.z;
    const adz = Math.abs(dz);
    if (adx > 4) e.f = dx > 0 ? 1 : -1;
    const sp = def.speed;
    if (e.entering) {
      const inside = e.x > this.camX + 24 && e.x < this.camX + W - 24;
      if (inside) e.entering = false;
      else {
        e.vx = (e.side > 0 ? -1 : 1) * sp;
        e.f = e.side > 0 ? -1 : 1;
        e.vz = 0;
        return;
      }
    }
    const pBusy = p.st === 'down' || p.st === 'getup' || p.st === 'dead' || p.inv > 30 || this.done !== null;
    // Rebalance sides now and then so the player gets surrounded.
    if (this.tick % 90 === e.id % 90) {
      let l = 0;
      let r = 0;
      for (const o of this.enemies) if (o.hp > 0 && !o.boss) (o.side > 0 ? r++ : l++);
      if (e.side > 0 && r > l + 1) e.side = -1;
      else if (e.side < 0 && l > r + 1) e.side = 1;
      e.spot = this.rng.int(0, 5);
    }

    if (e.boss) return this.bossThink(e, def, adx, adz, pBusy);

    if (def.ai === 'ranged') {
      const want = e.side * def.keep;
      const tx = Math.max(this.camX + 16, Math.min(this.camX + W - 16, p.x + want));
      const close = adx < 60;
      if (close) this.moveTo(e, e.x - Math.sign(dx || 1) * 40, e.z, sp * 1.1);
      else this.moveTo(e, tx, p.z, sp * 0.8);
      e.f = dx > 0 ? 1 : -1;
      if (!pBusy && e.cd <= 0) {
        if (close && adz < 8 && adx < 34) return this.enemyStart(e, def.moves[1]);
        if (adz < 7 && adx > 70 && adx < 260 && this.rangedCd <= 0 && e.x > this.camX && e.x < this.camX + W) {
          this.rangedCd = 80;
          return this.enemyStart(e, def.moves[0]);
        }
      }
      return;
    }

    if (!e.token && !pBusy && e.cd <= 0 && this.tokensUsed() < this.tokens) {
      e.token = true;
      e.tokenT = 0;
      e.plan = this.pickMove(def.moves, adx);
    }
    if (e.token && (pBusy || e.tokenT > 260)) this.releaseToken(e);

    if (e.token && e.plan >= 0) {
      const m = def.moves[e.plan];
      const far = m.range > 60;
      if (far) {
        // Line up in the same lane at a distance, then charge or leap.
        const want = Math.max(70, Math.min(m.range - 20, adx));
        const tx = p.x - Math.sign(dx || 1) * want;
        this.moveTo(e, tx, p.z, sp);
        if (adz < 8 && adx >= 50 && adx <= m.range) return this.enemyStart(e, m);
      } else {
        const tx = p.x - Math.sign(dx || e.side) * (m.reach - 6);
        this.moveTo(e, tx, p.z, sp);
        if (adz < 6 && adx <= m.reach + 2 && adx > 8) return this.enemyStart(e, m);
      }
      return;
    }
    // Wait around the player at a distance.
    const wx = p.x + e.side * (def.keep + (e.spot % 3) * 16);
    const wz = Math.max(4, Math.min(DEPTH - 4, p.z + (e.spot - 2.5) * 14));
    const tx = Math.max(this.camX + 14, Math.min(this.camX + W - 14, wx));
    if (this.moveTo(e, tx, wz, sp * 0.6) || (adx < 26 && adz < 10)) {
      e.vx *= 0.5;
    }
    if (adx < 40 && adz < 8 && !pBusy && e.cd <= 0 && this.rng.chance(0.02)) {
      // A free jab when the player walks too close.
      this.enemyStart(e, def.moves.reduce((a, b) => (b.range < a.range ? b : a)));
      e.cd = 60;
    }
  }

  private pickMove(moves: EMove[], adx: number): number {
    const opts: [number, number][] = [];
    moves.forEach((m, i) => {
      if (m.summon || m.weight <= 0) return;
      const w = m.range > 60 && adx < 50 ? m.weight * 0.3 : m.weight;
      opts.push([i, w]);
    });
    return this.rng.weighted(opts);
  }

  private bossThink(e: Actor, def: EnemyDef, adx: number, adz: number, pBusy: boolean): void {
    const p = this.p;
    const dx = p.x - e.x;
    // Summon at 66% and 33% HP.
    const sm = def.moves.find((m) => m.summon);
    if (sm && e.summons < 2 && e.hp < e.max * (1 - (e.summons + 1) / 3)) {
      e.summons++;
      return this.enemyStart(e, sm);
    }
    if (e.plan < 0) e.plan = this.pickMove(def.moves, adx);
    const m = def.moves[e.plan];
    if (pBusy) {
      this.moveTo(e, p.x - Math.sign(dx || 1) * def.keep, p.z + 20, def.speed * 0.6);
      return;
    }
    if (m.range > 60) {
      const want = Math.max(90, Math.min(m.range - 30, adx));
      this.moveTo(e, Math.max(this.camX + 20, Math.min(this.camX + W - 20, p.x - Math.sign(dx || 1) * want)), p.z, def.speed);
      const laneOk = m.proj === 'fan' || m.proj === 'wave' ? adz < 20 : adz < 8;
      if (e.cd <= 0 && laneOk && adx >= 60 && adx <= m.range) {
        e.plan = -1;
        return this.enemyStart(e, m);
      }
      if (e.t > 200) e.plan = -1;
    } else {
      this.moveTo(e, p.x - Math.sign(dx || 1) * (m.reach - 8), p.z, def.speed);
      if (e.cd <= 0 && adz < 7 && adx <= m.reach + 2) {
        e.plan = -1;
        return this.enemyStart(e, m);
      }
    }
  }

  private enemyStart(e: Actor, m: EMove): void {
    const p = this.p;
    e.f = p.x >= e.x ? 1 : -1;
    this.startMove(e, m, 'enemy');
    e.vx = 0;
    e.vz = 0;
    e.flash = 0;
  }

  private enemyAttack(e: Actor): void {
    const m = e.move as EMove;
    const p = this.p;
    if (e.t < m.su) {
      e.vx *= 0.7;
      e.vz *= 0.7;
    }
    if (e.t === m.su) {
      if (m.leap) {
        const adx = Math.abs(p.x - e.x);
        e.vy = 4.4;
        e.vx = e.f * Math.min(5.5, Math.max(2, adx / 20));
      }
      if (m.proj) this.enemyShoot(e, m);
      if (m.summon) this.summon(e, m.summon);
    }
    if (m.dash && e.t >= m.su && e.t < m.su + m.act) {
      e.vx = e.f * m.dash;
      if (this.tick % 4 === 0) this.dust(e.x, e.z);
    } else if (e.y <= 0 && e.t >= m.su + m.act) e.vx *= 0.75;
    if (e.t >= m.su + m.act + m.rec) {
      e.st = 'idle';
      e.t = 0;
      e.move = null;
      this.releaseToken(e);
      if (e.boss) e.cd = Math.max(20, 70 - this.o.district * 8) + this.rng.int(0, 40);
    }
  }

  private enemyShoot(e: Actor, m: EMove): void {
    const mk = (icon: string, kind: Proj['kind'], speed: number, vz: number, y: number): void => {
      this.projs.push({ id: this.nextId++, team: 'e', kind, icon, x: e.x + e.f * 14, z: e.z, y, vx: e.f * speed, vz, dmg: m.dmg * e.dmgMul, life: 140, rot: 0, hit: [] });
    };
    if (m.proj === 'knife') mk('🔪', 'knife', 4.6, 0, 26);
    else if (m.proj === 'bottle') mk('🍾', 'bottle', 3.8, 0, 28);
    else if (m.proj === 'bullet') mk('•', 'bullet', 6.5, 0, 30);
    else if (m.proj === 'wave') {
      mk('', 'wave', 3.6, 0, 0);
      this.shake = Math.max(this.shake, 6);
      this.ev.push('slam');
    } else if (m.proj === 'fan') for (const vz of [-0.55, 0, 0.55]) mk('🔪', 'knife', 4.4, vz, 26);
    this.ev.push(m.proj === 'bullet' ? 'shot' : 'toss');
  }

  private summon(e: Actor, kind: string): void {
    const dist = DISTRICTS[this.o.district];
    for (let i = 0; i < 2; i++) {
      const k = kind === 'mix' ? this.rng.weighted(dist.pool) : kind;
      this.spawn(k, i === 0 ? -1 : 1);
    }
    this.flashText(e, 'GET HIM!', '#ff4d6d', 12);
    this.ev.push('summon');
  }

  // ---------- Physics ----------

  private physics(a: Actor): void {
    if (a.st === 'held') {
      const h = a.holder === this.p.id ? this.p : null;
      if (!h) {
        a.st = 'idle';
        return;
      }
      a.x = h.x + h.f * 18;
      a.z = h.z + 0.5;
      a.y = 4;
      a.f = h.f === 1 ? -1 : 1;
      a.vx = a.vy = a.vz = 0;
      return;
    }
    a.x += a.vx;
    a.z += a.vz;
    if (a.y > 0 || a.vy > 0) {
      a.y += a.vy;
      a.vy -= a.st === 'air' && a.launched ? 0.32 : GRAV;
      if (a.y <= 0) {
        a.y = 0;
        a.vy = 0;
        this.land(a);
      }
    }
    if (a.st === 'thrown') this.thrownHits(a);
    if (a.st === 'down') {
      a.vx *= 0.8;
      if (a.t > (a.team === 'p' ? 38 : 50)) {
        if (a.hp <= 0) {
          if (a.team === 'p') this.playerDeath();
          else {
            a.st = 'dead';
            a.t = 0;
            a.gone = this.tick + 40;
          }
        } else {
          a.st = 'getup';
          a.t = 0;
        }
      }
    } else if (a.st === 'getup') {
      a.vx = 0;
      a.vz = 0;
      if (a.t > 18) {
        a.st = 'idle';
        a.t = 0;
        a.juggle = 0;
        a.launched = false;
        a.inv = a.team === 'p' ? 50 : 12;
        if (a.boss) a.poise = this.edef(a).poise;
      }
    }
    // Bounds
    a.z = Math.max(0, Math.min(DEPTH, a.z));
    if (a.team === 'p') {
      a.x = Math.max(this.camX + 12, Math.min(Math.min(this.camX + W - 12, this.length - 12), a.x));
    } else if (!a.entering) {
      a.x = Math.max(this.camX - 10, Math.min(this.camX + W + 10, a.x));
      if (a.st === 'idle' || a.st === 'attack') a.x = Math.max(this.camX + 8, Math.min(this.camX + W - 8, a.x));
    }
  }

  private land(a: Actor): void {
    a.sq = 6;
    if (a.st === 'jump') {
      a.st = 'idle';
      a.t = 0;
      a.vx *= 0.3;
      this.ev.push('land');
      this.dust(a.x, a.z);
    } else if (a.st === 'attack') {
      if (a.move && a.move.pose === 'jkick' && a.team === 'e') {
        /* enemy leap keeps its recovery */
      } else if (a.mk === 'air') {
        a.st = 'idle';
        a.t = 0;
        a.move = null;
        this.dust(a.x, a.z);
      }
    } else if (a.st === 'air' || a.st === 'thrown') {
      if (a.st === 'thrown') {
        this.hurt(a, a.carry, this.p);
        this.shake = Math.max(this.shake, 5);
        this.ev.push('thud');
        this.freeze = Math.max(this.freeze, 3);
      }
      a.st = 'down';
      a.t = 0;
      a.vx *= 0.4;
      this.dust(a.x, a.z);
      this.dust(a.x + 10, a.z);
      if (a.team === 'e') this.ev.push('fall');
    }
  }

  private thrownHits(a: Actor): void {
    for (const o of this.enemies) {
      if (o === a || !this.hittable(o) || a.hits[o.id] !== undefined) continue;
      if (Math.abs(o.x - a.x) < 22 * o.size && Math.abs(o.z - a.z) < 14 && Math.abs(o.y - a.y) < 36) {
        a.hits[o.id] = this.tick;
        const m: MoveDef = { name: 'Body', pose: 'throw', su: 0, act: 1, rec: 0, dmg: a.carry * 0.7, reach: 0, zr: 0, stun: 24, kb: 3, down: true, big: true };
        const save = this.p.f;
        this.p.f = a.vx >= 0 ? 1 : -1;
        this.damage(this.p, o, m, 'body');
        this.p.f = save;
      }
    }
  }

  private playerDeath(): void {
    const p = this.p;
    if (this.reviveT > 0) return;
    if (this.lives > 0) {
      this.reviveT = 30;
      p.st = 'down';
      p.t = 0;
      return;
    }
    p.st = 'dead';
    p.t = 0;
    if (!this.done) {
      this.done = 'dead';
      this.ev.push('dead');
    }
  }

  // ---------- Hits ----------

  hittable(t: Actor): boolean {
    return t.hp > 0 && t.inv <= 0 && t.st !== 'down' && t.st !== 'getup' && t.st !== 'dead' && t.st !== 'held' && t.st !== 'thrown';
  }

  private inBox(a: Actor, m: MoveDef, x: number, z: number, y: number, half: number): boolean {
    const dx = (x - a.x) * a.f;
    if (dx > m.reach + half || dx < -(m.back ?? 0) - half * 0.5) return false;
    if (Math.abs(z - a.z) > m.zr + 2) return false;
    if (!m.anyY && Math.abs(y - a.y) > 30) return false;
    return true;
  }

  private attacks(): void {
    const p = this.p;
    if (p.st === 'attack' && p.move) {
      const m = p.move;
      if (p.t >= m.su && p.t < m.su + m.act && m.dmg > 0) {
        for (const e of this.enemies) {
          if (!this.hittable(e)) continue;
          if (!this.inBox(p, m, e.x, e.z, e.y, 11 * e.size)) continue;
          const last = p.hits[e.id];
          if (last !== undefined && !(m.every && this.tick - last >= m.every)) continue;
          p.hits[e.id] = this.tick;
          this.damage(p, e, m, p.mk);
          if (p.mk === 'weapon' && p.weapon) {
            p.weapon.dur--;
            if (p.weapon.dur <= 0) {
              this.breakWeapon();
              break;
            }
          }
        }
        for (const pr of this.props) {
          if (pr.hp <= 0 || p.hits[-pr.id] !== undefined) continue;
          if (!this.inBox(p, m, pr.x, pr.z, 0, 12)) continue;
          p.hits[-pr.id] = this.tick;
          this.breakProp(pr);
        }
        if (m.pose === 'spin' && (p.t - m.su) % SPIN_EVERY === 0) this.ev.push('swing');
      }
    }
    if (p.st === 'attack' && p.move?.pose === 'slam' && p.t === p.move.su) {
      this.shake = Math.max(this.shake, 8);
      this.ring(p.x, p.z, 0, p.move.reach, '#ffd166');
      this.ev.push('slam');
    }
    for (const e of this.enemies) {
      if (e.st !== 'attack' || !e.move) continue;
      const m = e.move as EMove;
      if (m.proj || m.summon || m.dmg <= 0) continue;
      if (e.t < m.su || e.t >= m.su + m.act) continue;
      if (!this.hittable(p) || e.hits[p.id] !== undefined) continue;
      if (!this.inBox(e, m, p.x, p.z, p.y, 10)) continue;
      e.hits[p.id] = this.tick;
      this.damage(e, p, m, 'enemy');
    }
  }

  private breakWeapon(): void {
    const p = this.p;
    if (!p.weapon) return;
    const w = WEAPONS[p.weapon.id];
    this.flashText(p, `${w.icon} broke!`, '#ff9f43', 10);
    this.shards(p.x + p.f * 20, p.z, 26, w.glass ? '#9be7ff' : '#adb5bd');
    p.weapon = null;
    this.ev.push(w.glass ? 'glass' : 'break');
  }

  private breakProp(pr: Prop): void {
    pr.hp = 0;
    this.shards(pr.x, pr.z, 12, '#b08968');
    this.ev.push('break');
    this.shake = Math.max(this.shake, 2);
    if (pr.drop === 'cash') {
      const it = this.mkItem('cash', 'cash', pr.x, pr.z, 8 + 3 * this.o.district + this.rng.int(0, 6));
      it.vy = 3;
      this.items.push(it);
    } else if (FOODS[pr.drop]) {
      const it = this.mkItem('food', pr.drop, pr.x, pr.z);
      it.vy = 3;
      this.items.push(it);
    } else {
      const it = this.mkItem('weapon', pr.drop, pr.x, pr.z);
      it.vy = 3;
      this.items.push(it);
    }
    this.props = this.props.filter((x) => x !== pr);
  }

  /** Damage multiplier of the player for one hit. */
  private playerMult(mk: string, t: Actor): number {
    let m = 1;
    if (mk === 'chain') m *= 1 + 0.2 * this.perk('knuckles');
    if (mk === 'heavy' || mk === 'launch' || mk === 'air') m *= 1 + 0.25 * this.perk('boots');
    if (mk === 'weapon') m *= 1 + 0.25 * this.perk('weapons');
    if (t.y > 2) m *= 1 + 0.35 * this.perk('juggle');
    return m;
  }

  private hurt(t: Actor, dmg: number, by: Actor): void {
    if (dmg <= 0) return;
    const v = Math.max(1, Math.round(dmg));
    t.hp -= v;
    t.flash = 7;
    if (t.team === 'p') {
      this.dmgTaken += v;
      this.floats.push({ x: t.x, z: t.z, y: 60, text: `-${v}`, color: '#ff4d6d', t: 0, size: 13 });
    } else {
      this.floats.push({ x: t.x + (this.rng.next() - 0.5) * 10, z: t.z, y: 50 * t.size + t.y, text: `${v}`, color: '#ffffff', t: 0, size: v >= 15 ? 15 : 12 });
      if (t.hp <= 0) this.ko(by, t);
    }
  }

  private damage(a: Actor, t: Actor, m: MoveDef, mk: string): void {
    let dmg = m.dmg;
    if (a.team === 'p') dmg *= this.playerMult(mk, t);
    else dmg *= a.dmgMul * Math.pow(0.88, this.perk('skin'));
    const wasAlive = t.hp > 0;
    if (t.team === 'p') {
      const key = mk === 'proj' ? `proj:${m.name}` : `${a.kind}:${m.name}`;
      this.hurtBy[key] = (this.hurtBy[key] ?? 0) + Math.round(dmg);
    }
    this.hurt(t, dmg, a);
    // Sparks at the impact point
    const hx = t.x - a.f * 6;
    this.sparks(hx, t.z, t.y + 30 * t.size, m.big ? 10 : 6, m.big ? '#ffd166' : '#ffffff');
    this.freeze = Math.max(this.freeze, a.team === 'p' ? (m.big ? 6 : 3) : 5);
    this.shake = Math.max(this.shake, a.team === 'p' ? (m.big ? 4 : 1.5) : 4);
    this.ev.push(a.team === 'e' ? 'hurt' : m.big ? 'hitH' : 'hitL');

    if (a.team === 'p') {
      this.combo++;
      this.comboT = 0;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    } else {
      t.hitCount++;
      t.hitT = 50;
      if (t.held >= 0) {
        const h = this.enemies.find((e) => e.id === t.held);
        if (h) this.release(h);
      }
    }
    if (t.team === 'e' && wasAlive && t.hp <= 0) {
      // KO flight
      t.st = 'air';
      t.vy = 4.2;
      t.vx = a.f * 3;
      t.launched = true;
      t.move = null;
      t.t = 0;
      this.releaseToken(t);
      this.freeze = Math.max(this.freeze, t.boss ? 30 : 7);
      return;
    }
    if (t.hp <= 0) {
      t.st = 'air';
      t.vy = 4;
      t.vx = a.f * 3;
      t.launched = true;
      t.move = null;
      t.t = 0;
      return;
    }
    // Armor and poise
    const armored = t.st === 'attack' && t.move?.armor;
    if (t.team === 'p') {
      if (armored) return;
    } else if (armored || t.boss) {
      t.poise -= dmg;
      if (t.poise > 0 && !(t.boss && t.y > 0)) return;
      t.poise = this.edef(t).poise;
    }
    t.f = a.f === 1 ? -1 : 1;
    if (t.team === 'e') this.releaseToken(t);
    if (t.team === 'p' && t.st === 'grab') {
      const h = this.enemies.find((e) => e.id === t.held);
      if (h) this.release(h);
    }
    t.move = null;
    const air = t.y > 2 || t.st === 'air';
    const playerDown = t.team === 'p' && t.hitCount >= 3;
    if (m.lift || (air && t.team === 'e')) {
      const decay = Math.pow(0.82, t.juggle);
      t.st = 'air';
      t.vy = m.lift ? m.lift * decay : Math.max(t.vy, (m.down ? 3.6 : 3) * decay);
      t.vx = a.f * Math.max(1, m.kb * 0.45);
      t.launched = true;
      t.juggle++;
      t.t = 0;
    } else if (m.down || playerDown) {
      t.st = 'air';
      t.vy = 3.2;
      t.vx = a.f * Math.max(2, m.kb);
      t.launched = true;
      t.t = 0;
      if (t.team === 'p') t.hitCount = 0;
    } else {
      t.st = 'hit';
      t.stun = m.stun;
      t.vx = a.f * m.kb;
      t.t = 0;
    }
  }

  private ko(by: Actor, e: Actor): void {
    const def = this.edef(e);
    this.kills++;
    const mult = (1 + 0.25 * this.o.district) * (1 + 0.3 * this.perk('hustle')) * (this.o.kind === 'alley' ? 1.5 : 1);
    const c = Math.round(def.cash * mult);
    this.cash += c;
    this.floats.push({ x: e.x, z: e.z, y: 70 * e.size, text: `+$${c}`, color: '#7ee08a', t: 0, size: 12 });
    this.ev.push(e.boss ? 'bossko' : 'ko');
    if (this.perk('vamp')) this.heal(2 * this.perk('vamp'), true);
    if (def.drop && this.rng.chance(def.drop[1])) {
      const it = this.mkItem('weapon', def.drop[0], e.x, e.z);
      it.vy = 3;
      this.items.push(it);
    } else if (this.rng.chance(0.08)) {
      const it = this.mkItem('food', 'apple', e.x, e.z);
      it.vy = 3;
      this.items.push(it);
    }
    if (e.boss) {
      this.shake = 12;
      for (const o of this.enemies)
        if (o !== e && o.hp > 0) {
          o.hp = 0;
          o.st = 'air';
          o.vy = 3;
          o.vx = Math.sign(o.x - e.x || 1) * 3;
          o.launched = true;
          o.move = null;
          this.releaseToken(o);
        }
      if (this.active) this.active.queue = [];
    }
    void by;
  }

  heal(n: number, quiet = false): void {
    const p = this.p;
    const v = Math.min(n, p.max - p.hp);
    if (v <= 0) return;
    p.hp += v;
    if (!quiet || v >= 3) this.floats.push({ x: p.x, z: p.z, y: 62, text: `+${v}`, color: '#7ee08a', t: 0, size: 12 });
  }

  private endCombo(): void {
    if (this.combo >= 8) {
      const bonus = Math.floor(this.combo / 4);
      this.cash += bonus;
      const p = this.p;
      this.floats.push({ x: p.x, z: p.z, y: 80, text: `${this.combo} HIT COMBO +$${bonus}`, color: '#ffd166', t: 0, size: 13 });
      this.ev.push('combo');
    }
    this.combo = 0;
  }

  // ---------- Projectiles and items ----------

  private updateProjs(): void {
    const p = this.p;
    for (const pr of this.projs) {
      pr.x += pr.vx;
      pr.z += pr.vz;
      pr.life--;
      pr.rot += pr.kind === 'knife' || pr.kind === 'weapon' || pr.kind === 'bottle' ? 0.35 * Math.sign(pr.vx) : 0;
      if (pr.z < 0 || pr.z > DEPTH) pr.life = 0;
      if (pr.kind === 'wave' && this.tick % 3 === 0) this.dust(pr.x, pr.z);
      const targets = pr.team === 'e' ? [p] : this.enemies;
      for (const t of targets) {
        if (!this.hittable(t) || pr.hit.includes(t.id)) continue;
        const zr = pr.kind === 'wave' ? 18 : 11;
        if (Math.abs(t.x - pr.x) > 14 * t.size || Math.abs(t.z - pr.z) > zr) continue;
        if (pr.kind === 'wave' ? t.y > 8 : Math.abs(t.y + 26 * t.size - pr.y) > 30) continue;
        pr.hit.push(t.id);
        const m: MoveDef = { name: pr.kind, pose: 'jab', su: 0, act: 1, rec: 0, dmg: pr.dmg, reach: 0, zr: 0, stun: 20, kb: 3, down: pr.kind === 'wave' || pr.kind === 'weapon', big: pr.kind !== 'bullet' };
        const fake = { ...(pr.team === 'p' ? p : t), f: (pr.vx >= 0 ? 1 : -1) as 1 | -1, team: pr.team, dmgMul: 1 } as Actor;
        if (pr.team === 'e') fake.dmgMul = 1;
        this.damage(fake, t, m, 'proj');
        if (pr.kind !== 'wave') {
          pr.life = 0;
          if (pr.kind === 'bottle' || (pr.kind === 'weapon' && !pr.weapon)) {
            this.shards(pr.x, pr.z, pr.y, '#9be7ff');
            this.ev.push('glass');
          } else if (pr.kind === 'weapon' && pr.weapon) {
            const it = this.mkItem('weapon', pr.weapon, pr.x, pr.z, Math.max(1, Math.round(this.weaponDur(pr.weapon) * 0.5)));
            it.y = pr.y;
            it.vy = 3;
            it.vx = -pr.vx * 0.2;
            this.items.push(it);
          }
        }
        break;
      }
      if (pr.life > 0 && (pr.x < this.camX - 60 || pr.x > this.camX + W + 60)) pr.life = 0;
      if (pr.life <= 0 && pr.kind === 'weapon' && pr.weapon && pr.hit.length === 0) {
        const it = this.mkItem('weapon', pr.weapon, Math.max(this.camX + 10, Math.min(this.camX + W - 10, pr.x)), pr.z, Math.max(1, Math.round(this.weaponDur(pr.weapon) * 0.5)));
        it.y = 20;
        this.items.push(it);
      }
    }
    this.projs = this.projs.filter((x) => x.life > 0);
  }

  private updateItems(): void {
    const p = this.p;
    for (const it of this.items) {
      it.t++;
      if (it.y > 0 || it.vy > 0) {
        it.y += it.vy;
        it.vy -= GRAV;
        it.x += it.vx;
        if (it.y <= 0) {
          it.y = 0;
          it.vy = 0;
          it.vx = 0;
        }
      }
      if (it.kind === 'weapon' || p.hp <= 0 || p.st === 'held') continue;
      if (Math.abs(it.x - p.x) < 18 && Math.abs(it.z - p.z) < 13 && p.y < 24 && it.y < 6) {
        if (it.kind === 'cash') {
          this.cash += it.val;
          this.floats.push({ x: it.x, z: it.z, y: 30, text: `+$${it.val}`, color: '#7ee08a', t: 0, size: 12 });
          this.ev.push('coin');
        } else {
          this.heal(FOODS[it.type].heal);
          this.ev.push('food');
        }
        it.t = -1;
      }
    }
    this.items = this.items.filter((it) => it.t >= 0 && !(it.kind === 'cash' && it.t > 900));
  }

  // ---------- Waves and camera ----------

  private updateWaves(): void {
    const p = this.p;
    if (this.done) return;
    if (!this.active && this.waveIdx < this.waves.length && p.x >= this.waves[this.waveIdx].at) {
      const w = this.waves[this.waveIdx];
      this.active = { queue: w.list.slice(), max: w.max, spawnCd: 0, boss: w.boss };
      this.lock = true;
      this.lockX = Math.min(this.length - W, Math.max(this.camX, p.x - W * 0.5));
      if (w.boss) {
        this.spawn(w.boss, 1, true);
      }
      this.ev.push('lock');
    }
    const a = this.active;
    if (a) {
      if (a.spawnCd > 0) a.spawnCd--;
      const n = this.alive().length;
      if (a.queue.length && n < a.max && a.spawnCd <= 0) {
        const k = a.queue.shift()!;
        const side: 1 | -1 = this.rng.chance(0.5) ? 1 : -1;
        this.spawn(k, side);
        a.spawnCd = n < 2 ? 20 : 50;
      }
      if (!a.queue.length && n === 0) {
        this.active = null;
        this.lock = false;
        this.waveIdx++;
        if (this.waveIdx >= this.waves.length && this.o.kind === 'boss') {
          this.done = 'clear';
          this.ev.push('clear');
        } else {
          this.go = 180;
          this.ev.push('go');
        }
      }
    }
    if (!this.active && this.waveIdx >= this.waves.length && p.x >= this.length - 40 && !this.done) {
      this.done = 'clear';
      this.ev.push('clear');
    }
  }

  private updateCamera(): void {
    const p = this.p;
    const maxCam = this.length - W;
    if (this.lock) this.camX += (this.lockX - this.camX) * 0.12;
    else {
      const target = Math.min(maxCam, p.x - W * 0.42);
      if (target > this.camX) this.camX += (target - this.camX) * 0.15;
    }
    this.camX = Math.max(0, Math.min(maxCam, this.camX));
  }

  // ---------- Effects ----------

  private updateFx(): void {
    for (const s of this.parts) {
      s.x += s.vx;
      s.y += s.vy;
      if (s.kind !== 'ring') s.vy -= 0.25;
      if (s.y < 0 && s.kind !== 'ring') {
        s.y = 0;
        s.vy *= -0.3;
        s.vx *= 0.6;
      }
      s.life--;
    }
    this.parts = this.parts.filter((s) => s.life > 0);
    if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
    for (const f of this.floats) f.t++;
    this.floats = this.floats.filter((f) => f.t < 60);
  }

  private sparks(x: number, z: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      this.parts.push({ x, z, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, life: 12 + Math.random() * 8, max: 20, color, size: 2 + Math.random() * 2, kind: 'spark' });
    }
    this.parts.push({ x, z, y, vx: 0, vy: 0, life: 10, max: 10, color, size: 16, kind: 'star' });
  }

  private shards(x: number, z: number, y: number, color: string): void {
    for (let i = 0; i < 10; i++) this.parts.push({ x, z, y, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 1, life: 30 + Math.random() * 20, max: 50, color, size: 2 + Math.random() * 3, kind: 'shard' });
  }

  private dust(x: number, z: number): void {
    for (let i = 0; i < 3; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 16, z, y: 1, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 0.8, life: 18, max: 18, color: 'rgba(220,220,220,0.5)', size: 4 + Math.random() * 3, kind: 'dust' });
  }

  private ring(x: number, z: number, y: number, r: number, color: string): void {
    this.parts.push({ x, z, y, vx: 0, vy: 0, life: 16, max: 16, color, size: r, kind: 'ring' });
  }

  private flashText(a: Actor, text: string, color: string, size: number): void {
    this.floats.push({ x: a.x, z: a.z, y: 72, text, color, t: 0, size });
  }

  /** Remaining HP after a stage, for the run. */
  result(): { hp: number; cash: number; kills: number; maxCombo: number; lives: number; weapon: string | null; dmgTaken: number } {
    return { hp: Math.max(0, this.p.hp), cash: this.cash, kills: this.kills, maxCombo: this.maxCombo, lives: this.lives, weapon: this.p.weapon?.id ?? null, dmgTaken: this.dmgTaken };
  }
}

export function stageSeed(runSeed: string, district: number, col: number): number {
  return hash(runSeed, 'stage', district, col);
}
