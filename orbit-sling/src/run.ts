/** Run state, rewards, shop, events and save data. Pure functions, no DOM. */
import { EVENTS, LAUNCHERS, PLAN, SECTORS, SPECIALS, SHOTS, UPGRADES, type LauncherId, type NodeKind, type ShotId, type UpgId } from './data';
import { genSystem, type Sys, type SysKind } from './gen';
import { requiredLeft, type ShotMods, type SimResult } from './physics';
import { Rng, hash } from './rng';

export const RUN_KEY = 'orbit-sling.run';
export const META_KEY = 'orbit-sling.meta';

export interface Stats {
  shots: number;
  hits: number;
  banks: number;
  orbits: number;
  systems: number;
  caught: number;
}

export interface ShopItem {
  kind: 'ammo' | 'upgrade' | 'repair';
  id: string;
  n: number;
  cost: number;
  sold: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  launcher: LauncherId;
  sector: number;
  step: number;
  hull: number;
  maxHull: number;
  credits: number;
  score: number;
  ammo: Record<ShotId, number>;
  upg: Partial<Record<UpgId, number>>;
  /** The node the player is in. null = on the map. */
  node: NodeKind | null;
  sys: Sys | null;
  shop: ShopItem[] | null;
  event: string | null;
  eventResult: string | null;
  bossTries: number;
  stats: Stats;
  /** Seeker ammo appears in shops when the Hunter Bay is unlocked. */
  seekers: boolean;
}

export interface Meta {
  dust: number;
  unlocked: LauncherId[];
  runs: number;
  wins: number;
  bestSector: number;
  best: number;
  hits: number;
  orbits: number;
  last: LauncherId;
}

export function newRun(seed: string, launcher: LauncherId, meta: Meta): RunState {
  const L = LAUNCHERS[launcher];
  const ammo: Record<ShotId, number> = { std: 0, split: 0, heavy: 0, phase: 0, boomer: 0, seeker: 0 };
  for (const [k, v] of Object.entries(L.ammo)) ammo[k as ShotId] += v ?? 0;
  return {
    v: 1,
    seed,
    launcher,
    sector: 0,
    step: 0,
    hull: L.hull,
    maxHull: L.hull,
    credits: 0,
    score: 0,
    ammo,
    upg: { ...L.upgrades },
    node: null,
    sys: null,
    shop: null,
    event: null,
    eventResult: null,
    bossTries: 0,
    stats: { shots: 0, hits: 0, banks: 0, orbits: 0, systems: 0, caught: 0 },
    seekers: meta.unlocked.includes('hunter'),
  };
}

export const lvl = (run: RunState, id: UpgId): number => run.upg[id] ?? 0;

export function modsFor(run: RunState): ShotMods {
  const L = LAUNCHERS[run.launcher];
  return { speed: 1 + 0.12 * lvl(run, 'coil'), magnet: 3 * lvl(run, 'magnet'), splitN: L.splitN, phaseN: L.phaseN };
}

/** Aim line length in steps. */
export const previewSteps = (run: RunState): number => Math.round(80 * (1 + 0.4 * lvl(run, 'sight')));

export const choices = (run: RunState): NodeKind[] => PLAN[run.step] ?? ['boss'];

export const nodeSeed = (run: RunState, kind: NodeKind, extra = 0): number => hash(run.seed, run.sector, run.step, kind, extra);

export function enterSystem(run: RunState, kind: SysKind): Sys {
  const sys = genSystem(nodeSeed(run, kind, kind === 'boss' ? run.bossTries : 0), run.sector, kind, lvl(run, 'extra'));
  run.node = kind;
  run.sys = sys;
  return sys;
}

export interface Line {
  label: string;
  n: number;
}

export interface ShotReport {
  lines: Line[];
  credits: number;
  refund: boolean;
  cleared: boolean;
  failed: boolean;
}

const mult = (run: RunState): number => (1 + 0.2 * lvl(run, 'salvage')) * (run.sys?.kind === 'hard' ? 1.5 : 1);

