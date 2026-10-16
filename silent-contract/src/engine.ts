/**
 * Mission state and the pure turn resolver `apply(state, action) => state`.
 * The input state is never changed, so the app can keep a history for rewinds and the bot can look ahead.
 */
import { ALARM_MAX, ALARM_STEP, GADGETS, GUARDS, MISSIONS, type AgentId, type GadgetId, type GuardKind, type ImplantId, type MissionKind } from './data';
import {
  COVER,
  DOOR,
  DX,
  DY,
  EXIT,
  LOCK,
  OPEN,
  WALL,
  bfsPath,
  coneTiles,
  dirTo,
  dist2,
  distMap,
  isClosedDoor,
  isDoor,
  isWalk,
  los,
  sees,
} from './grid';
import { Rng, hash } from './rng';

export interface Gad {
  id: GadgetId;
  n: number;
}

export interface MAgent {
  id: AgentId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  down: boolean;
  out: boolean;
  hack: number;
  stealth: number;
  combat: number;
  gadgets: Gad[];
  implants: ImplantId[];
  cloak: number;
}

export type GuardState = 'patrol' | 'investigate' | 'chase' | 'ko' | 'off';

export interface Guard {
  id: number;
  kind: GuardKind;
  x: number;
  y: number;
  dir: number;
  state: GuardState;
  /** Turns left while knocked out or switched off. */
  ko: number;
  route: number[];
  ri: number;
  /** Sentries turn between these two directions. */
  dirs: number[];
  target: number;
  look: number;
  alerted: boolean;
  tagged: boolean;
  found: boolean;
  tripped: number;
  fired: number;
}

export type ObjKind = 'terminal' | 'safe' | 'target' | 'camera';

export interface Obj {
  id: number;
  kind: ObjKind;
  x: number;
  y: number;
  used: boolean;
  lock: number;
  credits: number;
  dir: number;
  /** Camera: turns left switched off (99 = until a reboot). */
  off: number;
  tripped: number;
}

export interface Fx {
  k: 'text' | 'shot' | 'ring';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
  r?: number;
}

export interface Mission {
  seed: number;
  kind: MissionKind;
  sec: number;
  W: number;
  H: number;
  t: number[];
  seen: number[];
  peek: number[];
  smoke: number[];
  objs: Obj[];
  guards: Guard[];
  agents: MAgent[];
  turn: number;
  alarm: number;
  pwr: number;
  credits: number;
  goal: boolean;
  rewinds: number;
  over: '' | 'escaped' | 'wiped';
  nextId: number;
  fx: Fx[];
  log: string[];
  spots: number;
  kos: number;
  /** Events for sounds: spotted, shot, alarm, ko, hack, coin, door, smoke. */
  ev: string[];
}

export type Action =
  | { t: 'move'; a: number; to: number }
  | { t: 'takedown'; a: number; g: number }
  | { t: 'door'; a: number; at: number }
  | { t: 'peek'; a: number; at: number }
  | { t: 'use'; a: number; obj: number }
  | { t: 'hack'; obj?: number; g?: number }
  | { t: 'gadget'; a: number; slot: number; at: number }
  | { t: 'revive'; a: number; b: number }
  | { t: 'escape' }
  | { t: 'end' };

export const VISION = 8;
export const CAM_RANGE = 4;

// ---------- Small helpers ----------

export const idx = (m: Mission, x: number, y: number): number => y * m.W + x;
export const level = (m: Mission): number => Math.min(ALARM_MAX, Math.floor(m.alarm / ALARM_STEP));
export const active = (a: MAgent): boolean => !a.down && !a.out;
export const awake = (g: Guard): boolean => g.state !== 'ko' && g.state !== 'off';
export const objAt = (m: Mission, i: number): Obj | undefined => m.objs.find((o) => o.kind !== 'camera' && idx(m, o.x, o.y) === i);
export const guardAt = (m: Mission, i: number): Guard | undefined => m.guards.find((g) => idx(m, g.x, g.y) === i && awake(g)) ?? m.guards.find((g) => idx(m, g.x, g.y) === i);
export const agentAt = (m: Mission, i: number): number => m.agents.findIndex((a) => !a.out && idx(m, a.x, a.y) === i);
const adj4 = (ax: number, ay: number, bx: number, by: number): boolean => Math.abs(ax - bx) + Math.abs(ay - by) === 1;

export function clone(m: Mission): Mission {
  return structuredClone(m);
}

function log(m: Mission, s: string): void {
  m.log.push(s);
  if (m.log.length > 8) m.log.shift();
}

function text(m: Mission, x: number, y: number, t: string, color = '#fff'): void {
  m.fx.push({ k: 'text', x, y, text: t, color });
}

export function guardRange(g: Guard): number {
  return GUARDS[g.kind].range + (g.alerted && g.kind !== 'drone' ? 1 : 0);
}

export function takedownCost(a: MAgent): number {
  return a.implants.includes('reflex') ? 1 : 2;
}

export function koTurns(a: MAgent, base: number): number {
  return base + (a.implants.includes('nerve') ? 2 : 0);
}

export function terminalPower(a: MAgent): number {
  return 2 + a.hack;
}

export function slots(a: { implants: ImplantId[] }): number {
  return 2 + (a.implants.includes('pocket') ? 1 : 0);
}

