/** Race simulation: fixed-step car physics, AI drivers, gadgets, laps. No DOM. */
import { LAPS, SURFACES, type GadgetKind, type Personality, type Stats } from './data';
import { Rng } from './rng';
import { EDGE, HALF, advance, lineOffset, local, normAngle, pointAt, tileAt, type Track } from './track';

export const DT = 1 / 60;
export const CAR_R = 13;
export const COUNTDOWN = 3;
/** The race ends after this many seconds in any case. */
export const TIME_LIMIT = 240;

export interface Input {
  steer: number;
  gas: number;
  brake: number;
  drift: boolean;
  nitro: boolean;
  gadget: boolean;
}

export const NO_INPUT: Input = { steer: 0, gas: 0, brake: 0, drift: false, nitro: false, gadget: false };

export interface Car {
  id: string;
  name: string;
  icon: string;
  color: string;
  isPlayer: boolean;
  boss: boolean;
  pers: Personality;
  skill: number;
  stats: Stats;
  hp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  nitro: number;
  nitroOn: boolean;
  drifting: boolean;
  air: number;
  airMax: number;
  spin: number;
  oil: number;
  shield: number;
  boostCd: number;
  gadget: GadgetKind | null;
  charges: number;
  gadgetCd: number;
  gadgetHeld: boolean;
  k: number;
  s: number;
  lap: number;
  prog: number;
  finished: boolean;
  time: number;
  stuck: number;
  wrong: number;
  laneBias: number;
  aiTimer: number;
  /** Extra lateral offset for passing. */
  dodge: number;
  /** Damage taken in this race. */
  taken: number;
  dealt: number;
  /** Bot driving error for the weak sim bot (0 = clean). */
  sloppy: number;
}

export type RaceEventKind = 'wall' | 'crash' | 'mine' | 'oil' | 'shield' | 'jump' | 'land' | 'boost' | 'lap' | 'finish' | 'nitro' | 'gadget' | 'wreck' | 'drop';

export interface RaceEvent {
  kind: RaceEventKind;
  x: number;
  y: number;
  amt: number;
  car: number;
}

export interface Mine {
  x: number;
  y: number;
  owner: number;
  arm: number;
}

export interface Oil {
  x: number;
  y: number;
  r: number;
  ttl: number;
}

export interface Race {
  track: Track;
  cars: Car[];
  t: number;
  /** Race clock, starts after the countdown. */
  clock: number;
  mines: Mine[];
  oils: Oil[];
  events: RaceEvent[];
  finishOrder: number[];
  done: boolean;
  trial: boolean;
  rng: Rng;
  /** When true the AI drives the player car too. */
  autoPlayer: boolean;
  playerInput: Input;
  laps: number;
  /** Order fixed at the moment the race ended. */
  result: number[] | null;
}

export interface Entrant {
  id: string;
  name: string;
  icon: string;
  color: string;
  isPlayer: boolean;
  boss: boolean;
  pers: Personality;
  skill: number;
  stats: Stats;
  hp: number;
  gadget: GadgetKind | null;
  charges: number;
}

