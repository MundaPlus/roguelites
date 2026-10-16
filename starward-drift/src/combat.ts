/** Fixed-step ship combat. The same code drives the player ship and the enemy ship. */
import { ENEMIES, NAMES, RACES, WEAPONS, type SysId, type WKind } from './data';
import { Rng } from './rng';
import {
  addWeapon,
  autoPower,
  capacity,
  crewRoom,
  effPower,
  evasion,
  fixPower,
  isManned,
  layoutOf,
  makeCrew,
  maxLayers,
  newShip,
  placeCrew,
  sendCrew,
  skillLevel,
  type Crew,
  type Ship,
} from './ship';

export const DT = 0.05;

export type Side = 'player' | 'enemy';

export interface Shot {
  from: Side;
  wid: string;
  kind: WKind;
  target: number;
  delay: number;
  t: number;
  dur: number;
  /** Start room on the shooter ship (for drawing). */
  src: number;
}

export interface CEvent {
  k: 'fire' | 'hit' | 'miss' | 'block' | 'ion' | 'death' | 'phase' | 'fixed' | 'beam' | 'boom' | 'firestart';
  /** The ship this happened to. */
  side: Side;
  room?: number;
  n?: number;
  text?: string;
  rooms?: number[];
}

export interface Combat {
  t: number;
  rs: number;
  player: Ship;
  enemy: Ship;
  shots: Shot[];
  ev: CEvent[];
  result: null | 'win' | 'crew' | 'lose' | 'fled';
  tpl: string;
  elite: boolean;
  boss: number;
  paused: boolean;
  aiT: number;
  /** The player asked to jump away when the FTL drive is ready. */
  fleeing?: boolean;
}