/** Tiles where objects stand. Guards and agents cannot walk there. */
function solidSet(m: Mission): Uint8Array {
  const s = new Uint8Array(m.W * m.H);
  for (const o of m.objs) if (o.kind !== 'camera') s[idx(m, o.x, o.y)] = 1;
  for (let i = 0; i < s.length; i++) if (m.t[i] === COVER) s[i] = 1;
  return s;
}

// ---------- Vision ----------

/** Tiles the team sees now (agents' sight plus peeks). */
export function agentVision(m: Mission): Uint8Array {
  const v = new Uint8Array(m.W * m.H);
  for (const i of m.peek) v[i] = 1;
  for (const a of m.agents) {
    if (a.out || a.down) continue;
    v[idx(m, a.x, a.y)] = 1;
    for (let y = Math.max(0, a.y - VISION); y <= Math.min(m.H - 1, a.y + VISION); y++) {
      for (let x = Math.max(0, a.x - VISION); x <= Math.min(m.W - 1, a.x + VISION); x++) {
        const i = idx(m, x, y);
        if (v[i] || dist2(x, y, a.x, a.y) > (VISION + 0.5) ** 2) continue;
        if (los(m, a.x, a.y, x, y, false)) v[i] = 1;
      }
    }
  }
  return v;
}

/** Is this guard shown to the player? */
export function guardShown(m: Mission, g: Guard, vis: Uint8Array): boolean {
  if (vis[idx(m, g.x, g.y)] || g.tagged) return true;
  return m.agents.some((a) => active(a) && a.implants.includes('sense') && dist2(a.x, a.y, g.x, g.y) <= 16);
}

function reveal(m: Mission): Uint8Array {
  const v = agentVision(m);
  for (let i = 0; i < v.length; i++) if (v[i]) m.seen[i] = 1;
  return v;
}

export function guardCone(m: Mission, g: Guard): number[] {
  if (!awake(g)) return [];
  return coneTiles(m, g.x, g.y, g.dir, guardRange(g));
}

export function camCone(m: Mission, o: Obj): number[] {
  if (o.kind !== 'camera' || o.off > 0) return [];
  return coneTiles(m, o.x, o.y, o.dir, CAM_RANGE);
}

function canSee(m: Mission, x: number, y: number, d: number, r: number, a: MAgent, camera: boolean): boolean {
  if (!active(a) || a.cloak > 0) return false;
  if (camera && a.stealth >= 3) return false;
  return sees(m, x, y, d, r, a.x, a.y);
}

/** Known danger: cones of guards and devices the player can see. */
export function knownDanger(m: Mission, vis: Uint8Array): Uint8Array {
  const d = new Uint8Array(m.W * m.H);
  for (const g of m.guards) if (guardShown(m, g, vis)) for (const i of guardCone(m, g)) d[i] = 1;
  for (const o of m.objs) if (o.kind === 'camera' && m.seen[idx(m, o.x, o.y)]) for (const i of camCone(m, o)) d[i] = Math.max(d[i], 2);
  return d;
}

// ---------- Guard planning ----------

export interface Intent {
  shoot: number;
  path: number[];
  face: number;
}

function guardSolid(m: Mission): (i: number) => boolean {
  const s = solidSet(m);
  return (i) => s[i] === 1;
}

export function guardSpeed(m: Mission, g: Guard): number {
  const def = GUARDS[g.kind];
  if (g.state === 'chase') return def.chase;
  if (g.state === 'investigate') return def.chase - 1;
  return def.speed + (def.speed > 0 && level(m) >= 1 ? 1 : 0);
}

/** What the guard will do in the next enemy phase. Shown on the board. */
export function guardIntent(m: Mission, g: Guard, solid = guardSolid(m)): Intent {
  const none: Intent = { shoot: -1, path: [], face: g.dir };
  if (!awake(g)) return none;
  const def = GUARDS[g.kind];
  const here = idx(m, g.x, g.y);
  if (g.state === 'chase' && def.dmg > 0) {
    let best = -1;
    let bd = 1e9;
    m.agents.forEach((a, k) => {
      if (!canSee(m, g.x, g.y, g.dir, guardRange(g), a, false)) return;
      const dd = dist2(a.x, a.y, g.x, g.y);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    if (best >= 0) return { shoot: best, path: [], face: g.dir };
  }
  let goal: number;
  if (g.state === 'chase' || g.state === 'investigate') goal = g.target;
  else {
    if (g.kind === 'sentry' && here === g.route[0]) return { shoot: -1, path: [], face: g.dir === g.dirs[0] ? g.dirs[1] : g.dirs[0] };
    goal = g.route[g.ri];
    if (goal === here) goal = g.route[(g.ri + 1) % g.route.length];
  }
  if (goal === here) return { shoot: -1, path: [], face: g.state === 'patrol' ? g.dir : (g.dir + 1) % 4 };
  const p = bfsPath(m, here, goal, solid);
  if (!p || p.length === 0) return { shoot: -1, path: [], face: (g.dir + 1) % 4 };
  const path = p.slice(0, guardSpeed(m, g));
  // Do not end on another awake guard.
  while (path.length && m.guards.some((o) => o !== g && awake(o) && idx(m, o.x, o.y) === path[path.length - 1])) path.pop();
  let face = g.dir;
  if (path.length) {
    const last = path[path.length - 1];
    const prev = path.length > 1 ? path[path.length - 2] : here;
    face = dirTo(prev % m.W, (prev / m.W) | 0, last % m.W, (last / m.W) | 0);
  }
  return { shoot: -1, path, face };
}

/** Tiles a guard's cone covers along its planned path (used by the bot and the "next" overlay). */
export function plannedCone(m: Mission, g: Guard, it: Intent): number[] {
  if (!awake(g)) return [];
  const r = guardRange(g);
  const out = new Set<number>();
  let x = g.x;
  let y = g.y;
  for (const i of coneTiles(m, x, y, g.dir, r)) out.add(i);
  for (const p of it.path) {
    const nx = p % m.W;
    const ny = (p / m.W) | 0;
    const d = dirTo(x, y, nx, ny);
    x = nx;
    y = ny;
    for (const i of coneTiles(m, x, y, d, r)) out.add(i);
  }
  for (const i of coneTiles(m, x, y, it.face, r)) out.add(i);
  for (const p of it.path) out.add(p);
  return [...out];
}

// ---------- Alarm ----------

function rngFor(m: Mission, tag: string): Rng {
  return new Rng(hash(m.seed, m.turn, tag, m.nextId, m.alarm));
}

function spawnTile(m: Mission, rng: Rng): number {
  const solid = solidSet(m);
  const from = m.agents.filter(active).map((a) => idx(m, a.x, a.y));
  const d = distMap(m, from.length ? from : [0], (i) => solid[i] === 1 || m.t[i] === DOOR || m.t[i] === LOCK);
  const cands: number[] = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] < 0 || m.t[i] === EXIT || isDoor(m.t[i])) continue;
    if (m.guards.some((g) => idx(m, g.x, g.y) === i)) continue;
    cands.push(i);
  }
  if (!cands.length) {
    for (let i = 0; i < m.t.length; i++) if (m.t[i] === 0 && !solid[i]) cands.push(i);
  }
  cands.sort((a, b) => d[b] - d[a]);
  return rng.pick(cands.slice(0, 6));
}

