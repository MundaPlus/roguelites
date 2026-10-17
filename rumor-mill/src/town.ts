/** Town graph, planting and the pure spread step. */
import { AGENTS, NAMES, TOWNS, type AgentId, type Trait } from './data';
import { Rng, hash } from './rng';
import { crossesWeak, isBig, isQuiet, keyOf, mutate, sameClaim, traceSpeed, type Claim } from './rumor';

export const VIEW_W = 360;
export const VIEW_H = 430;
export const TUNE = { linkRate: 2.0, maxDeg: 6 };

export interface Person {
  id: number;
  name: string;
  trait: Trait;
  x: number;
  y: number;
}

export interface Link {
  a: number;
  b: number;
  weak: boolean;
}

/** One claim a person holds. */
export interface Entry {
  claim: Claim;
  /** The version they heard, before their own change. */
  prev: Claim;
  /** Who told them first. -1 = planted by you or the rival. */
  from: number;
  sources: number[];
  weight: number;
  /** Path from the planter to this person. */
  path: number[];
  turn: number;
}

export interface PState {
  heard: Record<string, Entry>;
  order: string[];
  belief: string | null;
  /** A skeptic who killed a rumor keeps the last dead version for display. */
  dismissed: { claim: Claim; from: number; turn: number } | null;
  /** Agent index (yours) or -2 for a rival plant, -1 for none. */
  agent: number;
}

export interface Trace {
  guard: number;
  /** Guard first, the planter last. */
  path: number[];
  pos: number;
  speed: number;
  origin: number;
  born: number;
  done: boolean;
}

export interface Town {
  idx: number;
  name: string;
  target: string;
  icon: string;
  people: Person[];
  links: Link[];
  ps: PState[];
  pending: { node: number; key: string }[];
  traces: Trace[];
  turn: number;
  maxTurns: number;
  goal: number;
  agents: AgentId[];
  used: boolean[];
  exposed: boolean[];
  planted: boolean;
  lastClaim: Claim | null;
  rivalEvery: number;
  rivalNodes: number[];
  /** Best share reached. */
  best: number;
}

export type Ev =
  | { kind: 'hear'; node: number; from: number; key: string; changed: boolean }
  | { kind: 'kill'; node: number; from: number }
  | { kind: 'believe'; node: number; key: string; pos: boolean }
  | { kind: 'trace'; guard: number; origin: number }
  | { kind: 'expose'; node: number; agent: number }
  | { kind: 'safe'; node: number }
  | { kind: 'rival'; node: number };

export interface Move {
  from: number;
  to: number;
  claim: Claim;
}

// ---------- Graph helpers ----------

interface Graph {
  adj: number[][];
  weak: Set<string>;
}
const graphCache = new WeakMap<Link[], Graph>();
const lk = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function graph(t: Town): Graph {
  let g = graphCache.get(t.links);
  if (!g) {
    const adj: number[][] = t.people.map(() => []);
    const weak = new Set<string>();
    for (const l of t.links) {
      adj[l.a].push(l.b);
      adj[l.b].push(l.a);
      if (l.weak) weak.add(lk(l.a, l.b));
    }
    for (const a of adj) a.sort((x, y) => x - y);
    g = { adj, weak };
    graphCache.set(t.links, g);
  }
  return g;
}

export const isWeak = (t: Town, a: number, b: number): boolean => graph(t).weak.has(lk(a, b));

function cross(p1: Person, p2: Person, p3: Person, p4: Person): boolean {
  const d = (a: Person, b: Person, c: Person) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segDist(p: Person, a: Person, b: Person): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y);
}

// ---------- Generation ----------