/** Apply a finished shot to the system and the run. */
export function applyShot(run: RunState, type: ShotId, res: SimResult): ShotReport {
  const sys = run.sys!;
  const lines: Line[] = [];
  const trick = lvl(run, 'trick') ? 1.5 : 1;
  let crates = 0;
  for (const [ti, d] of res.dmg) {
    const t = sys.targets[ti];
    t.hp = Math.max(0, t.hp - d);
    if (t.kind === 'crate' && t.hp === 0) crates++;
  }
  for (const i of res.rocksBroken) sys.rocks[i].alive = false;
  for (const i of res.shieldsBroken) sys.shields[i].alive = false;
  if (res.hits) lines.push({ label: `${res.hits} hit${res.hits > 1 ? 's' : ''}`, n: res.hits * 6 });
  if (crates) lines.push({ label: 'Supply crate', n: 15 * crates });
  if (res.banks) lines.push({ label: `Bank shot${res.banks > 1 ? ` ×${res.banks}` : ''}`, n: Math.round(res.banks * 10 * trick) });
  if (res.orbits) lines.push({ label: `Orbit shot${res.orbits > 1 ? ` ×${res.orbits}` : ''}`, n: Math.round(res.orbits * 22 * trick) });
  const distinct = res.dmg.size;
  if (distinct >= 2) lines.push({ label: `Multi ×${distinct}`, n: 8 * (distinct - 1) });
  const m = mult(run);
  for (const l of lines) l.n = Math.round(l.n * m);
  const refund = res.caught;
  if (type !== 'std') run.ammo[type] = Math.max(0, run.ammo[type] - 1);
  if (refund) lines.push({ label: 'Caught! Shot refunded', n: 0 });
  else sys.used++;
  if (!res.hits) sys.missed++;
  sys.turn++;
  sys.banks += res.banks;
  sys.orbits += res.orbits;
  const credits = lines.reduce((a, l) => a + l.n, 0);
  sys.credits += credits;
  run.credits += credits;
  run.score += credits;
  run.stats.shots++;
  run.stats.hits += res.hits;
  run.stats.banks += res.banks;
  run.stats.orbits += res.orbits;
  if (refund) run.stats.caught++;
  const cleared = requiredLeft(sys) === 0;
  const failed = !cleared && sys.used >= sys.shots;
  return { lines, credits, refund, cleared, failed };
}

/** Bonuses when a system is cleared. */
export function clearBonus(run: RunState): Line[] {
  const sys = run.sys!;
  const lines: Line[] = [];
  lines.push({ label: sys.kind === 'boss' ? 'Boss destroyed' : 'System cleared', n: sys.kind === 'boss' ? 60 : sys.kind === 'hard' ? 30 : 15 });
  const spare = sys.shots - sys.used;
  if (spare > 0) lines.push({ label: `${spare} spare shot${spare > 1 ? 's' : ''}`, n: spare * 8 });
  if (sys.missed === 0) lines.push({ label: 'Clean sweep (no misses)', n: 15 });
  const m = 1 + 0.2 * lvl(run, 'salvage');
  for (const l of lines) l.n = Math.round(l.n * m);
  return lines;
}

export interface Outcome {
  cleared: boolean;
  lines: Line[];
  hullLost: number;
  sectorDone: boolean;
  won: boolean;
  dead: boolean;
}