export function newGuard(m: Mission, kind: GuardKind, at: number, route: number[]): Guard {
  return {
    id: m.nextId++,
    kind,
    x: at % m.W,
    y: (at / m.W) | 0,
    dir: 0,
    state: 'patrol',
    ko: 0,
    route: route.length ? route : [at],
    ri: 0,
    dirs: [0, 1],
    target: -1,
    look: 0,
    alerted: false,
    tagged: false,
    found: false,
    tripped: -1,
    fired: -1,
  };
}

function nearestAgentTile(m: Mission, x: number, y: number): number {
  let best = -1;
  let bd = 1e9;
  for (const a of m.agents) {
    if (!active(a)) continue;
    const d = dist2(a.x, a.y, x, y);
    if (d < bd) {
      bd = d;
      best = idx(m, a.x, a.y);
    }
  }
  return best;
}

function spawn(m: Mission, kind: GuardKind, hunt: boolean): void {
  const rng = rngFor(m, 'spawn' + kind);
  const at = spawnTile(m, rng);
  const floor: number[] = [];
  for (let i = 0; i < m.t.length; i++) if (m.t[i] === 0) floor.push(i);
  const solid = solidSet(m);
  const route = [at, ...rng.shuffle(floor.filter((i) => !solid[i])).slice(0, 2)];
  const g = newGuard(m, kind, at, route);
  if (hunt) {
    const tgt = nearestAgentTile(m, g.x, g.y);
    if (tgt >= 0) {
      g.state = 'chase';
      g.target = tgt;
      g.alerted = true;
    }
  }
  m.guards.push(g);
  text(m, g.x, g.y, '🚨', '#ff5d73');
  log(m, `${GUARDS[kind].name} arrives.`);
}

function onLevel(m: Mission, lv: number): void {
  m.ev.push('alarm');
  log(m, `Alarm level ${lv}.`);
  if (lv === 2) spawn(m, 'guard', false);
  if (lv === 3) {
    for (const o of m.objs) if (o.kind === 'camera') o.off = 0;
    spawn(m, 'drone', false);
  }
  if (lv === 4) for (let i = 0; i < m.t.length; i++) if (m.t[i] === DOOR) m.t[i] = LOCK;
  if (lv === 5) {
    spawn(m, 'enforcer', true);
    spawn(m, 'enforcer', true);
  }
  if (lv === 6) for (const g of m.guards) if (awake(g)) g.alerted = true;
}

export function addAlarm(m: Mission, pts: number): void {
  const before = level(m);
  m.alarm = Math.min(ALARM_MAX * ALARM_STEP, m.alarm + pts);
  const after = level(m);
  for (let lv = before + 1; lv <= after; lv++) onLevel(m, lv);
}

// ---------- Detection ----------

function setChase(m: Mission, g: Guard, a: MAgent): boolean {
  const fresh = g.state !== 'chase';
  g.state = 'chase';
  g.target = idx(m, a.x, a.y);
  g.alerted = true;
  if (fresh) {
    m.spots++;
    addAlarm(m, 1);
    text(m, g.x, g.y, '❗', '#ff5d73');
    m.ev.push('spotted');
    log(m, `${GUARDS[g.kind].name} spotted ${a.id}.`);
  }
  return fresh;
}

function callGuard(m: Mission, at: number): void {
  const solid = guardSolid(m);
  let best: Guard | null = null;
  let bl = 1e9;
  for (const g of m.guards) {
    if (!awake(g) || g.state === 'chase' || GUARDS[g.kind].mech) continue;
    const p = bfsPath(m, idx(m, g.x, g.y), at, solid);
    if (p && p.length < bl) {
      bl = p.length;
      best = g;
    }
  }
  if (best) {
    best.state = 'investigate';
    best.target = at;
    best.look = 2;
    text(m, best.x, best.y, '❓', '#ffd166');
  }
}