export function createRace(track: Track, entrants: Entrant[], seed: number, trial = false): Race {
  const rng = new Rng(seed);
  const n = track.tiles.length;
  const cars: Car[] = entrants.map((e, i) => {
    // Grid: 2 columns, rows behind the line. The player starts at the back.
    const row = Math.floor(i / 2);
    const col = i % 2;
    const back = 34 + row * 50;
    const tl = track.tiles[n - 1];
    const lat = trial ? 0 : col === 0 ? 26 : -26;
    let k = n - 1;
    let s = 1 - back / tl.len;
    if (s < 0) {
      k = n - 2;
      s = 1 + s * (tl.len / track.tiles[n - 2].len);
    }
    const p = pointAt(track.tiles[k], s, lat);
    return {
      ...e,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      a: p.dir,
      nitro: e.isPlayer ? 20 : 15,
      nitroOn: false,
      drifting: false,
      air: 0,
      airMax: 0,
      spin: 0,
      oil: 0,
      shield: 0,
      boostCd: 0,
      gadgetCd: 0,
      gadgetHeld: false,
      k,
      s,
      lap: 0,
      prog: k + s,
      finished: false,
      time: 0,
      stuck: 0,
      wrong: 0,
      laneBias: (rng.next() - 0.5) * 0.6,
      aiTimer: rng.next() * 2,
      dodge: 0,
      taken: 0,
      dealt: 0,
      sloppy: 0,
    };
  });
  return {
    track,
    cars,
    t: 0,
    clock: 0,
    mines: [],
    oils: [],
    events: [],
    finishOrder: [],
    done: false,
    trial,
    rng,
    autoPlayer: false,
    playerInput: { ...NO_INPUT },
    laps: LAPS,
    result: null,
  };
}

export const playerIndex = (r: Race): number => r.cars.findIndex((c) => c.isPlayer);

/** Current order of car indexes, leader first. */
export function standings(r: Race): number[] {
  const rest = r.cars
    .map((_, i) => i)
    .filter((i) => !r.finishOrder.includes(i))
    .sort((a, b) => r.cars[b].prog - r.cars[a].prog);
  return [...r.finishOrder, ...rest];
}

function emit(r: Race, kind: RaceEventKind, x: number, y: number, amt: number, car: number): void {
  if (r.events.length < 200) r.events.push({ kind, x, y, amt, car });
}

function hurt(r: Race, ci: number, dmg: number): number {
  const c = r.cars[ci];
  if (c.shield > 0 || dmg <= 0) return 0;
  const d = dmg * c.stats.guard;
  const before = c.hp;
  c.hp = Math.max(0, c.hp - d);
  c.taken += d;
  if (before > 0 && c.hp <= 0) emit(r, 'wreck', c.x, c.y, 0, ci);
  return d;
}

// ---------- AI ----------

