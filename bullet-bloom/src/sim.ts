/**
 * Fixed-step game simulation (60 Hz). No DOM. The app, the bot and the headless sim all use it.
 * Bullets, shots, items and particles live in typed-array pools (no allocation per frame).
 * A uniform grid sorts enemy bullets each frame for collision and graze checks.
 */
import { BOSSES, ENEMIES, H, PARTS, SHIPS, STAGES, W, type BossDef, type Emit, type EnemyDef, type PathKind, type ShipDef, type WaveDef } from './data';
import { Rng, hash } from './rng';

export const TAU = Math.PI * 2;
export const MAXB = 4096;
export const MAXS = 600;
export const MAXI = 900;
export const MAXP = 700;
/** Radius of the player hitbox. */
export const HIT_R = 2.4;
/** A bullet within this distance (plus its radius) grazes. */
export const GRAZE_R = 14;
/** Items above this line fly to the player. */
export const COLLECT_Y = H * 0.27;
/** Global tuning knobs (the headless sim changes them). */
export const TUNE = { bossHp: 0.6, enemyHp: 1, bulletSpd: 1, density: 1 };

export interface Loadout {
  ship: ShipDef;
  speed: number;
  focusSpeed: number;
  dmg: number;
  streams: number;
  spread: number;
  drone: number;
  laser: number;
  dmgMul: number;
  bombTime: number;
  bombMul: number;
  magnet: number;
  grazeMul: number;
  grazeScore: number;
  shield: boolean;
}

export function makeLoadout(shipId: string, parts: Record<string, number>): Loadout {
  const ship = SHIPS.find((s) => s.id === shipId) ?? SHIPS[0];
  const lv = (id: string): number => Math.min(PARTS[id].max, (parts[id] ?? 0) + (ship.start[id] ?? 0));
  const spd = 1 + 0.12 * lv('thruster');
  return {
    ship,
    speed: ship.speed * spd,
    focusSpeed: ship.focusSpeed * spd,
    dmg: ship.dmg,
    streams: ship.streams,
    spread: lv('spread'),
    drone: lv('drone'),
    laser: lv('laser'),
    dmgMul: 1 + 0.2 * lv('power'),
    bombTime: 120 + 30 * lv('bigbomb'),
    bombMul: 1 + 0.5 * lv('bigbomb'),
    magnet: 40 + 30 * lv('magnet'),
    grazeMul: ship.grazeMul * (1 + 0.5 * lv('graze')),
    grazeScore: lv('graze') > 0 ? 2 : 1,
    shield: lv('shield') > 0,
  };
}

export interface Input {
  /** Direction from keys or the bot, each -1..1. */
  dx: number;
  dy: number;
  /** Relative move in playfield pixels (touch drag). */
  rx: number;
  ry: number;
  focus: boolean;
  bomb: boolean;
}

export const newInput = (): Input => ({ dx: 0, dy: 0, rx: 0, ry: 0, focus: false, bomb: false });

interface EmitState {
  def: Emit;
  t: number;
  ang: number;
  burstLeft: number;
  burstT: number;
  volleys: number;
}

export interface Enemy {
  def: EnemyDef | null;
  boss: boolean;
  hp: number;
  maxHp: number;
  r: number;
  col: string;
  petals: number;
  x: number;
  y: number;
  t: number;
  path: PathKind;
  x0: number;
  y0: number;
  vx: number;
  dir: number;
  emits: EmitState[];
  flash: number;
  dead: boolean;
}

export interface BossState {
  def: BossDef;
  mid: boolean;
  e: Enemy;
  phase: number;
  phaseT: number;
  timeLeft: number;
  captured: boolean;
  intro: number;
  pause: number;
  tx: number;
  ty: number;
  /** Frames to show the spell card name banner. */
  banner: number;
}

interface Spawn {
  t: number;
  e: string;
  x: number;
  path: PathKind;
  dir: number;
}

export interface FloatText {
  x: number;
  y: number;
  s: string;
  t: number;
  c: string;
  big: boolean;
}

export type Mode = 'waves1' | 'mid' | 'waves2' | 'boss' | 'clear' | 'over';

export interface GameOpts {
  seed: number;
  stage: number;
  loop: number;
  load: Loadout;
  lives: number;
  bombs: number;
  charge: number;
  score: number;
  god?: boolean;
}

/** Sound and effect counters for one frame. The app reads and clears them. */
export const newEvents = () => ({ shot: 0, hit: 0, kill: 0, big: 0, graze: 0, item: 0, bomb: 0, die: 0, spell: 0, capture: 0, bombUp: 0, shield: 0, phase: 0, clear: 0 });
export type Events = ReturnType<typeof newEvents>;

