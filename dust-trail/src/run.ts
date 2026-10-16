/** Run state and all pure game rules. The app and the sim both drive the game through this module. */
import {
  BASE_RES,
  CHAINS,
  GROUPS,
  MAX_PARTY,
  NAMES,
  NODE_INFO,
  REGIONS,
  RES_INFO,
  RIVER_NAMES,
  ROWS,
  SKILLS,
  SKILL_INFO,
  TERRAIN,
  TOWN_NAMES,
  TRAITS,
  WEATHER,
  WEATHER_TABLE,
  type MemberPlan,
  type NodeKind,
  type Res,
  type Skill,
  type Terrain,
  type Weather,
} from './data';
import { EVENTS, type EventDef, type Fx, type Outcome } from './events';
import { Rng, hash } from './rng';
import type { SceneSetup } from './scenes';

export interface Traveler {
  uid: number;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  skills: Partial<Record<Skill, number>>;
  traits: string[];
  sick: string | null;
  sickDays: number;
}

export interface Link {
  to: number;
  miles: number;
  danger: number;
}

export interface MapNode {
  id: number;
  row: number;
  lane: number;
  kind: NodeKind;
  terrain: Terrain;
  name: string;
  links: Link[];
}

export interface Chip {
  text: string;
  good: boolean;
}

export interface EventInst {
  id: string;
  actors: number[];
  ret: Ret;
  result: { text: string; chips: Chip[] } | null;
}

export type SceneKind = 'hunt' | 'river' | 'ambush';

export interface SceneReq {
  kind: SceneKind;
  boss: boolean;
  ret: Ret;
  easy?: boolean;
}

export type Ret = 'travel' | 'map' | 'town' | 'win';
export type Phase = 'map' | 'travel' | 'event' | 'town' | 'scene' | 'report' | 'end';

export interface Job {
  name: string;
  icon: string;
  days: number;
  pay: number;
  skill: Skill | null;
  risk: number;
}

export interface Town {
  node: number;
  name: string;
  prices: { food: number; water: number; parts: number; med: number; ammo: number; doctor: number; repair: number; inn: number; barrel: number };
  jobs: Job[];
  recruits: { t: Traveler; price: number }[];
  done: string[];
}

export interface LogLine {
  day: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'weather';
}

export interface RunState {
  v: 1;
  seed: string;
  group: string;
  day: number;
  party: Traveler[];
  lost: { uid: number; name: string; icon: string; how: string; day: number }[];
  rel: Record<string, number>;
  res: Res;
  waterCap: number;
  morale: number;
  wagon: number;
  rations: number; // 0 lean, 1 normal, 2 full
  pace: number; // 0 steady, 1 hard
  nodes: MapNode[];
  at: number;
  visited: number[];
  trip: { to: number; miles: number; total: number; danger: number } | null;
  weather: Weather;
  flags: string[];
  used: string[];
  chains: string[];
  uid: number;
  rc: number;
  phase: Phase;
  event: EventInst | null;
  scene: SceneReq | null;
  report: { title: string; icon: string; text: string; chips: Chip[]; ret: Ret } | null;
  town: Town | null;
  log: LogLine[];
  calm: number; // days since the last travel event
  stats: { hunts: number; meat: number; bandits: number; rivers: number; events: number; miles: number };
  result: { victory: boolean; score: number; marks: number; cause: string } | null;
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  marks: number;
  deaths: number;
  miles: number;
  unlocked: string[];
}

// ---------- Helpers ----------

export const rngFor = (r: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(r.seed, r.rc++, ...parts));

export const relKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const relOf = (r: RunState, a: number, b: number): number => r.rel[relKey(a, b)] ?? 0;

export const skillOf = (t: Traveler, s: Skill): number => t.skills[s] ?? 0;
export const best = (r: RunState, s: Skill): number => r.party.reduce((m, t) => Math.max(m, skillOf(t, s)), 0);
export const bestBy = (r: RunState, s: Skill): Traveler | null => {
  let b: Traveler | null = null;
  for (const t of r.party) if (skillOf(t, s) > 0 && (!b || skillOf(t, s) > skillOf(b, s))) b = t;
  return b;
};
export const hasTrait = (r: RunState, tr: string): boolean => r.party.some((t) => t.traits.includes(tr));
export const node = (r: RunState, id: number): MapNode => r.nodes[id];
export const here = (r: RunState): MapNode => r.nodes[r.at];
export const region = (row: number): number => (row <= 3 ? 0 : row <= 7 ? 1 : 2);
export const curTerrain = (r: RunState): Terrain => (r.trip ? r.nodes[r.trip.to].terrain : here(r).terrain);
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

function log(r: RunState, text: string, kind: LogLine['kind'] = 'info'): void {
  r.log.push({ day: r.day, text, kind });
  if (r.log.length > 60) r.log.splice(0, r.log.length - 60);
}

// ---------- Travelers ----------

export function makeTraveler(r: RunState, rng: Rng, plan: MemberPlan | null): Traveler {
  const usedNames = new Set([...r.party.map((t) => t.name), ...r.lost.map((t) => t.name)]);
  const free = NAMES.filter(([n]) => !usedNames.has(n));
  const [name, icon] = rng.pick(free.length ? free : NAMES);
  let skills: Partial<Record<Skill, number>>;
  let traits: string[];
  if (plan) {
    skills = { ...plan.skills };
    traits = [...plan.traits];
  } else {
    skills = {};
    const n = rng.chance(0.4) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = rng.pick(SKILLS);
      skills[s] = Math.min(3, (skills[s] ?? 0) + rng.int(1, 2));
    }
    traits = rng.chance(0.75) ? [rng.pick(Object.keys(TRAITS))] : [];
  }
  const maxHp = 10 + (traits.includes('tough') ? 3 : 0) - (traits.includes('frail') ? 2 : 0);
  return { uid: r.uid++, name, icon, hp: maxHp, maxHp, skills, traits, sick: null, sickDays: 0 };
}

function addTraveler(r: RunState, t: Traveler, rng: Rng): void {
  for (const o of r.party) r.rel[relKey(t.uid, o.uid)] = rng.int(-1, 1);
  r.party.push(t);
}

// ---------- Map ----------