export function makeTown(idx: number, seed: number, agents: AgentId[]): Town {
  const def = TOWNS[idx];
  const rng = new Rng(hash(seed, 'town', idx));
  const N = def.n;
  const M = 22;
  const pts: Person[] = [];
  for (let i = 0; i < N; i++) {
    let best: { x: number; y: number } | null = null;
    let bd = -1;
    for (let k = 0; k < 24; k++) {
      const p = { x: M + rng.next() * (VIEW_W - 2 * M), y: M + rng.next() * (VIEW_H - 2 * M) };
      const d = pts.reduce((m, q) => Math.min(m, Math.hypot(q.x - p.x, q.y - p.y)), 1e9);
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    pts.push({ id: i, name: '', trait: 'plain', x: best!.x, y: best!.y });
  }
  // Relax so that no two people are too close.
  const r0 = Math.sqrt((VIEW_W * VIEW_H) / N) * 0.8;
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < N; i++)
      for (let j = i + 1; j < N; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < r0) {
          const f = ((r0 - d) / d) * 0.25;
          a.x -= dx * f;
          a.y -= dy * f;
          b.x += dx * f;
          b.y += dy * f;
        }
      }
    for (const p of pts) {
      p.x = Math.max(M, Math.min(VIEW_W - M, p.x));
      p.y = Math.max(M, Math.min(VIEW_H - M, p.y));
    }
  }
  for (const p of pts) {
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }
  // Links: shortest first, no crossings, no link through another person.
  const pairs: [number, number, number][] = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push([i, j, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)]);
  pairs.sort((a, b) => a[2] - b[2]);
  const links: Link[] = [];
  const deg = new Array(N).fill(0);
  const ok = (i: number, j: number): boolean => {
    for (const l of links) {
      if (l.a === i || l.a === j || l.b === i || l.b === j) continue;
      if (cross(pts[i], pts[j], pts[l.a], pts[l.b])) return false;
    }
    for (let k = 0; k < N; k++) if (k !== i && k !== j && segDist(pts[k], pts[i], pts[j]) < 14) return false;
    return true;
  };
  const target = Math.round(N * TUNE.linkRate);
  for (const [i, j, d] of pairs) {
    if (links.length >= target) break;
    if (d > r0 * 2.1) break;
    if (deg[i] >= TUNE.maxDeg || deg[j] >= TUNE.maxDeg) continue;
    if (!ok(i, j)) continue;
    links.push({ a: i, b: j, weak: false });
    deg[i]++;
    deg[j]++;
  }
  // Connect components.
  const parent = pts.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const l of links) parent[find(l.a)] = find(l.b);
  for (const [i, j] of pairs) {
    if (find(i) === find(j)) continue;
    if (!ok(i, j) && pairs.some(([a, b]) => find(a) !== find(b) && ok(a, b))) continue;
    links.push({ a: i, b: j, weak: false });
    parent[find(i)] = find(j);
  }
  // Weak links: about a third, longer links more often.
  const maxD = Math.max(...links.map((l) => Math.hypot(pts[l.a].x - pts[l.b].x, pts[l.a].y - pts[l.b].y)));
  for (const l of links) {
    const d = Math.hypot(pts[l.a].x - pts[l.b].x, pts[l.a].y - pts[l.b].y) / maxD;
    l.weak = rng.chance(0.1 + d * 0.35);
  }
  // Traits.
  const order = rng.shuffle(pts.map((_, i) => i));
  let k = 0;
  const give = (t: Trait, n: number) => {
    for (let i = 0; i < n && k < N; i++) pts[order[k++]].trait = t;
  };
  give('guard', def.guards);
  give('gossip', def.gossip);
  give('skeptic', def.skeptic);
  give('loyalist', def.loyalist);
  give('muddler', def.muddler);
  const names = rng.shuffle([...NAMES]);
  pts.forEach((p, i) => (p.name = names[i % names.length]));
  return {
    idx,
    name: def.name,
    target: def.target,
    icon: def.icon,
    people: pts,
    links,
    ps: pts.map(() => ({ heard: {}, order: [], belief: null, dismissed: null, agent: -1 })),
    pending: [],
    traces: [],
    turn: 0,
    maxTurns: def.turns,
    goal: def.goal,
    agents: [...agents],
    used: agents.map(() => false),
    exposed: agents.map(() => false),
    planted: false,
    lastClaim: null,
    rivalEvery: def.rival,
    rivalNodes: [],
    best: 0,
  };
}

// ---------- State queries ----------

export function cloneTown(t: Town): Town {
  return {
    ...t,
    ps: t.ps.map((p) => {
      const heard: Record<string, Entry> = {};
      for (const k of p.order) {
        const e = p.heard[k];
        heard[k] = { ...e, sources: [...e.sources] };
      }
      return { ...p, heard, order: [...p.order] };
    }),
    pending: [...t.pending],
    traces: t.traces.map((tr) => ({ ...tr })),
    used: [...t.used],
    exposed: [...t.exposed],
    rivalNodes: [...t.rivalNodes],
  };
}

/** People who count for the goal: not your agents, not rival plants. */
export const voters = (t: Town): number => t.ps.filter((p) => p.agent === -1).length;

export const believers = (t: Town): number => t.ps.filter((p) => p.agent === -1 && p.belief && p.belief[0] !== '!').length;
export const defenders = (t: Town): number => t.ps.filter((p) => p.agent === -1 && p.belief && p.belief[0] === '!').length;