/** Close the system and move the run on. */
export function finishSystem(run: RunState, cleared: boolean): Outcome {
  const sys = run.sys!;
  const out: Outcome = { cleared, lines: [], hullLost: 0, sectorDone: false, won: false, dead: false };
  if (cleared) {
    out.lines = clearBonus(run);
    const c = out.lines.reduce((a, l) => a + l.n, 0);
    run.credits += c;
    run.score += c;
    run.stats.systems++;
  } else {
    out.hullLost = 1;
    run.hull--;
  }
  if (run.hull <= 0) {
    out.dead = true;
    return out;
  }
  if (sys.kind === 'boss') {
    if (!cleared) {
      run.bossTries++;
      run.node = null;
      run.sys = null;
      return out;
    }
    run.score += 100;
    out.sectorDone = true;
    if (run.sector >= SECTORS.length - 1) {
      run.score += 300 + run.hull * 50;
      out.won = true;
      return out;
    }
    run.sector++;
    run.step = 0;
    run.bossTries = 0;
    run.node = null;
    run.sys = null;
    return out;
  }
  run.step++;
  run.node = null;
  run.sys = null;
  return out;
}

export function leaveNode(run: RunState): void {
  run.step++;
  run.node = null;
  run.shop = null;
  run.event = null;
  run.eventResult = null;
}

// ---------- Shop ----------

export function makeShop(run: RunState): ShopItem[] {
  const rng = new Rng(nodeSeed(run, 'shop', 7));
  const items: ShopItem[] = [];
  const pool = SPECIALS.filter((s) => s !== 'seeker' || run.seekers || run.launcher === 'hunter');
  const up = run.sector * 2;
  for (const id of rng.shuffle([...pool]).slice(0, 3)) items.push({ kind: 'ammo', id, n: 2, cost: SHOTS[id].price + up, sold: false });
  const ups = (Object.keys(UPGRADES) as UpgId[]).filter((u) => lvl(run, u) < UPGRADES[u].max);
  for (const id of rng.shuffle(ups).slice(0, 2)) items.push({ kind: 'upgrade', id, n: 1, cost: UPGRADES[id].price + up * 2, sold: false });
  items.push({ kind: 'repair', id: 'repair', n: 1, cost: 30 + up, sold: false });
  return items;
}

export function canBuy(run: RunState, it: ShopItem): boolean {
  if (it.sold || run.credits < it.cost) return false;
  if (it.kind === 'repair') return run.hull < run.maxHull;
  if (it.kind === 'upgrade') return lvl(run, it.id as UpgId) < UPGRADES[it.id as UpgId].max;
  return true;
}

export function applyUpgrade(run: RunState, id: UpgId): void {
  run.upg[id] = lvl(run, id) + 1;
  if (id === 'plating') {
    run.maxHull++;
    run.hull = Math.min(run.maxHull, run.hull + 1);
  }
}

export function buy(run: RunState, it: ShopItem): boolean {
  if (!canBuy(run, it)) return false;
  run.credits -= it.cost;
  it.sold = true;
  if (it.kind === 'ammo') run.ammo[it.id as ShotId] += it.n;
  else if (it.kind === 'upgrade') applyUpgrade(run, it.id as UpgId);
  else run.hull = Math.min(run.maxHull, run.hull + 1);
  return true;
}

// ---------- Station and events ----------

export function stationOpts(run: RunState): { id: string; icon: string; name: string; text: string; ok: boolean }[] {
  return [
    { id: 'repair', icon: '🔧', name: 'Repair', text: `Repair 1 hull (now ${run.hull}/${run.maxHull}).`, ok: run.hull < run.maxHull },
    { id: 'refit', icon: '📦', name: 'Refit', text: '+1 split, +1 heavy, +1 phase.', ok: true },
    { id: 'sell', icon: '💰', name: 'Sell scans', text: '+35 credits.', ok: true },
  ];
}

export function station(run: RunState, id: string): void {
  if (id === 'repair') run.hull = Math.min(run.maxHull, run.hull + 1);
  else if (id === 'refit') {
    run.ammo.split++;
    run.ammo.heavy++;
    run.ammo.phase++;
  } else run.credits += 35;
}

export function pickEvent(run: RunState): string {
  const rng = new Rng(nodeSeed(run, 'anomaly', 3));
  return rng.pick(EVENTS).id;
}

export const eventDef = (id: string) => EVENTS.find((e) => e.id === id)!;