function genMap(seed: string): MapNode[] {
  const rng = new Rng(hash(seed, 'map'));
  const nodes: MapNode[] = [];
  const rows: MapNode[][] = [];
  const towns = [...TOWN_NAMES];
  rng.shuffle(towns);
  const rivers = [...RIVER_NAMES];
  rng.shuffle(rivers);
  const mk = (row: number, lane: number, kind: NodeKind, terrain: Terrain, name: string): MapNode => {
    const n: MapNode = { id: nodes.length, row, lane, kind, terrain, name, links: [] };
    nodes.push(n);
    return n;
  };
  rows.push([mk(0, 1, 'start', 'prairie', 'Independence')]);
  for (let row = 1; row < ROWS - 1; row++) {
    const reg = REGIONS[region(row)];
    const count = rng.chance(0.55) ? 3 : 2;
    const lanes = count === 3 ? [0, 1, 2] : rng.pick([[0, 1], [1, 2], [0, 2]]);
    const townLane = row % 3 === 0 ? rng.pick(lanes) : -1;
    const list: MapNode[] = [];
    const kinds: [NodeKind, number][] = [
      ['camp', 3],
      ['hunt', region(row) === 1 ? 1 : 3],
      ['river', region(row) === 1 ? 1 : 3],
      ['pass', row < 2 ? 0 : 3],
      ['spring', region(row) === 1 ? 3 : 1],
      ['ruins', 2],
      ['town', 1],
    ];
    for (const lane of lanes) {
      let kind: NodeKind = lane === townLane ? 'town' : rng.weighted(kinds);
      if (kind === 'town' && list.some((n) => n.kind === 'town')) kind = 'camp';
      let terrain = rng.weighted(reg.terrain);
      if (kind === 'river' && terrain === 'desert') terrain = 'prairie';
      const name =
        kind === 'town' ? towns.pop() ?? 'Outpost' : kind === 'river' ? `${rivers.pop() ?? 'Muddy'} River` : `${TERRAIN[terrain].name} ${NODE_INFO[kind].name}`;
      list.push(mk(row, lane, kind, terrain, name));
    }
    rows.push(list);
  }
  rows.push([mk(ROWS - 1, 1, 'end', 'valley', 'Green Valley')]);
  for (let row = 0; row < ROWS - 1; row++) {
    const a = rows[row];
    const b = rows[row + 1];
    for (const n of a) for (const m of b) if (a.length === 1 || b.length === 1 || Math.abs(n.lane - m.lane) <= 1) n.links.push({ to: m.id, miles: 0, danger: 0 });
    // Keep the map from being a full mesh: drop a random diagonal now and then, but keep every node reachable.
    for (const n of a) {
      if (n.links.length > 2 && rng.chance(0.5)) {
        const drop = n.links.find((l) => nodes[l.to].lane !== n.lane);
        if (drop && b.some((m) => m.id === drop.to && a.filter((x) => x.links.some((l) => l.to === m.id)).length > 1)) n.links.splice(n.links.indexOf(drop), 1);
      }
    }
    for (const n of a)
      for (const l of n.links) {
        const t = nodes[l.to];
        l.miles = rng.int(3, 7) * 10;
        let d = rng.int(0, 1) + (l.miles <= 40 ? 1 : 0) + (t.kind === 'pass' ? 2 : 0) + (t.terrain === 'badlands' || t.terrain === 'mountain' ? 1 : 0);
        if (row >= 6) d += rng.chance(0.4) ? 1 : 0;
        l.danger = clamp(d, 0, 3);
      }
  }
  return nodes;
}

// ---------- New run ----------

export function newRun(seed: string, groupId: string, meta: Meta): RunState {
  const g = GROUPS.find((x) => x.id === groupId) ?? GROUPS[0];
  const r: RunState = {
    v: 1,
    seed,
    group: g.id,
    day: 1,
    party: [],
    lost: [],
    rel: {},
    res: { ...BASE_RES, ...g.res },
    waterCap: g.waterCap ?? 40,
    morale: g.morale ?? 70,
    wagon: 100,
    rations: 1,
    pace: 0,
    nodes: genMap(seed),
    at: 0,
    visited: [0],
    trip: null,
    weather: 'clear',
    flags: [],
    used: [],
    chains: CHAINS.filter((c) => c.cost === 0 || meta.unlocked.includes(c.id)).map((c) => c.id),
    uid: 1,
    rc: 0,
    phase: 'town',
    event: null,
    scene: null,
    report: null,
    town: null,
    log: [],
    calm: 0,
    stats: { hunts: 0, meat: 0, bandits: 0, rivers: 0, events: 0, miles: 0 },
    result: null,
  };
  const rng = new Rng(hash(seed, 'party'));
  for (const plan of g.members) addTraveler(r, makeTraveler(r, rng, plan), rng);
  r.town = makeTown(r, r.nodes[0]);
  log(r, `The ${g.name} sets out from Independence.`);
  return r;
}

// ---------- Condition language ----------

const COND_RE = /^(!?)([a-z]+)(?::([a-z0-9_]+))?(?:(>=|<=|>|<|=)(-?\d+))?$/;

function cmp(v: number, op: string | undefined, n: number | undefined): boolean {
  if (!op || n === undefined) return v > 0;
  switch (op) {
    case '>=':
      return v >= n;
    case '<=':
      return v <= n;
    case '>':
      return v > n;
    case '<':
      return v < n;
    default:
      return v === n;
  }
}

/** Evaluate one condition token against the run, e.g. `food<20`, `skill:medic>=2`, `!flag:map`. */
export function cond(r: RunState, token: string): boolean {
  const m = COND_RE.exec(token);
  if (!m) throw new Error(`Bad condition: ${token}`);
  const [, neg, key, arg, op, num] = m;
  const n = num === undefined ? undefined : Number(num);
  let v: boolean;
  const dest = r.trip ? r.nodes[r.trip.to] : here(r);
  switch (key) {
    case 'terrain':
      v = curTerrain(r) === arg;
      break;
    case 'weather':
      v = r.weather === arg;
      break;
    case 'kind':
      v = dest.kind === arg;
      break;
    case 'region':
      v = cmp(region(dest.row), op ?? '=', n ?? Number(arg));
      break;
    case 'skill':
      v = cmp(best(r, arg as Skill), op ?? '>=', n ?? 1);
      break;
    case 'trait':
      v = hasTrait(r, arg!);
      break;
    case 'flag':
      v = r.flags.includes(arg!);
      break;
    case 'chain':
      v = r.chains.includes(arg!);
      break;
    case 'sick':
      v = r.party.some((t) => t.sick);
      break;
    case 'hurt':
      v = r.party.some((t) => t.hp <= t.maxHp / 2);
      break;
    case 'full':
      v = r.party.length >= MAX_PARTY;
      break;
    case 'friends':
      v = pairs(r).some(([, , x]) => x >= 2);
      break;
    case 'rivals':
      v = pairs(r).some(([, , x]) => x <= -1);
      break;
    case 'broken':
      v = r.wagon <= 0;
      break;
    case 'party':
      v = cmp(r.party.length, op, n);
      break;
    case 'day':
      v = cmp(r.day, op, n);
      break;
    case 'row':
      v = cmp(dest.row, op, n);
      break;
    case 'danger':
      v = cmp(r.trip?.danger ?? 0, op, n);
      break;
    case 'morale':
      v = cmp(r.morale, op, n);
      break;
    case 'wagon':
      v = cmp(r.wagon, op, n);
      break;
    case 'rations':
      v = cmp(r.rations, op ?? '=', n);
      break;
    case 'pace':
      v = cmp(r.pace, op ?? '=', n);
      break;
    case 'food':
    case 'water':
    case 'parts':
    case 'med':
    case 'money':
    case 'ammo':
      v = cmp(r.res[key], op, n);
      break;
    default:
      throw new Error(`Unknown condition: ${token}`);
  }
  return neg ? !v : v;
}