export function aiInput(r: Race, ci: number): Input {
  const c = r.cars[ci];
  const tr = r.track;
  const speed = Math.hypot(c.vx, c.vy);
  const careful = c.pers === 'careful' ? 1.12 : c.pers === 'aggressive' ? 0.92 : 1;
  const look = 46 + speed * 0.32;
  const near = advance(tr, c.k, c.s, look);
  const far = advance(tr, c.k, c.s, look + 70 + speed * 0.35);
  const bias = c.laneBias * HALF * 0.35 + c.dodge;
  const lim = HALF * 0.8;
  const offN = Math.max(-lim, Math.min(lim, lineOffset(tr, near.k, near.s) + bias));
  const pn = pointAt(tr.tiles[near.k], near.s, offN);
  const pf = pointAt(tr.tiles[far.k], far.s, lineOffset(tr, far.k, far.s));
  let tx = pn.x;
  let ty = pn.y;
  // Aggressive drivers aim at a car just ahead.
  if (c.pers === 'aggressive' && !r.trial) {
    for (let j = 0; j < r.cars.length; j++) {
      if (j === ci) continue;
      const o = r.cars[j];
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 90 && d > 20 && dx * Math.cos(c.a) + dy * Math.sin(c.a) > d * 0.8 && o.air <= 0) {
        tx = tx * 0.5 + o.x * 0.5;
        ty = ty * 0.5 + o.y * 0.5;
        break;
      }
    }
  }
  const dN = normAngle(Math.atan2(ty - c.y, tx - c.x) - c.a);
  const dF = Math.abs(normAngle(Math.atan2(pf.y - c.y, pf.x - c.x) - c.a));
  let steer = Math.max(-1, Math.min(1, dN * 2.6));
  if (c.sloppy > 0) steer += Math.sin(r.t * 1.7 + ci * 3) * c.sloppy;
  const tile = tr.tiles[c.k];
  const sf = SURFACES[tile.surface];
  const surfGrip = tile.surface === 'dirt' ? c.stats.dirt : tile.surface === 'ice' ? c.stats.ice : 1;
  const gripK = Math.min(1.15, Math.sqrt(sf.grip * surfGrip * c.stats.grip));
  const top = c.stats.speed * c.skill;
  const want = top * Math.max(0.42, 1 - Math.min(0.62, dF * 0.62 * careful / (0.55 + 0.45 * gripK)));
  const vLong = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
  const gas = vLong < want ? 1 : 0.15;
  const brake = vLong > want + 45 ? 1 : 0;
  const drift = Math.abs(dN) > 0.42 && speed > 230 && c.pers !== 'careful';
  let nitro = c.nitro > 25 && dF < 0.22 && Math.abs(dN) < 0.12;
  if (c.nitroOn && c.nitro > 2 && dF < 0.35) nitro = true;
  // Gadgets.
  let gadget = false;
  c.aiTimer -= DT;
  if (c.gadget && c.charges > 0 && c.aiTimer <= 0 && !r.trial) {
    c.aiTimer = 0.5;
    const behind = r.cars.some((o, j) => {
      if (j === ci) return false;
      const dx = o.x - c.x;
      const dy = o.y - c.y;
      const d = Math.hypot(dx, dy);
      return d < 150 && dx * Math.cos(c.a) + dy * Math.sin(c.a) < -10;
    });
    const close = r.cars.some((o, j) => j !== ci && Math.hypot(o.x - c.x, o.y - c.y) < 60);
    if ((c.gadget === 'mine' || c.gadget === 'oil') && behind && r.rng.chance(c.pers === 'blocker' || c.boss ? 0.35 : 0.15)) gadget = true;
    if (c.gadget === 'shield' && close && r.rng.chance(0.4)) gadget = true;
    if (c.gadget === 'can' && c.nitro < 20 && dF < 0.2) gadget = true;
  }
  return { steer: Math.max(-1, Math.min(1, steer)), gas, brake, drift, nitro, gadget };
}

/** Pass a slower car ahead and, for blockers, sit in front of a chaser. */
function updateDodge(r: Race, ci: number): void {
  const c = r.cars[ci];
  const fx = Math.cos(c.a);
  const fy = Math.sin(c.a);
  let want = 0;
  for (let j = 0; j < r.cars.length; j++) {
    if (j === ci) continue;
    const o = r.cars[j];
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    const ahead = dx * fx + dy * fy;
    const side = dx * fy - dy * fx; // positive = to the left
    if (ahead > 0 && ahead < 85 && Math.abs(side) < 30 && c.pers !== 'aggressive') want = side > 0 ? -34 : 34;
    if (c.pers === 'blocker' && ahead < 0 && ahead > -110 && Math.abs(side) < 60) want = side;
  }
  c.dodge += (want - c.dodge) * Math.min(1, DT * 3);
}

// ---------- Physics ----------