const CELL = 24;
const GOFF = 32;
const GC = Math.ceil((W + GOFF * 2) / CELL);
const GR = Math.ceil((H + GOFF * 2) / CELL);

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export class Game {
  readonly stage: number;
  readonly loop: number;
  readonly load: Loadout;
  readonly rng: Rng;
  god: boolean;
  frame = 0;
  mode: Mode = 'waves1';
  modeT = 0;
  done: 'clear' | 'over' | null = null;
  scroll = 0;

  // Player
  px = W / 2;
  py = H - 40;
  focus = false;
  lives: number;
  bombs: number;
  charge: number;
  invuln = 120;
  bombT = 0;
  bombX = 0;
  bombY = 0;
  hitT = 0;
  shield: boolean;
  fireT = 0;
  laserOn = false;

  // Score and stats for this stage
  score: number;
  graze = 0;
  deaths = 0;
  bombsUsed = 0;
  kills = 0;
  points = 0;
  spellsSeen = 0;
  spellsCaptured = 0;
  vacuum = 0;

  // Enemy bullets
  bn = 0;
  bx = new Float32Array(MAXB);
  by = new Float32Array(MAXB);
  bvx = new Float32Array(MAXB);
  bvy = new Float32Array(MAXB);
  bang = new Float32Array(MAXB);
  bspd = new Float32Array(MAXB);
  bacc = new Float32Array(MAXB);
  bturn = new Float32Array(MAXB);
  br = new Float32Array(MAXB);
  bcol = new Uint8Array(MAXB);
  bgrazed = new Uint8Array(MAXB);
  bage = new Uint16Array(MAXB);

  // Player shots (kind 0 = straight, 1 = homing)
  sn = 0;
  sx = new Float32Array(MAXS);
  sy = new Float32Array(MAXS);
  svx = new Float32Array(MAXS);
  svy = new Float32Array(MAXS);
  sdmg = new Float32Array(MAXS);
  skind = new Uint8Array(MAXS);

  // Items (kind 0 = point, 1 = bloom, 2 = big bloom)
  inn = 0;
  ix = new Float32Array(MAXI);
  iy = new Float32Array(MAXI);
  ivy = new Float32Array(MAXI);
  ik = new Uint8Array(MAXI);
  ipull = new Uint8Array(MAXI);

  // Particles
  pn = 0;
  ppx = new Float32Array(MAXP);
  ppy = new Float32Array(MAXP);
  pvx = new Float32Array(MAXP);
  pvy = new Float32Array(MAXP);
  pl = new Float32Array(MAXP);
  pc = new Uint8Array(MAXP);

  // Collision grid
  private cellStart = new Int32Array(GC * GR + 1);
  private cellFill = new Int32Array(GC * GR);
  private cellOf = new Int32Array(MAXB);
  private gridIdx = new Int32Array(MAXB);
  private near1 = new Int32Array(MAXB);

  enemies: Enemy[] = [];
  boss: BossState | null = null;
  texts: FloatText[] = [];
  ev: Events = newEvents();

  private spawns1: Spawn[];
  private spawns2: Spawn[];
  private spawnIdx = 0;
  private spdMul: number;
  private dens: number;
  private hpMul: number;

  constructor(o: GameOpts) {
    this.stage = o.stage;
    this.loop = o.loop;
    this.load = o.load;
    this.lives = o.lives;
    this.bombs = o.bombs;
    this.charge = o.charge;
    this.score = o.score;
    this.god = !!o.god;
    this.shield = o.load.shield;
    this.rng = new Rng(hash(o.seed, 'play', o.stage, o.loop));
    this.spdMul = (1 + 0.05 * o.stage + 0.18 * o.loop) * TUNE.bulletSpd;
    this.dens = (1 + 0.06 * o.stage + 0.25 * o.loop) * TUNE.density;
    this.hpMul = 1 + 0.5 * o.loop;
    const plan = new Rng(hash(o.seed, 'waves', o.stage, o.loop));
    const def = STAGES[o.stage];
    this.spawns1 = buildSpawns(plan, def.waves, 1500 + o.stage * 120);
    this.spawns2 = buildSpawns(plan, def.waves, 1400 + o.stage * 120);
  }

  get stageDef() {
    return STAGES[this.stage];
  }

  // ---------- Step ----------

  step(inp: Input): void {
    this.frame++;
    this.modeT++;
    this.scroll += this.mode === 'boss' ? 0.35 : 0.9;
    if (this.vacuum > 0) this.vacuum--;
    this.updatePlayer(inp);
    this.updateScript();
    this.updateEnemies();
    this.updateBullets();
    this.buildGrid();
    this.collidePlayer();
    this.updateShots();
    this.updateItems();
    this.updateFx();
    if (this.charge >= 100) {
      this.charge -= 100;
      if (this.bombs < 8) {
        this.bombs++;
        this.ev.bombUp++;
        this.text(this.px, this.py - 24, '+1 BOMB', '#ff70a6', true);
      }
    }
    if (this.mode === 'clear' && this.modeT > 200) this.done = 'clear';
    if (this.mode === 'over' && this.modeT > 90) this.done = 'over';
  }

  // ---------- Player ----------

  private updatePlayer(inp: Input): void {
    const L = this.load;
    if (this.mode === 'over') return;
    this.focus = inp.focus;
    const sp = inp.focus ? L.focusSpeed : L.speed;
    let dx = inp.dx;
    let dy = inp.dy;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    let mx = dx * sp;
    let my = dy * sp;
    if (inp.rx || inp.ry) {
      const cap = sp * 1.6;
      const k = inp.focus ? 0.5 : 1;
      mx += clamp(inp.rx * k, -cap, cap);
      my += clamp(inp.ry * k, -cap, cap);
    }
    if (this.hitT === 0) {
      this.px = clamp(this.px + mx, 8, W - 8);
      this.py = clamp(this.py + my, 16, H - 12);
    }
    if (this.invuln > 0) this.invuln--;
    if (this.bombT > 0) {
      this.bombT--;
      this.cancelBullets(false);
      const dmg = (this.boss ? 1.4 : 3) * L.bombMul;
      for (const e of this.enemies) if (!e.dead && e.y > -10) this.damage(e, e.boss ? 1.4 * L.bombMul : dmg);
    }
    if (inp.bomb && this.bombs > 0 && this.bombT === 0) this.useBomb();
    if (this.hitT > 0 && --this.hitT === 0) this.die();
    // Shots
    if (this.hitT > 0) return;
    this.fireT++;
    const f = this.fireT;
    const dmg = L.dmg * L.dmgMul;
    if (f % 5 === 0) {
      const s = L.streams;
      for (let i = 0; i < s; i++) this.shot(this.px + (i - (s - 1) / 2) * (inp.focus ? 6 : 10), this.py - 10, 0, -11, dmg, 0);
      this.ev.shot++;
    }
    if (L.spread > 0 && f % 8 === 0) {
      for (let l = 1; l <= L.spread; l++) {
        const a = (inp.focus ? 0.06 : 0.2) * l;
        this.shot(this.px - 4, this.py - 6, -Math.sin(a) * 10, -Math.cos(a) * 10, 1.5 * L.dmgMul, 0);
        this.shot(this.px + 4, this.py - 6, Math.sin(a) * 10, -Math.cos(a) * 10, 1.5 * L.dmgMul, 0);
      }
    }
    if (L.drone > 0 && f % 10 === 0) {
      for (let i = 0; i < L.drone; i++) {
        const [ox, oy] = this.droneOffset(i);
        this.shot(this.px + ox, this.py + oy, 0, -8, 2.6 * L.dmgMul, 1);
      }
    }
    this.laserOn = L.laser > 0 && this.mode !== 'clear';
    if (this.laserOn) {
      const ld = 0.35 * L.laser * (inp.focus ? 1.5 : 1) * L.dmgMul;
      const hw = inp.focus ? 7 : 5;
      for (const e of this.enemies) {
        if (e.dead || e.y > this.py || Math.abs(e.x - this.px) > e.r + hw || e.y < -e.r) continue;
        this.damage(e, ld);
        if (this.frame % 6 === 0) this.particle(e.x + (this.rng.next() - 0.5) * e.r, e.y + e.r * 0.5, 0, 1, 12);
      }
    }
  }

  droneOffset(i: number): [number, number] {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    return this.focus ? [side * (12 + row * 10), 12 + row * 6] : [side * (26 + row * 18), 4 - row * 8];
  }

  private shot(x: number, y: number, vx: number, vy: number, dmg: number, kind: number): void {
    if (this.sn >= MAXS) return;
    const i = this.sn++;
    this.sx[i] = x;
    this.sy[i] = y;
    this.svx[i] = vx;
    this.svy[i] = vy;
    this.sdmg[i] = dmg;
    this.skind[i] = kind;
  }

  private useBomb(): void {
    this.bombs--;
    this.bombsUsed++;
    this.bombT = this.load.bombTime;
    this.bombX = this.px;
    this.bombY = this.py;
    this.invuln = Math.max(this.invuln, this.bombT + 40);
    this.hitT = 0;
    this.vacuum = Math.max(this.vacuum, 60);
    if (this.boss) this.boss.captured = false;
    this.cancelBullets(true);
    this.ev.bomb++;
  }

  private die(): void {
    this.lives--;
    this.deaths++;
    if (this.boss) this.boss.captured = false;
    this.burst(this.px, this.py, 40, 0, 4);
    this.cancelBullets(false);
    this.ev.die++;
    if (this.lives <= 0) {
      this.lives = 0;
      this.setMode('over');
      return;
    }
    this.px = W / 2;
    this.py = H - 40;
    this.invuln = 180;
    this.bombs = Math.max(this.bombs, this.load.ship.bombs);
    this.text(W / 2, H - 70, `${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`, '#ff4d6d', true);
  }

  private hitPlayer(): void {
    if (this.god || this.invuln > 0 || this.hitT > 0 || this.bombT > 0 || this.mode === 'over' || this.mode === 'clear') return;
    if (this.shield) {
      this.shield = false;
      this.invuln = 120;
      this.cancelBullets(false);
      this.ev.shield++;
      this.text(this.px, this.py - 20, 'SHIELD', '#4cc9f0', true);
      return;
    }
    // A short window to bomb out of the hit.
    this.hitT = 8;
  }

  // ---------- Stage script ----------

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
    this.spawnIdx = 0;
  }

  private updateScript(): void {
    const m = this.mode;
    if (m === 'waves1' || m === 'waves2') {
      const list = m === 'waves1' ? this.spawns1 : this.spawns2;
      while (this.spawnIdx < list.length && list[this.spawnIdx].t <= this.modeT) this.spawnEnemy(list[this.spawnIdx++]);
      const last = list.length ? list[list.length - 1].t : 0;
      const alive = this.enemies.some((e) => !e.dead);
      if (this.spawnIdx >= list.length && (!alive || this.modeT > last + 420)) {
        const def = this.stageDef;
        this.startBoss(m === 'waves1' ? def.mid : def.boss, m === 'waves1');
      }
    } else if (m === 'mid' || m === 'boss') {
      this.updateBoss();
    } else if (m === 'clear') {
      this.vacuum = 2;
    }
  }

  private spawnEnemy(s: Spawn): void {
    const d = ENEMIES[s.e];
    const hp = d.hp * (1 + 0.3 * this.stage) * this.hpMul * TUNE.enemyHp;
    let x0 = s.x;
    let y0 = -20;
    if (s.path === 'swoop') x0 = s.dir > 0 ? -20 : W + 20;
    if (s.path === 'cross') {
      x0 = s.dir > 0 ? -20 : W + 20;
      y0 = 50 + this.rng.next() * 110;
    }
    const e: Enemy = {
      def: d, boss: false, hp, maxHp: hp, r: d.r, col: d.col, petals: d.petals,
      x: x0, y: y0, t: 0, path: s.path, x0, y0, vx: 0, dir: s.dir,
      emits: [], flash: 0, dead: false,
    };
    if (s.path === 'dive') e.vx = clamp((this.px - x0) / (H / 2.6), -1.6, 1.6);
    if (s.path === 'stop') e.vx = 70 + this.rng.next() * 70;
    const em = this.stage >= 2 && d.hard ? [...d.emit, ...d.hard] : d.emit;
    e.emits = em.map((def) => newEmit(def, this.rng.next() * TAU));
    this.enemies.push(e);
  }

  private moveEnemy(e: Enemy): void {
    const t = e.t;
    switch (e.path) {
      case 'down':
        e.y = e.y0 + 1.4 * t;
        break;
      case 'sine':
        e.y = e.y0 + 1.2 * t;
        e.x = e.x0 + 50 * Math.sin(t * 0.035 + e.dir);
        break;
      case 'stop': {
        // e.vx holds the stop height.
        const stopY = e.vx;
        if (t < 70) e.y = e.y0 + (stopY - e.y0) * (1 - (1 - t / 70) ** 2);
        else if (t > 330) {
          e.y -= 1.3;
          e.x += e.dir * 0.6;
        }
        break;
      }
      case 'swoop': {
        const T = (W + 40) / 1.9;
        e.x = e.x0 + e.dir * 1.9 * t;
        e.y = -20 + 230 * Math.sin(Math.PI * Math.min(t / T, 1));
        break;
      }
      case 'cross':
        e.x = e.x0 + e.dir * 1.5 * t;
        e.y = e.y0 + 10 * Math.sin(t * 0.05);
        break;
      case 'dive':
        e.y = e.y0 + 2.6 * t;
        e.x = e.x0 + e.vx * t;
        break;
    }
  }

  // ---------- Bosses ----------

  private startBoss(id: string, mid: boolean): void {
    const def = BOSSES[id];
    this.setMode(mid ? 'mid' : 'boss');
    const e: Enemy = {
      def: null, boss: true, hp: 1, maxHp: 1, r: def.r, col: def.col, petals: def.petals,
      x: W / 2, y: -40, t: 0, path: 'down', x0: W / 2, y0: -40, vx: 0, dir: 1, emits: [], flash: 0, dead: false,
    };
    this.enemies.push(e);
    this.boss = { def, mid, e, phase: -1, phaseT: 0, timeLeft: 0, captured: true, intro: 110, pause: 0, tx: W / 2, ty: 100, banner: 0 };
    this.text(W / 2, 150, def.name, def.col, true);
  }

  private startPhase(i: number): void {
    const b = this.boss!;
    const ph = b.def.phases[i];
    b.phase = i;
    b.phaseT = 0;
    b.timeLeft = ph.time * 60;
    b.captured = true;
    const hp = ph.hp * this.hpMul * TUNE.bossHp;
    b.e.hp = hp;
    b.e.maxHp = hp;
    b.e.emits = ph.emit.map((d) => newEmit(d, this.rng.next() * TAU));
    if (ph.name) {
      b.banner = 150;
      this.spellsSeen++;
      this.ev.spell++;
    }
  }

  private updateBoss(): void {
    const b = this.boss;
    if (!b) return;
    const e = b.e;
    if (b.banner > 0) b.banner--;
    if (b.intro > 0) {
      e.x += (W / 2 - e.x) * 0.05;
      e.y += (100 - e.y) * 0.04;
      if (--b.intro === 0) this.startPhase(0);
      return;
    }
    if (b.pause > 0) {
      e.x += (W / 2 - e.x) * 0.04;
      e.y += (100 - e.y) * 0.04;
      if (--b.pause === 0) this.startPhase(b.phase + 1);
      return;
    }
    b.phaseT++;
    b.timeLeft--;
    const ph = b.def.phases[b.phase];
    switch (ph.move) {
      case 'center':
        b.tx = W / 2;
        b.ty = 100;
        break;
      case 'sway':
        b.tx = W / 2 + 95 * Math.sin(b.phaseT * 0.011);
        b.ty = 95 + 12 * Math.sin(b.phaseT * 0.023);
        break;
      case 'wander':
        if (b.phaseT % 150 === 1) {
          b.tx = 70 + this.rng.next() * (W - 140);
          b.ty = 70 + this.rng.next() * 60;
        }
        break;
      case 'still':
        break;
    }
    const dx = b.tx - e.x;
    const dy = b.ty - e.y;
    const d = Math.hypot(dx, dy);
    const v = Math.min(d, 1.3);
    if (d > 0.01) {
      e.x += (dx / d) * v;
      e.y += (dy / d) * v;
    }
    if (b.phaseT > 30) for (const es of e.emits) this.runEmitter(es, e.x, e.y);
    if (e.hp <= 0 || b.timeLeft <= 0) this.endPhase(b.timeLeft <= 0 && e.hp > 0);
  }

  private endPhase(timeout: boolean): void {
    const b = this.boss!;
    const e = b.e;
    const ph = b.def.phases[b.phase];
    this.cancelBullets(true);
    this.vacuum = 90;
    this.burst(e.x, e.y, 24, 0, 3);
    this.dropItems(e.x, e.y, 10, 3, 0);
    this.ev.phase++;
    if (ph.name && b.captured && !timeout) {
      const bonus = Math.round((40000 * (this.stage + 1) * (1 + this.loop) * (0.5 + (0.5 * b.timeLeft) / (ph.time * 60))) / 10) * 10;
      this.score += bonus;
      this.spellsCaptured++;
      this.ev.capture++;
      this.dropItems(e.x, e.y, 0, 0, 1);
      this.text(W / 2, 170, `Spell Card Bonus! +${bonus.toLocaleString('en-US')}`, '#ffd166', true);
    } else if (ph.name) {
      this.text(W / 2, 170, timeout ? 'Time out' : 'Bonus failed', '#a99bbd', true);
    }
    if (b.phase + 1 < b.def.phases.length) {
      b.pause = 60;
      return;
    }
    // Boss down
    e.dead = true;
    this.kills++;
    this.burst(e.x, e.y, 80, 0, 6);
    this.ev.big++;
    this.score += 20000 * (this.stage + 1) * (b.mid ? 1 : 3);
    this.boss = null;
    if (b.mid) {
      this.setMode('waves2');
    } else {
      this.setMode('clear');
      this.hitT = 0;
      this.ev.clear++;
      if (this.deaths === 0) {
        const nb = 100000 * (this.stage + 1);
        this.score += nb;
        this.text(W / 2, 220, `No-hit bonus +${nb.toLocaleString('en-US')}`, '#7ee08a', true);
      }
    }
  }

  // ---------- Enemies and emitters ----------

  private updateEnemies(): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t++;
      if (e.flash > 0) e.flash--;
      if (e.boss) continue;
      this.moveEnemy(e);
      if (e.y > 0 && e.y < H * 0.68 && e.x > 0 && e.x < W) for (const es of e.emits) this.runEmitter(es, e.x, e.y);
      if (e.x < -40 || e.x > W + 40 || e.y > H + 40 || (e.y < -40 && e.t > 80)) e.dead = true;
      // Body contact
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      if (dx * dx + dy * dy < (e.r * 0.6 + HIT_R) ** 2) this.hitPlayer();
    }
    if (this.frame % 30 === 0) this.enemies = this.enemies.filter((e) => !e.dead);
  }

  private runEmitter(es: EmitState, x: number, y: number): void {
    const d = es.def;
    es.t++;
    const delay = d.delay ?? 0;
    if (es.t < delay) return;
    if (es.burstLeft > 0) {
      if (--es.burstT <= 0) {
        this.volley(es, x, y);
        es.burstLeft--;
        es.burstT = d.gap ?? 4;
      }
      return;
    }
    if (d.max && es.volleys >= d.max) return;
    const every = Math.max(2, Math.round(d.every / this.dens));
    if ((es.t - delay) % every === 0) {
      this.volley(es, x, y);
      es.volleys++;
      if (d.burst && d.burst > 1) {
        es.burstLeft = d.burst - 1;
        es.burstT = d.gap ?? 4;
      }
    }
  }

  private aimAt(x: number, y: number): number {
    return Math.atan2(this.py - y, this.px - x);
  }

  private volley(es: EmitState, x0: number, y0: number): void {
    const d = es.def;
    const x = x0 + (d.ox ?? 0);
    const y = y0 + (d.oy ?? 0);
    const n = d.n ?? 1;
    const r = d.r ?? 3;
    const col = d.col ?? 0;
    const acc = d.acc ?? 0;
    const turn = d.turn ?? 0;
    const layers = d.layers ?? 1;
    const sm = this.spdMul;
    for (let li = 0; li < layers; li++) {
      const spd = (layers > 1 ? d.spd + ((d.spd2 ?? d.spd) - d.spd) * (li / (layers - 1)) : d.spd) * sm;
      switch (d.k) {
        case 'ring': {
          const base = es.ang + (d.aim ? this.aimAt(x, y) : Math.PI / 2);
          for (let i = 0; i < n; i++) this.bullet(x, y, base + (TAU * i) / n, spd, r, col, acc, turn);
          break;
        }
        case 'spiral': {
          for (let i = 0; i < n; i++) {
            this.bullet(x, y, es.ang + (TAU * i) / n, spd, r, col, acc, turn);
            if (d.mirror) this.bullet(x, y, Math.PI - es.ang + (TAU * i) / n, spd, r, col, acc, -turn);
          }
          break;
        }
        case 'aimed':
        case 'fan': {
          const base = d.k === 'aimed' ? this.aimAt(x, y) : (d.dir ?? Math.PI / 2);
          const arc = d.arc ?? 0;
          for (let i = 0; i < n; i++) this.bullet(x, y, base + (n > 1 ? arc * (i / (n - 1) - 0.5) : 0), spd, r, col, acc, turn);
          break;
        }
        case 'rain': {
          for (let i = 0; i < n; i++) {
            const s = (d.spd + this.rng.next() * ((d.spd2 ?? d.spd) - d.spd)) * sm;
            this.bullet(10 + this.rng.next() * (W - 20), -6, Math.PI / 2 + (this.rng.next() - 0.5) * 0.35, s, r, col, acc, turn);
          }
          break;
        }
        case 'flower': {
          for (let i = 0; i < n; i++) this.bullet(x, y, es.ang + (TAU * i) / n, spd, r, col, acc, i % 2 ? turn : -turn);
          break;
        }
        case 'random': {
          const dir = d.dir ?? Math.PI / 2;
          const arc = d.arc ?? TAU;
          for (let i = 0; i < n; i++) {
            const s = (d.spd + this.rng.next() * ((d.spd2 ?? d.spd) - d.spd)) * sm;
            this.bullet(x, y, dir + (this.rng.next() - 0.5) * arc, s, r, col, acc, turn);
          }
          break;
        }
      }
    }
    es.ang += d.spin ?? (d.k === 'flower' ? 0.17 : 0);
  }

  private bullet(x: number, y: number, ang: number, spd: number, r: number, col: number, acc: number, turn: number): void {
    if (this.bn >= MAXB) return;
    const i = this.bn++;
    this.bx[i] = x;
    this.by[i] = y;
    this.bang[i] = ang;
    this.bspd[i] = spd;
    this.bvx[i] = Math.cos(ang) * spd;
    this.bvy[i] = Math.sin(ang) * spd;
    this.bacc[i] = acc;
    this.bturn[i] = turn;
    this.br[i] = r;
    this.bcol[i] = col;
    this.bgrazed[i] = 0;
    this.bage[i] = 0;
  }

  private removeBullet(i: number): void {
    const j = --this.bn;
    if (i === j) return;
    this.bx[i] = this.bx[j];
    this.by[i] = this.by[j];
    this.bvx[i] = this.bvx[j];
    this.bvy[i] = this.bvy[j];
    this.bang[i] = this.bang[j];
    this.bspd[i] = this.bspd[j];
    this.bacc[i] = this.bacc[j];
    this.bturn[i] = this.bturn[j];
    this.br[i] = this.br[j];
    this.bcol[i] = this.bcol[j];
    this.bgrazed[i] = this.bgrazed[j];
    this.bage[i] = this.bage[j];
  }

  /** Remove all enemy bullets. With `items`, some turn into small point items. */
  cancelBullets(items: boolean): void {
    for (let i = 0; i < this.bn; i++) {
      if (i % 3 === 0) this.particle(this.bx[i], this.by[i], (this.rng.next() - 0.5) * 2, (this.rng.next() - 0.5) * 2, this.bcol[i]);
      if (items && i % 4 === 0) this.item(this.bx[i], this.by[i], 0, true);
    }
    if (items) this.score += this.bn * 10;
    this.bn = 0;
  }

  private updateBullets(): void {
    let i = 0;
    while (i < this.bn) {
      if (this.bacc[i] !== 0 || this.bturn[i] !== 0) {
        let s = this.bspd[i] + this.bacc[i];
        s = s < 0.3 ? 0.3 : s > 6 ? 6 : s;
        this.bspd[i] = s;
        const a = (this.bang[i] += this.bturn[i]);
        this.bvx[i] = Math.cos(a) * s;
        this.bvy[i] = Math.sin(a) * s;
      }
      const x = (this.bx[i] += this.bvx[i]);
      const y = (this.by[i] += this.bvy[i]);
      if (this.bage[i] < 65000) this.bage[i]++;
      if (x < -24 || x > W + 24 || y < -30 || y > H + 24) this.removeBullet(i);
      else i++;
    }
  }

  private buildGrid(): void {
    const cs = this.cellStart;
    const fill = this.cellFill;
    cs.fill(0);
    for (let i = 0; i < this.bn; i++) {
      const cx = clamp(Math.floor((this.bx[i] + GOFF) / CELL), 0, GC - 1);
      const cy = clamp(Math.floor((this.by[i] + GOFF) / CELL), 0, GR - 1);
      const c = cy * GC + cx;
      this.cellOf[i] = c;
      cs[c + 1]++;
    }
    for (let c = 0; c < GC * GR; c++) cs[c + 1] += cs[c];
    fill.set(cs.subarray(0, GC * GR));
    for (let i = 0; i < this.bn; i++) this.gridIdx[fill[this.cellOf[i]]++] = i;
  }

  /** Write the indices of bullets in the grid cells around (x, y) within `rad` into `out`. Returns the count. */
  near(x: number, y: number, rad: number, out: Int32Array): number {
    const x0 = clamp(Math.floor((x - rad + GOFF) / CELL), 0, GC - 1);
    const x1 = clamp(Math.floor((x + rad + GOFF) / CELL), 0, GC - 1);
    const y0 = clamp(Math.floor((y - rad + GOFF) / CELL), 0, GR - 1);
    const y1 = clamp(Math.floor((y + rad + GOFF) / CELL), 0, GR - 1);
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * GC + cx;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) out[n++] = this.gridIdx[k];
      }
    }
    return n;
  }

  private collidePlayer(): void {
    if (this.mode === 'over' || this.hitT > 0) return;
    const n = this.near(this.px, this.py, GRAZE_R + 10, this.near1);
    const L = this.load;
    for (let k = 0; k < n; k++) {
      const i = this.near1[k];
      const dx = this.bx[i] - this.px;
      const dy = this.by[i] - this.py;
      const d2 = dx * dx + dy * dy;
      const r = this.br[i];
      if (d2 < (r * 0.75 + HIT_R) ** 2) {
        this.hitPlayer();
        if (this.hitT > 0 || this.god) continue;
      } else if (!this.bgrazed[i] && d2 < (r + GRAZE_R) ** 2 && this.mode !== 'clear') {
        this.bgrazed[i] = 1;
        this.graze++;
        this.charge += 0.3 * L.grazeMul;
        this.score += 200 * L.grazeScore;
        this.ev.graze++;
        this.particle(this.px + dx * 0.5, this.py + dy * 0.5, dx * 0.08, dy * 0.08, 8);
      }
    }
  }

  // ---------- Player shots ----------

  private damage(e: Enemy, dmg: number): void {
    if (e.dead) return;
    if (e.boss) {
      const b = this.boss;
      if (!b || b.intro > 0 || b.pause > 0) return;
    }
    e.hp -= dmg;
    e.flash = 3;
    this.score += Math.round(dmg * 5);
    if (e.hp <= 0 && !e.boss) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    this.kills++;
    const d = e.def!;
    this.score += Math.round(d.hp * 30 * (1 + this.stage * 0.3));
    this.burst(e.x, e.y, 10 + e.r, 0, 2.5);
    this.dropItems(e.x, e.y, d.drop[0], d.drop[1], 0);
    if (e.r >= 14) this.ev.big++;
    else this.ev.kill++;
    if (d.revenge && this.stage >= 3 && this.bombT === 0) {
      const base = this.aimAt(e.x, e.y);
      for (let i = 0; i < d.revenge; i++) this.bullet(e.x, e.y, base + (TAU * i) / d.revenge, 1.5 * this.spdMul, 3, 7, 0, 0);
    }
  }

  private updateShots(): void {
    let i = 0;
    while (i < this.sn) {
      if (this.skind[i] === 1) {
        // Homing needle: turn toward the closest enemy.
        let best: Enemy | null = null;
        let bd = 1e9;
        for (const e of this.enemies) {
          if (e.dead || e.y < 0) continue;
          const d = (e.x - this.sx[i]) ** 2 + (e.y - this.sy[i]) ** 2;
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) {
          const want = Math.atan2(best.y - this.sy[i], best.x - this.sx[i]);
          const cur = Math.atan2(this.svy[i], this.svx[i]);
          let da = want - cur;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          const a = cur + clamp(da, -0.14, 0.14);
          this.svx[i] = Math.cos(a) * 8;
          this.svy[i] = Math.sin(a) * 8;
        }
      }
      const x = (this.sx[i] += this.svx[i]);
      const y = (this.sy[i] += this.svy[i]);
      let hit = false;
      if (y < -20 || x < -20 || x > W + 20 || y > H + 20) hit = true;
      else {
        for (const e of this.enemies) {
          if (e.dead || e.y < -e.r) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          const rr = e.r + 4;
          if (dx * dx + dy * dy < rr * rr) {
            this.damage(e, this.sdmg[i]);
            this.ev.hit++;
            if (this.rng.next() < 0.3) this.particle(x, y, (this.rng.next() - 0.5) * 3, -1 - this.rng.next() * 2, 3);
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        const j = --this.sn;
        this.sx[i] = this.sx[j];
        this.sy[i] = this.sy[j];
        this.svx[i] = this.svx[j];
        this.svy[i] = this.svy[j];
        this.sdmg[i] = this.sdmg[j];
        this.skind[i] = this.skind[j];
      } else i++;
    }
  }

  // ---------- Items ----------

  private item(x: number, y: number, k: number, pull: boolean): void {
    if (this.inn >= MAXI) return;
    const i = this.inn++;
    this.ix[i] = x;
    this.iy[i] = y;
    this.ivy[i] = -1.5 - this.rng.next();
    this.ik[i] = k;
    this.ipull[i] = pull ? 2 : 0;
  }

  private dropItems(x: number, y: number, points: number, blooms: number, big: number): void {
    const sp = (n: number) => (this.rng.next() - 0.5) * Math.min(60, 10 + n * 4);
    for (let i = 0; i < points; i++) this.item(x + sp(points), y + sp(points), 0, false);
    for (let i = 0; i < blooms; i++) this.item(x + sp(blooms), y + sp(blooms), 1, false);
    for (let i = 0; i < big; i++) this.item(x, y, 2, false);
  }

  private updateItems(): void {
    const line = this.py < COLLECT_Y && this.hitT === 0 && this.mode !== 'over';
    const mag = this.load.magnet * (this.focus ? 1.4 : 1);
    let i = 0;
    while (i < this.inn) {
      const dx = this.px - this.ix[i];
      const dy = this.py - this.iy[i];
      const d = Math.hypot(dx, dy);
      if (this.ipull[i] === 0 && (line || this.vacuum > 0 || this.bombT > 0 || d < mag) && this.mode !== 'over') this.ipull[i] = line || this.vacuum > 0 || this.bombT > 0 ? 2 : 1;
      if (this.ipull[i] > 0 && this.mode !== 'over') {
        const v = Math.max(7, d * 0.12);
        if (d > 0.1) {
          this.ix[i] += (dx / d) * Math.min(v, d);
          this.iy[i] += (dy / d) * Math.min(v, d);
        }
      } else {
        this.ivy[i] = Math.min(this.ivy[i] + 0.05, 1.6);
        this.iy[i] += this.ivy[i];
      }
      let gone = this.iy[i] > H + 12;
      if (!gone && d < 16 && this.mode !== 'over') {
        gone = true;
        this.collect(this.ik[i], this.ipull[i] === 2);
      }
      if (gone) {
        const j = --this.inn;
        this.ix[i] = this.ix[j];
        this.iy[i] = this.iy[j];
        this.ivy[i] = this.ivy[j];
        this.ik[i] = this.ik[j];
        this.ipull[i] = this.ipull[j];
      } else i++;
    }
  }

  private collect(k: number, full: boolean): void {
    this.ev.item++;
    if (k === 0) {
      const f = full ? 1 : clamp((H - this.py) / (H - COLLECT_Y), 0.15, 1);
      const v = Math.round((300 + 2700 * f) * (1 + 0.25 * this.stage)) * 10 / 10;
      this.score += Math.round(v / 10) * 10;
      this.points++;
      if (f >= 1 && this.frame % 3 === 0) this.text(this.px, this.py - 14, `${Math.round(v / 10) * 10}`, '#4cc9f0', false);
    } else if (k === 1) {
      this.charge += 2;
      this.score += 100;
    } else {
      this.charge += 25;
      this.score += 5000;
      this.text(this.px, this.py - 18, 'BLOOM', '#ff70a6', true);
    }
  }

  // ---------- Effects ----------

  particle(x: number, y: number, vx: number, vy: number, col: number): void {
    if (this.pn >= MAXP) return;
    const i = this.pn++;
    this.ppx[i] = x;
    this.ppy[i] = y;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pl[i] = 1;
    this.pc[i] = col;
  }

  private burst(x: number, y: number, n: number, col: number, spd: number): void {
    for (let k = 0; k < n; k++) {
      const a = this.rng.next() * TAU;
      const s = spd * (0.3 + this.rng.next());
      this.particle(x, y, Math.cos(a) * s, Math.sin(a) * s, k % 3 === 0 ? 8 : col);
    }
  }

  text(x: number, y: number, s: string, c: string, big: boolean): void {
    if (this.texts.length > 24) this.texts.shift();
    this.texts.push({ x, y, s, t: big ? 120 : 45, c, big });
  }

  private updateFx(): void {
    let i = 0;
    while (i < this.pn) {
      this.ppx[i] += this.pvx[i];
      this.ppy[i] += this.pvy[i];
      this.pvx[i] *= 0.95;
      this.pvy[i] *= 0.95;
      this.pl[i] -= 0.03;
      if (this.pl[i] <= 0) {
        const j = --this.pn;
        this.ppx[i] = this.ppx[j];
        this.ppy[i] = this.ppy[j];
        this.pvx[i] = this.pvx[j];
        this.pvy[i] = this.pvy[j];
        this.pl[i] = this.pl[j];
        this.pc[i] = this.pc[j];
      } else i++;
    }
    for (const t of this.texts) {
      t.t--;
      t.y -= t.big ? 0.25 : 0.6;
    }
    if (this.texts.length && this.texts[0].t <= 0) this.texts = this.texts.filter((t) => t.t > 0);
  }
}

function newEmit(def: Emit, ang: number): EmitState {
  return { def, t: 0, ang: def.k === 'ring' || def.k === 'aimed' ? 0 : ang, burstLeft: 0, burstT: 0, volleys: 0 };
}

/** Turn the stage's wave pool into a timed spawn list. */
function buildSpawns(rng: Rng, pool: WaveDef[], len: number): Spawn[] {
  const out: Spawn[] = [];
  let t = 90;
  let prev = -1;
  while (t < len) {
    let k = rng.int(0, pool.length - 1);
    if (k === prev) k = (k + 1) % pool.length;
    prev = k;
    const wd = pool[k];
    const flip = rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < wd.n; i++) {
      let x = W / 2;
      let dir = flip;
      switch (wd.xs) {
        case 'line':
          x = wd.n > 1 ? 40 + ((W - 80) * (flip > 0 ? i : wd.n - 1 - i)) / (wd.n - 1) : W / 2;
          break;
        case 'left':
          dir = 1;
          x = 40;
          break;
        case 'right':
          dir = -1;
          x = W - 40;
          break;
        case 'mid':
          x = W / 2 + (rng.next() - 0.5) * 60;
          break;
        case 'rand':
          x = 40 + rng.next() * (W - 80);
          break;
        case 'pair':
          x = i % 2 === 0 ? W * 0.28 : W * 0.72;
          dir = i % 2 === 0 ? -1 : 1;
          break;
        case 'side':
          dir = i % 2 === 0 ? 1 : -1;
          break;
      }
      out.push({ t: t + i * wd.gap, e: wd.e, x, path: wd.path, dir });
    }
    t += wd.dur + rng.int(10, 50);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