export const conds = (r: RunState, list: string[] | undefined): boolean => !list || list.every((c) => cond(r, c));

function pairs(r: RunState): [Traveler, Traveler, number][] {
  const out: [Traveler, Traveler, number][] = [];
  for (let i = 0; i < r.party.length; i++)
    for (let j = i + 1; j < r.party.length; j++) out.push([r.party[i], r.party[j], relOf(r, r.party[i].uid, r.party[j].uid)]);
  return out;
}

/** Condition on one traveler for event actors: `sick`, `hurt`, `healthy`, `trait:x`, `skill:x>=n`. */
function actorOk(t: Traveler, token: string): boolean {
  const m = COND_RE.exec(token);
  if (!m) return false;
  const [, neg, key, arg, op, num] = m;
  let v: boolean;
  switch (key) {
    case 'sick':
      v = !!t.sick;
      break;
    case 'hurt':
      v = t.hp <= t.maxHp / 2;
      break;
    case 'healthy':
      v = !t.sick && t.hp > t.maxHp / 2;
      break;
    case 'trait':
      v = t.traits.includes(arg!);
      break;
    case 'skill':
      v = cmp(skillOf(t, arg as Skill), op ?? '>=', num === undefined ? 1 : Number(num));
      break;
    case 'leaver':
      v = !t.traits.includes('loyal') && !t.traits.includes('brave');
      break;
    default:
      v = true;
  }
  return neg ? !v : v;
}

// ---------- Events ----------

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

function pickActors(r: RunState, ev: EventDef, rng: Rng): number[] | null {
  const a = r.party.filter((t) => !ev.actor || ev.actor.every((c) => actorOk(t, c)));
  if (!a.length) return null;
  const first = rng.pick(a);
  let rest = r.party.filter((t) => t !== first);
  if (ev.pair === 'friend') rest = rest.filter((t) => relOf(r, first.uid, t.uid) >= 2);
  if (ev.pair === 'rival') rest = rest.filter((t) => relOf(r, first.uid, t.uid) <= -1);
  if (ev.pair && !rest.length) return null;
  return rest.length ? [first.uid, rng.pick(rest).uid] : [first.uid];
}

export function eligible(r: RunState, ev: EventDef): boolean {
  if (ev.node) return false;
  if (ev.chain && !r.chains.includes(ev.chain)) return false;
  if (!ev.repeat && r.used.includes(ev.id)) return false;
  if (ev.pair && r.party.length < 2) return false;
  return conds(r, ev.when);
}

function startEvent(r: RunState, ev: EventDef, ret: Ret, rng: Rng): boolean {
  const actors = pickActors(r, ev, rng);
  if (!actors) return false;
  r.event = { id: ev.id, actors, ret, result: null };
  r.phase = 'event';
  if (!ev.repeat) r.used.push(ev.id);
  return true;
}

function drawEvent(r: RunState, ret: Ret, rng: Rng, tag?: 'ruins'): boolean {
  const pool = EVENTS.filter((e) => (tag ? e.tag === tag : !e.tag) && eligible(r, e));
  for (let tries = 0; tries < 5 && pool.length; tries++) {
    const ev = rng.weighted(pool.map((e) => [e, (e.w ?? 1) * (e.chain ? 2.5 : 1)] as const));
    if (startEvent(r, ev, ret, rng)) return true;
    pool.splice(pool.indexOf(ev), 1);
  }
  return false;
}

export const eventDef = (r: RunState): EventDef => EVENT_BY_ID[r.event!.id];

export function fill(r: RunState, text: string, actors: number[], skillUser?: Traveler | null): string {
  const nm = (uid: number | undefined): string => r.party.find((t) => t.uid === uid)?.name ?? r.lost.find((x) => x.uid === uid)?.name ?? 'someone';
  const a = nm(actors[0]);
  return text
    .replace(/\{a\}/g, a)
    .replace(/\{b\}/g, nm(actors[1]))
    .replace(/\{s\}/g, skillUser?.name ?? a)
    .replace(/\{town\}/g, r.trip ? r.nodes[r.trip.to].name : here(r).name);
}

export interface ChoiceView {
  label: string;
  tag: string; // e.g. "Medic 2 · 85%"
  ok: boolean;
  why: string;
}

function checkChance(r: RunState, base: number, s: Skill): { p: number; user: Traveler | null } {
  const user = bestBy(r, s);
  const lvl = user ? skillOf(user, s) : 0;
  const lucky = user?.traits.includes('lucky') ? 0.1 : 0;
  return { p: clamp(base + 0.17 * lvl + lucky, 0.05, 0.95), user };
}

export function choiceViews(r: RunState): ChoiceView[] {
  const ev = eventDef(r);
  return ev.choices.map((c) => {
    let ok = conds(r, c.req);
    let why = ok ? '' : (c.req ?? []).filter((x) => !cond(r, x)).map(reqText).join(', ');
    let tag = '';
    if (c.skill) {
      const lvl = best(r, c.skill);
      const info = SKILL_INFO[c.skill];
      if (c.check !== undefined) {
        const { p } = checkChance(r, c.check, c.skill);
        tag = `${info.icon} ${info.name} ${lvl} · ${Math.round(p * 100)}%`;
      } else {
        tag = `${info.icon} ${info.name}`;
        if (lvl < (c.min ?? 1)) {
          ok = false;
          why = `needs ${info.name} ${c.min ?? 1}`;
        }
      }
    }
    return { label: c.label, tag, ok, why };
  });
}

