/** Ship model: layout geometry, path finding, crew, systems and reactor power. Pure functions on plain objects. */
import { LAYOUTS, RACES, SYSTEMS, WEAPONS, type LayoutDef, type Race, type SysId } from './data';

export interface Door {
  a: number;
  b: number;
  /** Tile in room a and tile in room b. */
  ta: number;
  tb: number;
}

export interface Layout {
  id: string;
  def: LayoutDef;
  w: number;
  h: number;
  tileRoom: number[];
  doors: Door[];
  /** Tile neighbours (index list) for path finding. */
  nb: number[][];
  roomTiles: number[][];
  roomNb: number[][];
}

const layoutCache = new Map<string, Layout>();

export function layoutOf(id: string): Layout {
  const hit = layoutCache.get(id);
  if (hit) return hit;
  const def = LAYOUTS[id];
  const w = def.w;
  const h = def.h;
  const tileRoom = new Array<number>(w * h).fill(-1);
  const roomTiles: number[][] = def.rooms.map(() => []);
  def.rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        tileRoom[y * w + x] = i;
        roomTiles[i].push(y * w + x);
      }
  });
  const nb: number[][] = tileRoom.map(() => []);
  // Moves inside a room.
  for (let t = 0; t < w * h; t++) {
    if (tileRoom[t] < 0) continue;
    const x = t % w;
    const y = Math.floor(t / w);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= w || ny >= h) continue;
      const u = ny * w + nx;
      if (tileRoom[u] === tileRoom[t]) {
        nb[t].push(u);
        nb[u].push(t);
      }
    }
  }
  // One door per pair of touching rooms, at the middle of the shared edge.
  const pairs = new Map<string, [number, number][]>();
  for (let t = 0; t < w * h; t++) {
    if (tileRoom[t] < 0) continue;
    const x = t % w;
    const y = Math.floor(t / w);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= w || ny >= h) continue;
      const u = ny * w + nx;
      const a = tileRoom[t];
      const b = tileRoom[u];
      if (b < 0 || a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const list = pairs.get(key) ?? [];
      list.push(a < b ? [t, u] : [u, t]);
      pairs.set(key, list);
    }
  }
  const doors: Door[] = [];
  const roomNb: number[][] = def.rooms.map(() => []);
  for (const [key, list] of pairs) {
    const [a, b] = key.split('-').map(Number);
    const [ta, tb] = list[Math.floor((list.length - 1) / 2)];
    doors.push({ a, b, ta, tb });
    nb[ta].push(tb);
    nb[tb].push(ta);
    roomNb[a].push(b);
    roomNb[b].push(a);
  }
  const lay: Layout = { id, def, w, h, tileRoom, doors, nb, roomTiles, roomNb };
  layoutCache.set(id, lay);
  return lay;
}

/** BFS path of tiles from `from` to `to` (excluding `from`). */
export function findPath(lay: Layout, from: number, to: number): number[] {
  if (from === to) return [];
  const prev = new Array<number>(lay.tileRoom.length).fill(-2);
  prev[from] = -1;
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const t = q[i];
    if (t === to) break;
    for (const u of lay.nb[t]) {
      if (prev[u] !== -2) continue;
      prev[u] = t;
      q.push(u);
    }
  }
  if (prev[to] === -2) return [];
  const path: number[] = [];
  for (let t = to; t !== from; t = prev[t]) path.push(t);
  return path.reverse();
}

// ---------- State ----------

export interface Room {
  o2: number;
  fire: number;
  breach: number;
  breachProg: number;
}

export interface Sys {
  id: SysId;
  room: number;
  level: number;
  power: number;
  want: number;
  dmg: number;
  repair: number;
  ion: number;
  ionT: number;
  burn: number;
}

export type Skill = 'pilot' | 'engines' | 'shields' | 'weapons';

export interface Crew {
  id: number;
  name: string;
  race: Race;
  hp: number;
  max: number;
  x: number;
  y: number;
  path: number[];
  /** Room the crew returns to. */
  home: number;
  /** Room the crew walks to now. */
  dest: number;
  xp: Record<Skill, number>;
  healing?: boolean;
}

export interface WeaponInst {
  id: string;
  charge: number;
  powered: boolean;
  want: boolean;
  target: number | null;
  chain: number;
}