function trip(m: Mission, src: { tripped: number; x: number; y: number }, a: MAgent): boolean {
  if (src.tripped === m.turn) return false;
  src.tripped = m.turn;
  m.spots++;
  const drone = 'kind' in src;
  addAlarm(m, drone ? 1 : 2);
  text(m, src.x, src.y, '📷❗', '#ff9f43');
  m.ev.push('spotted');
  log(m, `A ${drone ? 'drone' : 'camera'} saw ${a.id}. Alarm +${drone ? 1 : 2}.`);
  callGuard(m, idx(m, a.x, a.y));
  return true;
}

function shoot(m: Mission, g: Guard, k: number): void {
  const a = m.agents[k];
  const dmg = GUARDS[g.kind].dmg;
  g.dir = dirTo(g.x, g.y, a.x, a.y);
  a.hp = Math.max(0, a.hp - dmg);
  m.fx.push({ k: 'shot', x: g.x, y: g.y, x2: a.x, y2: a.y });
  text(m, a.x, a.y, `-${dmg}`, '#ff5d73');
  m.ev.push('shot');
  log(m, `${GUARDS[g.kind].name} shoots ${a.id} for ${dmg}.`);
  if (a.hp <= 0) {
    a.down = true;
    a.ap = 0;
    a.cloak = 0;
    text(m, a.x, a.y, '✖', '#ff5d73');
    log(m, `${a.id} is down.`);
  }
  if (m.agents.every((x) => x.out || x.down)) m.over = 'wiped';
}

/**
 * Check every viewer against every agent. Returns true when something new spotted an agent,
 * or a guard fired (this stops a move). `mover` is the agent that just acted.
 */
function spotCheck(m: Mission, mover: number): boolean {
  let stop = false;
  for (const g of m.guards) {
    if (!awake(g)) continue;
    const mech = GUARDS[g.kind].mech;
    const r = guardRange(g);
    for (let k = 0; k < m.agents.length; k++) {
      const a = m.agents[k];
      if (!canSee(m, g.x, g.y, g.dir, r, a, mech)) continue;
      if (mech) {
        if (trip(m, g, a)) stop = true;
        continue;
      }
      if (setChase(m, g, a) && k === mover) stop = true;
      else g.target = idx(m, a.x, a.y);
    }
  }
  for (const o of m.objs) {
    if (o.kind !== 'camera' || o.off > 0) continue;
    for (const a of m.agents) if (canSee(m, o.x, o.y, o.dir, CAM_RANGE, a, true) && trip(m, o, a)) stop = true;
  }
  return stop;
}

// ---------- Agent movement ----------

export const STEP_COST = (c: number): number => (c === DOOR ? 2 : c === LOCK ? 4 : 1);

/**
 * Dijkstra for one agent. Key = AP cost × 1000 + danger tiles crossed, so the cheapest path
 * avoids known cones when it can. Returns the key per tile (-1 = unreachable) and the parents.
 */
export function agentPaths(m: Mission, k: number, danger?: Uint8Array): { key: Int32Array; prev: Int32Array } {
  const n = m.W * m.H;
  const key = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const a = m.agents[k];
  const solid = solidSet(m);
  for (const g of m.guards) if (awake(g)) solid[idx(m, g.x, g.y)] = 1;
  const start = idx(m, a.x, a.y);
  key[start] = 0;
  // Small binary heap.
  const heap: number[] = [start];
  const done = new Uint8Array(n);
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key[heap[p]] <= key[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let s = c;
        if (l < heap.length && key[heap[l]] < key[heap[s]]) s = l;
        if (r < heap.length && key[heap[r]] < key[heap[s]]) s = r;
        if (s === c) break;
        [heap[s], heap[c]] = [heap[c], heap[s]];
        c = s;
      }
    }
    return top;
  };
  while (heap.length) {
    const cur = pop();
    if (done[cur]) continue;
    done[cur] = 1;
    const cx = cur % m.W;
    const cy = (cur / m.W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
      const ni = ny * m.W + nx;
      const c = m.t[ni];
      if (!isWalk(c) || solid[ni] || !m.seen[ni]) continue;
      const nk = key[cur] + STEP_COST(c) * 1000 + (danger && danger[ni] ? 1 : 0);
      if (key[ni] === -1 || nk < key[ni]) {
        key[ni] = nk;
        prev[ni] = cur;
        push(ni);
      }
    }
  }
  return { key, prev };
}

export function pathTo(prev: Int32Array, from: number, to: number): number[] {
  const out: number[] = [];
  let p = to;
  while (p !== from && p !== -1) {
    out.push(p);
    p = prev[p];
  }
  if (p === -1) return [];
  return out.reverse();
}

// ---------- Validation ----------