function reqText(token: string): string {
  const m = COND_RE.exec(token);
  if (!m) return token;
  const [, neg, key, arg, op, num] = m;
  if (key in RES_INFO) return `${op === '>=' || op === '>' ? 'needs ' : ''}${num} ${RES_INFO[key as keyof typeof RES_INFO].icon}`;
  if (key === 'trait') return `${neg ? 'no' : 'needs'} ${TRAITS[arg!]?.name ?? arg}`;
  if (key === 'skill') return `needs ${SKILL_INFO[arg as Skill].name} ${num ?? 1}`;
  if (key === 'party') return `needs ${num} travelers`;
  if (key === 'full') return neg ? 'party is full' : 'needs a full party';
  return token;
}

/** Resolve a choice of the current event. Sets `event.result`. */
export function choose(r: RunState, i: number): void {
  const inst = r.event!;
  const ev = eventDef(r);
  const c = ev.choices[i];
  const views = choiceViews(r);
  if (!views[i]?.ok || inst.result) return;
  const rng = rngFor(r, 'choice', ev.id, i);
  let list: Outcome[];
  let user: Traveler | null = null;
  let prefix = '';
  if (c.skill && c.check !== undefined) {
    const ch = checkChance(r, c.check, c.skill);
    user = ch.user;
    const okRoll = rng.chance(ch.p);
    list = okRoll ? c.ok! : c.fail!;
    prefix = okRoll ? '✔ Success. ' : '✘ Failed. ';
  } else {
    if (c.skill) user = bestBy(r, c.skill);
    list = c.out ?? c.ok ?? [];
  }
  const o = list.length ? rng.weighted(list.map((x) => [x, x.w ?? 1] as const)) : { text: '' };
  const chips = o.fx ? applyFx(r, o.fx, inst.actors, rng, user) : [];
  inst.result = { text: prefix + fill(r, o.text, inst.actors, user), chips };
  r.stats.events++;
}

/** Leave the event screen after the result. */
export function finishEvent(r: RunState): void {
  const ret = r.event!.ret;
  r.event = null;
  if (checkLoss(r)) return;
  if (r.scene) {
    r.phase = 'scene';
    return;
  }
  goRet(r, ret);
}

function goRet(r: RunState, ret: Ret): void {
  if (ret === 'win') {
    finish(r, true, 'Reached Green Valley');
    return;
  }
  if (ret === 'town' && r.town) r.phase = 'town';
  else if (ret === 'travel' && r.trip) r.phase = 'travel';
  else r.phase = 'map';
}

// ---------- Effects ----------

const ILLNESS = ['fever', 'dysentery', 'cholera', 'the flu', 'a bad cough', 'mountain sickness'];

function gain(r: RunState, key: keyof Res, n: number, chips: Chip[]): void {
  const before = r.res[key];
  let v = Math.max(0, before + n);
  if (key === 'water') v = Math.min(r.waterCap, v);
  r.res[key] = Math.round(v);
  const d = r.res[key] - before;
  if (d) chips.push({ text: `${d > 0 ? '+' : ''}${d} ${RES_INFO[key].icon}`, good: d > 0 });
}

function hurt(r: RunState, t: Traveler, n: number, chips: Chip[], how: string): void {
  const before = t.hp;
  t.hp = clamp(t.hp + n, 0, t.maxHp);
  const d = t.hp - before;
  if (d) chips.push({ text: `${t.name} ${d > 0 ? '+' : ''}${d} ❤️`, good: d > 0 });
  if (t.hp <= 0) kill(r, t, how, chips);
}

export function kill(r: RunState, t: Traveler, how: string, chips: Chip[] | null): void {
  const i = r.party.indexOf(t);
  if (i < 0) return;
  r.party.splice(i, 1);
  r.lost.push({ uid: t.uid, name: t.name, icon: t.icon, how, day: r.day });
  const friendLoss = r.party.filter((o) => relOf(r, o.uid, t.uid) >= 2).length * 8;
  const loss = (hasTrait(r, 'pious') ? 8 : 15) + friendLoss;
  r.morale = clamp(r.morale - loss, 0, 100);
  log(r, `${t.icon} ${t.name} ${how === 'left' ? 'left the wagon' : `died (${how})`}.`, 'bad');
  chips?.push({ text: `${t.name} ${how === 'left' ? 'leaves' : 'dies'}`, good: false });
  if (how === 'left') r.lost[r.lost.length - 1].how = 'left';
}

export function moraleChange(r: RunState, n: number, chips: Chip[] | null): void {
  const before = r.morale;
  r.morale = clamp(Math.round(r.morale + n), 0, 100);
  const d = r.morale - before;
  if (d && chips) chips.push({ text: `${d > 0 ? '+' : ''}${d} morale`, good: d > 0 });
}

