import { BOSSES } from './bosses';
import {
  COLS, DIRS, type Dir, type Floor, ROOM_H, ROOM_W, ROWS, type Room, T, TILE, blocksShots, generateFloor, idx, nearestFree, reachable,
  roomKey, tileCenter,
} from './dungeon';
import { ENEMIES, ENEMY_BY_ID, type Enemy, type ShotOpts } from './enemies';
import type { Input } from './input';
import { ITEM_BY_ID, ITEM_PRICE, ITEMS, type Pool, activeSynergies } from './items';
import { TAU, Rng, angleTo, clamp, dist, hashSeed, rand, turnToward } from './math';
import { HUB_UPGRADES, LOADOUTS, type RunStart, type SaveData } from './meta';
import { drawGlow, drawHeart, drawRoomStatic, shapePath } from './render';
import { sfx } from './sfx';
import { type Pickup, type PickupKind, type Stats, baseStats } from './types';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  ang: number;
  fireCd: number;
  dodgeT: number;
  dodgeCd: number;
  dvx: number;
  dvy: number;
  iframes: number;
  shieldUp: boolean;
  bombs: number;
  coins: number;
  items: string[];
}

export interface Shot {
  x: number;
  y: number;
  ang: number;
  speed: number;
  r: number;
  dmg: number;
  dist: number;
  range: number;
  pierce: number;
  bounce: number;
  homing: number;
  split: number;
  explode: number;
  chain: number;
  burn: number;
  slow: number;
  knock: number;
  wave: number;
  phase: number;
  back: 0 | 1 | 2;
  frag: boolean;
  color: string;
  hit: Set<Enemy>;
  dead: boolean;
}

export interface EShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  accel: number;
  curve: number;
  homing: number;
  dead: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'dot' | 'ring' | 'text';
  text?: string;
}

interface Bomb {
  x: number;
  y: number;
  t: number;
}

interface Bolt {
  pts: { x: number; y: number }[];
  t: number;
}

interface Drone {
  x: number;
  y: number;
  cd: number;
}

interface Banner {
  title: string;
  sub: string;
  color: string;
  t: number;
  dur: number;
}

export interface RunResult {
  won: boolean;
  floor: number;
  kills: number;
  rooms: number;
  shards: number;
  items: string[];
  time: number;
  seed: string;
  loadout: string;
}

const PLAYER_HITBOX = 7;
const FLOOR_COUNT = 5;