function gadgetCheck(m: Mission, k: number, slot: number, at: number, vis: Uint8Array): string {
  const a = m.agents[k];
  const gd = a.gadgets[slot];
  if (!gd || gd.n <= 0) return 'No charges left.';
  const def = GADGETS[gd.id];
  if (a.ap < def.ap) return 'Not enough AP.';
  const tx = at % m.W;
  const ty = (at / m.W) | 0;
  switch (def.target) {
    case 'self':
      return '';
    case 'tile':
      if (!m.seen[at] || m.t[at] === WALL) return 'Pick a tile you know.';
      if (dist2(a.x, a.y, tx, ty) > (def.range + 0.5) ** 2) return 'Too far.';
      if (gd.id === 'smoke' && !los(m, a.x, a.y, tx, ty, false)) return 'No line of sight.';
      return '';
    case 'guard': {
      const g = m.guards.find((q) => idx(m, q.x, q.y) === at && awake(q));
      if (!g || !guardShown(m, g, vis)) return 'Pick a guard.';
      if (gd.id === 'tag') return dist2(a.x, a.y, tx, ty) <= (def.range + 0.5) ** 2 && vis[at] ? '' : 'Too far or not in sight.';
      if (GUARDS[g.kind].mech) return 'Drones cannot be knocked out.';
      if (gd.id === 'taser') return adj4(a.x, a.y, tx, ty) ? '' : 'Must be next to the guard.';
      if (GUARDS[g.kind].armor > 0) return 'Darts do not work on armor.';
      if (dist2(a.x, a.y, tx, ty) > (def.range + 0.5) ** 2 || !los(m, a.x, a.y, tx, ty, false)) return 'Too far or not in sight.';
      return '';
    }
    case 'ally': {
      const b = agentAt(m, at);
      if (b < 0) return 'Pick an agent.';
      if (b !== k && !adj4(a.x, a.y, tx, ty)) return 'Must be next to them.';
      if (m.agents[b].hp >= m.agents[b].maxHp) return 'Full HP.';
      return '';
    }
    case 'device': {
      if (!adj4(a.x, a.y, tx, ty)) return 'Must be next to it.';
      if (m.t[at] === LOCK) return '';
      const o = objAt(m, at);
      if (o && (o.kind === 'safe' || o.kind === 'target') && !o.used) return '';
      return 'Use it on a safe, the target or a locked door.';
    }
  }
}

/** Returns '' when the action is legal, else a reason. */
export function check(m: Mission, act: Action): string {
  if (m.over) return 'The mission is over.';
  const vis = agentVision(m);
  if (act.t === 'end') return '';
  if (act.t === 'escape') return m.agents.some((a) => active(a) && m.t[idx(m, a.x, a.y)] === EXIT) ? '' : 'Stand on the exit pad first.';
  if (act.t === 'hack') {
    if (act.obj !== undefined) {
      const o = m.objs.find((q) => q.id === act.obj);
      if (!o || o.kind !== 'camera' || o.off > 0) return 'Nothing to hack.';
      if (!vis[idx(m, o.x, o.y)]) return 'The camera must be in sight.';
      return m.pwr >= 1 ? '' : 'Needs 1 power.';
    }
    const g = m.guards.find((q) => q.id === act.g);
    if (!g || g.kind !== 'drone' || !awake(g)) return 'Nothing to hack.';
    if (!vis[idx(m, g.x, g.y)]) return 'The drone must be in sight.';
    return m.pwr >= 2 ? '' : 'Needs 2 power.';
  }
  const a = m.agents[act.a];
  if (!a || !active(a)) return 'That agent cannot act.';
  switch (act.t) {
    case 'move': {
      if (act.to === idx(m, a.x, a.y)) return 'Already there.';
      if (agentAt(m, act.to) >= 0) return 'Occupied.';
      const { key } = agentPaths(m, act.a);
      if (key[act.to] < 0) return 'No path.';
      if (Math.floor(key[act.to] / 1000) > a.ap) return 'Not enough AP.';
      return '';
    }
    case 'takedown': {
      const g = m.guards.find((q) => q.id === act.g);
      if (!g || !awake(g)) return 'No target.';
      if (!adj4(a.x, a.y, g.x, g.y)) return 'Must be next to the guard.';
      if (GUARDS[g.kind].mech) return 'Drones cannot be knocked out.';
      if (GUARDS[g.kind].armor > 0 && a.combat < 3) return 'Armored. Needs combat 3 or a taser.';
      return a.ap >= takedownCost(a) ? '' : 'Not enough AP.';
    }
    case 'door': {
      const x = act.at % m.W;
      const y = (act.at / m.W) | 0;
      if (!isDoor(m.t[act.at]) || !adj4(a.x, a.y, x, y)) return 'Not next to a door.';
      if (m.t[act.at] === OPEN && (agentAt(m, act.at) >= 0 || m.guards.some((g) => idx(m, g.x, g.y) === act.at))) return 'Something blocks the door.';
      const cost = m.t[act.at] === LOCK ? 3 : 1;
      return a.ap >= cost ? '' : 'Not enough AP.';
    }
    case 'peek': {
      const x = act.at % m.W;
      const y = (act.at / m.W) | 0;
      if (!isClosedDoor(m.t[act.at]) || !adj4(a.x, a.y, x, y)) return 'Not next to a closed door.';
      return a.ap >= 1 ? '' : 'Not enough AP.';
    }
    case 'use': {
      const o = m.objs.find((q) => q.id === act.obj);
      if (!o || o.kind === 'camera' || o.used) return 'Nothing to use.';
      if (!adj4(a.x, a.y, o.x, o.y)) return 'Must be next to it.';
      const ap = o.kind === 'target' ? 2 : 1;
      if (a.ap < ap) return 'Not enough AP.';
      if (o.kind !== 'terminal' && m.pwr < o.lock) return `Needs ${o.lock} power. Hack terminals first.`;
      return '';
    }
    case 'gadget':
      return gadgetCheck(m, act.a, act.slot, act.at, vis);
    case 'revive': {
      const b = m.agents[act.b];
      if (!b || !b.down || b.out) return 'Nobody to revive.';
      if (!adj4(a.x, a.y, b.x, b.y)) return 'Must be next to them.';
      return a.ap >= 2 ? '' : 'Not enough AP.';
    }
  }
  return 'Unknown action.';
}