export interface Ship {
  name: string;
  layout: string;
  hull: number;
  maxHull: number;
  reactor: number;
  rooms: Room[];
  systems: Partial<Record<SysId, Sys>>;
  crew: Crew[];
  weapons: WeaponInst[];
  shields: number;
  shieldProg: number;
  ftl: number;
  auto: boolean;
  augments: string[];
  missiles: number;
  /** Ships with no crew: systems work unmanned and repair by themselves. */
  drone: boolean;
  nextCrewId: number;
}

export const SKILL_LVL = [45, 130];
export const skillLevel = (xp: number): number => (xp >= SKILL_LVL[1] ? 2 : xp >= SKILL_LVL[0] ? 1 : 0);

export function makeCrew(ship: Ship, race: Race, name: string): Crew {
  const r = RACES[race];
  return {
    id: ship.nextCrewId++,
    name,
    race,
    hp: r.hp,
    max: r.hp,
    x: 0,
    y: 0,
    path: [],
    home: 0,
    dest: 0,
    xp: { pilot: 0, engines: 0, shields: 0, weapons: 0 },
  };
}

export function newShip(name: string, layoutId: string, hull: number, reactor: number, levels: Partial<Record<SysId, number>>): Ship {
  const lay = layoutOf(layoutId);
  const systems: Partial<Record<SysId, Sys>> = {};
  lay.def.rooms.forEach((r, i) => {
    if (!r.sys) return;
    const level = levels[r.sys] ?? 0;
    if (level <= 0) return;
    systems[r.sys] = { id: r.sys, room: i, level, power: 0, want: 0, dmg: 0, repair: 0, ion: 0, ionT: 0, burn: 0 };
  });
  return {
    name,
    layout: layoutId,
    hull,
    maxHull: hull,
    reactor,
    rooms: lay.def.rooms.map(() => ({ o2: 100, fire: 0, breach: 0, breachProg: 0 })),
    systems,
    crew: [],
    weapons: [],
    shields: 0,
    shieldProg: 0,
    ftl: 0,
    auto: true,
    augments: [],
    missiles: 0,
    drone: false,
    nextCrewId: 1,
  };
}

export function addWeapon(ship: Ship, id: string): void {
  ship.weapons.push({ id, charge: 0, powered: false, want: true, target: null, chain: 0 });
}

/** Station rooms in order: pilot, engines, weapons, shields, then the rest. */
export function stationRooms(ship: Ship): number[] {
  const order: SysId[] = ['pilot', 'engines', 'weapons', 'shields', 'medbay', 'oxygen'];
  const rooms: number[] = [];
  for (const s of order) {
    const sys = ship.systems[s];
    if (sys) rooms.push(sys.room);
  }
  return rooms;
}

export function placeCrew(ship: Ship, c: Crew): void {
  const lay = layoutOf(ship.layout);
  const st = stationRooms(ship);
  const taken = ship.crew.filter((o) => o !== c).map((o) => o.home);
  const home = st.find((r) => !taken.includes(r)) ?? st[ship.crew.indexOf(c) % st.length] ?? 0;
  c.home = home;
  c.dest = home;
  const t = freeTile(ship, home, c) ?? lay.roomTiles[home][0];
  c.x = t % lay.w;
  c.y = Math.floor(t / lay.w);
  c.path = [];
}

export function crewTile(ship: Ship, c: Crew): number {
  const lay = layoutOf(ship.layout);
  return Math.round(c.y) * lay.w + Math.round(c.x);
}

export function crewRoom(ship: Ship, c: Crew): number {
  return layoutOf(ship.layout).tileRoom[crewTile(ship, c)];
}

/** A tile in the room that no other crew stands on or walks to. */
export function freeTile(ship: Ship, room: number, self: Crew): number | null {
  const lay = layoutOf(ship.layout);
  const used = new Set<number>();
  for (const o of ship.crew) {
    if (o === self) continue;
    used.add(o.path.length ? o.path[o.path.length - 1] : crewTile(ship, o));
  }
  return lay.roomTiles[room].find((t) => !used.has(t)) ?? null;
}