export function canEvent(run: RunState, idx: number): boolean {
  const o = eventDef(run.event!).options[idx];
  if (!o) return false;
  if (o.cost && run.credits < o.cost) return false;
  if (o.hull && run.hull <= o.hull) return false;
  if (o.fx === 'upgrade' && !(Object.keys(UPGRADES) as UpgId[]).some((u) => lvl(run, u) < UPGRADES[u].max)) return false;
  return true;
}

export function doEvent(run: RunState, idx: number): string {
  const ev = eventDef(run.event!);
  const o = ev.options[idx];
  const rng = new Rng(nodeSeed(run, 'anomaly', 11 + idx));
  if (o.cost) run.credits -= o.cost;
  if (o.hull) run.hull -= o.hull;
  let msg = 'You fly on.';
  const randomAmmo = (n: number): string => {
    const got: string[] = [];
    const pool = SPECIALS.filter((s) => s !== 'seeker' || run.seekers);
    for (let i = 0; i < n; i++) {
      const id = rng.pick(pool);
      run.ammo[id]++;
      got.push(`${SHOTS[id].icon} ${SHOTS[id].name}`);
    }
    return got.join(', ');
  };
  switch (o.fx) {
    case 'credits30':
      run.credits += 30;
      msg = '+30 credits.';
      break;
    case 'credits25':
      run.credits += 25;
      msg = '+25 credits.';
      break;
    case 'credits20':
      run.credits += 20;
      msg = '+20 credits.';
      break;
    case 'ammo2':
      msg = `You find ${randomAmmo(2)}.`;
      break;
    case 'flare':
      run.credits += 70;
      msg = 'The hull glows red, but the bounty is yours. +70 credits.';
      break;
    case 'upgrade': {
      const ups = (Object.keys(UPGRADES) as UpgId[]).filter((u) => lvl(run, u) < UPGRADES[u].max);
      const id = rng.pick(ups);
      applyUpgrade(run, id);
      msg = `Installed ${UPGRADES[id].icon} ${UPGRADES[id].name}: ${UPGRADES[id].text}`;
      break;
    }
    case 'comet':
      run.ammo.split += 2;
      run.ammo.heavy += 1;
      msg = '+2 split, +1 heavy.';
      break;
    case 'rescue':
      run.hull = Math.min(run.maxHull, run.hull + 1);
      run.ammo.phase++;
      msg = 'The crew patches your hull and gives you a phase shot.';
      break;
    case 'rift':
      if (rng.chance(0.5)) {
        run.maxHull++;
        run.hull = Math.min(run.maxHull, run.hull + 2);
        msg = 'You pull out an alien hull plate. +1 max hull, repair 2.';
      } else msg = `The rift bites, but you grab ${randomAmmo(3)}.`;
      break;
  }
  run.eventResult = msg;
  return msg;
}

// ---------- Score and save ----------

export const dustFor = (score: number, won: boolean): number => Math.floor(score / 45) + (won ? 25 : 0);

export function saveRun(run: RunState | null): void {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || !LAUNCHERS[run.launcher]) return null;
    return run;
  } catch {
    return null;
  }
}

export function loadMeta(): Meta {
  const base: Meta = { dust: 0, unlocked: ['mk1'], runs: 0, wins: 0, bestSector: 0, best: 0, hits: 0, orbits: 0, last: 'mk1' };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!m.unlocked.includes('mk1')) m.unlocked.push('mk1');
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** Record a finished run in the meta progress. Returns the stardust gained. */
export function recordEnd(meta: Meta, run: RunState, won: boolean): number {
  const dust = dustFor(run.score, won);
  meta.dust += dust;
  meta.runs++;
  if (won) meta.wins++;
  meta.bestSector = Math.max(meta.bestSector, won ? SECTORS.length : run.sector + 1);
  meta.best = Math.max(meta.best, run.score);
  meta.hits += run.stats.hits;
  meta.orbits += run.stats.orbits;
  return dust;
}