// ---------- Apply ----------

function ko(m: Mission, g: Guard, turns: number): void {
  g.state = 'ko';
  g.ko = turns;
  g.found = false;
  m.kos++;
  text(m, g.x, g.y, `💤${turns}`, '#b388ff');
  m.ev.push('ko');
  log(m, `${GUARDS[g.kind].name} knocked out for ${turns} turns.`);
}

function useGadget(m: Mission, k: number, slot: number, at: number): void {
  const a = m.agents[k];
  const gd = a.gadgets[slot];
  const def = GADGETS[gd.id];
  gd.n--;
  a.ap -= def.ap;
  const tx = at % m.W;
  const ty = (at / m.W) | 0;
  m.ev.push('gadget');
  switch (gd.id) {
    case 'dart': {
      const g = guardAt(m, at)!;
      m.fx.push({ k: 'shot', x: a.x, y: a.y, x2: g.x, y2: g.y, color: '#b388ff' });
      ko(m, g, koTurns(a, 2));
      break;
    }
    case 'taser':
      ko(m, guardAt(m, at)!, koTurns(a, 3));
      break;
    case 'smoke':
      for (let y = ty - 1; y <= ty + 1; y++)
        for (let x = tx - 1; x <= tx + 1; x++) {
          if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
          const i = idx(m, x, y);
          if (m.t[i] !== WALL) m.smoke[i] = 2;
        }
      m.ev.push('smoke');
      log(m, 'Smoke fills the area.');
      break;
    case 'noise':
      m.fx.push({ k: 'ring', x: tx, y: ty, r: 6, color: '#ffd166' });
      for (const g of m.guards) {
        if (!awake(g) || g.state === 'chase') continue;
        if (dist2(g.x, g.y, tx, ty) > 36.5) continue;
        g.state = 'investigate';
        g.target = at;
        g.look = 1;
        text(m, g.x, g.y, '❓', '#ffd166');
      }
      log(m, 'A noise draws the guards.');
      break;
    case 'emp':
      m.fx.push({ k: 'ring', x: a.x, y: a.y, r: 4, color: '#4cc9f0' });
      for (const o of m.objs) if (o.kind === 'camera' && dist2(o.x, o.y, a.x, a.y) <= 16.5) o.off = Math.max(o.off, 3);
      for (const g of m.guards)
        if (GUARDS[g.kind].mech && awake(g) && dist2(g.x, g.y, a.x, a.y) <= 16.5) {
          g.state = 'off';
          g.ko = 3;
          text(m, g.x, g.y, '⚡', '#4cc9f0');
        }
      log(m, 'EMP blast.');
      break;
    case 'cloak':
      a.cloak = 1;
      text(m, a.x, a.y, '🕶️', '#b388ff');
      break;
    case 'medkit': {
      const b = m.agents[agentAt(m, at)];
      b.hp = Math.min(b.maxHp, b.hp + 2);
      if (b.down) {
        b.down = false;
        b.ap = 0;
      }
      text(m, b.x, b.y, '+2', '#7ee08a');
      break;
    }
    case 'keycard': {
      if (m.t[at] === LOCK) {
        m.t[at] = OPEN;
        m.ev.push('door');
      } else {
        const o = objAt(m, at)!;
        openObj(m, a, o);
      }
      break;
    }
    case 'buster':
      m.pwr += 2;
      text(m, a.x, a.y, '+2⚡', '#4cc9f0');
      break;
    case 'tag': {
      const g = guardAt(m, at)!;
      g.tagged = true;
      text(m, g.x, g.y, '🔭', '#4cc9f0');
      break;
    }
  }
}

function openObj(m: Mission, a: MAgent, o: Obj): void {
  o.used = true;
  if (o.kind === 'safe') {
    const c = Math.round(o.credits * (a.implants.includes('siphon') ? 1.5 : 1));
    m.credits += c;
    text(m, o.x, o.y, `+${c}¢`, '#ffd166');
    m.ev.push('coin');
    log(m, `Safe cracked: ${c} credits.`);
  } else if (o.kind === 'target') {
    m.goal = true;
    text(m, o.x, o.y, MISSIONS[m.kind].targetIcon + '✔', '#7ee08a');
    m.ev.push('coin');
    log(m, `${MISSIONS[m.kind].target} secured. Get to the exit.`);
  }
}