export class Game {
  floorN = 1;
  floor!: Floor;
  room!: Room;
  player: Player;
  stats: Stats = baseStats();
  private baseStats: Stats = baseStats();
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  eshots: EShot[] = [];
  particles: Particle[] = [];
  bombs: Bomb[] = [];
  bolts: Bolt[] = [];
  drones: Drone[] = [];
  state: 'play' | 'transition' | 'paused' | 'over' = 'play';
  time = 0;
  kills = 0;
  roomsCleared = 0;
  shards = 0;
  showMap = false;
  god = false;
  boss: Enemy | null = null;
  private rng: Rng;
  private trans: { dir: Dir; t: number; from: Room; to: Room } | null = null;
  private flow = new Int16Array(COLS * ROWS);
  private flowT = 0;
  private shakeMag = 0;
  private banners: Banner[] = [];
  private seen = new Set<string>();
  private discount = 0;
  private waveDelay = 0;
  private endT = -1;
  private won = false;
  private denyT = 0;
  private statics = new WeakMap<Room, HTMLCanvasElement>();
  private view = { scale: 1, ox: 0, oy: 0 };
  private synergies = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    private input: Input,
    save: SaveData,
    readonly seed: string,
    private onEnd: (r: RunResult) => void,
    private onPause: () => void,
  ) {
    this.rng = new Rng(hashSeed(seed));
    const run: RunStart = { bombs: 1, coins: 0, discount: 0, items: [] };
    const s = baseStats();
    const loadout = LOADOUTS.find((l) => l.id === save.selected) ?? LOADOUTS[0];
    loadout.apply(s, run);
    for (const u of HUB_UPGRADES) {
      const rank = save.upgrades[u.id] ?? 0;
      if (rank) u.apply(s, rank, run);
    }
    this.loadout = loadout.id;
    this.baseStats = s;
    this.discount = Math.min(0.5, run.discount);
    this.player = {
      x: 0, y: 0, vx: 0, vy: 0, r: 12, hp: s.maxHp, ang: -Math.PI / 2, fireCd: 0, dodgeT: 0, dodgeCd: 0, dvx: 0, dvy: 0,
      iframes: 0, shieldUp: false, bombs: run.bombs, coins: run.coins, items: [],
    };
    for (const id of run.items) {
      this.player.items.push(id);
      this.seen.add(id);
    }
    this.recalc();
    this.player.hp = this.stats.maxHp;
    this.startFloor();
  }

  readonly loadout: string;

  // ---------- Setup ----------

  private startFloor(): void {
    this.floor = generateFloor(this.floorN, this.rng);
    this.enterRoom(this.floor.start, null);
    this.banner(`Floor ${this.floorN}`, this.floor.palette.name, this.floor.palette.wall, 2.6);
  }

  private recalc(): void {
    const s: Stats = { ...this.baseStats };
    for (const id of this.player.items) ITEM_BY_ID[id]?.apply(s);
    for (const y of activeSynergies(this.player.items)) {
      y.apply(s);
      if (!this.synergies.has(y.id)) {
        this.synergies.add(y.id);
        if (this.time > 0) this.banner(`Synergy: ${y.name}`, y.desc, '#ffd23f', 3);
      }
    }
    s.fireRate = Math.min(s.fireRate, 14);
    s.maxHp = clamp(s.maxHp, 2, 24);
    s.dodgeCd = Math.max(0.25, s.dodgeCd);
    this.stats = s;
    while (this.drones.length < s.drones) this.drones.push({ x: this.player.x, y: this.player.y, cd: 0.5 });
  }

  // ---------- Rooms ----------

  private enterRoom(room: Room, from: Dir | null): void {
    this.room = room;
    room.visited = true;
    this.shots = [];
    this.eshots = [];
    this.bombs = [];
    this.bolts = [];
    this.enemies = [];
    this.boss = null;
    const p = this.player;
    if (from) {
      const opp = DIRS[DIRS[from].opp];
      const c = tileCenter(opp.tx + DIRS[from].dx, opp.ty + DIRS[from].dy);
      p.x = c.x;
      p.y = c.y;
    } else {
      p.x = ROOM_W / 2;
      p.y = ROOM_H / 2 + TILE;
    }
    p.dodgeT = 0;
    for (const d of this.drones) {
      d.x = p.x;
      d.y = p.y;
    }
    p.shieldUp = this.stats.shield;
    this.computeFlow();

    if (room.type === 'treasure' && !room.pedestals.length) {
      const c = tileCenter(8, 5);
      room.pedestals.push({ item: this.drawItem('treasure'), x: c.x, y: c.y, price: 0, taken: false });
    }
    if (room.type === 'shop' && !room.pedestals.length) {
      const price = (n: number) => Math.max(1, Math.round(n * (1 - this.discount)));
      for (const tx of [6, 8]) {
        const id = this.drawItem('shop');
        const c = tileCenter(tx, 4);
        room.pedestals.push({ item: id, x: c.x, y: c.y, price: price(ITEM_PRICE[ITEM_BY_ID[id].rarity]), taken: false });
      }
      const h = tileCenter(10, 4);
      room.wares.push({ kind: 'heart', x: h.x, y: h.y, price: price(3), taken: false });
      const b = tileCenter(12, 4);
      room.wares.push({ kind: 'bomb', x: b.x, y: b.y, price: price(4), taken: false });
    }
    if (!room.cleared) {
      if (room.type === 'boss') {
        const def = BOSSES[Math.min(this.floorN, BOSSES.length) - 1];
        const e = this.spawn(def.id, ROOM_W / 2, ROOM_H / 2 - TILE, false, 0.9);
        this.boss = e;
        this.banner(def.name, `Floor ${this.floorN} guardian`, def.color, 2.2);
      } else {
        if (room.type === 'challenge') {
          room.wave = 3;
          this.banner('Challenge', 'Survive 3 waves for a prize', '#ffd23f', 2);
        }
        this.spawnWave();
      }
      sfx.door();
    }
  }

  private spawnWave(): void {
    const room = this.room;
    const budget = 3 + this.floorN * 1.5 + Math.min(room.dist, 6) * 0.3 + (room.type === 'challenge' ? 1.5 : 0);
    const defs = ENEMIES.filter((d) => d.cost > 0 && d.minFloor <= this.floorN);
    let left = budget;
    const picks = [];
    while (left > 0.5 && picks.length < 12) {
      const opts = defs.filter((d) => d.cost <= left + 0.3);
      if (!opts.length) break;
      const d = this.rng.pick(opts);
      picks.push(d);
      left -= d.cost;
    }
    const p = this.player;
    const ptx = Math.floor(p.x / TILE);
    const pty = Math.floor(p.y / TILE);
    const reach = reachable(this.room.tiles, ptx, pty);
    const spots: { x: number; y: number }[] = [];
    for (let ty = 1; ty < ROWS - 1; ty++) {
      for (let tx = 1; tx < COLS - 1; tx++) {
        const i = idx(tx, ty);
        const c = tileCenter(tx, ty);
        if (this.room.tiles[i] === T.Floor && reach[i] && dist(c.x, c.y, p.x, p.y) > 170) spots.push(c);
      }
    }
    if (!spots.length) spots.push(tileCenter(8, 2));
    const eliteChance = 0.04 + this.floorN * 0.03;
    for (const d of picks) {
      const at = this.rng.pick(spots);
      const n = d.pack ? d.pack + Math.floor(this.floorN / 2) : 1;
      const elite = !d.pack && Math.random() < eliteChance;
      for (let i = 0; i < n; i++) this.spawn(d.id, at.x + (n > 1 ? rand(-14, 14) : 0), at.y + (n > 1 ? rand(-14, 14) : 0), elite, 0.75);
    }
  }

  spawn(id: string, x: number, y: number, elite = false, spawnT = 0.35): Enemy {
    const def = ENEMY_BY_ID[id] ?? BOSSES.find((b) => b.id === id)!;
    const scale = def.boss ? 1 : 1 + 0.3 * (this.floorN - 1);
    const hp = def.hp * scale * (elite ? 2.2 : 1);
    const e: Enemy = {
      def, x, y, vx: 0, vy: 0, r: def.r * (elite ? 1.25 : 1), hp, maxHp: hp, speed: def.speed * (elite ? 1.1 : 1) * (1 + (this.floorN - 1) * 0.04),
      ang: 0, t: 0, state: 0, timer: rand(0.5, 1.5), flash: 0, slowT: 0, burnT: 0, burnDps: 0, elite, spawnT, dead: false,
      kx: 0, ky: 0, tele: 0, teleAng: 0, alpha: 1, data: { seed: Math.random() },
    };
    this.enemies.push(e);
    return e;
  }

  private drawItem(pool: Pool): string {
    const cands = ITEMS.filter((i) => i.pools.includes(pool) && (i.stack || !this.seen.has(i.id)));
    const luck = this.stats.luck;
    const weight = (r: string) => (r === 'common' ? 3 : r === 'rare' ? 1.6 + luck * 0.25 : pool === 'boss' ? 2.5 : 0.6);
    let total = 0;
    for (const c of cands) total += weight(c.rarity);
    let roll = this.rng.next() * total;
    for (const c of cands) {
      roll -= weight(c.rarity);
      if (roll <= 0) {
        if (!c.stack) this.seen.add(c.id);
        return c.id;
      }
    }
    return 'heartcore';
  }

  // ---------- Flow field ----------

  private computeFlow(): void {
    const f = this.flow;
    f.fill(-1);
    const tiles = this.room.tiles;
    const sx = clamp(Math.floor(this.player.x / TILE), 1, COLS - 2);
    const sy = clamp(Math.floor(this.player.y / TILE), 1, ROWS - 2);
    const start = idx(sx, sy);
    f[start] = 0;
    const q = [start];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const x = i % COLS;
      const y = (i / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
        const j = idx(nx, ny);
        if (f[j] === -1 && tiles[j] === T.Floor) {
          f[j] = f[i] + 1;
          q.push(j);
        }
      }
    }
  }

  /** Unit vector toward the player along the flow field. */
  pathDir(e: Enemy): { x: number; y: number } {
    const p = this.player;
    const tx = Math.floor(e.x / TILE);
    const ty = Math.floor(e.y / TILE);
    const here = this.flow[idx(clamp(tx, 0, COLS - 1), clamp(ty, 0, ROWS - 1))];
    if (here <= 1) {
      const a = angleTo(e.x, e.y, p.x, p.y);
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    let best = here;
    let bx = 0;
    let by = 0;
    const f = this.flow;
    const tiles = this.room.tiles;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
        const v = f[idx(nx, ny)];
        if (v < 0 || v >= best) continue;
        if (dx && dy && (tiles[idx(tx + dx, ty)] !== T.Floor || tiles[idx(tx, ty + dy)] !== T.Floor)) continue;
        best = v;
        bx = dx;
        by = dy;
      }
    }
    if (!bx && !by) {
      const a = angleTo(e.x, e.y, p.x, p.y);
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    const c = tileCenter(tx + bx, ty + by);
    const a = angleTo(e.x, e.y, c.x, c.y);
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  // ---------- Physics ----------

  private tileAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T.Wall;
    return this.room.tiles[idx(tx, ty)];
  }

  /** True when a body could stand at (x, y). Fleeing enemies use it to avoid corners. */
  openAt(x: number, y: number, flying: boolean): boolean {
    const t = this.tileAt(x, y);
    return flying ? !this.flyerSolid(t) : !this.groundSolid(t);
  }

  private moveCircle(o: { x: number; y: number; r: number }, dx: number, dy: number, solid: (t: number) => boolean): boolean {
    o.x += dx;
    const hx = this.resolve(o, solid);
    o.y += dy;
    const hy = this.resolve(o, solid);
    return hx || hy;
  }

  private resolve(o: { x: number; y: number; r: number }, solid: (t: number) => boolean): boolean {
    let hit = false;
    const x0 = Math.floor((o.x - o.r) / TILE);
    const x1 = Math.floor((o.x + o.r) / TILE);
    const y0 = Math.floor((o.y - o.r) / TILE);
    const y1 = Math.floor((o.y + o.r) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? T.Wall : this.room.tiles[idx(tx, ty)];
        if (!solid(t)) continue;
        const nx = clamp(o.x, tx * TILE, tx * TILE + TILE);
        const ny = clamp(o.y, ty * TILE, ty * TILE + TILE);
        let dx = o.x - nx;
        let dy = o.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= o.r * o.r) continue;
        hit = true;
        if (d2 === 0) {
          // Centre is inside the tile: push out on the shortest axis.
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          dx = o.x - cx;
          dy = o.y - cy;
          if (Math.abs(dx) > Math.abs(dy)) o.x = cx + Math.sign(dx || 1) * (TILE / 2 + o.r);
          else o.y = cy + Math.sign(dy || 1) * (TILE / 2 + o.r);
          continue;
        }
        const d = Math.sqrt(d2);
        o.x += (dx / d) * (o.r - d);
        o.y += (dy / d) * (o.r - d);
      }
    }
    return hit;
  }

  private playerSolid = (t: number): boolean => !(t === T.Floor || (t === T.Door && this.room.cleared));
  private groundSolid = (t: number): boolean => t !== T.Floor;
  private flyerSolid = (t: number): boolean => t === T.Wall || t === T.Door;

  // ---------- Main update ----------

  update(dt: number): void {
    this.input.pollPad();
    if (this.state === 'paused') return;
    if (this.input.consume('Escape', 'KeyP', 'PadPause') && this.state === 'play') {
      this.state = 'paused';
      this.onPause();
      return;
    }
    if (this.input.consume('Tab', 'PadMap')) this.showMap = !this.showMap;
    if (this.input.consume('KeyF')) {
      this.input.autoFire = !this.input.autoFire;
      this.toastText(this.input.autoFire ? 'Auto-fire ON' : 'Auto-fire OFF');
    }
    this.updateParticles(dt);
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter((b) => b.t < b.dur);
    this.shakeMag = Math.max(0, this.shakeMag - dt * 30);

    if (this.state === 'transition') {
      const tr = this.trans!;
      tr.t += dt / 0.32;
      if (tr.t >= 1) {
        this.trans = null;
        this.state = 'play';
        this.enterRoom(tr.to, tr.dir);
      }
      return;
    }
    if (this.state === 'over') {
      this.endT -= dt;
      if (this.endT <= 0 && this.endT > -100) {
        this.endT = -1000;
        this.onEnd(this.result());
      }
      return;
    }

    this.time += dt;
    this.denyT -= dt;
    this.updatePlayer(dt);
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.2;
      this.computeFlow();
    }
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateEnemyShots(dt);
    this.updateHelpers(dt);
    this.updateBombs(dt);
    this.updatePickups(dt);
    this.checkRoomClear(dt);
    this.checkDoors();
    for (const b of this.bolts) b.t -= dt;
    this.bolts = this.bolts.filter((b) => b.t > 0);
    if (this.won && this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.finish(true);
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const s = this.stats;
    const inp = this.input;
    p.iframes -= dt;
    p.dodgeCd -= dt;
    const mv = inp.move();
    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      p.vx = p.dvx;
      p.vy = p.dvy;
      if (Math.random() < 0.6) this.particle(p.x, p.y, 0, 0, 0.25, s.shotColor, 9, 'dot');
    } else {
      const k = Math.min(1, dt * 14);
      p.vx += (mv.x * s.speed - p.vx) * k;
      p.vy += (mv.y * s.speed - p.vy) * k;
    }
    if (inp.consume('Space', 'ShiftLeft', 'ShiftRight', 'MouseRight', 'PadDodge', 'TouchDodge') && p.dodgeCd <= 0 && p.dodgeT <= 0) {
      let dx = mv.x;
      let dy = mv.y;
      if (!dx && !dy) {
        dx = Math.cos(p.ang);
        dy = Math.sin(p.ang);
      }
      const d = Math.hypot(dx, dy);
      const sp = Math.max(420, s.speed * 2.3);
      p.dvx = (dx / d) * sp;
      p.dvy = (dy / d) * sp;
      p.dodgeT = 0.24;
      p.iframes = Math.max(p.iframes, 0.3);
      p.dodgeCd = s.dodgeCd + 0.24;
      sfx.dodge();
    }
    this.moveCircle(p, p.vx * dt, p.vy * dt, this.playerSolid);

    // Aim
    const dir = inp.aimDir();
    let firing = false;
    if (dir) {
      p.ang = Math.atan2(dir.y, dir.x);
      firing = true;
    } else if (!inp.touch && !inp.pad) {
      const w = this.screenToWorld(inp.mouse.x, inp.mouse.y);
      p.ang = angleTo(p.x, p.y, w.x, w.y);
      firing = inp.wantsMouseFire();
    } else if (inp.pad && inp.autoFire) firing = true;
    p.fireCd -= dt;
    if (firing && p.fireCd <= 0 && p.dodgeT <= 0) {
      this.fire();
      p.fireCd = Math.max(p.fireCd, -0.05) + 1 / s.fireRate;
    }
    if (p.fireCd < 0 && !firing) p.fireCd = 0;

    if (inp.consume('KeyE', 'KeyQ', 'PadBomb', 'TouchBomb')) {
      if (p.bombs > 0) {
        p.bombs--;
        this.bombs.push({ x: p.x, y: p.y, t: 1.4 });
      } else sfx.deny();
    }

    // Pedestals and shop wares
    for (const ped of this.room.pedestals) {
      if (ped.taken || dist(p.x, p.y, ped.x, ped.y) > 24) continue;
      if (ped.price > p.coins) {
        this.deny(`Need ${ped.price} coins`);
        continue;
      }
      p.coins -= ped.price;
      ped.taken = true;
      this.giveItem(ped.item);
    }
    for (const w of this.room.wares) {
      if (w.taken || dist(p.x, p.y, w.x, w.y) > 22) continue;
      if (w.price > p.coins) {
        this.deny(`Need ${w.price} coins`);
        continue;
      }
      if (w.kind === 'heart' && p.hp >= s.maxHp) {
        this.deny('Health is full');
        continue;
      }
      p.coins -= w.price;
      w.taken = true;
      if (w.kind === 'heart') p.hp = Math.min(s.maxHp, p.hp + 2);
      else p.bombs++;
      sfx.pickup();
    }
    if (this.room.hatch && dist(p.x, p.y, ROOM_W / 2, tileCenter(8, 7).y) < 18 && p.dodgeT <= 0) this.nextFloor();

    // Aura
    if (s.aura > 0) {
      for (const e of this.enemies) {
        if (!e.dead && e.spawnT <= 0 && dist(e.x, e.y, p.x, p.y) < 70 + e.r) this.damageEnemy(e, s.aura * dt, false, true);
      }
    }
  }

  private deny(text: string): void {
    if (this.denyT > 0) return;
    this.denyT = 1.5;
    sfx.deny();
    this.toastText(text);
  }

  private fire(): void {
    const p = this.player;
    const s = this.stats;
    const n = 1 + s.multishot;
    for (let i = 0; i < n; i++) this.shots.push(this.makeShot(p.ang + (i - (n - 1) / 2) * s.spread));
    if (s.rearShot) this.shots.push(this.makeShot(p.ang + Math.PI));
    sfx.shoot();
  }

  private makeShot(ang: number, dmgMul = 1): Shot {
    const p = this.player;
    const s = this.stats;
    return {
      x: p.x + Math.cos(ang) * 12, y: p.y + Math.sin(ang) * 12, ang, speed: s.shotSpeed, r: s.shotSize, dmg: s.damage * s.dmgMult * dmgMul,
      dist: 0, range: s.range, pierce: s.pierce, bounce: s.bounce, homing: s.homing, split: s.split, explode: s.explode, chain: s.chain,
      burn: s.burn, slow: s.slow, knock: s.knockback, wave: s.wave ? 1 : 0, phase: 0, back: s.boomerang ? 1 : 0, frag: false,
      color: s.shotColor, hit: new Set(), dead: false,
    };
  }

  // ---------- Enemies ----------

  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.tele = Math.max(0, e.tele - dt);
      const slowMul = e.slowT > 0 ? 0.5 : 1;
      e.slowT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damageEnemy(e, e.burnDps * dt, false, true);
        if (Math.random() < 0.3) this.particle(e.x + rand(-e.r, e.r), e.y + rand(-e.r, e.r), 0, -40, 0.4, '#ff9f1c', 3, 'dot');
        if (e.burnT <= 0) e.burnDps = 0;
        if (e.dead) continue;
      }
      e.def.update(e, this, dt * slowMul);
      const solid = e.def.flying ? this.flyerSolid : this.groundSolid;
      const bumped = this.moveCircle(e, (e.vx * slowMul + e.kx) * dt, (e.vy * slowMul + e.ky) * dt, solid);
      if (bumped && e.def.id === 'dasher' && e.state === 2) e.timer = 0;
      const kd = Math.min(1, dt * 8);
      e.kx -= e.kx * kd;
      e.ky -= e.ky * kd;
      // Contact damage
      if (dist(e.x, e.y, p.x, p.y) < e.r + PLAYER_HITBOX + 2) this.hurtPlayer(1);
    }
    // Keep enemies apart.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const wa = a.def.boss ? 0 : b.def.boss ? 1 : 0.5;
        const wb = 1 - wa;
        a.x -= (dx / d) * push * 2 * wa;
        a.y -= (dy / d) * push * 2 * wa;
        b.x += (dx / d) * push * 2 * wb;
        b.y += (dy / d) * push * 2 * wb;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  damageEnemy(e: Enemy, dmg: number, crit = false, silent = false): void {
    if (e.dead || e.spawnT > 0) return;
    e.hp -= dmg;
    if (!silent) {
      e.flash = 0.07;
      sfx.hit();
    }
    if (crit) this.particle(e.x, e.y - e.r, 0, -50, 0.6, '#ffd23f', 14, 'text', `${Math.round(dmg)}!`);
    if (e.hp <= 0) this.killEnemy(e, true);
  }

  killEnemy(e: Enemy, byPlayer: boolean): void {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    sfx.kill();
    this.burst(e.x, e.y, e.def.color, e.def.boss ? 60 : 14);
    this.particle(e.x, e.y, 0, 0, 0.35, e.def.color, e.r * 2.5, 'ring');
    e.def.onDeath?.(e, this);
    if (e.def.boss) {
      this.bossDefeated(e);
      return;
    }
    if (!byPlayer) return;
    const s = this.stats;
    const luck = s.luck * 0.02;
    if (e.elite) {
      this.drop('coin', e.x, e.y);
      this.drop('shard', e.x, e.y);
    } else {
      if (Math.random() < 0.1 + luck) this.drop('coin', e.x, e.y);
      if (Math.random() < 0.025 + luck * 0.5) this.drop('shard', e.x, e.y);
    }
    if (Math.random() < 0.012 + s.killHeal) this.drop('halfHeart', e.x, e.y);
  }

  private bossDefeated(e: Enemy): void {
    this.eshots = [];
    this.shake(18);
    this.boss = null;
    for (const o of this.enemies) if (!o.dead) this.killEnemy(o, false);
    const room = this.room;
    room.cleared = true;
    this.roomsCleared++;
    this.shards += 4 + this.floorN * 2;
    this.banner(`${e.def.name} destroyed`, `+${4 + this.floorN * 2} shards`, e.def.color, 2.5);
    const c = tileCenter(8, 4);
    room.pedestals.push({ item: this.drawItem('boss'), x: c.x, y: c.y, price: 0, taken: false });
    this.drop('heart', ROOM_W / 2 - 50, tileCenter(8, 6).y);
    if (this.floorN >= FLOOR_COUNT) {
      this.won = true;
      this.endT = 4;
    } else room.hatch = true;
    room.dirty = true;
  }

  bossPhase(e: Enemy): void {
    this.shake(12);
    this.eshots = [];
    this.burst(e.x, e.y, '#ffffff', 40);
    this.particle(e.x, e.y, 0, 0, 0.6, e.def.color, 200, 'ring');
    this.banner('', 'ENRAGED', e.def.color, 1.2);
  }

  countAlive(id?: string): number {
    return this.enemies.filter((e) => !e.dead && (!id || e.def.id === id)).length;
  }

  /** A random floor point between lo and hi px from the player. */
  freePoint(lo: number, hi: number): { x: number; y: number } {
    const p = this.player;
    let best = tileCenter(8, 2);
    for (let i = 0; i < 60; i++) {
      const tx = 1 + Math.floor(Math.random() * (COLS - 2));
      const ty = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (this.room.tiles[idx(tx, ty)] !== T.Floor) continue;
      const c = tileCenter(tx, ty);
      const d = dist(c.x, c.y, p.x, p.y);
      if (d >= lo && d <= hi) return c;
      if (d >= lo) best = c;
    }
    return best;
  }

  enemyShot(x: number, y: number, ang: number, speed: number, o: ShotOpts = {}): void {
    if (this.eshots.length > 900) return;
    this.eshots.push({
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: o.r ?? 5, color: o.color ?? '#ff2e63', life: o.life ?? 7,
      accel: o.accel ?? 0, curve: o.curve ?? 0, homing: o.homing ?? 0, dead: false,
    });
    sfx.enemyShot();
  }

  /** A line of bullets that crosses the room, with a gap to slip through. */
  bulletWall(side: Dir, gapPos: number, gap: number, speed: number): void {
    const horizontal = side === 'w' || side === 'e';
    const len = horizontal ? ROOM_H - TILE * 2 : ROOM_W - TILE * 2;
    const gapAt = TILE + len * gapPos;
    for (let v = TILE + 10; v < TILE + len - 6; v += 24) {
      if (Math.abs(v - gapAt) < gap / 2) continue;
      if (side === 'w') this.enemyShot(TILE + 8, v, 0, speed, { life: 6, color: '#c77dff' });
      if (side === 'e') this.enemyShot(ROOM_W - TILE - 8, v, Math.PI, speed, { life: 6, color: '#c77dff' });
      if (side === 'n') this.enemyShot(v, TILE + 8, Math.PI / 2, speed, { life: 6, color: '#c77dff' });
      if (side === 's') this.enemyShot(v, ROOM_H - TILE - 8, -Math.PI / 2, speed, { life: 6, color: '#c77dff' });
    }
  }

  explode(x: number, y: number, r: number, dmg: number, hurtsPlayer: boolean, breaksRocks = hurtsPlayer): void {
    sfx.boom();
    this.shake(Math.min(14, r / 6));
    this.particle(x, y, 0, 0, 0.35, '#ffb703', r * 2, 'ring');
    this.burst(x, y, '#ff7b00', Math.round(r / 3));
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || dist(x, y, e.x, e.y) > r + e.r) continue;
      this.damageEnemy(e, dmg, false, false);
      if (this.stats.napalm && !hurtsPlayer) {
        e.burnT = 3;
        e.burnDps = Math.max(e.burnDps, dmg / 3);
      }
    }
    const p = this.player;
    if (hurtsPlayer && dist(x, y, p.x, p.y) < r + PLAYER_HITBOX) this.hurtPlayer(2);
    if (breaksRocks) {
      const tiles = this.room.tiles;
      for (let ty = 1; ty < ROWS - 1; ty++) {
        for (let tx = 1; tx < COLS - 1; tx++) {
          const c = tileCenter(tx, ty);
          if (tiles[idx(tx, ty)] === T.Rock && dist(x, y, c.x, c.y) < r + 22) {
            tiles[idx(tx, ty)] = T.Floor;
            this.room.dirty = true;
            this.burst(c.x, c.y, this.floor.palette.rock, 8);
            if (Math.random() < 0.12) this.drop('coin', c.x, c.y);
          }
        }
      }
      if (this.room.dirty) this.computeFlow();
    }
  }

  private chainLightning(from: Enemy, jumps: number, dmg: number): void {
    const done = new Set<Enemy>([from]);
    let cur = from;
    const pts = [{ x: from.x, y: from.y }];
    for (let i = 0; i < jumps; i++) {
      let next: Enemy | null = null;
      let best = 170;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || done.has(e)) continue;
        const d = dist(cur.x, cur.y, e.x, e.y);
        if (d < best) {
          best = d;
          next = e;
        }
      }
      if (!next) break;
      done.add(next);
      pts.push({ x: next.x, y: next.y });
      this.damageEnemy(next, dmg, false, true);
      cur = next;
    }
    if (pts.length > 1) {
      this.bolts.push({ pts, t: 0.15 });
      sfx.zap();
    }
  }

  // ---------- Shots ----------

  private updateShots(dt: number): void {
    const p = this.player;
    for (const s of this.shots) {
      if (s.homing) {
        let target: Enemy | null = null;
        let best = 280;
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || s.hit.has(e)) continue;
          const d = dist(s.x, s.y, e.x, e.y);
          if (d < best) {
            best = d;
            target = e;
          }
        }
        if (target && s.back !== 2) s.ang = turnToward(s.ang, angleTo(s.x, s.y, target.x, target.y), s.homing * dt);
      }
      if (s.back === 1 && s.dist >= s.range * 0.6) {
        s.back = 2;
        s.hit.clear();
      }
      if (s.back === 2) {
        s.ang = turnToward(s.ang, angleTo(s.x, s.y, p.x, p.y), 9 * dt);
        if (dist(s.x, s.y, p.x, p.y) < 16) s.dead = true;
      }
      let vx = Math.cos(s.ang) * s.speed;
      let vy = Math.sin(s.ang) * s.speed;
      if (s.wave) {
        s.phase += dt * 13;
        const w = Math.cos(s.phase) * s.speed * 0.6;
        vx += -Math.sin(s.ang) * w;
        vy += Math.cos(s.ang) * w;
      }
      const steps = Math.max(1, Math.ceil((s.speed * dt) / 8));
      const h = dt / steps;
      for (let k = 0; k < steps && !s.dead; k++) {
        const nx = s.x + vx * h;
        if (blocksShots(this.tileAt(nx, s.y))) {
          if (s.bounce > 0) {
            s.bounce--;
            s.ang = Math.PI - s.ang;
            vx = -vx;
          } else {
            this.shotDie(s);
            break;
          }
        } else s.x = nx;
        const ny = s.y + vy * h;
        if (blocksShots(this.tileAt(s.x, ny))) {
          if (s.bounce > 0) {
            s.bounce--;
            s.ang = -s.ang;
            vy = -vy;
          } else {
            this.shotDie(s);
            break;
          }
        } else s.y = ny;
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0 || s.hit.has(e)) continue;
          const rr = s.r + e.r;
          if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > rr * rr) continue;
          s.hit.add(e);
          this.hitEnemy(e, s);
          if (s.pierce > 0) s.pierce--;
          else {
            s.dead = true;
            break;
          }
        }
      }
      s.dist += s.speed * dt;
      if ((s.back !== 2 && s.dist > s.range) || s.dist > s.range * 3) this.shotDie(s);
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  private shotDie(s: Shot): void {
    if (s.dead) return;
    s.dead = true;
    for (let i = 0; i < 4; i++) this.particle(s.x, s.y, rand(-60, 60), rand(-60, 60), 0.2, s.color, 2, 'dot');
    if (s.explode && (!s.frag || this.stats.clusterSplit)) this.explode(s.x, s.y, s.explode * (s.frag ? 0.6 : 1), s.dmg * 0.6, false, false);
  }

  private hitEnemy(e: Enemy, s: Shot): void {
    const st = this.stats;
    const crit = Math.random() < st.crit;
    const dmg = s.dmg * (crit ? st.critMult : 1);
    const heavy = e.def.boss ? 0 : e.def.heavy ? 0.25 : 1;
    e.kx += Math.cos(s.ang) * s.knock * heavy;
    e.ky += Math.sin(s.ang) * s.knock * heavy;
    if (s.burn) {
      e.burnT = 3;
      e.burnDps = Math.max(e.burnDps, (s.dmg * s.burn) / 3);
    }
    if (s.slow) e.slowT = Math.max(e.slowT, s.slow);
    for (let i = 0; i < 3; i++) this.particle(s.x, s.y, rand(-80, 80), rand(-80, 80), 0.2, s.color, 2, 'dot');
    this.damageEnemy(e, dmg, crit);
    if (s.explode && (!s.frag || st.clusterSplit)) this.explode(s.x, s.y, s.explode * (s.frag ? 0.6 : 1), s.dmg * 0.6, false, false);
    if (s.chain && !s.frag) this.chainLightning(e, s.chain, s.dmg * 0.5);
    if (s.split && !s.frag) {
      for (let k = 0; k < s.split; k++) {
        const a = s.ang + (k - (s.split - 1) / 2) * 0.7 + (s.split === 1 ? 0.5 : 0);
        const f = this.makeShot(a, 0.5);
        f.x = s.x;
        f.y = s.y;
        f.dmg = s.dmg * 0.5;
        f.r = s.r * 0.7;
        f.range = 150;
        f.pierce = 0;
        f.back = 0;
        f.frag = true;
        f.split = 0;
        f.hit.add(e);
        this.shots.push(f);
      }
    }
  }

  private updateEnemyShots(dt: number): void {
    const p = this.player;
    const orbs = this.orbitalPositions();
    for (const b of this.eshots) {
      b.life -= dt;
      if (b.life <= 0) {
        b.dead = true;
        continue;
      }
      if (b.homing) {
        const a = Math.atan2(b.vy, b.vx);
        const sp = Math.hypot(b.vx, b.vy);
        const na = turnToward(a, angleTo(b.x, b.y, p.x, p.y), b.homing * dt);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      if (b.curve) {
        const c = Math.cos(b.curve * dt);
        const s = Math.sin(b.curve * dt);
        const vx = b.vx * c - b.vy * s;
        b.vy = b.vx * s + b.vy * c;
        b.vx = vx;
      }
      if (b.accel) {
        const m = 1 + b.accel * dt;
        b.vx *= m;
        b.vy *= m;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const t = this.tileAt(b.x, b.y);
      if (t === T.Wall || t === T.Door || t === T.Rock || t === T.Block) {
        b.dead = true;
        this.particle(b.x, b.y, 0, 0, 0.15, b.color, 3, 'dot');
        continue;
      }
      for (const o of orbs) {
        if (dist(o.x, o.y, b.x, b.y) < 10 + b.r) {
          b.dead = true;
          this.particle(b.x, b.y, 0, 0, 0.2, '#ffffff', 4, 'dot');
          break;
        }
      }
      if (b.dead) continue;
      if (dist(b.x, b.y, p.x, p.y) < b.r + PLAYER_HITBOX && p.iframes <= 0) {
        b.dead = true;
        this.hurtPlayer(1);
      }
    }
    this.eshots = this.eshots.filter((b) => !b.dead);
  }

  // ---------- Player damage ----------

  hurtPlayer(n: number): void {
    const p = this.player;
    if (p.iframes > 0 || this.god || this.state !== 'play') return;
    if (p.shieldUp) {
      p.shieldUp = false;
      p.iframes = 0.8;
      this.particle(p.x, p.y, 0, 0, 0.4, '#4cc9f0', 60, 'ring');
      sfx.zap();
      return;
    }
    p.hp -= n;
    p.iframes = 1.1;
    this.shake(10);
    sfx.hurt();
    this.burst(p.x, p.y, '#ff2e63', 14);
    if (this.stats.staticField) {
      this.particle(p.x, p.y, 0, 0, 0.4, '#9bf6ff', 280, 'ring');
      for (const b of this.eshots) if (dist(b.x, b.y, p.x, p.y) < 150) b.dead = true;
      for (const e of this.enemies) {
        if (dist(e.x, e.y, p.x, p.y) < 120 + e.r) {
          this.damageEnemy(e, 12 + this.floorN * 5, false, true);
          const a = angleTo(p.x, p.y, e.x, e.y);
          e.kx += Math.cos(a) * 300;
          e.ky += Math.sin(a) * 300;
        }
      }
    }
    if (p.hp <= 0) {
      p.hp = 0;
      this.finish(false);
    }
  }

  private finish(won: boolean): void {
    if (this.state === 'over') return;
    this.won = won;
    if (won) this.shards += 25;
    this.state = 'over';
    this.endT = won ? 0.3 : 1.4;
    if (!won) {
      this.burst(this.player.x, this.player.y, this.stats.shotColor, 50);
      this.shake(16);
    }
  }

  private result(): RunResult {
    return {
      won: this.won, floor: this.floorN, kills: this.kills, rooms: this.roomsCleared, shards: this.shards, items: this.player.items.slice(),
      time: this.time, seed: this.seed, loadout: this.loadout,
    };
  }

  // ---------- Helpers: orbitals, drones, bombs, pickups ----------

  private orbitalPositions(): { x: number; y: number }[] {
    const n = this.stats.orbitals;
    const p = this.player;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = this.time * 2.8 + (i / n) * TAU;
      out.push({ x: p.x + Math.cos(a) * 40, y: p.y + Math.sin(a) * 40 });
    }
    return out;
  }

  private updateHelpers(dt: number): void {
    const s = this.stats;
    for (const o of this.orbitalPositions()) {
      for (const e of this.enemies) {
        if (!e.dead && e.spawnT <= 0 && dist(o.x, o.y, e.x, e.y) < 10 + e.r) this.damageEnemy(e, s.damage * 4 * dt, false, true);
      }
    }
    const p = this.player;
    this.drones.forEach((d, i) => {
      const a = this.time * 0.8 + (i * TAU) / Math.max(1, this.drones.length);
      const tx = p.x + Math.cos(a) * 30 - Math.cos(p.ang) * 20;
      const ty = p.y + Math.sin(a) * 30 - Math.sin(p.ang) * 20;
      d.x += (tx - d.x) * Math.min(1, dt * 5);
      d.y += (ty - d.y) * Math.min(1, dt * 5);
      d.cd -= dt;
      if (d.cd > 0) return;
      let target: Enemy | null = null;
      let best = 360;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        const dd = dist(d.x, d.y, e.x, e.y);
        if (dd < best) {
          best = dd;
          target = e;
        }
      }
      if (!target) return;
      d.cd = 0.75;
      const shot = this.makeShot(angleTo(d.x, d.y, target.x, target.y), 0.45);
      shot.x = d.x;
      shot.y = d.y;
      shot.split = 0;
      shot.explode = 0;
      shot.back = 0;
      shot.r = Math.max(3, s.shotSize * 0.6);
      shot.color = '#9ef01a';
      this.shots.push(shot);
    });
  }

  private updateBombs(dt: number): void {
    for (const b of this.bombs) {
      b.t -= dt;
      if (b.t <= 0) this.explode(b.x, b.y, 85, 30 + this.floorN * 6, true, true);
    }
    this.bombs = this.bombs.filter((b) => b.t > 0);
  }

  drop(kind: PickupKind, x: number, y: number): void {
    let px = x;
    let py = y;
    if (this.tileAt(x, y) !== T.Floor) {
      const c = nearestFree(this.room.tiles, Math.floor(x / TILE), Math.floor(y / TILE));
      px = c.x;
      py = c.y;
    }
    const a = rand(0, TAU);
    this.room.pickups.push({ kind, x: px, y: py, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, t: 0 });
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const s = this.stats;
    const list = this.room.pickups;
    for (const k of list) {
      k.t += dt;
      const d = dist(k.x, k.y, p.x, p.y);
      const wanted = k.kind === 'coin' || k.kind === 'bomb' || k.kind === 'shard' || p.hp < s.maxHp;
      if (s.magnet && d < 150 && wanted && k.t > 0.4) {
        const a = angleTo(k.x, k.y, p.x, p.y);
        k.vx += Math.cos(a) * 900 * dt;
        k.vy += Math.sin(a) * 900 * dt;
      }
      const fr = Math.min(1, dt * 4);
      k.vx -= k.vx * fr;
      k.vy -= k.vy * fr;
      const o = { x: k.x, y: k.y, r: 8 };
      this.moveCircle(o, k.vx * dt, k.vy * dt, this.groundSolid);
      k.x = o.x;
      k.y = o.y;
      if (d > p.r + 10 || k.t < 0.3 || !wanted) continue;
      k.t = -1;
      this.collect(k);
    }
    this.room.pickups = list.filter((k) => k.t >= 0);
  }

  private collect(k: Pickup): void {
    const p = this.player;
    const label: Record<PickupKind, string> = { coin: '+1 🪙', heart: '+❤', halfHeart: '+½❤', bomb: '+1 💣', shard: '+1 💠' };
    if (k.kind === 'coin') p.coins++;
    if (k.kind === 'heart') p.hp = Math.min(this.stats.maxHp, p.hp + 2);
    if (k.kind === 'halfHeart') p.hp = Math.min(this.stats.maxHp, p.hp + 1);
    if (k.kind === 'bomb') p.bombs++;
    if (k.kind === 'shard') this.shards++;
    sfx.pickup();
    this.particle(k.x, k.y - 10, 0, -40, 0.7, '#ffffff', 12, 'text', label[k.kind]);
  }

  giveItem(id: string): void {
    const def = ITEM_BY_ID[id];
    if (!def) return;
    const before = this.stats.maxHp;
    this.player.items.push(id);
    this.recalc();
    const gain = this.stats.maxHp - before;
    if (gain > 0) this.player.hp += gain;
    this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
    sfx.item();
    const color = def.rarity === 'legendary' ? '#ffd23f' : def.rarity === 'rare' ? '#c77dff' : '#3df2ff';
    this.banner(`${def.icon} ${def.name}`, def.desc, color, 3);
    this.burst(this.player.x, this.player.y, color, 30);
  }

  // ---------- Room flow ----------

  private checkRoomClear(dt: number): void {
    const room = this.room;
    if (room.cleared || this.enemies.length > 0) return;
    if (room.type === 'challenge' && room.wave > 1) {
      this.waveDelay += dt;
      if (this.waveDelay > 0.9) {
        this.waveDelay = 0;
        room.wave--;
        this.spawnWave();
      }
      return;
    }
    if (room.type === 'boss') return;
    room.cleared = true;
    this.roomsCleared++;
    this.shards++;
    sfx.door();
    const c = nearestFree(room.tiles, 8, 5, reachable(room.tiles, Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE)));
    if (room.type === 'challenge') {
      room.pedestals.push({ item: this.drawItem('treasure'), x: c.x, y: c.y, price: 0, taken: false });
      return;
    }
    if (Math.random() < 0.5 + this.stats.luck * 0.06) {
      const roll = Math.random();
      const kind: PickupKind = roll < 0.42 ? 'coin' : roll < 0.62 ? 'halfHeart' : roll < 0.74 ? 'heart' : roll < 0.9 ? 'bomb' : 'shard';
      this.drop(kind, c.x, c.y);
      if (kind === 'coin' && Math.random() < 0.4) this.drop('coin', c.x, c.y);
    }
  }

  private checkDoors(): void {
    if (!this.room.cleared) return;
    const p = this.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (const d of Object.keys(this.room.doors) as Dir[]) {
      const dd = DIRS[d];
      if (tx !== dd.tx || ty !== dd.ty) continue;
      const to = this.floor.rooms.get(roomKey(this.room.gx + dd.dx, this.room.gy + dd.dy));
      if (!to) continue;
      this.trans = { dir: d, t: 0, from: this.room, to };
      this.state = 'transition';
      this.room.pickups = this.room.pickups.filter((k) => k.t >= 0);
      return;
    }
  }

  private nextFloor(): void {
    this.floorN++;
    this.room.hatch = false;
    this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 2);
    this.startFloor();
  }

  // ---------- Effects ----------

  shake(n: number): void {
    this.shakeMag = Math.max(this.shakeMag, n);
  }

  particle(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, kind: Particle['kind'], text?: string): void {
    if (this.particles.length > 700) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, max: life, color, size, kind, text });
  }

  burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(40, 220);
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.6), color, rand(1.5, 3.5), 'dot');
    }
  }

  private updateParticles(dt: number): void {
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'dot') {
        q.vx *= 1 - Math.min(1, dt * 3);
        q.vy *= 1 - Math.min(1, dt * 3);
      }
    }
    this.particles = this.particles.filter((q) => q.life > 0);
  }

  banner(title: string, sub: string, color: string, dur: number): void {
    this.banners = this.banners.filter((b) => b.title !== title || b.sub !== sub);
    this.banners.push({ title, sub, color, t: 0, dur });
  }

  private toastText(text: string): void {
    this.particle(this.player.x, this.player.y - 26, 0, -25, 1.2, '#ffffff', 13, 'text', text);
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'play';
  }

  quit(): void {
    this.finish(false);
    this.endT = 0;
  }

  // ---------- Drawing ----------

  private screenToWorld(cx: number, cy: number): { x: number; y: number } {
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    return { x: (cx * dpr - this.view.ox) / this.view.scale, y: (cy * dpr - this.view.oy) / this.view.scale };
  }

  private staticFor(room: Room): HTMLCanvasElement {
    let c = this.statics.get(room);
    if (!c || room.dirty) {
      c = drawRoomStatic(room, this.floor.palette, c, this.floorN === 1 && room.type === 'start' && !this.input.touch && !matchMedia('(pointer: coarse)').matches);
      room.dirty = false;
      this.statics.set(room, c);
    }
    return c;
  }

  draw(): void {
    const cv = this.canvas;
    const ctx = cv.getContext('2d')!;
    const W = cv.width;
    const H = cv.height;
    const pal = this.floor.palette;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020204';
    ctx.fillRect(0, 0, W, H);
    const scale = Math.min(W / ROOM_W, H / ROOM_H) * 0.98;
    const ox = (W - ROOM_W * scale) / 2;
    const oy = (H - ROOM_H * scale) / 2;
    this.view = { scale, ox, oy };
    const sx = this.shakeMag ? rand(-1, 1) * this.shakeMag * scale * 0.4 : 0;
    const sy = this.shakeMag ? rand(-1, 1) * this.shakeMag * scale * 0.4 : 0;

    if (this.state === 'transition' && this.trans) {
      const tr = this.trans;
      const e = tr.t * tr.t * (3 - 2 * tr.t);
      const d = DIRS[tr.dir];
      const fx = -d.dx * e * ROOM_W;
      const fy = -d.dy * e * ROOM_H;
      ctx.setTransform(scale, 0, 0, scale, ox + fx * scale, oy + fy * scale);
      ctx.drawImage(this.staticFor(tr.from), 0, 0, ROOM_W, ROOM_H);
      ctx.setTransform(scale, 0, 0, scale, ox + (fx + d.dx * ROOM_W) * scale, oy + (fy + d.dy * ROOM_H) * scale);
      ctx.drawImage(this.staticFor(tr.to), 0, 0, ROOM_W, ROOM_H);
      this.drawDoors(ctx, tr.to, pal.wall, true);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawHud(ctx, W, H);
      return;
    }

    ctx.setTransform(scale, 0, 0, scale, ox + sx, oy + sy);
    ctx.drawImage(this.staticFor(this.room), 0, 0, ROOM_W, ROOM_H);
    this.drawDoors(ctx, this.room, pal.wall, this.room.cleared);
    this.drawWorld(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawTouch(ctx);
    this.drawHud(ctx, W, H);
  }

  private drawDoors(ctx: CanvasRenderingContext2D, room: Room, color: string, open: boolean): void {
    for (const d of Object.keys(room.doors) as Dir[]) {
      const dd = DIRS[d];
      const x = dd.tx * TILE;
      const y = dd.ty * TILE;
      const target = this.floor.rooms.get(roomKey(room.gx + dd.dx, room.gy + dd.dy));
      const special = target?.type === 'boss' ? '#ff3b3b' : target?.type === 'treasure' ? '#ffd23f' : target?.type === 'shop' ? '#9ef01a' : target?.type === 'challenge' ? '#ff9f1c' : color;
      ctx.save();
      ctx.strokeStyle = special;
      ctx.lineWidth = 3;
      ctx.shadowColor = special;
      ctx.shadowBlur = 10;
      if (dd.dx === 0) {
        ctx.beginPath();
        ctx.moveTo(x - 2, y);
        ctx.lineTo(x - 2, y + TILE);
        ctx.moveTo(x + TILE + 2, y);
        ctx.lineTo(x + TILE + 2, y + TILE);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x + TILE, y - 2);
        ctx.moveTo(x, y + TILE + 2);
        ctx.lineTo(x + TILE, y + TILE + 2);
        ctx.stroke();
      }
      if (!open) {
        ctx.strokeStyle = '#ff2e63';
        ctx.shadowColor = '#ff2e63';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
          if (dd.dx === 0) {
            ctx.moveTo(x + (i * TILE) / 4, y + 4);
            ctx.lineTo(x + (i * TILE) / 4, y + TILE - 4);
          } else {
            ctx.moveTo(x + 4, y + (i * TILE) / 4);
            ctx.lineTo(x + TILE - 4, y + (i * TILE) / 4);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    const room = this.room;
    const p = this.player;
    const t = this.time;

    // Hatch
    if (room.hatch) {
      const c = tileCenter(8, 7);
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.strokeStyle = this.floor.palette.wall;
      ctx.lineWidth = 2;
      ctx.shadowColor = this.floor.palette.wall;
      ctx.shadowBlur = 14;
      ctx.fillRect(c.x - 16, c.y - 16, 32, 32);
      ctx.strokeRect(c.x - 16, c.y - 16, 32, 32);
      ctx.fillStyle = this.floor.palette.wall;
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('▼ DOWN', c.x, c.y + 3);
      ctx.restore();
    }

    // Pickups
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const k of room.pickups) {
      const bob = Math.sin((t + k.x) * 4) * 2;
      const col = k.kind === 'coin' ? '#ffd23f' : k.kind === 'bomb' ? '#aaaaaa' : k.kind === 'shard' ? '#3df2ff' : '#ff2e63';
      drawGlow(ctx, k.x, k.y, 18, col, 0.35);
      if (k.kind === 'heart' || k.kind === 'halfHeart') drawHeart(ctx, k.x, k.y + bob, k.kind === 'heart' ? 9 : 6, 2, 2);
      else {
        ctx.font = '16px system-ui';
        ctx.fillText(k.kind === 'coin' ? '🪙' : k.kind === 'bomb' ? '💣' : '💠', k.x, k.y + bob);
      }
    }

    // Pedestals and wares
    for (const ped of room.pedestals) {
      if (ped.taken) continue;
      const def = ITEM_BY_ID[ped.item];
      const col = def.rarity === 'legendary' ? '#ffd23f' : def.rarity === 'rare' ? '#c77dff' : '#3df2ff';
      ctx.save();
      ctx.fillStyle = '#0d0d16';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.fillRect(ped.x - 14, ped.y + 4, 28, 12);
      ctx.strokeRect(ped.x - 14, ped.y + 4, 28, 12);
      ctx.restore();
      drawGlow(ctx, ped.x, ped.y - 8, 28, col, 0.4);
      ctx.font = '22px system-ui';
      ctx.fillText(def.icon, ped.x, ped.y - 8 + Math.sin(t * 3) * 3);
      if (dist(p.x, p.y, ped.x, ped.y) < 90) {
        ctx.font = 'bold 10px system-ui';
        ctx.fillStyle = col;
        ctx.fillText(def.name, ped.x, ped.y - 32);
        ctx.fillStyle = '#ccc';
        ctx.font = '9px system-ui';
        ctx.fillText(def.desc, ped.x, ped.y - 22 - 0);
      }
      if (ped.price) {
        ctx.fillStyle = p.coins >= ped.price ? '#ffd23f' : '#ff6b6b';
        ctx.font = 'bold 11px system-ui';
        ctx.fillText(`${ped.price} 🪙`, ped.x, ped.y + 26);
      }
    }
    for (const w of room.wares) {
      if (w.taken) continue;
      if (w.kind === 'heart') drawHeart(ctx, w.x, w.y, 9, 2, 2);
      else {
        ctx.font = '18px system-ui';
        ctx.fillText('💣', w.x, w.y);
      }
      ctx.fillStyle = p.coins >= w.price ? '#ffd23f' : '#ff6b6b';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText(`${w.price} 🪙`, w.x, w.y + 22);
    }

    // Bombs
    for (const b of this.bombs) {
      const blink = b.t < 0.5 ? Math.sin(b.t * 60) > 0 : Math.sin(b.t * 18) > 0;
      drawGlow(ctx, b.x, b.y, 26, '#ff7b00', blink ? 0.7 : 0.3);
      ctx.font = '18px system-ui';
      ctx.fillText('💣', b.x, b.y);
    }

    // Telegraph lines
    for (const e of this.enemies) {
      if (e.tele <= 0 || e.spawnT > 0) continue;
      ctx.save();
      ctx.strokeStyle = e.def.color;
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 20));
      ctx.lineWidth = e.def.boss ? 4 : 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.teleAng) * 800, e.y + Math.sin(e.teleAng) * 800);
      ctx.stroke();
      ctx.restore();
    }

    // Enemies
    for (const e of this.enemies) this.drawEnemy(ctx, e);

    // Player
    const blink = p.iframes > 0 && p.dodgeT <= 0 && Math.sin(t * 40) > 0;
    if (this.state !== 'over') {
      const col = this.stats.shotColor;
      drawGlow(ctx, p.x, p.y, 34, col, 0.45);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = blink ? 0.35 : p.dodgeT > 0 ? 0.6 : 1;
      ctx.rotate(p.ang);
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fillStyle = '#0a1a22';
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (p.shieldUp) {
        ctx.save();
        ctx.strokeStyle = '#4cc9f0';
        ctx.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Orbitals and drones
    for (const o of this.orbitalPositions()) {
      drawGlow(ctx, o.x, o.y, 22, '#ffffff', 0.5);
      ctx.fillStyle = '#e0fbfc';
      ctx.beginPath();
      ctx.arc(o.x, o.y, 6, 0, TAU);
      ctx.fill();
    }
    for (const d of this.drones) {
      drawGlow(ctx, d.x, d.y, 20, '#9ef01a', 0.5);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.strokeStyle = '#9ef01a';
      ctx.lineWidth = 2;
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    }

    // Player shots
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shots) drawGlow(ctx, s.x, s.y, s.r * 3.2, s.color, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.shots) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.5, 0, TAU);
      ctx.fill();
    }

    // Enemy shots
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.eshots) drawGlow(ctx, b.x, b.y, b.r * 3.4, b.color, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    for (const b of this.eshots) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU);
      ctx.fill();
    }

    // Lightning
    ctx.save();
    ctx.strokeStyle = '#ffee32';
    ctx.shadowColor = '#ffee32';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    for (const b of this.bolts) {
      ctx.globalAlpha = Math.min(1, b.t / 0.1);
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let i = 1; i < b.pts.length; i++) {
        const a = b.pts[i - 1];
        const c = b.pts[i];
        for (let k = 1; k <= 4; k++) {
          const f = k / 4;
          const j = k === 4 ? 0 : 10;
          ctx.lineTo(a.x + (c.x - a.x) * f + rand(-j, j), a.y + (c.y - a.y) * f + rand(-j, j));
        }
      }
      ctx.stroke();
    }
    ctx.restore();

    // Particles
    for (const q of this.particles) {
      const a = Math.max(0, q.life / q.max);
      if (q.kind === 'dot') {
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      } else if (q.kind === 'ring') {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(0.1, (1 - a) * q.size * 0.5 + 4), 0, TAU);
        ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = q.color;
        ctx.font = `bold ${q.size}px system-ui`;
        ctx.fillText(q.text ?? '', q.x, q.y);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
    if (e.spawnT > 0) {
      const k = e.spawnT / 0.75;
      ctx.save();
      ctx.strokeStyle = e.def.color;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.4 + k * 1.6), 0, TAU);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const col = e.def.color;
    drawGlow(ctx, e.x, e.y, e.r * 2.6, e.elite ? '#ffd23f' : col, 0.35 * e.alpha);
    ctx.save();
    ctx.globalAlpha = e.alpha;
    ctx.translate(e.x, e.y);
    if (e.elite) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 5, 0, TAU);
      ctx.stroke();
    }
    ctx.rotate(e.ang);
    shapePath(ctx, e.def.shape, e.r, e.t);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.slowT > 0 ? '#1d3557' : 'rgba(10,10,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = e.slowT > 0 ? '#8ecae6' : col;
    ctx.lineWidth = e.def.boss ? 3.5 : 2.5;
    ctx.stroke();
    if (e.def.boss) {
      ctx.rotate(-e.ang + e.t * 1.5);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5 * e.alpha;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 10, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (!e.def.boss && e.hp < e.maxHp) {
      const w = e.r * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, 3);
      ctx.fillStyle = col;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 9, (w * Math.max(0, e.hp)) / e.maxHp, 3);
    }
  }

  private drawTouch(ctx: CanvasRenderingContext2D): void {
    const inp = this.input;
    if (!inp.touch) return;
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    for (const [s, col] of [
      [inp.moveStick, '#3df2ff'],
      [inp.aimStick, '#ff2e63'],
    ] as const) {
      if (!s) continue;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(s.ox * dpr, s.oy * dpr, 45 * dpr, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = col;
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      const m = d > 45 ? 45 / d : 1;
      ctx.beginPath();
      ctx.arc((s.ox + dx * m) * dpr, (s.oy + dy * m) * dpr, 18 * dpr, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    const u = dpr * clamp(Math.min(W, H) / dpr / 640, 0.7, 1.25);
    const p = this.player;
    const s = this.stats;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Hearts
    const hearts = Math.ceil(s.maxHp / 2);
    for (let i = 0; i < hearts; i++) {
      const fill = clamp(p.hp - i * 2, 0, 2);
      drawHeart(ctx, 22 * u + (i % 8) * 22 * u, 20 * u + Math.floor(i / 8) * 20 * u, 8 * u, fill, 2);
    }
    if (p.shieldUp) {
      ctx.font = `${14 * u}px system-ui`;
      ctx.fillText('🛡️', 22 * u + Math.min(hearts, 8) * 22 * u, 20 * u);
    }
    const row = 20 * u + (Math.ceil(hearts / 8) - 1) * 20 * u + 24 * u;
    ctx.font = `bold ${13 * u}px system-ui`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`🪙 ${p.coins}   💣 ${p.bombs}   💠 ${this.shards}`, 12 * u, row);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `${11 * u}px system-ui`;
    ctx.fillText(`Floor ${this.floorN} · ${this.floor.palette.name}`, 12 * u, row + 18 * u);
    if (p.dodgeCd > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(12 * u, row + 30 * u, 60 * u, 4 * u);
      ctx.fillStyle = s.shotColor;
      ctx.fillRect(12 * u, row + 30 * u, 60 * u * (1 - clamp(p.dodgeCd / (s.dodgeCd + 0.24), 0, 1)), 4 * u);
    }

    // Items
    ctx.font = `${16 * u}px system-ui`;
    const perRow = Math.max(6, Math.floor((W * 0.45) / (22 * u)));
    p.items.forEach((id, i) => {
      ctx.fillText(ITEM_BY_ID[id]?.icon ?? '?', 12 * u + (i % perRow) * 22 * u, H - 16 * u - Math.floor(i / perRow) * 22 * u);
    });

    // Minimap
    this.drawMap(ctx, W, u, this.showMap);

    // Boss bar
    if (this.boss && !this.boss.dead && this.boss.spawnT <= 0) {
      const b = this.boss;
      const bw = Math.min(W * 0.6, 420 * u);
      const bx = (W - bw) / 2;
      const by = H - 30 * u;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bx, by, bw, 10 * u);
      ctx.fillStyle = b.def.color;
      ctx.fillRect(bx, by, (bw * Math.max(0, b.hp)) / b.maxHp, 10 * u);
      ctx.strokeStyle = b.def.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, 10 * u);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${12 * u}px system-ui`;
      ctx.fillText(b.def.name, W / 2, by - 10 * u);
    }

    // Banners
    ctx.textAlign = 'center';
    const b = this.banners[this.banners.length - 1];
    if (b) {
      const a = Math.min(1, b.t * 4, (b.dur - b.t) * 2);
      ctx.globalAlpha = Math.max(0, a);
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 16 * u;
      if (b.title) {
        ctx.fillStyle = b.color;
        ctx.font = `900 ${30 * u}px system-ui`;
        ctx.fillText(b.title, W / 2, H * 0.22);
      }
      ctx.fillStyle = b.title ? '#ffffff' : b.color;
      ctx.font = b.title ? `${15 * u}px system-ui` : `900 ${26 * u}px system-ui`;
      ctx.fillText(b.sub, W / 2, H * 0.22 + (b.title ? 30 * u : 0));
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (this.state === 'over' && !this.won) {
      ctx.fillStyle = 'rgba(40,0,10,0.35)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  private drawMap(ctx: CanvasRenderingContext2D, W: number, u: number, big: boolean): void {
    const cw = (big ? 30 : 14) * u;
    const ch = (big ? 20 : 10) * u;
    const gap = 3 * u;
    const rooms = [...this.floor.rooms.values()];
    const known = rooms.filter((r) => r.visited || rooms.some((o) => o.visited && Math.abs(o.gx - r.gx) + Math.abs(o.gy - r.gy) === 1 && this.adjacent(o, r)));
    if (!known.length) return;
    const minX = Math.min(...rooms.map((r) => r.gx));
    const maxX = Math.max(...rooms.map((r) => r.gx));
    const minY = Math.min(...rooms.map((r) => r.gy));
    const maxY = Math.max(...rooms.map((r) => r.gy));
    const mw = (maxX - minX + 1) * (cw + gap);
    const mh = (maxY - minY + 1) * (ch + gap);
    const ox = big ? (W - mw) / 2 : W - mw - 12 * u;
    const oy = big ? 80 * u : 12 * u;
    ctx.save();
    ctx.fillStyle = big ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(ox - 6 * u, oy - 6 * u, mw + 12 * u - gap, mh + 12 * u - gap);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of known) {
      const x = ox + (r.gx - minX) * (cw + gap);
      const y = oy + (r.gy - minY) * (ch + gap);
      const cur = r === this.room;
      ctx.fillStyle = cur ? '#ffffff' : r.visited ? 'rgba(160,180,200,0.75)' : 'rgba(80,90,110,0.5)';
      ctx.fillRect(x, y, cw, ch);
      const icon = r.type === 'boss' ? '💀' : r.type === 'treasure' ? '👑' : r.type === 'shop' ? '🛒' : r.type === 'challenge' ? '⚔️' : '';
      if (icon) {
        ctx.font = `${ch * 0.8}px system-ui`;
        ctx.fillText(icon, x + cw / 2, y + ch / 2 + 1);
      }
    }
    ctx.restore();
  }

  private adjacent(a: Room, b: Room): boolean {
    for (const d of Object.keys(a.doors) as Dir[]) if (a.gx + DIRS[d].dx === b.gx && a.gy + DIRS[d].dy === b.gy) return true;
    return false;
  }
}