export function sendCrew(ship: Ship, c: Crew, room: number): void {
  const lay = layoutOf(ship.layout);
  c.dest = room;
  const here = crewTile(ship, c);
  if (lay.tileRoom[here] === room && !c.path.length) return;
  const goal = freeTile(ship, room, c) ?? lay.roomTiles[room][0];
  // Start from the next tile when already walking, so the crew does not jump.
  const start = c.path.length ? c.path[0] : here;
  const p = findPath(lay, start, goal);
  c.path = c.path.length ? [start, ...p] : p;
}

// ---------- Power ----------

export function zoltansIn(ship: Ship, room: number): number {
  let n = 0;
  for (const c of ship.crew) if (c.race === 'zoltan' && !c.path.length && crewRoom(ship, c) === room) n++;
  return n;
}

export const weaponPower = (ship: Ship): number => ship.weapons.reduce((a, w) => a + (w.powered ? WEAPONS[w.id].power : 0), 0);

export function sysPower(ship: Ship, id: SysId): number {
  if (id === 'weapons') return weaponPower(ship);
  return ship.systems[id]?.power ?? 0;
}

/** Usable bars of a system (level minus damage). */
export function capacity(sys: Sys): number {
  return Math.max(0, sys.level - sys.dmg);
}

export function reactorUsed(ship: Ship): number {
  let used = 0;
  for (const id of ['shields', 'engines', 'oxygen', 'medbay', 'weapons'] as SysId[]) {
    const s = ship.systems[id];
    if (!s) continue;
    used += Math.max(0, sysPower(ship, id) - zoltansIn(ship, s.room));
  }
  return used;
}

export const reactorFree = (ship: Ship): number => ship.reactor - reactorUsed(ship);

/** Power that works now: allocated power minus ion. The pilot counts as level when manned. */
export function effPower(ship: Ship, id: SysId): number {
  const s = ship.systems[id];
  if (!s) return 0;
  if (id === 'pilot') return capacity(s);
  return Math.max(0, sysPower(ship, id) - s.ion);
}

export function addPower(ship: Ship, id: SysId): boolean {
  const s = ship.systems[id];
  if (!s || id === 'weapons' || id === 'pilot') return false;
  if (s.power >= capacity(s)) return false;
  const z = zoltansIn(ship, s.room);
  const needs = s.power + 1 > z ? 1 : 0;
  if (reactorFree(ship) < needs) return false;
  s.power++;
  s.want = s.power;
  return true;
}

export function removePower(ship: Ship, id: SysId): boolean {
  const s = ship.systems[id];
  if (!s || id === 'weapons' || id === 'pilot' || s.power <= 0) return false;
  s.power--;
  s.want = s.power;
  return true;
}

function canPowerWeapon(ship: Ship, i: number): boolean {
  const ws = ship.systems.weapons;
  if (!ws) return false;
  const w = ship.weapons[i];
  const cost = WEAPONS[w.id].power;
  if (weaponPower(ship) + cost > capacity(ws)) return false;
  const z = zoltansIn(ship, ws.room);
  const before = Math.max(0, weaponPower(ship) - z);
  const after = Math.max(0, weaponPower(ship) + cost - z);
  return reactorFree(ship) >= after - before;
}

export function toggleWeapon(ship: Ship, i: number): boolean {
  const w = ship.weapons[i];
  if (!w) return false;
  if (w.powered) {
    w.powered = false;
    w.want = false;
    return true;
  }
  if (!canPowerWeapon(ship, i)) return false;
  w.powered = true;
  w.want = true;
  return true;
}

const SHED: SysId[] = ['medbay', 'oxygen', 'engines', 'weapons', 'shields'];