export function guardPhase(m: Mission, frames?: Mission[]): void {
  m.peek = [];
  const solid = guardSolid(m);
  for (const g of [...m.guards]) {
    if (m.over) break;
    m.fx = [];
    const here = idx(m, g.x, g.y);
    if (g.state === 'ko' || g.state === 'off') {
      const pinned = m.agents.some((a) => active(a) && idx(m, a.x, a.y) === here);
      g.ko--;
      if (pinned && g.ko < 1) g.ko = 1;
      if (g.ko <= 0) {
        if (g.state === 'off') {
          g.state = 'patrol';
          text(m, g.x, g.y, '🔌', '#4cc9f0');
        } else {
          g.state = 'investigate';
          g.target = here;
          g.look = 2;
          g.alerted = true;
          text(m, g.x, g.y, '😠', '#ff9f43');
          log(m, `${GUARDS[g.kind].name} wakes up.`);
          addAlarm(m, 1);
        }
      }
      if (frames) frames.push(clone(m));
      continue;
    }
    // A guard that sees an agent at the start of its turn notices it.
    if (!GUARDS[g.kind].mech && g.state !== 'chase') {
      const k = m.agents.findIndex((a) => canSee(m, g.x, g.y, g.dir, guardRange(g), a, false));
      if (k >= 0) {
        // It only turns hostile now. It shoots next turn if it still sees the agent.
        setChase(m, g, m.agents[k]);
        if (frames) frames.push(clone(m));
        continue;
      }
    }
    const it = guardIntent(m, g, solid);
    if (it.shoot >= 0) {
      shoot(m, g, it.shoot);
      g.target = idx(m, m.agents[it.shoot].x, m.agents[it.shoot].y);
    } else {
      let moved = 0;
      for (const p of it.path) {
        if (p === it.path[it.path.length - 1] && m.guards.some((o) => o !== g && awake(o) && idx(m, o.x, o.y) === p)) break;
        const k = agentAt(m, p);
        if (k >= 0) {
          g.dir = dirTo(g.x, g.y, p % m.W, (p / m.W) | 0);
          if (!GUARDS[g.kind].mech) setChase(m, g, m.agents[k]);
          else trip(m, g, m.agents[k]);
          break;
        }
        const nx = p % m.W;
        const ny = (p / m.W) | 0;
        g.dir = dirTo(g.x, g.y, nx, ny);
        g.x = nx;
        g.y = ny;
        moved++;
        if (m.t[p] === DOOR || m.t[p] === LOCK) {
          m.t[p] = OPEN;
          m.ev.push('door');
        }
        let stop = false;
        for (const a of m.agents) {
          if (!canSee(m, g.x, g.y, g.dir, guardRange(g), a, GUARDS[g.kind].mech)) continue;
          if (GUARDS[g.kind].mech) trip(m, g, a);
          else {
            setChase(m, g, a);
            stop = true;
          }
        }
        // Bodies make guards suspicious.
        if (!GUARDS[g.kind].mech && g.state !== 'chase') {
          for (const b of m.guards) {
            if (b === g || b.state !== 'ko' || b.found) continue;
            if (!sees(m, g.x, g.y, g.dir, guardRange(g), b.x, b.y)) continue;
            b.found = true;
            g.state = 'investigate';
            g.target = idx(m, b.x, b.y);
            g.look = 2;
            g.alerted = true;
            text(m, g.x, g.y, '❓', '#ffd166');
            log(m, 'A guard found a body.');
            stop = true;
          }
        }
        if (stop) break;
      }
      if (moved === 0 && it.path.length === 0) g.dir = it.face;
      else if (moved === it.path.length && it.path.length) g.dir = it.face;
      const now = idx(m, g.x, g.y);
      if (g.state === 'patrol' && now === g.route[g.ri]) g.ri = (g.ri + 1) % g.route.length;
      if (g.state === 'chase' && now === g.target && moved === it.path.length) {
        g.state = 'investigate';
        g.look = 2;
      } else if (g.state === 'investigate' && now === g.target && moved === 0) {
        g.look--;
        if (g.look <= 0) {
          g.state = 'patrol';
          g.target = -1;
          // Go back to the nearest point of the route.
          g.ri = 0;
        }
      }
    }
    if (frames) frames.push(clone(m));
  }
}

function endRound(m: Mission, frames?: Mission[]): void {
  guardPhase(m, frames);
  m.fx = [];
  if (m.over) return;
  for (const o of m.objs) if (o.kind === 'camera' && o.off > 0 && o.off < 99) o.off--;
  for (let i = 0; i < m.smoke.length; i++) if (m.smoke[i] > 0) m.smoke[i]--;
  for (const a of m.agents) if (a.cloak > 0) a.cloak--;
  m.turn++;
  addAlarm(m, 1);
  if (level(m) >= ALARM_MAX && m.turn % 2 === 0) spawn(m, 'enforcer', true);
  for (const a of m.agents) if (active(a)) a.ap = a.maxAp;
  reveal(m);
  spotCheck(m, -1);
}

