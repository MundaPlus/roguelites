/** One level in play: fixed 60 Hz step of the player, enemies, items and traps. No DOM. */
import {
  ARROW,
  CRUSH,
  DIRT,
  EMPTY,
  ENEMIES,
  GEMS,
  GOLDV,
  ICE,
  ICICLE,
  ITEMS,
  LADDER,
  LAVA,
  PASSIVES,
  PLAT,
  ROCK,
  SPIKES,
  TS,
  isBreakable,
  isSolid,
  type EnemyDef,
} from './data';
import type { Level } from './level';
import { buildNav, type Grid, type Nav } from './nav';
import { Rng, hash } from './rng';

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
  bomb: boolean;
  rope: boolean;
}

export const noInput = (): Input => ({ left: false, right: false, up: false, down: false, jump: false, attack: false, bomb: false, rope: false });

export type Kind = 'enemy' | 'gold' | 'gem' | 'crate' | 'pot' | 'rock' | 'bomb' | 'arrow' | 'pellet' | 'fall' | 'item' | 'ware' | 'pet' | 'keeper' | 'ghost';

export interface Ent {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  dead: boolean;
  t: number;
  state: string;
  dir: number;
  hp: number;
  maxHp: number;
  hurtT: number;
  /** Enemy id, item id or pet emoji. */
  eid: string;
  /** Gold value, gem index or price. */
  value: number;
  held: boolean;
  thrown: boolean;
  swing: number;
  def: EnemyDef | null;
}

export interface Rope {
  x: number;
  top: number;
  bottom: number;
}

export interface Carry {
  hp: number;
  bombs: number;
  ropes: number;
  gold: number;
  items: string[];
  kills: number;
}

export type Ev =
  | { kind: 'sfx'; name: string }
  | { kind: 'fx'; fx: string; x: number; y: number; text?: string; color?: string }
  | { kind: 'shake'; amt: number }
  | { kind: 'toast'; text: string };

export interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: number;
  state: 'normal' | 'climb' | 'hang';
  coyote: number;
  jumpBuf: number;
  invuln: number;
  stun: number;
  whipT: number;
  whipCd: number;
  swing: number;
  holding: Ent | null;
  jetFuel: number;
  jetOn: boolean;
  regrab: number;
  climbCd: number;
  dropT: number;
  dropping: number;
  dead: boolean;
  deathT: number;
}

const GRAV = 0.38;
const MAXFALL = 7.5;
const RUN = 2.2;
const JUMP = 6.8;
const CLIMB = 1.6;
const GHOST_AT = 180 * 60;

const approach = (v: number, t: number, a: number): number => (v < t ? Math.min(t, v + a) : Math.max(t, v - a));
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const cx = (e: { x: number; w: number }): number => e.x + e.w / 2;
const cy = (e: { y: number; h: number }): number => e.y + e.h / 2;

export class World {
  readonly w: number;
  readonly h: number;
  tiles: Uint8Array;
  ents: Ent[] = [];
  ropes: Rope[] = [];
  events: Ev[] = [];
  p: Player;
  hp: number;
  bombs: number;
  ropesLeft: number;
  gold: number;
  items: string[];
  kills: number;
  levelKills = 0;
  levelGold = 0;
  frame = 0;
  exitOpen: boolean;
  done: 'exit' | 'dead' | null = null;
  petRescued = false;
  bossDead = false;
  /** Damage taken per cause, for the balance sim. */
  hurtLog: Record<string, number> = {};
  navDirty = true;
  private nav: Nav | null = null;
  private prev: Input = noInput();
  private nextId = 1;
  private rng: Rng;
  traps: { x: number; y: number; state: 'armed' | 'shake'; t: number; icicle: boolean }[] = [];
  private arrows = new Map<number, number>();
  private ghostCd = 0;
  private bossJumps = 0;
  private keeperGreeted = false;