/** Keep power legal after damage, ion or crew moves, and give back wanted power when it fits. */
export function fixPower(ship: Ship): void {
  for (const id of ['shields', 'engines', 'oxygen', 'medbay'] as SysId[]) {
    const s = ship.systems[id];
    if (s && s.power > capacity(s)) s.power = capacity(s);
  }
  const ws = ship.systems.weapons;
  if (ws) {
    for (let i = ship.weapons.length - 1; i >= 0 && weaponPower(ship) > capacity(ws); i--) ship.weapons[i].powered = false;
  } else ship.weapons.forEach((w) => (w.powered = false));
  // Reactor overflow (a Zoltan walked out).
  let guard = 20;
  while (reactorUsed(ship) > ship.reactor && guard-- > 0) {
    for (const id of SHED) {
      if (id === 'weapons') {
        const i = ship.weapons.map((w) => w.powered).lastIndexOf(true);
        if (i >= 0) {
          ship.weapons[i].powered = false;
          break;
        }
        continue;
      }
      const s = ship.systems[id];
      if (s && s.power > 0) {
        s.power--;
        break;
      }
    }
  }
  // Give back wanted power.
  for (const id of ['shields', 'engines', 'oxygen', 'medbay'] as SysId[]) {
    const s = ship.systems[id];
    if (!s) continue;
    while (s.power < s.want && s.power < capacity(s)) {
      const z = zoltansIn(ship, s.room);
      if (reactorFree(ship) < (s.power + 1 > z ? 1 : 0)) break;
      s.power++;
    }
  }
  ship.weapons.forEach((w, i) => {
    if (w.want && !w.powered && canPowerWeapon(ship, i)) w.powered = true;
  });
}

/** Fill power in a fixed order, used for new ships and the enemy. */
export function autoPower(ship: Ship, order: SysId[] = ['shields', 'weapons', 'engines', 'oxygen', 'medbay']): void {
  for (const id of order) {
    if (id === 'weapons') {
      ship.weapons.forEach((w, i) => {
        if (!w.powered && canPowerWeapon(ship, i)) {
          w.powered = true;
          w.want = true;
        }
      });
      continue;
    }
    while (addPower(ship, id)) {
      /* fill */
    }
  }
}

export const maxLayers = (ship: Ship): number => Math.floor(effPower(ship, 'shields') / 2);

export function upgradeCost(id: SysId, level: number): number {
  return SYSTEMS[id].cost * (level + 1);
}

export const reactorCost = (reactor: number): number => 10 + reactor * 2;

export function isManned(ship: Ship, id: SysId): Crew | null {
  const s = ship.systems[id];
  if (!s) return null;
  const room = ship.rooms[s.room];
  if (room.fire > 0.05 || room.breach > 0 || s.dmg > 0) return null;
  for (const c of ship.crew) if (!c.path.length && crewRoom(ship, c) === s.room) return c;
  return null;
}

/** Evasion in percent. */
export function evasion(ship: Ship): number {
  const eng = effPower(ship, 'engines');
  if (eng <= 0) return 0;
  const pilotSys = ship.systems.pilot;
  if (!pilotSys || capacity(pilotSys) <= 0) return 0;
  const pilot = ship.drone ? null : isManned(ship, 'pilot');
  let mult = 1;
  if (!pilot && !ship.drone) mult = capacity(pilotSys) >= 3 ? 0.8 : capacity(pilotSys) >= 2 ? 0.5 : 0;
  let ev = eng * 5;
  if (pilot) ev += 5 + skillLevel(pilot.xp.pilot) * 2.5;
  const engMan = ship.drone ? null : isManned(ship, 'engines');
  if (engMan) ev += 5 + skillLevel(engMan.xp.engines) * 2.5;
  if (ship.augments.includes('stealth')) ev += 7;
  return Math.min(60, Math.round(ev * mult));
}

/** Restore after a fight: no fires, full air, systems fixed, crew healed. */
export function cleanUp(ship: Ship): void {
  ship.rooms.forEach((r) => {
    r.o2 = 100;
    r.fire = 0;
    r.breach = 0;
    r.breachProg = 0;
  });
  for (const s of Object.values(ship.systems)) {
    if (!s) continue;
    s.dmg = 0;
    s.repair = 0;
    s.ion = 0;
    s.ionT = 0;
    s.burn = 0;
  }
  ship.crew.forEach((c) => {
    c.hp = c.max;
    c.healing = false;
  });
  ship.weapons.forEach((w) => {
    w.charge = 0;
    w.target = null;
    w.chain = 0;
  });
  ship.ftl = 0;
  ship.shieldProg = 0;
  fixPower(ship);
  ship.shields = maxLayers(ship);
  ship.crew.forEach((c) => placeAt(ship, c, c.home));
}

function placeAt(ship: Ship, c: Crew, room: number): void {
  const lay = layoutOf(ship.layout);
  c.path = [];
  c.x = -9;
  c.y = -9;
  const t = freeTile(ship, room, c) ?? lay.roomTiles[room][0];
  c.x = t % lay.w;
  c.y = Math.floor(t / lay.w);
  c.dest = room;
}