function stepCar(r: Race, ci: number, inp: Input): void {
  const c = r.cars[ci];
  const st = c.stats;
  const tr = r.track;
  const tile = tr.tiles[c.k];
  const before = local(tile, c.x, c.y);
  const fx = Math.cos(c.a);
  const fy = Math.sin(c.a);
  const rx = -fy;
  const ry = fx;
  let vLong = c.vx * fx + c.vy * fy;
  let vLat = c.vx * rx + c.vy * ry;
  c.boostCd = Math.max(0, c.boostCd - DT);
  c.shield = Math.max(0, c.shield - DT);
  c.oil = Math.max(0, c.oil - DT);
  c.gadgetCd = Math.max(0, c.gadgetCd - DT);
  c.nitroOn = false;
  c.drifting = false;
  if (c.air > 0) {
    c.air -= DT;
    if (c.air <= 0) emit(r, 'land', c.x, c.y, 0, ci);
  } else {
    const sf = SURFACES[tile.surface];
    let grip = sf.grip * (tile.surface === 'dirt' ? st.dirt : tile.surface === 'ice' ? st.ice : 1) * st.grip;
    let top = sf.top;
    let accel = sf.accel;
    let drag = 0;
    const gap = tile.feature === 'jump' && before.s > 0.47 && before.s < 0.8;
    if (before.dist > HALF + 4) {
      grip = Math.min(grip, 0.7);
      top *= 0.55;
      accel *= 0.6;
      drag = 1.6;
    }
    if (gap) {
      top *= 0.35;
      accel *= 0.5;
      drag = 2.6;
    }
    if (c.hp <= 0) top *= 0.68;
    if (c.spin > 0) {
      c.spin -= DT;
      c.a += 10 * DT;
      inp = NO_INPUT;
    }
    // Gadget.
    if (inp.gadget && !c.gadgetHeld && c.gadget && c.charges > 0 && c.gadgetCd <= 0) useGadget(r, ci);
    c.gadgetHeld = inp.gadget;
    // Nitro.
    if (inp.nitro && c.nitro > 0) {
      c.nitroOn = true;
      c.nitro = Math.max(0, c.nitro - 30 * DT);
      top *= 1 + 0.32 * st.nitroPower;
      accel *= 1 + 1.1 * st.nitroPower;
    }
    const topSpeed = st.speed * top;
    const acc = 330 * st.accel * accel;
    if (inp.gas > 0 && vLong < topSpeed) vLong += acc * inp.gas * (1 - Math.max(0, vLong) / topSpeed) * DT;
    if (vLong > topSpeed) vLong -= (vLong - topSpeed) * 1.6 * DT;
    if (inp.brake > 0) {
      if (vLong > 15) vLong -= 720 * inp.brake * DT;
      else vLong = Math.max(-150, vLong - 300 * inp.brake * DT);
    }
    vLong -= vLong * ((inp.gas > 0 ? 0 : 0.7) + drag) * DT;
    // Steering.
    const sp = Math.abs(vLong);
    const turnRate = 3.3 * Math.min(1, sp / 80) * (1 - 0.33 * Math.min(1, sp / st.speed)) * (inp.drift ? 1.3 : 1) * (c.oil > 0 ? 0.6 : 1);
    const turn = inp.steer * turnRate * DT * (vLong >= 0 ? 1 : -1);
    // Sideways grip.
    const g = 9 * grip * (inp.drift ? 0.16 : 1) * (c.oil > 0 ? 0.06 : 1);
    vLat *= Math.exp(-g * DT);
    if (Math.abs(vLat) > 50 && sp > 110) {
      c.drifting = true;
      c.nitro = Math.min(st.nitroCap, c.nitro + Math.abs(vLat) * 0.085 * st.nitroFill * DT);
      vLong -= Math.abs(vLat) * 0.12 * DT;
    }
    c.vx = fx * vLong + rx * vLat;
    c.vy = fy * vLong + ry * vLat;
    c.a += turn;
    // Boost pad.
    if (tile.feature === 'boost' && before.s > 0.38 && before.s < 0.62 && before.dist < 30 && c.boostCd <= 0) {
      c.boostCd = 0.8;
      const fx2 = Math.cos(c.a);
      const fy2 = Math.sin(c.a);
      c.vx += fx2 * 170;
      c.vy += fy2 * 170;
      c.nitro = Math.min(st.nitroCap, c.nitro + 6);
      emit(r, 'boost', c.x, c.y, 0, ci);
    }
  }
  c.x += c.vx * DT;
  c.y += c.vy * DT;
  // Track position and laps.
  const nk = tileAt(tr, c.x, c.y);
  const n = tr.tiles.length;
  if (nk >= 0 && nk !== c.k) {
    const delta = nk - c.k;
    if (delta < -n / 2) c.lap++;
    else if (delta > n / 2) c.lap--;
    c.k = nk;
  }
  const loc = local(tr.tiles[c.k], c.x, c.y);
  // Jump ramp.
  const t2 = tr.tiles[c.k];
  if (t2.feature === 'jump' && c.air <= 0 && before.s < 0.4 && loc.s >= 0.4 && c.k === tileAt(tr, c.x - c.vx * DT, c.y - c.vy * DT)) {
    const v = c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a);
    if (v > 170) {
      c.air = c.airMax = Math.max(0.3, Math.min(0.85, v / 480));
      emit(r, 'jump', c.x, c.y, 0, ci);
    }
  }
  c.s = loc.s;
  // Barriers.
  const lim = EDGE - CAR_R * 0.7;
  if (loc.dist > lim) {
    const pen = loc.dist - lim;
    c.x -= loc.nx * pen;
    c.y -= loc.ny * pen;
    const vn = c.vx * loc.nx + c.vy * loc.ny;
    if (vn > 0) {
      c.vx -= 1.35 * vn * loc.nx;
      c.vy -= 1.35 * vn * loc.ny;
      c.vx *= 0.93;
      c.vy *= 0.93;
      if (vn > 110) {
        hurt(r, ci, (vn - 110) * 0.05);
        emit(r, 'wall', c.x + loc.nx * CAR_R, c.y + loc.ny * CAR_R, vn, ci);
      }
    }
  }
  // Progress.
  const prog = c.lap * n + c.k + c.s;
  if (r.clock > 0) {
    if (prog < c.prog - 0.002) c.wrong += DT;
    else if (prog > c.prog + 0.001) c.wrong = Math.max(0, c.wrong - DT * 2);
  }
  c.prog = prog;
  if (!c.finished && c.lap > r.laps) {
    c.finished = true;
    c.time = r.clock;
    r.finishOrder.push(ci);
    emit(r, 'finish', c.x, c.y, r.finishOrder.length, ci);
  }
}