/** The pure resolver. `frames` (optional) receives one snapshot per guard during the enemy phase. */
export function apply(m0: Mission, act: Action, frames?: Mission[]): Mission {
  const m = clone(m0);
  m.fx = [];
  m.ev = [];
  if (check(m, act)) return m;
  switch (act.t) {
    case 'end':
      endRound(m, frames);
      return m;
    case 'escape': {
      let lost = 0;
      for (const a of m.agents) {
        if (a.out) continue;
        if (m.t[idx(m, a.x, a.y)] === EXIT) a.out = true;
        else lost++;
      }
      m.over = 'escaped';
      m.ev.push('escape');
      log(m, lost ? `Escaped. ${lost} agent(s) left behind.` : 'Escaped.');
      return m;
    }
    case 'hack': {
      if (act.obj !== undefined) {
        const o = m.objs.find((q) => q.id === act.obj)!;
        o.off = 99;
        m.pwr -= 1;
        text(m, o.x, o.y, '📷✖', '#4cc9f0');
        log(m, 'Camera hacked.');
      } else {
        const g = m.guards.find((q) => q.id === act.g)!;
        g.state = 'off';
        g.ko = 3;
        m.pwr -= 2;
        text(m, g.x, g.y, '⚡', '#4cc9f0');
        log(m, 'Drone hacked.');
      }
      m.ev.push('hack');
      return m;
    }
  }
  const k = act.a;
  const a = m.agents[k];
  switch (act.t) {
    case 'move': {
      const { prev } = agentPaths(m, k);
      const path = pathTo(prev, idx(m, a.x, a.y), act.to);
      for (const p of path) {
        const c = m.t[p];
        a.ap -= STEP_COST(c);
        if (c === DOOR || c === LOCK) {
          m.t[p] = OPEN;
          m.ev.push('door');
        }
        a.x = p % m.W;
        a.y = (p / m.W) | 0;
        reveal(m);
        if (spotCheck(m, k) || m.over) break;
      }
      m.ev.push('step');
      break;
    }
    case 'takedown': {
      const g = m.guards.find((q) => q.id === act.g)!;
      a.ap -= takedownCost(a);
      ko(m, g, koTurns(a, 2 + a.combat));
      break;
    }
    case 'door': {
      const c = m.t[act.at];
      a.ap -= c === LOCK ? 3 : 1;
      m.t[act.at] = c === OPEN ? DOOR : OPEN;
      m.ev.push('door');
      reveal(m);
      spotCheck(m, k);
      break;
    }
    case 'peek': {
      a.ap -= 1;
      const x0 = act.at % m.W;
      const y0 = (act.at / m.W) | 0;
      const saved = m.t[act.at];
      m.t[act.at] = OPEN;
      for (let y = Math.max(0, y0 - VISION); y <= Math.min(m.H - 1, y0 + VISION); y++)
        for (let x = Math.max(0, x0 - VISION); x <= Math.min(m.W - 1, x0 + VISION); x++) {
          if (dist2(x, y, x0, y0) > (VISION + 0.5) ** 2) continue;
          if (los(m, x0, y0, x, y, false)) {
            const i = idx(m, x, y);
            m.peek.push(i);
            m.seen[i] = 1;
          }
        }
      m.t[act.at] = saved;
      text(m, x0, y0, '👁️', '#4cc9f0');
      break;
    }
    case 'use': {
      const o = m.objs.find((q) => q.id === act.obj)!;
      if (o.kind === 'terminal') {
        a.ap -= 1;
        o.used = true;
        const p = terminalPower(a);
        m.pwr += p;
        text(m, o.x, o.y, `+${p}⚡`, '#4cc9f0');
        m.ev.push('hack');
        log(m, `Terminal hacked: +${p} power.`);
      } else {
        a.ap -= o.kind === 'target' ? 2 : 1;
        m.pwr -= o.lock;
        openObj(m, a, o);
      }
      break;
    }
    case 'gadget':
      useGadget(m, k, act.slot, act.at);
      reveal(m);
      spotCheck(m, -1);
      break;
    case 'revive': {
      const b = m.agents[act.b];
      a.ap -= 2;
      b.down = false;
      b.hp = 1;
      b.ap = 0;
      text(m, b.x, b.y, '+1', '#7ee08a');
      log(m, `${b.id} is back up.`);
      break;
    }
  }
  return m;
}

/** Actions the selected agent can do right now (for buttons and the bot). */
export function agentOptions(m: Mission, k: number): { act: Action; label: string; icon: string }[] {
  const a = m.agents[k];
  const out: { act: Action; label: string; icon: string }[] = [];
  if (!a || !active(a)) return out;
  for (const g of m.guards) {
    const act: Action = { t: 'takedown', a: k, g: g.id };
    if (awake(g) && adj4(a.x, a.y, g.x, g.y) && !check(m, act)) out.push({ act, label: `Takedown (${takedownCost(a)} AP)`, icon: '👊' });
  }
  for (const o of m.objs) {
    if (o.kind === 'camera' || o.used || !adj4(a.x, a.y, o.x, o.y)) continue;
    const act: Action = { t: 'use', a: k, obj: o.id };
    const label = o.kind === 'terminal' ? `Hack terminal (+${terminalPower(a)}⚡)` : o.kind === 'safe' ? `Crack safe (${o.lock}⚡)` : `Take ${MISSIONS[m.kind].target} (${o.lock}⚡, 2 AP)`;
    out.push({ act, label, icon: o.kind === 'terminal' ? '💻' : o.kind === 'safe' ? '🔓' : MISSIONS[m.kind].targetIcon });
  }
  for (let d = 0; d < 4; d++) {
    const x = a.x + DX[d];
    const y = a.y + DY[d];
    if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
    const i = idx(m, x, y);
    const c = m.t[i];
    if (!isDoor(c)) continue;
    if (isClosedDoor(c)) {
      out.push({ act: { t: 'peek', a: k, at: i }, label: 'Peek (1 AP)', icon: '👁️' });
      out.push({ act: { t: 'door', a: k, at: i }, label: c === LOCK ? 'Force door (3 AP)' : 'Open door (1 AP)', icon: '🚪' });
    } else out.push({ act: { t: 'door', a: k, at: i }, label: 'Close door (1 AP)', icon: '🚪' });
  }
  m.agents.forEach((b, j) => {
    if (j !== k && b.down && !b.out && adj4(a.x, a.y, b.x, b.y)) out.push({ act: { t: 'revive', a: k, b: j }, label: 'Revive (2 AP)', icon: '❤️' });
  });
  return out.filter((o) => !check(m, o.act));
}

export function onExit(m: Mission, a: MAgent): boolean {
  return m.t[idx(m, a.x, a.y)] === EXIT;
}