/** mulberry32 step on the combat state, so a saved fight goes on with the same numbers. */
export function rnd(c: Combat): number {
  c.rs = (c.rs + 0x6d2b79f5) | 0;
  let t = c.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const TRAVEL: Record<WKind, number> = { laser: 1, ion: 1, flak: 1.1, missile: 1.6, beam: 0.45 };

function emit(c: Combat, e: CEvent): void {
  c.ev.push(e);
  if (c.ev.length > 300) c.ev.splice(0, c.ev.length - 300);
}

// ---------- Enemy generation ----------

export function makeEnemy(tplId: string, sector: number, rng: Rng): Ship {
  const tpl = ENEMIES[tplId];
  if (tplId === 'flagship') return makeFlagship(rng);
  const d = sector + (tplId === 'elite' ? 1.2 : 0);
  const layout = rng.pick(tpl.layouts);
  const hull = Math.max(6, Math.round(8 + d * 2 + tpl.hull + rng.int(0, 2)));
  let shields = d < 1 ? (rng.chance(0.45) ? 2 : 0) : d < 2.5 ? 2 : d < 4 ? (rng.chance(0.5) ? 4 : 2) : rng.chance(0.65) ? 4 : 2;
  if (d >= 5.5) shields = 4 + (rng.chance(0.35) ? 2 : 0);
  shields = Math.min(8, shields + tpl.shields);
  const engines = Math.max(1, Math.min(8, 1 + Math.floor(d / 1.6) + tpl.engines));
  const nW = 1 + (d >= 1.5 ? 1 : 0) + (d >= 4.6 ? 1 : 0);
  const maxTier = Math.floor(d / 2);
  const pool = tpl.pool.filter((id) => WEAPONS[id].tier <= maxTier);
  const ws: string[] = [];
  for (let i = 0; i < nW; i++) ws.push(rng.pick(pool.length ? pool : tpl.pool));
  const wLvl = ws.reduce((a, id) => a + WEAPONS[id].power, 0);
  const levels: Partial<Record<SysId, number>> = { shields, engines, oxygen: 1, medbay: d >= 3 ? 2 : 1, weapons: wLvl, pilot: d >= 4 ? 2 : 1 };
  const reactor = shields + engines + 1 + 1 + wLvl;
  const ship = newShip(tpl.name, layout, hull, reactor, levels);
  ship.missiles = 12;
  ship.drone = !!tpl.auto;
  ws.forEach((id) => addWeapon(ship, id));
  if (!tpl.auto) {
    const n = Math.min(6, 2 + Math.floor(d / 2) + (rng.chance(0.4) ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const c = makeCrew(ship, rng.pick(tpl.races), rng.pick(NAMES));
      ship.crew.push(c);
      placeCrew(ship, c);
    }
  }
  autoPower(ship);
  ship.shields = maxLayers(ship);
  return ship;
}

function makeFlagship(rng: Rng): Ship {
  const levels: Partial<Record<SysId, number>> = { shields: 4, engines: 2, oxygen: 2, medbay: 2, weapons: 4, pilot: 2 };
  const ship = newShip('Rebel Flagship', 'flagship', 20, 14, levels);
  ship.missiles = 30;
  ['burst2', 'heavy1', 'leto'].forEach((id) => addWeapon(ship, id));
  for (const r of ENEMIES.flagship.races) {
    const c = makeCrew(ship, r, rng.pick(NAMES));
    ship.crew.push(c);
    placeCrew(ship, c);
  }
  autoPower(ship);
  ship.shields = maxLayers(ship);
  return ship;
}

export function newCombat(player: Ship, enemy: Ship, tpl: string, seed: number): Combat {
  const c: Combat = { t: 0, rs: seed | 0, player, enemy, shots: [], ev: [], result: null, tpl, elite: tpl === 'elite', boss: tpl === 'flagship' ? 1 : 0, paused: false, aiT: 0 };
  fixPower(player);
  player.shields = maxLayers(player);
  player.ftl = 0;
  if (player.augments.includes('preigniter')) player.weapons.forEach((w) => (w.charge = 1));
  return c;
}

// ---------- Simulation ----------

export function tick(c: Combat, dt = DT): void {
  if (c.result) return;
  c.t += dt;
  c.aiT += dt;
  const think = c.aiT >= 0.5;
  if (think) c.aiT = 0;
  shipTick(c, c.player, c.enemy, 'player', dt, think);
  shipTick(c, c.enemy, c.player, 'enemy', dt, think);
  for (const s of c.shots) {
    if (s.delay > 0) {
      s.delay -= dt;
      if (s.delay <= 0) emit(c, { k: 'fire', side: s.from, text: s.kind });
      continue;
    }
    s.t -= dt;
  }
  const done = c.shots.filter((s) => s.delay <= 0 && s.t <= 0);
  if (done.length) {
    c.shots = c.shots.filter((s) => !(s.delay <= 0 && s.t <= 0));
    for (const s of done) resolve(c, s);
  }
  checkEnd(c);
}

function checkEnd(c: Combat): void {
  const e = c.enemy;
  const p = c.player;
  if (e.hull <= 0) {
    if (c.boss === 1) {
      c.boss = 2;
      e.hull = Math.round(e.maxHull * 0.5);
      e.rooms.forEach((r) => {
        r.fire = 0;
        r.breach = 0;
        r.o2 = 100;
      });
      for (const s of Object.values(e.systems)) if (s) s.dmg = 0;
      const sh = e.systems.shields;
      if (sh) sh.level = 5;
      const ws = e.systems.weapons;
      if (ws) ws.level += 1;
      e.reactor += 3;
      addWeapon(e, 'ion1');
      autoPower(e);
      c.shots = c.shots.filter((s) => s.from === 'enemy');
      emit(c, { k: 'phase', side: 'enemy', text: 'Flagship phase 2: the ship repairs itself and brings an ion gun online!' });
      return;
    }
    e.hull = 0;
    c.result = 'win';
    emit(c, { k: 'boom', side: 'enemy' });
    return;
  }
  if (!e.drone && e.crew.length === 0) {
    c.result = 'crew';
    return;
  }
  if (p.hull <= 0 || p.crew.length === 0) {
    p.hull = Math.max(0, p.hull);
    c.result = 'lose';
    emit(c, { k: 'boom', side: 'player' });
    return;
  }
  if (p.ftl >= 1 && c.fleeing) c.result = 'fled';
}

function shipTick(c: Combat, ship: Ship, other: Ship, side: Side, dt: number, think: boolean): void {
  const lay = layoutOf(ship.layout);
  for (const s of Object.values(ship.systems)) {
    if (!s) continue;
    if (s.ion > 0) {
      s.ionT -= dt;
      if (s.ionT <= 0) {
        s.ion = 0;
        s.ionT = 0;
      }
    }
    if (ship.drone && s.dmg > 0) {
      s.repair += dt / 9;
      if (s.repair >= 1) {
        s.repair = 0;
        s.dmg--;
      }
    }
  }
  fixPower(ship);
  if (think && (ship.auto || side === 'enemy')) crewAI(ship);
  // Movement.
  for (const cr of ship.crew) {
    if (!cr.path.length) continue;
    const t = cr.path[0];
    const tx = t % lay.w;
    const ty = Math.floor(t / lay.w);
    const sp = 1.7 * RACES[cr.race].speed * dt;
    const dx = tx - cr.x;
    const dy = ty - cr.y;
    const d = Math.hypot(dx, dy);
    if (d <= sp) {
      cr.x = tx;
      cr.y = ty;
      cr.path.shift();
    } else {
      cr.x += (dx / d) * sp;
      cr.y += (dy / d) * sp;
    }
  }
  // Work.
  const oxyEff = effPower(ship, 'oxygen');
  const medSys = ship.systems.medbay;
  const medEff = effPower(ship, 'medbay');
  const fsupp = ship.augments.includes('fire_supp') ? 2 : 1;
  for (const cr of ship.crew) {
    const roomI = crewRoom(ship, cr);
    if (roomI < 0) continue;
    const room = ship.rooms[roomI];
    const sysId = lay.def.rooms[roomI].sys;
    const sys = sysId ? ship.systems[sysId] : undefined;
    const rep = RACES[cr.race].repair;
    if (!cr.path.length) {
      if (room.fire > 0) room.fire = Math.max(0, room.fire - 0.45 * rep * dt);
      else if (room.breach > 0) {
        room.breachProg += (rep * dt) / 5;
        if (room.breachProg >= 1) {
          room.breachProg = 0;
          room.breach--;
          emit(c, { k: 'fixed', side, room: roomI, text: 'breach sealed' });
        }
      } else if (sys && sys.dmg > 0) {
        sys.repair += (rep * dt) / 4;
        if (sys.repair >= 1) {
          sys.repair = 0;
          sys.dmg--;
          emit(c, { k: 'fixed', side, room: roomI, text: 'repaired' });
        }
      } else if (sysId && sysId !== 'oxygen' && sysId !== 'medbay' && isManned(ship, sysId) === cr) {
        cr.xp[sysId as 'pilot'] += dt;
      }
    }
    // Damage and healing.
    if (room.fire > 0.05 && cr.race !== 'rock') cr.hp -= (2 + 2 * room.fire) * dt;
    if (room.o2 < 10 && cr.race !== 'lanius') cr.hp -= 6 * dt;
    if (medSys && roomI === medSys.room && medEff > 0 && !cr.path.length) cr.hp += 5 * medEff * dt;
    if (ship.augments.includes('nanobots')) cr.hp += dt;
    cr.hp = Math.min(cr.max, cr.hp);
  }
  const dead = ship.crew.filter((cr) => cr.hp <= 0);
  if (dead.length) {
    ship.crew = ship.crew.filter((cr) => cr.hp > 0);
    for (const cr of dead) emit(c, { k: 'death', side, room: crewRoom(ship, cr), text: `${cr.name} died` });
  }
  // Rooms: fire, breach, oxygen.
  for (let i = 0; i < ship.rooms.length; i++) {
    const r = ship.rooms[i];
    const tiles = lay.roomTiles[i].length;
    if (r.fire > 0) {
      if (r.o2 < 12) r.fire -= 0.3 * fsupp * dt;
      else r.fire = Math.min(tiles, r.fire + 0.05 * r.fire * dt);
      if (fsupp > 1) r.fire -= 0.08 * dt;
      r.o2 -= 1.2 * r.fire * dt;
      const sid = lay.def.rooms[i].sys;
      const sys = sid ? ship.systems[sid] : undefined;
      if (sys) {
        sys.burn += r.fire * dt;
        if (sys.burn >= 14) {
          sys.burn = 0;
          if (sys.dmg < sys.level) sys.dmg++;
        }
      }
      for (const n of lay.roomNb[i]) {
        const nr = ship.rooms[n];
        if (nr.fire < 0.05 && nr.o2 > 20 && rnd(c) < 0.02 * r.fire * dt) {
          nr.fire = 1;
          emit(c, { k: 'firestart', side, room: n });
        }
      }
      if (r.fire < 0.02) r.fire = 0;
    }
    const gain = oxyEff > 0 ? 1.6 * oxyEff : -0.7;
    r.o2 += gain * dt - r.breach * 8 * dt;
  }
  for (const d of lay.doors) {
    const a = ship.rooms[d.a];
    const b = ship.rooms[d.b];
    const flow = (a.o2 - b.o2) * 0.6 * dt;
    a.o2 -= flow;
    b.o2 += flow;
  }
  for (const r of ship.rooms) r.o2 = Math.max(0, Math.min(100, r.o2));
  // Shields.
  const ml = maxLayers(ship);
  if (ship.shields > ml) ship.shields = ml;
  const sh = ship.systems.shields;
  if (sh && ship.shields < ml && sh.ion <= 0) {
    const man = ship.drone ? null : isManned(ship, 'shields');
    let rate = 0.5 * (man ? 1.1 + 0.07 * skillLevel(man.xp.shields) : 1);
    if (ship.augments.includes('shield_boost')) rate *= 1.35;
    ship.shieldProg += rate * dt;
    if (ship.shieldProg >= 1) {
      ship.shieldProg = 0;
      ship.shields++;
    }
  } else if (ship.shields >= ml) ship.shieldProg = 0;
  // Weapons.
  const ws = ship.systems.weapons;
  const wman = ship.drone ? null : isManned(ship, 'weapons');
  let mult = wman ? 1.1 + 0.05 * skillLevel(wman.xp.weapons) : 1;
  if (ship.augments.includes('reloader')) mult *= 1.1;
  const frozen = !ws || ws.ion > 0;
  ship.weapons.forEach((w, i) => {
    const def = WEAPONS[w.id];
    if (w.powered) {
      if (!frozen) {
        const ct = def.charge * (def.chain ? Math.max(0.55, 1 - 0.15 * w.chain) : 1);
        w.charge = Math.min(1, w.charge + (dt * mult) / ct);
      }
    } else {
      w.charge = Math.max(0, w.charge - dt / 6);
      w.chain = 0;
    }
    if (side === 'enemy' && w.charge >= 1 && w.target === null && other.hull > 0) w.target = enemyPick(c, other);
    if (w.charge >= 1 && w.powered && w.target !== null && other.hull > 0) {
      if (def.kind === 'missile' && ship.missiles <= 0) return;
      fire(c, ship, other, side, i);
      if (side === 'enemy') w.target = null;
    }
  });
  // FTL drive (the player only).
  if (side === 'player') {
    const eng = effPower(ship, 'engines');
    const ps = ship.systems.pilot;
    const pilotOk = !!ps && (!!isManned(ship, 'pilot') || capacity(ps) >= 2);
    if (eng > 0 && pilotOk && c.boss === 0) ship.ftl = Math.min(1, ship.ftl + dt / (34 / (1 + 0.12 * eng)));
  }
}

const PICK_W: Record<SysId, number> = { shields: 4, weapons: 4, pilot: 1.2, engines: 1.5, oxygen: 1, medbay: 1.2 };

function enemyPick(c: Combat, target: Ship): number {
  const rooms = layoutOf(target.layout).def.rooms;
  const items: [number, number][] = rooms.map((r, i) => [i, r.sys ? PICK_W[r.sys] : 0.4]);
  const total = items.reduce((a, [, w]) => a + w, 0);
  let roll = rnd(c) * total;
  for (const [i, w] of items) {
    roll -= w;
    if (roll < 0) return i;
  }
  return 0;
}

function fire(c: Combat, ship: Ship, other: Ship, side: Side, i: number): void {
  const w = ship.weapons[i];
  const def = WEAPONS[w.id];
  w.charge = 0;
  if (def.chain) w.chain = Math.min(3, w.chain + 1);
  if (def.kind === 'missile' && !(ship.augments.includes('replicator') && rnd(c) < 0.35)) ship.missiles--;
  const lay = layoutOf(other.layout);
  const src = ship.systems.weapons?.room ?? 0;
  for (let k = 0; k < def.shots; k++) {
    let target = w.target!;
    if (def.kind === 'flak') {
      const opts = [target, ...lay.roomNb[target]];
      target = opts[Math.floor(rnd(c) * opts.length)];
    }
    const dur = TRAVEL[def.kind];
    c.shots.push({ from: side, wid: w.id, kind: def.kind, target, delay: k * 0.22 + 0.0001, t: dur, dur, src });
  }
}

function resolve(c: Combat, s: Shot): void {
  const defSide: Side = s.from === 'player' ? 'enemy' : 'player';
  const D = s.from === 'player' ? c.enemy : c.player;
  const def = WEAPONS[s.wid];
  if (D.hull <= 0) return;
  if (s.kind !== 'beam') {
    if (rnd(c) * 100 < evasion(D)) {
      emit(c, { k: 'miss', side: defSide, room: s.target });
      return;
    }
    if ((s.kind === 'laser' || s.kind === 'flak') && D.shields >= 1) {
      D.shields--;
      D.shieldProg = 0;
      emit(c, { k: 'block', side: defSide, room: s.target });
      return;
    }
    if (s.kind === 'ion') {
      const ion = def.ion ?? 1;
      const sh = D.systems.shields;
      if (D.shields >= 1 && sh) {
        D.shields--;
        D.shieldProg = 0;
        sh.ion = Math.min(4, sh.ion + ion);
        sh.ionT = 4.5;
        emit(c, { k: 'ion', side: defSide, room: sh.room, text: 'shields ionized' });
        return;
      }
      const sid = layoutOf(D.layout).def.rooms[s.target].sys;
      const sys = sid ? D.systems[sid] : undefined;
      if (sys) {
        sys.ion = Math.min(4, sys.ion + ion);
        sys.ionT = 5;
      }
      emit(c, { k: 'ion', side: defSide, room: s.target, text: 'ion' });
      return;
    }
    hitRoom(c, D, defSide, s.target, def.dmg, s.wid);
    return;
  }
  // Beam.
  const eff = def.dmg - D.shields;
  if (D.shields > 0 && eff <= 0) {
    emit(c, { k: 'block', side: defSide, room: s.target });
    return;
  }
  const lay = layoutOf(D.layout);
  const rooms = [s.target];
  let cur = s.target;
  while (rooms.length < (def.len ?? 1)) {
    const nbs = lay.roomNb[cur].filter((n) => !rooms.includes(n));
    if (!nbs.length) break;
    cur = nbs[Math.floor(rnd(c) * nbs.length)];
    rooms.push(cur);
  }
  emit(c, { k: 'beam', side: defSide, rooms });
  for (const r of rooms) hitRoom(c, D, defSide, r, Math.max(0, eff), s.wid);
}

function hitRoom(c: Combat, D: Ship, side: Side, room: number, dmg: number, wid: string): void {
  const def = WEAPONS[wid];
  const lay = layoutOf(D.layout);
  D.hull -= dmg;
  const sid = lay.def.rooms[room].sys;
  const sys = sid ? D.systems[sid] : undefined;
  if (sys && dmg > 0) {
    sys.dmg = Math.min(sys.level, sys.dmg + dmg);
    sys.repair = 0;
  }
  for (const cr of D.crew) if (crewRoom(D, cr) === room) cr.hp -= 15 * dmg + (def.crew ?? 0);
  const r = D.rooms[room];
  if (def.fire && rnd(c) < def.fire) {
    if (r.fire < 1) emit(c, { k: 'firestart', side, room });
    r.fire = Math.max(r.fire, 1);
  }
  if (def.breach && rnd(c) < def.breach) r.breach = Math.min(lay.roomTiles[room].length, r.breach + 1);
  emit(c, { k: 'hit', side, room, n: dmg });
}

// ---------- Crew AI ----------

const SYS_PRIO: Record<SysId, number> = { shields: 6, weapons: 5.5, pilot: 5, engines: 4.5, oxygen: 4, medbay: 3 };

/** Send crew to fires, breaches and broken systems, to the medbay when hurt, and back to their station. */
export function crewAI(ship: Ship): void {
  if (!ship.crew.length) return;
  const lay = layoutOf(ship.layout);
  const med = ship.systems.medbay;
  const medOk = !!med && effPower(ship, 'medbay') > 0 && ship.rooms[med.room].fire < 0.05 && ship.rooms[med.room].o2 > 15;
  for (const cr of ship.crew) {
    if (cr.healing && (cr.hp >= cr.max * 0.95 || !medOk)) cr.healing = false;
    else if (!cr.healing && medOk && cr.hp < cr.max * 0.4) cr.healing = true;
  }
  const pool = ship.crew.filter((cr) => !cr.healing);
  const problems: { room: number; prio: number; need: number }[] = [];
  lay.def.rooms.forEach((rd, i) => {
    const r = ship.rooms[i];
    const sys = rd.sys ? ship.systems[rd.sys] : undefined;
    if (r.fire > 0.05) problems.push({ room: i, prio: 10 + r.fire, need: r.fire > 1.5 ? 3 : 2 });
    else if (r.breach > 0) problems.push({ room: i, prio: 8 + r.breach, need: 2 });
    else if (sys && sys.dmg > 0) problems.push({ room: i, prio: SYS_PRIO[sys.id] + sys.dmg * 0.1, need: sys.dmg >= 2 ? 2 : 1 });
  });
  problems.sort((a, b) => b.prio - a.prio);
  const target = new Map<Crew, number>();
  const pilotRoom = ship.systems.pilot?.room ?? -1;
  const roomCenter = (i: number): [number, number] => {
    const rd = lay.def.rooms[i];
    return [rd.x + (rd.w - 1) / 2, rd.y + (rd.h - 1) / 2];
  };
  for (const p of problems) {
    const [px, py] = roomCenter(p.room);
    for (let k = 0; k < p.need && pool.length; k++) {
      let best = -1;
      let bc = Infinity;
      pool.forEach((cr, i) => {
        let cost = Math.abs(cr.x - px) + Math.abs(cr.y - py);
        if (cr.home === pilotRoom && p.room !== pilotRoom && pool.length > 1) cost += 6;
        if (cost < bc) {
          bc = cost;
          best = i;
        }
      });
      const cr = pool.splice(best, 1)[0];
      target.set(cr, p.room);
    }
  }
  for (const cr of ship.crew) {
    const room = cr.healing && med ? med.room : target.get(cr) ?? cr.home;
    if (cr.dest !== room || (!cr.path.length && crewRoom(ship, cr) !== room)) sendCrew(ship, cr, room);
  }
}