export const share = (t: Town): number => believers(t) / Math.max(1, voters(t));

/** Believers needed for the goal, with the current number of voters. */
export const needed = (t: Town): number => Math.ceil(t.goal * voters(t) - 1e-9);

export const isWon = (t: Town): boolean => believers(t) >= needed(t);
export const isOver = (t: Town): boolean => isWon(t) || t.turn >= t.maxTurns;

/** Why this person cannot get a rumor planted, or '' if they can. */
export function plantBlock(t: Town, node: number): string {
  const p = t.people[node];
  const s = t.ps[node];
  if (p.trait === 'guard') return 'Guards cannot be recruited.';
  if (s.agent >= 0) return 'Already your agent.';
  if (s.agent === -2) return 'The rival owns this person.';
  if (s.order.length || s.dismissed) return 'They already heard a rumor.';
  return '';
}

export const freeAgents = (t: Town): number[] => t.agents.map((_, i) => i).filter((i) => !t.used[i]);

/** The claim as the agent plants it. */
export function plantedClaim(agent: AgentId, c: Claim): Claim {
  if (agent === 'bard' && !c.mod) return { ...c, mod: 'surely' };
  return c;
}

export function canPlant(t: Town, agent: number, node: number): boolean {
  return !t.planted && !isOver(t) && agent >= 0 && agent < t.agents.length && !t.used[agent] && !plantBlock(t, node);
}

/** Plant a rumor through agent `agent` on person `node`. Returns a new town. */
export function plant(t0: Town, agent: number, node: number, c: Claim): Town {
  const t = cloneTown(t0);
  const claim = plantedClaim(t.agents[agent], c);
  const key = keyOf(claim);
  const s = t.ps[node];
  s.agent = agent;
  s.heard[key] = { claim, prev: claim, from: -1, sources: [-1], weight: 2, path: [node], turn: t.turn };
  s.order.push(key);
  t.used[agent] = true;
  t.planted = true;
  t.lastClaim = { ...c, mod: null };
  t.pending.push({ node, key });
  return t;
}

/** The person the rival whispers to next: the unheard non-guard with the most links. */
function rivalPick(t: Town): number {
  const g = graph(t);
  let best = -1;
  for (let i = 0; i < t.people.length; i++) {
    if (plantBlock(t, i)) continue;
    if (best < 0 || g.adj[i].length > g.adj[best].length) best = i;
  }
  return best;
}

/** The turn after which the rival acts next, or -1. */
export function nextRivalTurn(t: Town): number {
  if (!t.rivalEvery) return -1;
  let n = Math.max(2, t.turn + 1);
  while ((n - 2) % t.rivalEvery !== 0) n++;
  return n <= t.maxTurns ? n : -1;
}