export function applyFx(r: RunState, fx: Fx, actors: number[], rng: Rng, user: Traveler | null = null): Chip[] {
  const chips: Chip[] = [];
  const a = r.party.find((t) => t.uid === actors[0]) ?? null;
  const b = r.party.find((t) => t.uid === actors[1]) ?? null;
  for (const k of ['food', 'water', 'parts', 'med', 'money', 'ammo'] as const) if (fx[k]) gain(r, k, fx[k]!, chips);
  if (fx.wagon) {
    const before = r.wagon;
    r.wagon = clamp(r.wagon + fx.wagon, 0, 100);
    const d = r.wagon - before;
    if (d) chips.push({ text: `${d > 0 ? '+' : ''}${d} 🛞`, good: d > 0 });
  }
  if (fx.morale) moraleChange(r, fx.morale, chips);
  if (fx.rel && a && b) {
    const k = relKey(a.uid, b.uid);
    r.rel[k] = clamp((r.rel[k] ?? 0) + fx.rel, -3, 3);
    chips.push({ text: `${a.name} ${fx.rel > 0 ? '💛' : '⚡'} ${b.name}`, good: fx.rel > 0 });
  }
  if (fx.relAll) {
    for (const [x, y] of pairs(r)) r.rel[relKey(x.uid, y.uid)] = clamp(relOf(r, x.uid, y.uid) + fx.relAll, -3, 3);
    chips.push({ text: fx.relAll > 0 ? 'Bonds grow 💛' : 'Tempers rise ⚡', good: fx.relAll > 0 });
  }
  if (fx.skill && (user ?? a)) {
    const t = (user ?? a)!;
    const [s, n] = fx.skill;
    t.skills[s] = clamp(skillOf(t, s) + n, 0, 3);
    chips.push({ text: `${t.name} ${SKILL_INFO[s].icon} ${SKILL_INFO[s].name} ${skillOf(t, s)}`, good: n > 0 });
  }
  if (fx.trait && a && !a.traits.includes(fx.trait)) {
    a.traits.push(fx.trait);
    if (fx.trait === 'tough') {
      a.maxHp += 3;
      a.hp += 3;
    }
    chips.push({ text: `${a.name} is now ${TRAITS[fx.trait].name} ${TRAITS[fx.trait].icon}`, good: !['frail', 'grumpy', 'coward', 'glutton'].includes(fx.trait) });
  }
  if (fx.cure && a && a.sick) {
    a.sick = null;
    a.sickDays = 0;
    chips.push({ text: `${a.name} cured`, good: true });
  }
  if (fx.sick && a && !a.sick) {
    a.sick = typeof fx.sick === 'string' ? fx.sick : rng.pick(ILLNESS);
    a.sickDays = 0;
    chips.push({ text: `${a.name} has ${a.sick} 🤒`, good: false });
  }
  if (fx.hpAll) for (const t of [...r.party]) hurt(r, t, fx.hpAll, chips, 'hardship');
  if (fx.hpB && b) hurt(r, b, fx.hpB, chips, 'an accident');
  if (fx.hp && a) hurt(r, a, fx.hp, chips, fx.hp < 0 ? 'wounds' : '');
  if (fx.recruit && r.party.length < MAX_PARTY) {
    const t = makeTraveler(r, rng, typeof fx.recruit === 'object' ? fx.recruit : null);
    addTraveler(r, t, rng);
    chips.push({ text: `${t.icon} ${t.name} joins`, good: true });
    log(r, `${t.icon} ${t.name} joined the wagon.`, 'good');
  }
  if (fx.leave && a && r.party.includes(a)) kill(r, a, 'left', chips);
  if (fx.leaveB && b && r.party.includes(b)) kill(r, b, 'left', chips);
  if (fx.die && a && r.party.includes(a)) kill(r, a, fx.die, chips);
  if (fx.flag) for (const f of fx.flag.split(',')) if (!r.flags.includes(f)) r.flags.push(f);
  if (fx.unflag) r.flags = r.flags.filter((f) => f !== fx.unflag);
  if (fx.miles && r.trip) {
    r.trip.miles = Math.max(1, r.trip.miles + fx.miles);
    chips.push({ text: `${fx.miles > 0 ? '+' : ''}${fx.miles} miles`, good: fx.miles < 0 });
  }
  if (fx.days) {
    for (let i = 0; i < fx.days; i++) upkeep(r, rngFor(r, 'wait'), false);
    chips.push({ text: `${fx.days} day${fx.days > 1 ? 's' : ''} pass`, good: false });
  }
  if (fx.scene) r.scene = { kind: fx.scene, boss: false, ret: r.event?.ret ?? 'map', easy: fx.easy };
  return chips;
}

// ---------- Daily upkeep ----------

export const eats = (t: Traveler): number => (t.traits.includes('glutton') ? 1.5 : t.traits.includes('light') ? 0.75 : 1);
export const RATION_MULT = [0.6, 1, 1.4];
export const RATION_NAMES = ['Lean', 'Normal', 'Full'];
export const PACE_NAMES = ['Steady', 'Hard'];

export function foodPerDay(r: RunState, w: Weather = r.weather): number {
  return Math.ceil(r.party.reduce((s, t) => s + eats(t), 0) * RATION_MULT[r.rations] * WEATHER[w].food);
}

export function waterPerDay(r: RunState, terrain: Terrain = curTerrain(r), w: Weather = r.weather): number {
  return Math.ceil(r.party.length * TERRAIN[terrain].water * WEATHER[w].water);
}

export function milesPerDay(r: RunState, w: Weather = r.weather): number {
  return Math.round((r.pace ? 18 : 12) * WEATHER[w].speed * (r.wagon <= 0 ? 0.5 : 1));
}

/** One day of food, water, wear, health and morale. Returns false when the run is lost. */
export function upkeep(r: RunState, rng: Rng, moving: boolean): void {
  r.day++;
  const terrain = curTerrain(r);
  r.weather = rng.weighted(WEATHER_TABLE[terrain]);
  const W = WEATHER[r.weather];
  const T = TERRAIN[terrain];
  log(r, `Day ${r.day}: ${W.icon} ${W.name} in the ${T.name.toLowerCase()}.`, 'weather');
  // Food and water.
  if (W.rain) r.res.water = Math.min(r.waterCap, r.res.water + W.rain);
  const fNeed = foodPerDay(r);
  const wNeed = waterPerDay(r, terrain);
  const starving = r.res.food < fNeed;
  const thirsty = r.res.water < wNeed;
  r.res.food = Math.max(0, r.res.food - fNeed);
  r.res.water = Math.max(0, r.res.water - wNeed);
  if (starving) log(r, 'No food left. Everyone goes hungry.', 'bad');
  if (thirsty) log(r, 'The water barrels are dry!', 'bad');
  // Wagon wear.
  if (moving) {
    const mech = best(r, 'mech');
    const wear = (T.wear + W.wear) * (r.pace ? 1.5 : 1) * (1 - 0.15 * mech);
    const before = r.wagon;
    r.wagon = Math.max(0, r.wagon - Math.round(wear * (0.6 + rng.next() * 0.8)));
    if (r.wagon <= 0 && before > 0) {
      if (r.res.parts > 0) {
        r.res.parts--;
        r.wagon = 50 + 15 * mech;
        log(r, 'A wheel broke. You fixed it with a spare part.', 'bad');
      } else log(r, 'The wagon broke down! No parts. You crawl at half speed.', 'bad');
    }
  }
  // Health.
  const medic = best(r, 'medic');
  for (const t of [...r.party]) {
    let d = 0;
    if (starving) d -= 1;
    if (thirsty) d -= 2;
    if (t.sick) {
      t.sickDays++;
      if (rng.chance(t.sick === 'cholera' ? 0.8 : 0.55)) d -= 1;
      if (rng.chance(0.1 + 0.07 * medic + Math.min(0.2, t.sickDays * 0.02))) {
        log(r, `${t.name} got over ${t.sick}.`, 'good');
        t.sick = null;
        t.sickDays = 0;
      }
    } else {
      if (!starving && !thirsty && rng.chance([0, 0.35, 0.7][r.rations])) d += 1;
      const p = 0.012 + T.sick + W.sick + (t.traits.includes('frail') ? 0.02 : 0) + (r.rations === 0 ? 0.02 : 0) + (thirsty ? 0.06 : 0) + (r.pace ? 0.01 : 0);
      if (rng.chance(p)) {
        t.sick = rng.pick(ILLNESS);
        t.sickDays = 0;
        log(r, `${t.icon} ${t.name} came down with ${t.sick}.`, 'bad');
      }
    }
    if (moving && r.pace && rng.chance(0.35)) d -= 1;
    if (d) {
      t.hp = clamp(t.hp + d, 0, t.maxHp);
      if (t.hp <= 0) kill(r, t, starving ? 'starvation' : thirsty ? 'thirst' : t.sick ? t.sick : 'exhaustion', null);
    }
  }
  // Morale.
  let m = W.morale + [-2, 0, 1][r.rations] - (moving && r.pace ? 1.5 : 0);
  if (starving) m -= 5;
  if (thirsty) m -= 5;
  if (r.wagon <= 0) m -= 2;
  for (const t of r.party) {
    if (t.traits.includes('cheerful')) m += 1;
    if (t.traits.includes('grumpy') && r.day % 2 === 0) m -= 1;
    if (t.sick) m -= 0.5;
  }
  for (const [, , x] of pairs(r)) m += x >= 2 ? 0.4 : x <= -2 ? -0.4 : 0;
  r.morale = clamp(Math.round(r.morale + m), 0, 100);
  // Desertion.
  if (r.morale < 25 && r.party.length > 1 && rng.chance((25 - r.morale) / 70)) {
    const cands = r.party.filter((t) => actorOk(t, 'leaver'));
    if (cands.length) {
      const cow = cands.find((t) => t.traits.includes('coward'));
      const t = cow ?? rng.pick(cands);
      const food = Math.floor(r.res.food * 0.15);
      r.res.food -= food;
      kill(r, t, 'left', null);
      log(r, `${t.name} lost hope and walked off with ${food} food.`, 'bad');
      r.morale = clamp(r.morale + 10, 0, 100);
    }
  }
}