function useGadget(r: Race, ci: number): void {
  const c = r.cars[ci];
  c.charges--;
  c.gadgetCd = 0.6;
  const bx = c.x - Math.cos(c.a) * 26;
  const by = c.y - Math.sin(c.a) * 26;
  switch (c.gadget) {
    case 'mine':
      r.mines.push({ x: bx, y: by, owner: ci, arm: 0.7 });
      break;
    case 'oil':
      r.oils.push({ x: bx, y: by, r: 30, ttl: 14 });
      break;
    case 'shield':
      c.shield = 3;
      break;
    case 'can':
      c.nitro = Math.min(c.stats.nitroCap, c.nitro + 50);
      break;
  }
  emit(r, 'gadget', c.x, c.y, 0, ci);
}

function collide(r: Race): void {
  const cs = r.cars;
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const b = cs[j];
      if (a.air > 0 || b.air > 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= CAR_R * 2 || d < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      const ma = a.stats.mass * (a.shield > 0 ? 3 : 1);
      const mb = b.stats.mass * (b.shield > 0 ? 3 : 1);
      const pen = CAR_R * 2 - d;
      a.x -= nx * pen * (mb / (ma + mb));
      a.y -= ny * pen * (mb / (ma + mb));
      b.x += nx * pen * (ma / (ma + mb));
      b.y += ny * pen * (ma / (ma + mb));
      const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vrel <= 0) continue;
      const jimp = (1.4 * vrel) / (1 / ma + 1 / mb);
      a.vx -= (jimp / ma) * nx;
      a.vy -= (jimp / ma) * ny;
      b.vx += (jimp / mb) * nx;
      b.vy += (jimp / mb) * ny;
      if (vrel > 70) {
        const base = (vrel - 70) * 0.06;
        // The car that drives into the other is the rammer.
        const aHit = Math.cos(a.a) * nx + Math.sin(a.a) * ny;
        const bHit = -(Math.cos(b.a) * nx + Math.sin(b.a) * ny);
        const aRam = aHit > bHit;
        const dB = hurt(r, j, base * (aRam ? a.stats.ram : 0.6));
        const dA = hurt(r, i, base * (aRam ? 0.6 : b.stats.ram));
        a.dealt += dB;
        b.dealt += dA;
        emit(r, 'crash', (a.x + b.x) / 2, (a.y + b.y) / 2, vrel, a.isPlayer ? i : j);
      }
    }
}