/** One turn: every new rumor moves one link. Pure: returns a new town. */
export function spread(t0: Town): { town: Town; events: Ev[]; moves: Move[] } {
  const t = cloneTown(t0);
  const g = graph(t);
  const events: Ev[] = [];
  const moves: (Move & { path: number[] })[] = [];
  for (const p of t0.pending) {
    const e = t0.ps[p.node].heard[p.key];
    if (!e) continue;
    for (const m of g.adj[p.node]) {
      if (e.sources.includes(m) || t0.ps[m].agent !== -1) continue;
      if (g.weak.has(lk(p.node, m)) && !crossesWeak(e.claim)) continue;
      moves.push({ from: p.node, to: m, claim: e.claim, path: e.path });
    }
  }
  moves.sort((a, b) => a.to - b.to || a.from - b.from);
  t.pending = [];
  t.planted = false;
  t.turn++;
  const oldTraces = t.traces.length;
  for (const d of moves) {
    const per = t.people[d.to];
    const st = t.ps[d.to];
    const held = mutate(per.trait, d.claim);
    if (!held) {
      if (!st.order.length) st.dismissed = { claim: d.claim, from: d.from, turn: t.turn };
      events.push({ kind: 'kill', node: d.to, from: d.from });
      continue;
    }
    const key = keyOf(held);
    const w = isBig(held) ? 2 : 1;
    let e = st.heard[key];
    if (!e) {
      e = { claim: held, prev: d.claim, from: d.from, sources: [d.from], weight: w, path: [...d.path, d.to], turn: t.turn };
      st.heard[key] = e;
      st.order.push(key);
      events.push({ kind: 'hear', node: d.to, from: d.from, key, changed: !sameClaim(held, d.claim) });
      const origin = e.path[0];
      if (per.trait === 'guard' && t.ps[origin].agent >= 0 && !isQuiet(held) && !t.traces.some((tr) => tr.guard === d.to && tr.origin === origin)) {
        t.traces.push({ guard: d.to, path: [...e.path].reverse(), pos: 0, speed: traceSpeed(held), origin, born: t.turn, done: false });
        events.push({ kind: 'trace', guard: d.to, origin });
      }
    } else if (!e.sources.includes(d.from)) {
      e.sources.push(d.from);
      e.weight += w;
    }
    if (st.belief === null && e.weight >= 2) {
      st.belief = key;
      t.pending.push({ node: d.to, key });
      events.push({ kind: 'believe', node: d.to, key, pos: !held.not });
    }
  }
  for (let i = 0; i < oldTraces; i++) {
    const tr = t.traces[i];
    if (tr.done) continue;
    tr.pos += tr.speed;
    if (tr.pos >= tr.path.length - 1) {
      tr.pos = tr.path.length - 1;
      tr.done = true;
      const a = t.ps[tr.origin].agent;
      if (a < 0 || t.exposed[a]) continue;
      if (t.agents[a] === 'ghost') events.push({ kind: 'safe', node: tr.origin });
      else {
        t.exposed[a] = true;
        events.push({ kind: 'expose', node: tr.origin, agent: a });
      }
      for (const o of t.traces) if (o.origin === tr.origin) o.done = true;
    }
  }
  if (t.rivalEvery && t.lastClaim && t.turn >= 2 && (t.turn - 2) % t.rivalEvery === 0 && t.turn < t.maxTurns && !isWon(t)) {
    const node = rivalPick(t);
    if (node >= 0) {
      const claim: Claim = { ...t.lastClaim, mod: null, not: true };
      const key = keyOf(claim);
      const s = t.ps[node];
      s.agent = -2;
      s.heard[key] = { claim, prev: claim, from: -1, sources: [-1], weight: 2, path: [node], turn: t.turn };
      s.order.push(key);
      t.pending.push({ node, key });
      t.rivalNodes.push(node);
      events.push({ kind: 'rival', node });
    }
  }
  t.best = Math.max(t.best, share(t));
  return { town: t, events, moves: moves.map(({ from, to, claim }) => ({ from, to, claim })) };
}

/** Turns until a trace reaches its planter. */
export const traceLeft = (tr: Trace): number => Math.ceil((tr.path.length - 1 - tr.pos) / tr.speed - 1e-9);

/** The entry a person shows: the belief, else the newest claim. */
export function shown(t: Town, node: number): Entry | null {
  const s = t.ps[node];
  if (s.belief) return s.heard[s.belief];
  if (!s.order.length) return null;
  return s.heard[s.order[s.order.length - 1]];
}

export interface PreviewHop {
  node: number;
  from: number;
  turn: number;
  entry: Entry;
}

export interface Preview {
  hops: PreviewHop[];
  killed: { node: number; from: number; turn: number }[];
  believers: number;
  traces: Trace[];
  claim: Claim;
}

/** What happens to a new plant over the next `turns` turns (other rumors keep moving too). */
export function preview(t: Town, agent: number, node: number, c: Claim, turns = 2): Preview {
  let s = plant(t, agent, node, c);
  const killed: Preview['killed'] = [];
  for (let i = 0; i < turns && s.turn < s.maxTurns; i++) {
    const r = spread(s);
    for (const ev of r.events) {
      if (ev.kind !== 'kill') continue;
      const mv = r.moves.find((m) => m.to === ev.node && m.from === ev.from);
      if (mv && s.ps[ev.from].heard && Object.values(s.ps[ev.from].heard).some((e) => e.path[0] === node)) killed.push({ node: ev.node, from: ev.from, turn: i + 1 });
    }
    s = r.town;
  }
  const hops: PreviewHop[] = [];
  let bel = 0;
  s.ps.forEach((p, i) => {
    if (i === node) return;
    for (const k of p.order) {
      const e = p.heard[k];
      if (e.path[0] === node) {
        hops.push({ node: i, from: e.from, turn: e.turn - t.turn, entry: e });
        if (p.belief === k && !t.ps[i].belief) bel++;
      }
    }
  });
  hops.sort((a, b) => a.turn - b.turn || a.node - b.node);
  return { hops, killed, believers: bel, traces: s.traces.filter((tr) => tr.origin === node), claim: plantedClaim(t.agents[agent], c) };
}

export const agentDef = (id: AgentId) => AGENTS[id];