// ---------- Travel ----------

export function chooseLink(r: RunState, i: number): void {
  const l = here(r).links[i];
  if (!l || r.phase !== 'map') return;
  r.trip = { to: l.to, miles: l.miles, total: l.miles, danger: l.danger };
  r.phase = 'travel';
  r.calm = 0;
  log(r, `Set out for ${r.nodes[l.to].name} (${l.miles} miles).`);
}

/** One travel day. May start an event, arrive at the next node, or end the run. */
export function travelDay(r: RunState): void {
  if (r.phase !== 'travel' || !r.trip) return;
  const rng = rngFor(r, 'day', r.day);
  upkeep(r, rng, true);
  if (checkLoss(r)) return;
  const mi = Math.min(r.trip.miles, milesPerDay(r));
  r.trip.miles -= mi;
  r.stats.miles += mi;
  if (r.trip.miles <= 0) {
    arrive(r);
    return;
  }
  r.calm++;
  const p = 0.2 + 0.07 * r.trip.danger + Math.min(0.25, r.calm * 0.06);
  if (rng.chance(p) && drawEvent(r, 'travel', rng)) r.calm = 0;
}

function arrive(r: RunState): void {
  const to = r.trip!.to;
  r.at = to;
  r.visited.push(to);
  r.trip = null;
  const n = here(r);
  log(r, `Arrived at ${n.name}.`, 'good');
  const rng = rngFor(r, 'arrive', to);
  switch (n.kind) {
    case 'town':
      r.town = makeTown(r, n);
      r.phase = 'town';
      return;
    case 'end':
      r.scene = { kind: 'ambush', boss: true, ret: 'win' };
      r.phase = 'scene';
      return;
    case 'ruins':
      if (!drawEvent(r, 'map', rng, 'ruins')) r.phase = 'map';
      return;
    default: {
      if (n.kind === 'river' || n.kind === 'spring') r.res.water = r.waterCap;
      const ev = EVENTS.find((e) => e.node === n.kind)!;
      if (!startEvent(r, ev, 'map', rng)) r.phase = 'map';
    }
  }
}

// ---------- Party actions (any time on the map or the road) ----------

export function canTreat(r: RunState, t: Traveler): boolean {
  return r.res.med > 0 && (!!t.sick || t.hp < t.maxHp);
}

export function treat(r: RunState, uid: number): Chip[] {
  const t = r.party.find((x) => x.uid === uid);
  const chips: Chip[] = [];
  if (!t || !canTreat(r, t)) return chips;
  r.res.med--;
  chips.push({ text: '-1 💊', good: false });
  const medic = best(r, 'medic');
  if (t.sick) {
    chips.push({ text: `${t.name} cured of ${t.sick}`, good: true });
    t.sick = null;
    t.sickDays = 0;
  }
  hurt(r, t, 2 + medic, chips, '');
  return chips;
}

export function canRepair(r: RunState): boolean {
  return r.res.parts > 0 && r.wagon < 100;
}

export function repair(r: RunState): Chip[] {
  if (!canRepair(r)) return [];
  r.res.parts--;
  const before = r.wagon;
  r.wagon = Math.min(100, r.wagon + 45 + 15 * best(r, 'mech'));
  return [
    { text: '-1 ⚙️', good: false },
    { text: `+${r.wagon - before} 🛞`, good: true },
  ];
}

// ---------- Towns ----------