function objects(r: Race): void {
  for (const m of r.mines) m.arm -= DT;
  r.mines = r.mines.filter((m) => {
    for (let i = 0; i < r.cars.length; i++) {
      const c = r.cars[i];
      if (c.air > 0 || (i === m.owner && m.arm > 0)) continue;
      if (Math.hypot(c.x - m.x, c.y - m.y) < CAR_R + 7) {
        if (c.shield > 0) emit(r, 'shield', m.x, m.y, 0, i);
        else {
          hurt(r, i, 16);
          c.spin = 0.65;
          c.vx *= 0.3;
          c.vy *= 0.3;
          if (m.owner !== i) r.cars[m.owner].dealt += 16;
        }
        emit(r, 'mine', m.x, m.y, 0, i);
        return false;
      }
    }
    return true;
  });
  for (const o of r.oils) o.ttl -= DT;
  r.oils = r.oils.filter((o) => o.ttl > 0);
  for (let i = 0; i < r.cars.length; i++) {
    const c = r.cars[i];
    if (c.air > 0 || c.shield > 0) continue;
    for (const o of r.oils)
      if (Math.hypot(c.x - o.x, c.y - o.y) < o.r) {
        if (c.oil <= 0) emit(r, 'oil', c.x, c.y, 0, i);
        c.oil = 0.7;
      }
  }
}

/** Put a stuck car back on the center line. */
export function respawn(r: Race, ci: number): void {
  const c = r.cars[ci];
  const p = pointAt(r.track.tiles[c.k], Math.min(0.9, c.s), 0);
  c.x = p.x;
  c.y = p.y;
  c.a = p.dir;
  c.vx = Math.cos(p.dir) * 60;
  c.vy = Math.sin(p.dir) * 60;
  c.spin = 0;
  c.stuck = 0;
  c.wrong = 0;
  c.air = 0;
}

/** One fixed physics step for the whole race. */
export function stepRace(r: Race): void {
  r.t += DT;
  const started = r.t >= COUNTDOWN;
  if (started) r.clock += DT;
  const lapsBefore = r.cars.map((c) => c.lap);
  const pi = playerIndex(r);
  for (let i = 0; i < r.cars.length; i++) {
    const c = r.cars[i];
    const ai = !c.isPlayer || r.autoPlayer || c.finished;
    if (!started) continue;
    if (ai) updateDodge(r, i);
    const inp = ai ? aiInput(r, i) : r.playerInput;
    stepCar(r, i, inp);
    const sp = Math.hypot(c.vx, c.vy);
    if (sp < 30 && c.air <= 0) c.stuck += DT;
    else c.stuck = Math.max(0, c.stuck - DT);
    if (ai && (c.stuck > 1.6 || c.wrong > 1.5)) respawn(r, i);
    if (!ai && (c.stuck > 4 || c.wrong > 4)) respawn(r, i);
  }
  if (started) {
    collide(r);
    objects(r);
  }
  r.cars.forEach((c, i) => {
    if (c.lap > lapsBefore[i] && c.lap >= 2 && c.lap <= r.laps) emit(r, 'lap', c.x, c.y, c.lap, i);
  });
  const player = r.cars[pi];
  if (!r.done && (player.finished || r.clock >= TIME_LIMIT)) {
    r.done = true;
    r.result = standings(r);
  }
}

/** Final order when the player finished: finishers, then the rest by progress. */
export const finalOrder = (r: Race): number[] => r.result ?? standings(r);