  constructor(
    readonly level: Level,
    carry: Carry,
    seed: string,
  ) {
    this.w = level.w;
    this.h = level.h;
    this.tiles = level.tiles.slice();
    this.rng = new Rng(hash(seed, 'world', level.index));
    this.hp = carry.hp;
    this.bombs = carry.bombs;
    this.ropesLeft = carry.ropes;
    this.gold = carry.gold;
    this.items = [...carry.items];
    this.kills = carry.kills;
    this.exitOpen = !level.boss;
    const e = level.entrance;
    this.p = {
      x: e.x * TS + 3,
      y: (e.y + 1) * TS - 14,
      w: 10,
      h: 14,
      vx: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      state: 'normal',
      coyote: 0,
      jumpBuf: 0,
      invuln: 60,
      stun: 0,
      whipT: 0,
      whipCd: 0,
      swing: 0,
      holding: null,
      jetFuel: 90,
      jetOn: false,
      regrab: 0,
      climbCd: 0,
      dropT: 0,
      dropping: 0,
      dead: false,
      deathT: 0,
    };
    for (const [k, d] of level.arrowDir) this.arrows.set(k, d);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const t = this.tile(x, y);
        if (t === CRUSH || t === ICICLE) this.traps.push({ x, y, state: 'armed', t: 0, icicle: t === ICICLE });
      }
    for (const s of level.spawns) {
      const bx = s.x * TS + TS / 2;
      const by = (s.y + 1) * TS;
      switch (s.kind) {
        case 'enemy': {
          const def = ENEMIES[s.id!];
          const ceiling = def.brain === 'bat' || def.brain === 'spider';
          const en = this.spawn('enemy', bx - def.w / 2, ceiling ? s.y * TS : by - def.h, def.w, def.h);
          en.eid = s.id!;
          en.def = def;
          en.hp = en.maxHp = def.hp;
          en.dir = this.rng.chance(0.5) ? 1 : -1;
          en.state = ceiling ? 'hang' : def.brain === 'boss' ? 'wait' : 'walk';
          en.t = this.rng.int(0, 60);
          break;
        }
        case 'gold':
          this.spawn('gold', bx - 4, by - 6, 8, 6).value = s.value!;
          break;
        case 'gem':
          this.spawn('gem', bx - 4, by - 7, 8, 7).value = s.value!;
          break;
        case 'crate':
          this.spawn('crate', bx - 6, by - 12, 12, 12).hp = 1;
          break;
        case 'pot':
          this.spawn('pot', bx - 5, by - 10, 10, 10);
          break;
        case 'rock':
          this.spawn('rock', bx - 4, by - 7, 8, 7);
          break;
        case 'pet': {
          const pet = this.spawn('pet', bx - 6, by - 10, 12, 10);
          pet.eid = s.id!;
          pet.state = 'wait';
          break;
        }
        case 'shopkeeper':
          this.spawn('keeper', bx - 6, by - 15, 12, 15);
          break;
        case 'ware': {
          const wv = this.spawn('ware', bx - 6, by - 12, 12, 12);
          wv.eid = s.id!;
          wv.value = s.value!;
          break;
        }
      }
    }
  }

  // ---------- Tiles ----------

  tile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return ROCK;
    return this.tiles[y * this.w + x];
  }

  setTile(x: number, y: number, t: number): void {
    if (x <= 0 || y <= 0 || x >= this.w - 1 || y >= this.h - 1) return;
    this.tiles[y * this.w + x] = t;
    this.navDirty = true;
  }

  solidAt(px: number, py: number): boolean {
    return isSolid(this.tile(Math.floor(px / TS), Math.floor(py / TS)));
  }

  climbable(x: number, y: number): boolean {
    if (this.tile(x, y) === LADDER) return true;
    for (const r of this.ropes) if (r.x === x && y >= r.top && y <= r.bottom) return true;
    return false;
  }

  grid(): Grid {
    return { w: this.w, h: this.h, tile: (x, y) => this.tile(x, y), climb: (x, y) => this.climbable(x, y) };
  }

  getNav(): Nav {
    if (!this.nav || this.navDirty) {
      this.nav = buildNav(this.grid());
      this.navDirty = false;
    }
    return this.nav;
  }

  has(item: string): boolean {
    return this.items.includes(item);
  }

  carry(): Carry {
    return { hp: this.hp, bombs: this.bombs, ropes: this.ropesLeft, gold: this.gold, items: [...this.items], kills: this.kills };
  }

  private emit(ev: Ev): void {
    if (this.events.length < 200) this.events.push(ev);
  }

  private sfx(name: string): void {
    this.emit({ kind: 'sfx', name });
  }

  private fx(fx: string, x: number, y: number, text?: string, color?: string): void {
    this.emit({ kind: 'fx', fx, x, y, text, color });
  }

  private spawn(kind: Kind, x: number, y: number, w: number, h: number): Ent {
    const e: Ent = {
      id: this.nextId++,
      kind,
      x,
      y,
      w,
      h,
      vx: 0,
      vy: 0,
      onGround: false,
      dead: false,
      t: 0,
      state: '',
      dir: 1,
      hp: 1,
      maxHp: 1,
      hurtT: 0,
      eid: '',
      value: 0,
      held: false,
      thrown: false,
      swing: -1,
      def: null,
    };
    this.ents.push(e);
    return e;
  }

  // ---------- Collision ----------

  /** Moves along x. Returns true on a wall hit. */
  private moveX(e: { x: number; y: number; w: number; h: number }, dx: number): boolean {
    if (dx === 0) return false;
    e.x += dx;
    const y0 = Math.floor(e.y / TS);
    const y1 = Math.floor((e.y + e.h - 0.001) / TS);
    const col = dx > 0 ? Math.floor((e.x + e.w - 0.001) / TS) : Math.floor(e.x / TS);
    for (let y = y0; y <= y1; y++) {
      if (isSolid(this.tile(col, y))) {
        e.x = dx > 0 ? col * TS - e.w : (col + 1) * TS;
        return true;
      }
    }
    return false;
  }

  private rectFree(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TS);
    const x1 = Math.floor((x + w - 0.001) / TS);
    const y0 = Math.floor(y / TS);
    const y1 = Math.floor((y + h - 0.001) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(this.tile(tx, ty))) return false;
    return true;
  }

  private nudge(p: Player, ox: number, dx: number): boolean {
    for (let off = 1; off <= 6; off++) {
      for (const s of [1, -1]) {
        const ny = p.y + off * s;
        if (this.rectFree(ox, ny, p.w, p.h) && this.rectFree(ox + dx, ny, p.w, p.h)) {
          p.y = ny;
          p.x = ox + dx;
          return true;
        }
      }
    }
    return false;
  }

  /** Moves along y. Returns 'floor', 'ceil' or null. */
  private moveY(e: { x: number; y: number; w: number; h: number }, dy: number, oneWay: boolean, ladderTops = true): 'floor' | 'ceil' | null {
    if (dy === 0) return null;
    const oldBottom = e.y + e.h;
    e.y += dy;
    const x0 = Math.floor(e.x / TS);
    const x1 = Math.floor((e.x + e.w - 0.001) / TS);
    if (dy > 0) {
      const row = Math.floor((e.y + e.h - 0.001) / TS);
      for (let x = x0; x <= x1; x++) {
        const t = this.tile(x, row);
        let block = isSolid(t);
        if (!block && oneWay && oldBottom <= row * TS + 0.01) {
          if (t === PLAT || (ladderTops && t === LADDER && this.tile(x, row - 1) !== LADDER)) block = true;
        }
        if (block) {
          e.y = row * TS - e.h;
          return 'floor';
        }
      }
    } else {
      const row = Math.floor(e.y / TS);
      for (let x = x0; x <= x1; x++) {
        if (isSolid(this.tile(x, row))) {
          e.y = (row + 1) * TS;
          return 'ceil';
        }
      }
    }
    return null;
  }

  /** Gravity body step for items and walkers. */
  private body(e: Ent, bounce = 0, oneWay = true): { hitX: boolean; landed: number } {
    e.vy = Math.min(e.vy + GRAV, MAXFALL);
    const hitX = this.moveX(e, e.vx);
    if (hitX) e.vx = bounce ? -e.vx * bounce : 0;
    const impact = e.vy;
    const r = this.moveY(e, e.vy, oneWay);
    const was = e.onGround;
    e.onGround = false;
    let landed = 0;
    if (r === 'floor') {
      e.onGround = true;
      if (!was) landed = impact;
      if (bounce && impact > 2) {
        e.vy = -impact * bounce;
        e.vx *= 0.7;
        e.onGround = false;
      } else e.vy = 0;
    } else if (r === 'ceil') e.vy = 0;
    if (e.onGround) e.vx *= bounce ? 0.85 : 1;
    return { hitX, landed };
  }

  private inLava(e: { x: number; y: number; w: number; h: number }): boolean {
    const x0 = Math.floor((e.x + 1) / TS);
    const x1 = Math.floor((e.x + e.w - 1) / TS);
    const y0 = Math.floor((e.y + 2) / TS);
    const y1 = Math.floor((e.y + e.h - 1) / TS);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.tile(x, y) === LAVA) return true;
    return false;
  }

  // ---------- Step ----------

  step(inp: Input): void {
    if (this.done) return;
    this.frame++;
    const pr = {
      jump: inp.jump && !this.prev.jump,
      attack: inp.attack && !this.prev.attack,
      bomb: inp.bomb && !this.prev.bomb,
      rope: inp.rope && !this.prev.rope,
      up: inp.up && !this.prev.up,
    };
    this.prev = { ...inp };
    this.updatePlayer(inp, pr);
    this.updateEnts();
    this.updateTraps();
    this.updateGhost();
    if (this.ents.some((e) => e.dead)) this.ents = this.ents.filter((e) => !e.dead);
    const p = this.p;
    if (p.dead) {
      p.deathT++;
      if (p.deathT > 80) this.done = 'dead';
      return;
    }
    if (this.exitOpen) {
      const ex = this.level.exit;
      if (overlap(p, { x: ex.x * TS + 2, y: ex.y * TS, w: TS - 4, h: TS })) {
        this.done = 'exit';
        const pet = this.ents.find((e) => e.kind === 'pet' && e.state === 'follow');
        if (pet) this.petRescued = true;
        this.sfx('exit');
      }
    }
  }

  private updatePlayer(inp: Input, pr: { jump: boolean; attack: boolean; bomb: boolean; rope: boolean; up: boolean }): void {
    const p = this.p;
    if (p.dead) {
      p.vx *= 0.95;
      p.vy = Math.min(p.vy + GRAV, MAXFALL);
      this.moveX(p, p.vx);
      if (this.moveY(p, p.vy, true)) p.vy = 0;
      return;
    }
    if (p.invuln > 0) p.invuln--;
    if (p.stun > 0) p.stun--;
    if (p.whipCd > 0) p.whipCd--;
    if (p.whipT > 0) p.whipT--;
    if (p.regrab > 0) p.regrab--;
    if (p.climbCd > 0) p.climbCd--;
    if (p.dropping > 0) p.dropping--;
    const ctl = p.stun === 0;
    const L = ctl && inp.left;
    const R = ctl && inp.right;
    const U = ctl && inp.up;
    const D = ctl && inp.down;
    const jp = ctl && pr.jump;
    const jh = ctl && inp.jump;
    const dirIn = (R ? 1 : 0) - (L ? 1 : 0);
    if (dirIn !== 0 && p.whipT === 0) p.facing = dirIn;
    p.jumpBuf = jp ? 6 : Math.max(0, p.jumpBuf - 1);
    const jumpV = JUMP * (this.has('spring') ? 1.15 : 1);
    const pcx = p.x + p.w / 2;
    const col = Math.floor(pcx / TS);
    const midRow = Math.floor((p.y + p.h / 2) / TS);

    if (p.state === 'climb') {
      if (!this.climbable(col, midRow)) {
        p.state = 'normal';
      } else {
        p.vx = 0;
        p.x += (col * TS + TS / 2 - p.w / 2 - p.x) * 0.5;
        if (jp) {
          p.state = 'normal';
          p.vy = -jumpV * 0.8;
          p.vx = dirIn * RUN;
          p.jumpBuf = 0;
          p.climbCd = 12;
          this.sfx('jump');
        } else if (dirIn !== 0 && !U && !D && !isSolid(this.tile(col + dirIn, midRow)) && !isSolid(this.tile(col + dirIn, Math.floor((p.y + p.h - 1) / TS)))) {
          // Step off sideways.
          p.state = 'normal';
          p.vx = dirIn * 1.5;
          p.climbCd = 12;
        } else {
          p.vy = U ? -CLIMB : D ? CLIMB : 0;
          if (p.vy < 0) {
            const nextRow = Math.floor((p.y + p.h / 2 + p.vy) / TS);
            if (!this.climbable(col, nextRow)) {
              const t = this.tile(col, midRow);
              if (t === LADDER && !isSolid(this.tile(col, midRow - 1))) {
                // Step off the top of the ladder.
                p.y = midRow * TS - p.h;
                p.state = 'normal';
                p.onGround = true;
                p.vy = 0;
                p.climbCd = 8;
              } else p.vy = 0;
            }
          }
          if (p.state === 'climb') {
            if (this.moveY(p, p.vy, false) === 'floor' && D) {
              p.state = 'normal';
              p.onGround = true;
            }
            if (Math.floor(this.frame / 8) % 2 === 0 && p.vy !== 0 && this.frame % 8 === 0) this.sfx('climb');
          }
        }
      }
    } else if (p.state === 'hang') {
      p.vx = 0;
      p.vy = 0;
      const wallCol = Math.floor((p.facing > 0 ? p.x + p.w + 1 : p.x - 1) / TS);
      const row = Math.floor(p.y / TS);
      if (!isSolid(this.tile(wallCol, row))) p.state = 'normal';
      else if (jp) {
        p.state = 'normal';
        p.vy = -jumpV;
        p.regrab = 12;
        p.jumpBuf = 0;
        this.sfx('jump');
      } else if (D) {
        p.state = 'normal';
        p.regrab = 20;
      }
    }

    if (p.state === 'normal') {
      const footRow = Math.floor((p.y + p.h + 1) / TS);
      const onIce = p.onGround && this.tile(col, footRow) === ICE;
      if (p.stun > 0) p.vx *= 0.96;
      else if (dirIn !== 0) p.vx = approach(p.vx, dirIn * RUN, p.onGround ? (onIce ? 0.08 : 0.5) : 0.32);
      else p.vx = approach(p.vx, 0, p.onGround ? (onIce ? 0.03 : 0.5) : 0.12);

      let g = GRAV;
      if (p.vy < 0 && !jh) g *= 2.4;
      p.vy += g;
      let maxFall = MAXFALL;
      if (this.has('cape') && jh && p.vy > 0) maxFall = 1.6;
      if (p.onGround) {
        p.jetFuel = 90;
        p.jetOn = false;
      } else if (jp && p.coyote === 0) p.jetOn = true;
      if (!p.onGround && this.has('jetpack') && jh && p.jetOn && p.jetFuel > 0) {
        p.vy = Math.max(p.vy - 0.8, -3.4);
        p.jetFuel--;
        if (p.jetFuel % 4 === 0) this.fx('jet', pcx, p.y + p.h);
      }
      p.vy = Math.min(p.vy, maxFall);

      // Wall slide and wall jump with the gloves.
      if (!p.onGround && this.has('gloves') && dirIn !== 0) {
        const wx = dirIn > 0 ? p.x + p.w + 1 : p.x - 1;
        if (this.solidAt(wx, p.y + 2) || this.solidAt(wx, p.y + p.h - 2)) {
          if (p.vy > 1) p.vy = 1;
          if (jp) {
            p.vx = -dirIn * 3;
            p.vy = -jumpV * 0.9;
            p.facing = -dirIn;
            p.jumpBuf = 0;
            this.sfx('jump');
          }
        }
      }

      if (p.onGround) p.coyote = 6;
      else if (p.coyote > 0) p.coyote--;
      if (p.jumpBuf > 0 && p.coyote > 0 && ctl) {
        p.vy = -jumpV;
        p.coyote = 0;
        p.jumpBuf = 0;
        p.onGround = false;
        p.jetOn = false;
        this.sfx('jump');
      }

      // Drop through a wood platform: hold down.
      const under = this.tile(col, footRow);
      if (p.onGround && D && (under === PLAT || (under === LADDER && !this.climbable(col, footRow - 1)))) p.dropT++;
      else p.dropT = 0;
      if (p.dropT > 10 && under === PLAT) {
        p.dropping = 10;
        p.dropT = 0;
        p.onGround = false;
      }

      // Grab a ladder or a rope.
      if (p.climbCd === 0 && !p.holding) {
        if (U && this.climbable(col, midRow)) {
          p.state = 'climb';
          p.vx = 0;
          p.vy = 0;
        } else if (D && p.onGround && this.tile(col, footRow) === LADDER) {
          p.state = 'climb';
          p.y += 8;
          p.vx = 0;
          p.vy = 0;
        }
      }
    }

    if (p.state === 'normal') {
      // Ledge grab.
      if (!p.onGround && p.vy > 0 && dirIn !== 0 && p.regrab === 0 && !p.holding) {
        const wallCol = Math.floor((dirIn > 0 ? p.x + p.w + 1 : p.x - 1) / TS);
        const r = Math.floor((p.y + 4) / TS);
        const myCol = Math.floor(pcx / TS);
        if (isSolid(this.tile(wallCol, r)) && !isSolid(this.tile(wallCol, r - 1)) && !isSolid(this.tile(myCol, r - 1)) && p.y >= r * TS - 4 && p.y <= r * TS + 4) {
          p.state = 'hang';
          p.y = r * TS;
          p.vx = 0;
          p.vy = 0;
          p.x = dirIn > 0 ? wallCol * TS - p.w : (wallCol + 1) * TS;
          p.facing = dirIn;
          this.sfx('grab');
        }
      }
    }

    if (p.state === 'normal') {
      p.vx = Math.max(-7, Math.min(7, p.vx));
      const ox = p.x;
      if (this.moveX(p, p.vx)) {
        // Corner correction: slip into a one-tile gap when only a few pixels block the body.
        if (!p.onGround && !this.nudge(p, ox, p.vx)) p.vx = 0;
        else if (p.onGround) p.vx = 0;
      }
      const was = p.onGround;
      const impact = p.vy;
      p.onGround = false;
      const r = this.moveY(p, p.vy, p.dropping === 0);
      if (r === 'floor') {
        p.onGround = true;
        p.vy = 0;
        if (!was) {
          if (impact > 4) this.fx('dust', pcx, p.y + p.h);
          if (impact > 2.5) {
            const t = this.tile(Math.floor((p.x + p.w / 2) / TS), Math.floor((p.y + p.h - 1) / TS));
            if (t === SPIKES) this.hurt(2, pcx, 'spikes');
            else if (impact > 4) this.sfx('land');
          }
        }
      } else if (r === 'ceil') p.vy = 0;
    }

    if (this.inLava(p)) {
      this.hurt(3, pcx, 'lava', true);
      if (!p.dead) {
        p.vy = -7.5;
        p.state = 'normal';
      }
    }

    // Actions.
    if (ctl && !p.dead) {
      if (pr.attack) this.attack(D, U);
      if (pr.bomb) this.throwBomb(D, U);
      if (pr.rope) this.useRope();
      if (pr.up) this.buy();
    }
    if (p.whipT >= 4 && p.whipT <= 11) this.whipHits();
    if (p.holding) {
      const h = p.holding;
      h.x = p.facing > 0 ? p.x + p.w - 3 : p.x - h.w + 3;
      h.y = p.y + 3;
    }

    // Pickups.
    for (const e of this.ents) {
      if (e.dead || !overlap(p, e)) continue;
      if ((e.kind === 'gold' || e.kind === 'gem') && e.t <= 0) {
        const v = e.kind === 'gem' ? GEMS[e.value].value : e.value;
        this.gold += v;
        this.levelGold += v;
        e.dead = true;
        this.sfx(e.kind === 'gem' ? 'gem' : 'coin');
        this.fx('float', cx(e), e.y, `+${v}`, '#ffd166');
      } else if (e.kind === 'item' && e.t <= 0) {
        this.applyItem(e.eid);
        e.dead = true;
      } else if (e.kind === 'pet' && e.state === 'wait') {
        e.state = 'follow';
        this.sfx('pet');
        this.fx('float', cx(e), e.y, '♥', '#ff8fab');
        this.emit({ kind: 'toast', text: `${e.eid} Pet found! Bring it to the exit for +1 HP.` });
      }
    }
  }

  hurt(dmg: number, fromX: number, cause: string, ignoreInvuln = false): boolean {
    const p = this.p;
    if (p.dead || (p.invuln > 0 && !ignoreInvuln)) return false;
    this.hp -= dmg;
    this.hurtLog[cause] = (this.hurtLog[cause] ?? 0) + dmg;
    p.invuln = 70;
    p.stun = 16;
    p.state = 'normal';
    p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 3;
    p.vy = -3.5;
    if (p.holding) {
      p.holding.held = false;
      p.holding = null;
    }
    this.fx('float', p.x + p.w / 2, p.y - 4, `-${dmg}`, '#ef476f');
    this.fx('blood', p.x + p.w / 2, p.y + p.h / 2);
    this.emit({ kind: 'shake', amt: 4 });
    this.sfx('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      p.dead = true;
      p.vy = -4;
      this.sfx('die');
      this.emit({ kind: 'toast', text: `💀 Killed by ${cause}.` });
    }
    return true;
  }

  private applyItem(id: string): void {
    const def = ITEMS[id];
    if (id === 'bombbag') this.bombs += 3;
    else if (id === 'ropepile') this.ropesLeft += 3;
    else if (id === 'potion') this.hp += 1;
    else if (!this.items.includes(id)) this.items.push(id);
    this.sfx('item');
    this.fx('float', this.p.x + this.p.w / 2, this.p.y - 6, `${def.icon} ${def.name}`, '#e9c46a');
    if (!def.consumable) this.emit({ kind: 'toast', text: `${def.icon} ${def.name}: ${def.text}` });
  }

  private attack(down: boolean, up: boolean): void {
    const p = this.p;
    if (p.holding) {
      const h = p.holding;
      h.held = false;
      p.holding = null;
      if (down && p.onGround) {
        h.vx = 0;
        h.vy = 0;
        return;
      }
      const mitt = this.has('mitt') ? 1.5 : 1;
      h.vx = p.facing * 6 * mitt + p.vx * 0.3;
      h.vy = up ? -6 : -2;
      h.thrown = true;
      this.sfx('throw');
      return;
    }
    if (down && p.onGround) {
      const h = this.ents.find((e) => (e.kind === 'rock' || e.kind === 'pot') && !e.dead && overlap(p, { x: e.x - 4, y: e.y, w: e.w + 8, h: e.h }));
      if (h) {
        h.held = true;
        h.thrown = false;
        p.holding = h;
        this.sfx('grab');
        return;
      }
    }
    if (p.whipCd > 0 || p.state === 'climb') return;
    if (this.has('shotgun')) {
      for (let i = 0; i < 5; i++) {
        const pl = this.spawn('pellet', p.x + p.w / 2 + p.facing * 6, p.y + 6, 3, 3);
        pl.vx = p.facing * (6 + this.rng.next() * 1.5);
        pl.vy = (i - 2) * 0.35;
        pl.t = 16;
      }
      p.whipCd = 40;
      p.vx -= p.facing * 1.5;
      this.sfx('shotgun');
      this.emit({ kind: 'shake', amt: 2 });
      this.fx('flash', p.x + p.w / 2 + p.facing * 10, p.y + 7);
      return;
    }
    p.whipT = 14;
    p.whipCd = 20;
    p.swing++;
    this.sfx('whip');
  }

  whipBox(): { x: number; y: number; w: number; h: number } {
    const p = this.p;
    return { x: p.facing > 0 ? p.x + p.w - 2 : p.x - 18, y: p.y - 3, w: 20, h: 17 };
  }

  private whipHits(): void {
    const p = this.p;
    const box = this.whipBox();
    for (const e of this.ents) {
      if (e.dead || e.swing === p.swing || !overlap(box, e)) continue;
      if (e.kind === 'enemy') {
        e.swing = p.swing;
        this.hurtEnemy(e, 1, p.x + p.w / 2);
      } else if (e.kind === 'crate') {
        e.swing = p.swing;
        this.openCrate(e);
      } else if (e.kind === 'pot' && !e.held) {
        e.swing = p.swing;
        this.breakPot(e);
      }
    }
  }

  private throwBomb(down: boolean, up: boolean): void {
    const p = this.p;
    if (this.bombs <= 0) {
      this.sfx('deny');
      return;
    }
    this.bombs--;
    const b = this.spawn('bomb', p.x + p.w / 2 - 4, p.y + 4, 8, 8);
    b.t = 140;
    const mitt = this.has('mitt') ? 1.5 : 1;
    if (down) {
      b.vx = 0;
      b.vy = 0;
    } else {
      b.vx = p.facing * 4.2 * mitt + p.vx * 0.3;
      b.vy = up ? -6 : -3;
    }
    this.sfx('throw');
  }

  private useRope(): void {
    const p = this.p;
    if (this.ropesLeft <= 0) {
      this.sfx('deny');
      return;
    }
    const col = Math.floor((p.x + p.w / 2) / TS);
    const row = Math.floor((p.y + p.h - 1) / TS);
    let top = row;
    for (let k = 1; k <= 8; k++) {
      const t = this.tile(col, row - k);
      if (isSolid(t)) break;
      top = row - k;
    }
    let bottom = row;
    while (bottom - top < 9 && !isSolid(this.tile(col, bottom + 1))) bottom++;
    if (top === row && bottom === row) {
      this.sfx('deny');
      return;
    }
    this.ropesLeft--;
    this.ropes.push({ x: col, top, bottom });
    this.navDirty = true;
    this.sfx('rope');
  }

  private buy(): void {
    const p = this.p;
    const ware = this.ents.find((e) => e.kind === 'ware' && !e.dead && overlap(p, e));
    if (!ware) return;
    if (this.gold < ware.value) {
      this.sfx('deny');
      this.emit({ kind: 'toast', text: `${ITEMS[ware.eid].name} costs ${ware.value}. You have ${this.gold}.` });
      return;
    }
    this.gold -= ware.value;
    ware.dead = true;
    this.fx('float', cx(ware), ware.y, `-${ware.value}`, '#ffd166');
    this.sfx('buy');
    this.applyItem(ware.eid);
  }

  hurtEnemy(e: Ent, dmg: number, fromX: number): void {
    if (e.dead || e.hurtT > 0) return;
    e.hp -= dmg;
    e.hurtT = e.def?.brain === 'boss' ? 14 : 10;
    this.fx('hit', cx(e), cy(e));
    this.sfx('hit');
    if (e.hp <= 0) {
      this.killEnemy(e);
      return;
    }
    if (e.def?.brain !== 'boss') {
      e.vx = Math.sign(cx(e) - fromX || 1) * 2;
      e.vy = -2;
      if (e.state === 'hang') e.state = e.def?.brain === 'bat' ? 'fly' : 'drop';
      if (e.state === 'charge') {
        e.state = 'rest';
        e.t = 40;
      }
    } else this.emit({ kind: 'shake', amt: 3 });
  }

  private killEnemy(e: Ent): void {
    e.dead = true;
    this.kills++;
    this.levelKills++;
    this.sfx('kill');
    this.fx('poof', cx(e), cy(e), e.def?.icon);
    if (this.has('kapala') && this.kills % 8 === 0) {
      this.hp++;
      this.fx('float', this.p.x + this.p.w / 2, this.p.y - 8, '+1 ❤️', '#ef476f');
      this.sfx('heal');
    }
    if (e.def?.brain === 'boss') {
      this.bossDead = true;
      this.exitOpen = true;
      this.emit({ kind: 'shake', amt: 10 });
      this.emit({ kind: 'toast', text: '🗿 The Stone King crumbles! The exit is open.' });
      this.fx('boom', cx(e), cy(e));
      for (let i = 0; i < 5; i++) {
        const g = this.spawn('gem', cx(e) - 4, cy(e), 8, 7);
        g.value = i % 3;
        g.vx = (i - 2) * 1.2;
        g.vy = -4;
        g.t = 20;
      }
      for (const o of this.ents) if (o.kind === 'enemy' && o !== e) this.killEnemy(o);
      return;
    }
    if (this.rng.chance(0.25)) {
      const g = this.spawn('gold', cx(e) - 4, cy(e), 8, 6);
      g.value = 100;
      g.vy = -3;
      g.t = 10;
    }
  }

  private openCrate(e: Ent): void {
    e.dead = true;
    this.sfx('crate');
    this.fx('debris', cx(e), cy(e), undefined, '#a0522d');
    const owned = PASSIVES.filter((id) => !this.items.includes(id));
    const roll = this.rng.weighted<string>([
      ['bombbag', 3],
      ['ropepile', 3],
      ['passive', owned.length ? 2 : 0],
      ['potion', 1],
      ['gold', 1],
    ]);
    if (roll === 'gold') {
      const g = this.spawn('gem', cx(e) - 4, e.y, 8, 7);
      g.value = 0;
      g.vy = -3;
      g.t = 10;
      return;
    }
    const it = this.spawn('item', cx(e) - 6, e.y, 12, 12);
    it.eid = roll === 'passive' ? this.rng.pick(owned) : roll;
    it.vy = -3;
    it.t = 15;
  }

  private breakPot(e: Ent): void {
    e.dead = true;
    if (this.p.holding === e) this.p.holding = null;
    this.sfx('pot');
    this.fx('debris', cx(e), cy(e), undefined, '#c97b4a');
    const r = this.rng.next();
    if (r < 0.45) {
      const g = this.spawn('gold', cx(e) - 4, e.y, 8, 6);
      g.value = this.rng.chance(0.3) ? 300 : 100;
      g.vy = -3;
      g.t = 10;
    } else if (r < 0.55) {
      const g = this.spawn('gem', cx(e) - 4, e.y, 8, 7);
      g.value = this.rng.int(0, 2);
      g.vy = -3;
      g.t = 10;
    } else if (r < 0.65) {
      const s = this.spawn('enemy', cx(e) - 7, e.y + e.h - 10, 14, 10);
      s.def = ENEMIES.snake;
      s.eid = 'snake';
      s.hp = s.maxHp = 1;
      s.state = 'walk';
      s.hurtT = 20;
    }
  }

  private explode(x: number, y: number): void {
    const R = 40;
    this.sfx('bomb');
    this.emit({ kind: 'shake', amt: 8 });
    this.fx('boom', x, y);
    const tx0 = Math.floor((x - R) / TS);
    const tx1 = Math.floor((x + R) / TS);
    const ty0 = Math.floor((y - R) / TS);
    const ty1 = Math.floor((y + R) / TS);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = tx * TS + 8 - x;
        const dy = ty * TS + 8 - y;
        if (dx * dx + dy * dy > R * R) continue;
        const t = this.tile(tx, ty);
        if (!isBreakable(t) || t === LAVA) continue;
        if (tx <= 0 || ty <= 0 || tx >= this.w - 1 || ty >= this.h - 1) continue;
        this.setTile(tx, ty, EMPTY);
        this.arrows.delete(ty * this.w + tx);
        this.traps = this.traps.filter((tr) => tr.x !== tx || tr.y !== ty);
        if (t === GOLDV) {
          const g = this.spawn('gold', tx * TS + 4, ty * TS + 4, 8, 6);
          g.value = 200;
          g.vy = -2;
          g.t = 10;
        }
      }
    // Neighbor update: spikes and ladders without support fall away.
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++)
      for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
        if (this.tile(tx, ty) === SPIKES && !isSolid(this.tile(tx, ty + 1))) this.setTile(tx, ty, EMPTY);
      }
    this.ropes = this.ropes.filter((r) => {
      const rx = r.x * TS + 8;
      return Math.abs(rx - x) > R || r.bottom * TS < y - R || r.top * TS > y + R;
    });
    for (const e of this.ents) {
      if (e.dead) continue;
      const d = Math.hypot(cx(e) - x, cy(e) - y);
      if (d > R + 8) continue;
      if (e.kind === 'enemy') {
        e.hurtT = 0;
        this.hurtEnemy(e, e.def?.brain === 'boss' ? 4 : 10, x);
      } else if (e.kind === 'crate') this.openCrate(e);
      else if (e.kind === 'pot') this.breakPot(e);
      else if (e.kind === 'bomb') e.t = Math.min(e.t, 6);
      else if (e.kind === 'gold' || e.kind === 'gem' || e.kind === 'rock' || e.kind === 'item') {
        e.vx += Math.sign(cx(e) - x) * 2;
        e.vy = -3;
      }
    }
    const p = this.p;
    if (Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y) < R + 6) this.hurt(2, x, 'your own bomb');
  }

  // ---------- Entities ----------

  private updateEnts(): void {
    const p = this.p;
    const n = this.ents.length;
    for (let i = 0; i < n; i++) {
      const e = this.ents[i];
      if (e.dead) continue;
      if (e.t > 0 && e.kind !== 'enemy' && e.kind !== 'bomb' && e.kind !== 'pellet') e.t--;
      switch (e.kind) {
        case 'enemy':
          this.updateEnemy(e);
          break;
        case 'gold':
        case 'gem':
        case 'item':
        case 'crate':
          if (e.vx !== 0 || e.vy !== 0 || !e.onGround) {
            this.body(e);
            if (e.onGround) e.vx *= 0.8;
            if (Math.abs(e.vx) < 0.05) e.vx = 0;
          }
          if (this.inLava(e)) e.dead = true;
          break;
        case 'rock':
        case 'pot':
          if (e.held) break;
          this.updateThrowable(e);
          break;
        case 'bomb': {
          e.t--;
          const r = this.body(e, 0.4);
          if (r.hitX) e.vx *= 0.8;
          if (e.onGround) e.vx *= 0.9;
          if (e.t <= 0 || this.inLava(e)) {
            e.dead = true;
            this.explode(cx(e), cy(e));
          }
          break;
        }
        case 'arrow': {
          e.vy = Math.min(e.vy + 0.02, 2);
          const hit = this.moveX(e, e.vx) || this.moveY(e, e.vy, false) !== null;
          if (hit || e.x < 0 || e.x > this.w * TS) {
            e.dead = true;
            this.fx('debris', cx(e), cy(e), undefined, '#bbb');
            break;
          }
          if (overlap(e, p) && !p.dead) {
            e.dead = true;
            this.hurt(1, cx(e) - e.vx * 3, 'an arrow trap');
            break;
          }
          for (const o of this.ents)
            if (o.kind === 'enemy' && !o.dead && overlap(e, o)) {
              e.dead = true;
              o.hurtT = 0;
              this.hurtEnemy(o, 2, cx(e) - e.vx * 3);
              break;
            }
          break;
        }
        case 'pellet': {
          e.t--;
          if (e.t <= 0 || this.moveX(e, e.vx) || this.moveY(e, e.vy, false) !== null) {
            e.dead = true;
            break;
          }
          for (const o of this.ents) {
            if (o.dead || !overlap(e, o)) continue;
            if (o.kind === 'enemy') {
              o.hurtT = Math.min(o.hurtT, 0);
              e.dead = true;
              this.hurtEnemy(o, 1, cx(e) - e.vx * 3);
              break;
            }
            if (o.kind === 'crate') {
              e.dead = true;
              this.openCrate(o);
              break;
            }
            if (o.kind === 'pot' && !o.held) {
              e.dead = true;
              this.breakPot(o);
              break;
            }
          }
          break;
        }
        case 'fall': {
          e.vy = Math.min(e.vy + GRAV, 8);
          const r = this.moveY(e, e.vy, true, false);
          if (overlap(e, p) && e.vy > 1 && !p.dead) this.hurt(e.state === 'icicle' ? 1 : 2, cx(e), e.state === 'icicle' ? 'an icicle' : 'a falling block');
          for (const o of this.ents) if (o.kind === 'enemy' && !o.dead && o.def?.brain !== 'boss' && overlap(e, o) && e.vy > 1) this.killEnemy(o);
          if (r === 'floor' || this.inLava(e)) {
            e.dead = true;
            this.emit({ kind: 'shake', amt: 3 });
            if (e.state === 'icicle') {
              this.fx('debris', cx(e), cy(e), undefined, '#dff3ff');
              this.sfx('shatter');
            } else {
              const tx = Math.floor(cx(e) / TS);
              const ty = Math.floor(cy(e) / TS);
              if (this.tile(tx, ty) === EMPTY || this.tile(tx, ty) === SPIKES) this.setTile(tx, ty, DIRT);
              this.fx('dust', cx(e), e.y + e.h);
              this.sfx('thud');
            }
          }
          break;
        }
        case 'pet':
          if (e.state === 'follow') {
            const tx = p.x - p.facing * 12;
            e.x += (tx - e.x) * 0.15;
            e.y += (p.y + p.h - e.h - e.y) * 0.2;
          } else {
            this.body(e);
          }
          break;
        case 'keeper':
          if (!this.keeperGreeted && Math.abs(cx(e) - p.x) < 5 * TS && Math.abs(cy(e) - p.y) < 3 * TS) {
            this.keeperGreeted = true;
            this.emit({ kind: 'toast', text: '🧔 "Welcome! Stand on an item and press ↑ to buy."' });
          }
          e.dir = cx(e) < p.x ? 1 : -1;
          break;
        case 'ghost': {
          const dx = p.x + p.w / 2 - cx(e);
          const dy = p.y + p.h / 2 - cy(e);
          const d = Math.hypot(dx, dy) || 1;
          e.x += (dx / d) * 0.55;
          e.y += (dy / d) * 0.55;
          e.dir = dx > 0 ? 1 : -1;
          if (overlap(e, p) && !p.dead) {
            this.hurt(2, cx(e), 'the ghost');
            e.dead = true;
            this.ghostCd = 25 * 60;
            this.fx('poof', cx(e), cy(e), '👻');
          }
          break;
        }
        default:
          break;
      }
    }
  }

  private updateThrowable(e: Ent): void {
    const speed = Math.abs(e.vx) + Math.abs(e.vy);
    const r = this.body(e, e.kind === 'rock' ? 0.3 : 0);
    if (e.thrown) {
      if (e.kind === 'pot' && (r.hitX || (r.landed > 2 && speed > 3))) {
        this.breakPot(e);
        return;
      }
      for (const o of this.ents) {
        if (o.dead || !overlap(e, o)) continue;
        if (o.kind === 'enemy') {
          this.hurtEnemy(o, e.kind === 'rock' ? 2 : 1, cx(e) - e.vx * 3);
          if (e.kind === 'pot') {
            this.breakPot(e);
            return;
          }
          e.vx *= -0.3;
          e.thrown = false;
          break;
        }
        if (o.kind === 'crate') {
          this.openCrate(o);
          e.vx *= -0.3;
          break;
        }
      }
    }
    if (e.onGround) e.vx *= 0.8;
    if (Math.abs(e.vx) < 1.5 && e.onGround) e.thrown = false;
    if (Math.abs(e.vx) < 0.05) e.vx = 0;
    if (this.inLava(e)) e.dead = true;
  }

  private updateEnemy(e: Ent): void {
    const def = e.def!;
    const p = this.p;
    if (e.hurtT > 0) e.hurtT--;
    const dx = p.x + p.w / 2 - cx(e);
    const dy = p.y + p.h / 2 - cy(e);
    const knocked = e.hurtT > 0 && def.brain !== 'boss';
    switch (def.brain) {
      case 'walker':
      case 'chaser': {
        let speed = def.speed;
        if (def.brain === 'chaser' && Math.abs(dy) < 12 && Math.abs(dx) < 6 * TS && !p.dead) {
          e.dir = dx > 0 ? 1 : -1;
          speed *= 1.8;
        }
        if (e.onGround && !knocked) e.vx = e.dir * speed;
        const r = this.body(e);
        if (r.hitX) e.dir = -e.dir;
        if (e.onGround && !knocked) this.turnAtEdge(e);
        break;
      }
      case 'charger': {
        if (e.state === 'walk') {
          if (e.onGround && !knocked) e.vx = e.dir * def.speed;
          const r = this.body(e);
          if (r.hitX) e.dir = -e.dir;
          if (e.onGround && !knocked) this.turnAtEdge(e);
          if (!p.dead && e.onGround && Math.abs(dy) < 12 && Math.abs(dx) < 7 * TS && this.lineClear(cx(e), p.x + p.w / 2, Math.floor(cy(e) / TS))) {
            e.state = 'charge';
            e.dir = dx > 0 ? 1 : -1;
            e.t = 70;
            this.sfx('grunt');
          }
        } else if (e.state === 'charge') {
          if (!knocked) e.vx = e.dir * 2.4;
          const r = this.body(e);
          e.t--;
          if (r.hitX) {
            e.state = 'rest';
            e.t = 60;
            this.emit({ kind: 'shake', amt: 2 });
          } else if (e.t <= 0) {
            e.state = 'rest';
            e.t = 30;
          }
        } else {
          e.vx = approach(e.vx, 0, 0.2);
          this.body(e);
          if (--e.t <= 0) e.state = 'walk';
        }
        break;
      }
      case 'hopper': {
        const r = this.body(e);
        if (r.hitX) e.vx = 0;
        if (e.onGround) {
          if (!knocked) e.vx = 0;
          e.t--;
          if (e.t <= 0 && Math.abs(dx) < 8 * TS && Math.abs(dy) < 5 * TS && !p.dead) {
            e.dir = dx > 0 ? 1 : -1;
            e.vx = e.dir * def.speed;
            e.vy = -5;
            e.t = 75;
          }
        }
        break;
      }
      case 'spider': {
        if (e.state === 'hang') {
          if (!p.dead && Math.abs(dx) < 20 && dy > 0 && dy < 8 * TS && this.columnClear(Math.floor(cx(e) / TS), Math.floor(cy(e) / TS), Math.floor((p.y + p.h / 2) / TS))) e.state = 'drop';
          break;
        }
        const r = this.body(e);
        if (r.hitX) e.vx = 0;
        if (e.onGround) {
          if (!knocked) e.vx = 0;
          if (--e.t <= 0 && Math.abs(dx) < 8 * TS && Math.abs(dy) < 5 * TS && !p.dead) {
            e.dir = dx > 0 ? 1 : -1;
            e.vx = e.dir * def.speed;
            e.vy = -4.2;
            e.t = 45;
          }
        }
        break;
      }
      case 'bat': {
        if (e.state === 'hang') {
          if (!p.dead && Math.hypot(dx, dy) < 6 * TS && dy > -TS) e.state = 'fly';
          break;
        }
        if (!knocked) {
          e.vx = Math.max(-def.speed, Math.min(def.speed, e.vx + Math.sign(dx) * 0.07));
          e.vy = Math.max(-def.speed, Math.min(def.speed, e.vy + Math.sign(dy) * 0.07 + Math.sin(this.frame * 0.2 + e.id) * 0.05));
        } else {
          e.vx *= 0.9;
          e.vy *= 0.9;
        }
        if (this.moveX(e, e.vx)) e.vx = -e.vx * 0.5;
        if (this.moveY(e, e.vy, false)) e.vy = -e.vy * 0.5;
        e.dir = e.vx > 0 ? 1 : -1;
        break;
      }
      case 'boss':
        this.updateBoss(e, dx);
        break;
    }
    if (e.dead) return;
    if (this.inLava(e)) {
      if (def.brain !== 'boss') {
        this.fx('poof', cx(e), cy(e), '🔥');
        e.dead = true;
        return;
      }
    }
    if (e.y > this.h * TS) {
      e.dead = true;
      return;
    }
    // Contact with the player.
    if (p.dead || !overlap(e, p)) return;
    const stomp = p.vy > 0.5 && p.y + p.h - p.vy <= e.y + 6 && p.state === 'normal';
    if (stomp) {
      this.hurtEnemy(e, this.has('spikeshoes') ? 3 : 1, p.x + p.w / 2);
      p.y = e.y - p.h;
      p.vy = this.prev.jump ? -6.5 : -4.5;
      this.sfx('stomp');
      return;
    }
    if (e.state === 'hang') return;
    if (e.hurtT > 6 && def.brain !== 'boss') return;
    if (this.hurt(def.dmg, cx(e), def.brain === 'boss' ? 'the Stone King' : `a ${def.name.toLowerCase()}`) && e.eid === 'yeti') p.vx *= 1.8;
  }

  private turnAtEdge(e: Ent): void {
    const fx = e.dir > 0 ? e.x + e.w + 1 : e.x - 1;
    const row = Math.floor((e.y + e.h + 1) / TS);
    const t = this.tile(Math.floor(fx / TS), row);
    if (!isSolid(t) && t !== PLAT && t !== LADDER) e.dir = -e.dir;
    // Walkers avoid lava and spikes ahead.
    const ahead = this.tile(Math.floor(fx / TS), Math.floor((e.y + e.h - 1) / TS));
    if (ahead === SPIKES || t === LAVA) e.dir = -e.dir;
  }

  private lineClear(x0: number, x1: number, row: number): boolean {
    const a = Math.floor(Math.min(x0, x1) / TS);
    const b = Math.floor(Math.max(x0, x1) / TS);
    for (let x = a; x <= b; x++) if (isSolid(this.tile(x, row))) return false;
    return true;
  }

  private columnClear(col: number, y0: number, y1: number): boolean {
    for (let y = y0; y <= y1; y++) if (isSolid(this.tile(col, y))) return false;
    return true;
  }

  /** Where the boss will land, for the shadow and the bot. */
  bossLanding(e: Ent): number {
    if (e.state !== 'air') return cx(e);
    const floor = (this.h - 2) * TS;
    // Solve y(t) = floor for the remaining flight.
    const d = floor - (e.y + e.h);
    const t = (e.vy + Math.sqrt(Math.max(0, e.vy * e.vy + 2 * GRAV * d))) / GRAV;
    return Math.max(TS + e.w / 2, Math.min((this.w - 1) * TS - e.w / 2, cx(e) + e.vx * t));
  }

  private updateBoss(e: Ent, dx: number): void {
    const p = this.p;
    if (e.state === 'wait') {
      this.body(e, 0, false);
      if (p.y > 14 * TS) {
        e.state = 'idle';
        e.t = 60;
        this.emit({ kind: 'toast', text: '🗿 The Stone King wakes up! Jump when it lands.' });
        this.sfx('roar');
      }
      return;
    }
    const angry = e.hp <= e.maxHp / 2;
    if (e.state === 'idle') {
      e.vx = 0;
      this.body(e, 0, false);
      e.dir = dx > 0 ? 1 : -1;
      if (--e.t <= 0 && e.onGround) {
        const vy = angry ? 8.2 : 7.5;
        const air = (2 * vy) / GRAV;
        const target = Math.max(2 * TS + e.w / 2, Math.min((this.w - 2) * TS - e.w / 2, p.x + p.w / 2));
        e.vx = Math.max(-3.5, Math.min(3.5, (target - cx(e)) / air));
        e.vy = -vy;
        e.onGround = false;
        e.state = 'air';
        this.sfx('roar');
      }
      this.bossPush(e);
      return;
    }
    // In the air.
    const r = this.body(e, 0, false);
    if (r.hitX) e.vx = -e.vx;
    if (e.onGround) {
      e.state = 'idle';
      e.t = angry ? 50 : 75;
      this.bossJumps++;
      this.emit({ kind: 'shake', amt: 7 });
      this.sfx('slam');
      this.fx('dust', cx(e) - 10, e.y + e.h);
      this.fx('dust', cx(e) + 10, e.y + e.h);
      this.fx('wave', cx(e), e.y + e.h);
      if (p.onGround && p.state !== 'climb' && Math.abs(dx) < 7 * TS && Math.abs(p.y + p.h - (e.y + e.h)) < 2 * TS) this.hurt(1, cx(e), 'the Stone King');
      this.bossPush(e);
      const adds = this.ents.filter((o) => o.kind === 'enemy' && o !== e && !o.dead).length;
      if (this.bossJumps % 3 === 0 && adds < 2) {
        const id = this.rng.chance(0.5) ? 'mummy' : 'scorpion';
        const def = ENEMIES[id];
        const sx = this.rng.chance(0.5) ? 3 * TS : (this.w - 4) * TS;
        const s = this.spawn('enemy', sx, 15 * TS, def.w, def.h);
        s.def = def;
        s.eid = id;
        s.hp = s.maxHp = def.hp;
        s.state = 'walk';
        s.dir = sx < e.x ? 1 : -1;
        this.fx('poof', sx + 6, 15 * TS + 6, def.icon);
      }
    }
  }

  /** The boss shoves the player out of its body. */
  private bossPush(e: Ent): void {
    const p = this.p;
    if (p.dead || !overlap(e, p) || p.y + p.h <= e.y + 6) return;
    this.hurt(1, cx(e), 'the Stone King');
    const left = e.x - p.w;
    const right = e.x + e.w;
    const goLeft = p.x + p.w / 2 < cx(e) ? !this.solidAt(left, p.y + p.h - 2) : this.solidAt(right + p.w, p.y + p.h - 2);
    p.x = goLeft ? left - 0.5 : right + 0.5;
    if (this.solidAt(p.x, p.y + p.h - 2) || this.solidAt(p.x + p.w, p.y + p.h - 2)) {
      // No room at the side: pop on top.
      p.x = cx(e) - p.w / 2;
      p.y = e.y - p.h;
      p.vy = -3;
    }
  }

  // ---------- Traps and ghost ----------

  private updateTraps(): void {
    const p = this.p;
    if (p.dead) return;
    const pcx = p.x + p.w / 2;
    const prow = Math.floor((p.y + p.h / 2) / TS);
    for (const tr of this.traps) {
      if (tr.state === 'armed') {
        const below = prow > tr.y && prow - tr.y <= 8 && Math.abs(pcx - (tr.x * TS + 8)) < 12;
        if (below && this.columnClear(tr.x, tr.y + 1, prow)) {
          tr.state = 'shake';
          tr.t = tr.icicle ? 18 : 24;
          this.sfx('rumble');
        }
      } else if (--tr.t <= 0) {
        this.setTile(tr.x, tr.y, EMPTY);
        const f = this.spawn('fall', tr.x * TS + (tr.icicle ? 3 : 0), tr.y * TS, tr.icicle ? 10 : 16, tr.icicle ? 14 : 16);
        f.state = tr.icicle ? 'icicle' : 'block';
        tr.state = 'armed';
        tr.x = -1;
      }
    }
    this.traps = this.traps.filter((t) => t.x >= 0);
    if (this.frame % 3 !== 0) return;
    for (const [k, d] of this.arrows) {
      const tx = k % this.w;
      const ty = Math.floor(k / this.w);
      if (this.tile(tx, ty) !== ARROW) {
        this.arrows.delete(k);
        continue;
      }
      if (Math.abs(p.y + p.h / 2 - (ty * TS + 8)) > 10) continue;
      for (let s = 1; s <= 8; s++) {
        const x = tx + d * s;
        if (isSolid(this.tile(x, ty))) break;
        if (Math.floor(pcx / TS) === x) {
          const a = this.spawn('arrow', d > 0 ? (tx + 1) * TS : tx * TS - 10, ty * TS + 7, 10, 3);
          a.vx = d * 5;
          a.dir = d;
          this.arrows.delete(k);
          this.sfx('arrow');
          break;
        }
      }
    }
  }

  /** Remaining time before the ghost, in frames. */
  ghostIn(): number {
    return Math.max(0, GHOST_AT - this.frame);
  }

  private updateGhost(): void {
    if (this.frame < GHOST_AT || this.p.dead || this.level.boss) return;
    if (this.ghostCd > 0) {
      this.ghostCd--;
      return;
    }
    if (this.ents.some((e) => e.kind === 'ghost')) return;
    const p = this.p;
    const gx = p.x < (this.w * TS) / 2 ? (this.w - 2) * TS : TS;
    const g = this.spawn('ghost', gx, p.y - 40, 20, 20);
    g.state = 'chase';
    this.sfx('ghost');
    this.emit({ kind: 'toast', text: '👻 A ghost comes for you. Hurry to the exit!' });
  }

  // ---------- Debug ----------

  teleportToExit(): void {
    if (this.level.boss) {
      const boss = this.ents.find((e) => e.def?.brain === 'boss');
      if (boss) this.killEnemy(boss);
    }
    const ex = this.level.exit;
    const p = this.p;
    p.x = ex.x * TS + 3;
    p.y = (ex.y + 1) * TS - p.h;
    p.vx = 0;
    p.vy = 0;
    p.state = 'normal';
  }
}