export function makeTown(r: RunState, n: MapNode): Town {
  const rng = new Rng(hash(r.seed, 'town', n.id));
  const reg = region(n.row);
  const vary = (v: number): number => Math.max(1, Math.round(v * (0.8 + rng.next() * 0.45) * (1 + 0.15 * reg)));
  const jobsAll: Job[] = [
    { name: 'Haul freight', icon: '📦', days: 2, pay: 26, skill: null, risk: 0.15 },
    { name: 'Mend fences', icon: '🪵', days: 1, pay: 12, skill: null, risk: 0 },
    { name: "Assist the doctor", icon: '🩺', days: 2, pay: 30, skill: 'medic', risk: 0 },
    { name: 'Fix wagons', icon: '🔧', days: 1, pay: 18, skill: 'mech', risk: 0 },
    { name: 'Guard the bank', icon: '🏦', days: 2, pay: 30, skill: 'fight', risk: 0.2 },
    { name: 'Sell goods in the square', icon: '🗣️', days: 1, pay: 16, skill: 'talk', risk: 0 },
    { name: 'Hunt for the butcher', icon: '🦌', days: 2, pay: 26, skill: 'hunt', risk: 0.1 },
    { name: 'Guide a survey team', icon: '🗺️', days: 2, pay: 28, skill: 'scout', risk: 0.1 },
  ];
  rng.shuffle(jobsAll);
  const jobs = [jobsAll.find((j) => !j.skill)!, ...jobsAll.filter((j) => j.skill).slice(0, 2)];
  const town: Town = {
    node: n.id,
    name: n.name,
    prices: {
      food: vary(8),
      water: vary(4),
      parts: vary(16),
      med: vary(14),
      ammo: vary(7),
      doctor: vary(18),
      repair: vary(14),
      inn: vary(10),
      barrel: vary(30),
    },
    jobs,
    recruits: [],
    done: [],
  };
  const tmp = { ...r, party: [...r.party], uid: r.uid };
  const count = rng.int(1, 2);
  for (let i = 0; i < count; i++) {
    const t = makeTraveler(tmp, rng, null);
    tmp.party.push(t);
    const lv = Object.values(t.skills).reduce((s, v) => s + (v ?? 0), 0);
    town.recruits.push({ t, price: 15 + lv * 8 + rng.int(0, 10) });
  }
  r.uid = tmp.uid;
  return town;
}

export const discount = (r: RunState): number => 1 - 0.08 * best(r, 'talk');
export const price = (r: RunState, base: number): number => Math.max(1, Math.round(base * discount(r)));

export type ShopKey = 'food' | 'water' | 'parts' | 'med' | 'ammo' | 'doctor' | 'repair' | 'inn' | 'barrel';

export const SHOP: { key: ShopKey; icon: string; name: string; text: string }[] = [
  { key: 'food', icon: '🍖', name: '10 food', text: 'Flour, beans and salt pork.' },
  { key: 'water', icon: '💧', name: 'Fill water', text: 'Fill the barrels to the top.' },
  { key: 'ammo', icon: '🧨', name: '10 ammo', text: 'For hunts and bandits.' },
  { key: 'parts', icon: '⚙️', name: '1 wagon part', text: 'Fixes a broken wagon on the road.' },
  { key: 'med', icon: '💊', name: '1 medicine', text: 'Cures one sickness and heals.' },
  { key: 'repair', icon: '🛞', name: 'Wheelwright', text: 'Repair the wagon to 100.' },
  { key: 'doctor', icon: '🩺', name: 'Town doctor', text: 'Cure and heal everyone fully.' },
  { key: 'inn', icon: '🛏️', name: 'Night at the inn', text: '+3 HP each, +15 morale. One day passes.' },
  { key: 'barrel', icon: '🛢️', name: 'Bigger barrel', text: '+15 water space. Once per town.' },
];

export function shopPrice(r: RunState, key: ShopKey): number {
  const t = r.town!;
  if (key === 'inn') return price(r, t.prices.inn * Math.max(1, r.party.length / 2));
  return price(r, t.prices[key]);
}

export function shopOk(r: RunState, key: ShopKey): string {
  const t = r.town!;
  if (r.res.money < shopPrice(r, key)) return 'Not enough money';
  if (key === 'water' && r.res.water >= r.waterCap) return 'Barrels full';
  if (key === 'repair' && r.wagon >= 100) return 'Wagon is fine';
  if (key === 'doctor' && !r.party.some((p) => p.sick || p.hp < p.maxHp)) return 'Everyone is well';
  if (key === 'barrel' && t.done.includes('barrel')) return 'Sold out';
  return '';
}

export function buy(r: RunState, key: ShopKey): Chip[] {
  if (shopOk(r, key)) return [];
  const chips: Chip[] = [];
  gain(r, 'money', -shopPrice(r, key), chips);
  switch (key) {
    case 'food':
      gain(r, 'food', 10, chips);
      break;
    case 'water':
      gain(r, 'water', r.waterCap, chips);
      break;
    case 'ammo':
      gain(r, 'ammo', 10, chips);
      break;
    case 'parts':
      gain(r, 'parts', 1, chips);
      break;
    case 'med':
      gain(r, 'med', 1, chips);
      break;
    case 'repair':
      chips.push({ text: `+${100 - r.wagon} 🛞`, good: true });
      r.wagon = 100;
      break;
    case 'doctor':
      for (const t of r.party) {
        t.sick = null;
        t.sickDays = 0;
        t.hp = t.maxHp;
      }
      chips.push({ text: 'Everyone healed', good: true });
      break;
    case 'inn':
      upkeep(r, rngFor(r, 'inn'), false);
      for (const t of r.party) hurt(r, t, 3, chips, '');
      moraleChange(r, 15 + (hasTrait(r, 'musician') ? 5 : 0), chips);
      break;
    case 'barrel':
      r.waterCap += 15;
      r.town!.done.push('barrel');
      chips.push({ text: '+15 water space', good: true });
      break;
  }
  return chips;
}

export function jobPay(r: RunState, j: Job): number {
  const lvl = j.skill ? best(r, j.skill) : 0;
  return Math.round((j.pay + lvl * 8) * (1 + 0.1 * best(r, 'talk')));
}

export function jobOk(r: RunState, i: number): string {
  const j = r.town!.jobs[i];
  if (r.town!.done.includes(`job${i}`)) return 'Done';
  if (j.skill && best(r, j.skill) < 1) return `Needs ${SKILL_INFO[j.skill].name}`;
  return '';
}

export function doJob(r: RunState, i: number): Chip[] {
  if (jobOk(r, i)) return [];
  const j = r.town!.jobs[i];
  const chips: Chip[] = [];
  r.town!.done.push(`job${i}`);
  for (let d = 0; d < j.days; d++) upkeep(r, rngFor(r, 'job', i, d), false);
  chips.push({ text: `${j.days} day${j.days > 1 ? 's' : ''} pass`, good: false });
  gain(r, 'money', jobPay(r, j), chips);
  const rng = rngFor(r, 'jobrisk', i);
  if (r.party.length && rng.chance(j.risk)) hurt(r, rng.pick(r.party), -2, chips, 'a work accident');
  checkLoss(r);
  return chips;
}

export function recruitOk(r: RunState, i: number): string {
  const rec = r.town!.recruits[i];
  if (!rec) return 'Gone';
  if (r.party.length >= MAX_PARTY) return 'Wagon is full';
  if (r.res.money < price(r, rec.price)) return 'Not enough money';
  return '';
}

export function recruit(r: RunState, i: number): Chip[] {
  if (recruitOk(r, i)) return [];
  const rec = r.town!.recruits[i];
  const chips: Chip[] = [];
  gain(r, 'money', -price(r, rec.price), chips);
  r.town!.recruits.splice(i, 1);
  addTraveler(r, rec.t, rngFor(r, 'recruit'));
  chips.push({ text: `${rec.t.icon} ${rec.t.name} joins`, good: true });
  log(r, `${rec.t.icon} ${rec.t.name} joined in ${r.town!.name}.`, 'good');
  return chips;
}

export function leaveTown(r: RunState): void {
  if (r.phase !== 'town') return;
  r.town = null;
  r.phase = r.party.length ? 'map' : 'end';
  // A town visit sometimes ends with a town event.
  const rng = rngFor(r, 'leave', r.at);
  if (r.at !== 0 && rng.chance(0.35)) drawEvent(r, 'map', rng, undefined);
}

// ---------- Scenes ----------

export interface SceneOutcome {
  res: Partial<Res>;
  wagon: number;
  hurt: [number, number][]; // uid, hp loss
  kills: number;
  meat: number;
  text: string;
}

export function applyScene(r: RunState, o: SceneOutcome): void {
  const req = r.scene!;
  r.scene = null;
  const chips: Chip[] = [];
  for (const [k, v] of Object.entries(o.res) as [keyof Res, number][]) if (v) gain(r, k, v, chips);
  if (o.wagon) {
    const before = r.wagon;
    r.wagon = clamp(r.wagon + o.wagon, 0, 100);
    if (r.wagon !== before) chips.push({ text: `${r.wagon - before} 🛞`, good: false });
  }
  for (const [uid, n] of o.hurt) {
    const t = r.party.find((x) => x.uid === uid);
    if (t) hurt(r, t, -n, chips, req.kind === 'river' ? 'drowning' : 'a bandit bullet');
  }
  if (req.kind === 'hunt') {
    r.stats.hunts++;
    r.stats.meat += o.meat;
    moraleChange(r, o.meat >= 30 ? 6 : o.meat > 0 ? 2 : -3, chips);
  } else if (req.kind === 'ambush') {
    r.stats.bandits += o.kills;
    moraleChange(r, o.kills >= 4 ? 5 : -4, chips);
  } else {
    r.stats.rivers++;
  }
  const titles = { hunt: ['Hunt over', '🦌'], river: ['Across the river', '🌊'], ambush: [req.boss ? 'The last gate' : 'Ambush over', '🏴'] } as const;
  r.report = { title: titles[req.kind][0], icon: titles[req.kind][1], text: o.text, chips, ret: req.ret };
  r.phase = 'report';
  checkLoss(r);
}

export function closeReport(r: RunState): void {
  const rep = r.report;
  r.report = null;
  if (r.phase === 'end') return;
  goRet(r, rep?.ret ?? 'map');
}

// ---------- End ----------

export function checkLoss(r: RunState): boolean {
  if (r.phase === 'end') return true;
  if (r.party.length === 0) {
    const last = r.lost[r.lost.length - 1];
    finish(r, false, last ? `${last.name} ${last.how === 'left' ? 'left' : `died of ${last.how}`}. Nobody is left.` : 'Nobody is left.');
    return true;
  }
  return false;
}

export function score(r: RunState, victory: boolean): number {
  const row = here(r).row + (r.trip ? 0.5 : 0);
  let s = Math.round(row * 40 + r.stats.miles * 0.3);
  if (victory) {
    s += 400 + r.party.length * 150 + r.party.reduce((x, t) => x + t.hp * 5, 0);
    s += Math.round(r.res.money / 2 + r.res.food / 4 + r.morale * 2);
    s += Math.max(0, 70 - r.day) * 6;
  }
  return s;
}

export function finish(r: RunState, victory: boolean, cause: string): void {
  const s = score(r, victory);
  r.result = { victory, score: s, marks: Math.floor(s / 120) + (victory ? 3 : 0), cause };
  r.phase = 'end';
}

// ---------- Save data ----------

const RUN_KEY = 'dusttrail.run';
const META_KEY = 'dusttrail.meta';

export function saveRun(r: RunState | null): void {
  try {
    if (!r || r.phase === 'end') localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* storage blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r.v === 1 && r.phase !== 'end' ? r : null;
  } catch {
    return null;
  }
}

export function freshMeta(): Meta {
  return { runs: 0, wins: 0, best: 0, marks: 0, deaths: 0, miles: 0, unlocked: [] };
}

export function loadMeta(): Meta {
  try {
    const s = localStorage.getItem(META_KEY);
    return s ? { ...freshMeta(), ...(JSON.parse(s) as Meta) } : freshMeta();
  } catch {
    return freshMeta();
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}

/** Book the result of a finished run into the meta progress. */
export function bookRun(m: Meta, r: RunState): void {
  if (!r.result) return;
  m.wins += r.result.victory ? 1 : 0;
  m.best = Math.max(m.best, r.result.score);
  m.marks += r.result.marks;
  m.deaths += r.lost.filter((x) => x.how !== 'left').length;
  m.miles += r.stats.miles;
}

export function unlockCost(id: string): number {
  return GROUPS.find((g) => g.id === id)?.cost ?? CHAINS.find((c) => c.id === id)?.cost ?? 99;
}

export const isUnlocked = (m: Meta, id: string): boolean => unlockCost(id) === 0 || m.unlocked.includes(id);

// ---------- Scene setup ----------

export function sceneSetup(r: RunState): SceneSetup {
  const req = r.scene!;
  const dest = r.trip ? r.nodes[r.trip.to] : here(r);
  return {
    kind: req.kind,
    boss: req.boss,
    easy: !!req.easy,
    seed: hash(r.seed, 'scene', r.day, r.rc++),
    hunt: best(r, 'hunt'),
    scout: best(r, 'scout'),
    mech: best(r, 'mech'),
    fighters: r.party.filter((t) => skillOf(t, 'fight') > 0).map((t) => ({ uid: t.uid, lvl: skillOf(t, 'fight'), brave: t.traits.includes('brave') })),
    party: r.party.map((t) => t.uid),
    ammo: r.res.ammo,
    sharp: hasTrait(r, 'sharp'),
    strong: r.party.filter((t) => t.traits.includes('strong')).length,
    row: dest.row,
    danger: r.trip ? r.trip.danger : dest.kind === 'pass' ? 2 : 1,
  };
}
