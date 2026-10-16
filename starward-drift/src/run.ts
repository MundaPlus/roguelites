/** Run state: sector maps, beacons, events, stores, rewards, upgrades, save data and score. */
import {
  AUGMENTS,
  AUG_IDS,
  EVENT_MAP,
  EVENTS,
  FIGHT_LINES,
  NAMES,
  RACES,
  SECTORS,
  SHIPS,
  SYSTEMS,
  WEAPONS,
  WEAPON_IDS,
  ENEMIES,
  type Outcome,
  type Race,
  type Req,
  type SysId,
} from './data';
import { makeEnemy, newCombat, type Combat } from './combat';
import { Rng, hash } from './rng';
import { addWeapon, autoPower, cleanUp, layoutOf, makeCrew, newShip, placeCrew, reactorCost, upgradeCost, type Ship } from './ship';

export const RUN_KEY = 'starward.run';
export const META_KEY = 'starward.meta';
export const MAX_WEAPONS = 4;
export const MAX_CARGO = 3;
export const MAX_CREW = 8;
export const MAX_AUG = 3;
export const FLEET_STEP = 0.075;
export const REACTOR_MAX = 25;

export type BeaconKind = 'start' | 'exit' | 'fight' | 'event' | 'distress' | 'store' | 'empty';

export interface StoreItem {
  kind: 'weapon' | 'crew' | 'augment';
  id: string;
  cost: number;
  sold?: boolean;
}

export interface Beacon {
  x: number;
  y: number;
  kind: BeaconKind;
  visited: boolean;
  nb: number[];
  store?: StoreItem[];
}

export interface NodeChoice {
  text: string;
  ok: boolean;
  act: string;
}

export interface Next {
  fight?: string;
  bonus?: number;
  store?: boolean;
  sector?: boolean;
}

export type Node =
  | { kind: 'event'; id: string; title: string; icon: string; text: string; choices: NodeChoice[]; result?: string; gains?: string[]; next?: Next }
  | { kind: 'store' }
  | { kind: 'reward'; title: string; text: string; gains: string[]; victory?: boolean };

export interface Stats {
  kills: number;
  scrap: number;
  jumps: number;
  fled: number;
}

export interface RunState {
  v: 1;
  seed: string;
  shipId: string;
  ship: Ship;
  scrap: number;
  fuel: number;
  sector: number;
  map: Beacon[];
  at: number;
  fleet: number;
  node: Node | null;
  combat: Combat | null;
  cargo: string[];
  stats: Stats;
  bonus: number;
  over: null | { victory: boolean; score: number };
}

export interface Meta {
  runs: number;
  wins: number;
  bestSector: number;
  best: number;
  kills: number;
  unlocked: string[];
}

// ---------- New run ----------

export function newRun(shipId: string, seed: string): RunState {
  const def = SHIPS.find((s) => s.id === shipId) ?? SHIPS[0];
  const rng = new Rng(hash(seed, 'crew'));
  const ship = newShip(def.name, def.layout, def.hull, def.reactor, def.systems);
  ship.auto = true;
  ship.missiles = def.missiles;
  ship.augments = [...def.augments];
  def.weapons.forEach((id) => addWeapon(ship, id));
  const names = rng.shuffle([...NAMES]);
  def.crew.forEach((r, i) => {
    const c = makeCrew(ship, r, names[i]);
    ship.crew.push(c);
    placeCrew(ship, c);
  });
  autoPower(ship);
  cleanUp(ship);
  const run: RunState = {
    v: 1,
    seed,
    shipId: def.id,
    ship,
    scrap: 25,
    fuel: 16,
    sector: 0,
    map: [],
    at: 0,
    fleet: 0,
    node: null,
    combat: null,
    cargo: [],
    stats: { kills: 0, scrap: 0, jumps: 0, fled: 0 },
    bonus: 0,
    over: null,
  };
  enterSector(run, 0);
  return run;
}

export function enterSector(run: RunState, sector: number): void {
  run.sector = sector;
  if (sector > 0) run.fuel += 2;
  run.map = genSector(run.seed, sector);
  run.at = 0;
  run.fleet = -0.2;
  run.map[0].visited = true;
  run.node = {
    kind: 'event',
    id: 'sector',
    title: `Sector ${sector + 1}: ${SECTORS[sector].name}`,
    icon: SECTORS[sector].icon,
    text:
      sector === 0
        ? 'You carry data the rebels must not get. Reach the exit beacon ⭐ of each sector before the rebel fleet catches you. After sector 6, the Rebel Flagship waits.'
        : `You arrive in the ${SECTORS[sector].name}. A supply buoy gives you 2 fuel. The rebel fleet follows close behind.`,
    choices: [{ text: 'Continue', ok: true, act: 'continue' }],
  };
}

const dist = (a: Beacon, b: Beacon): number => Math.hypot((a.x - b.x) * 1.5, a.y - b.y);

export function genSector(seed: string, sector: number): Beacon[] {
  const rng = new Rng(hash(seed, 'map', sector));
  const target = 17 + rng.int(0, 3);
  const bs: Beacon[] = [];
  bs.push({ x: 0.03 + rng.next() * 0.04, y: 0.3 + rng.next() * 0.4, kind: 'start', visited: false, nb: [] });
  bs.push({ x: 0.93 + rng.next() * 0.04, y: 0.2 + rng.next() * 0.6, kind: 'exit', visited: false, nb: [] });
  for (let tries = 0; tries < 2000 && bs.length < target; tries++) {
    const b: Beacon = { x: 0.06 + rng.next() * 0.88, y: 0.07 + rng.next() * 0.86, kind: 'empty', visited: false, nb: [] };
    if (bs.every((o) => dist(o, b) > 0.17)) bs.push(b);
  }
  const link = (i: number, j: number): void => {
    if (i === j || bs[i].nb.includes(j)) return;
    bs[i].nb.push(j);
    bs[j].nb.push(i);
  };
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (dist(bs[i], bs[j]) < 0.3) link(i, j);
  // Connect every beacon to the start.
  for (;;) {
    const seen = new Set([0]);
    const q = [0];
    while (q.length) for (const n of bs[q.shift()!].nb) if (!seen.has(n)) (seen.add(n), q.push(n));
    if (seen.size === bs.length) break;
    let best: [number, number] = [0, 0];
    let bd = Infinity;
    for (const i of seen)
      for (let j = 0; j < bs.length; j++) {
        if (seen.has(j)) continue;
        const d = dist(bs[i], bs[j]);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    link(best[0], best[1]);
  }
  const mids = rng.shuffle(bs.map((_, i) => i).slice(2));
  mids.forEach((i, k) => {
    if (k < 2) bs[i].kind = 'store';
    else bs[i].kind = rng.weighted<BeaconKind>([['fight', 46], ['event', 32], ['distress', 10], ['empty', 12]]);
  });
  return bs;
}

// ---------- Travel ----------

export const canJump = (run: RunState, i: number): boolean => !run.node && !run.combat && run.map[run.at].nb.includes(i);

export const overtaken = (run: RunState, i: number): boolean => run.map[i].x < run.fleet && run.map[i].kind !== 'start';

export function jump(run: RunState, i: number): void {
  if (!canJump(run, i)) return;
  if (run.fuel > 0) run.fuel--;
  else run.ship.hull -= 3;
  if (run.ship.augments.includes('hull_drone')) run.ship.hull = Math.min(run.ship.maxHull, run.ship.hull + 1);
  run.fleet += FLEET_STEP;
  run.at = i;
  run.stats.jumps++;
  if (run.ship.hull <= 0) {
    endRun(run, false);
    return;
  }
  const b = run.map[i];
  const rng = new Rng(hash(run.seed, run.sector, i, run.stats.jumps, 'arrive'));
  if (overtaken(run, i)) {
    b.visited = true;
    run.node = fightNode('elite', 'The rebel fleet has taken this beacon! An elite warship attacks.');
    return;
  }
  if (b.visited) {
    if (b.kind === 'store') run.node = { kind: 'store' };
    else if (b.kind === 'exit') run.node = exitNode(run);
    return;
  }
  b.visited = true;
  switch (b.kind) {
    case 'fight': {
      const tpl = rng.weighted(SECTORS[run.sector].foes);
      run.node = fightNode(tpl);
      break;
    }
    case 'event':
      run.node = eventNode(run, rng.pick(EVENTS.filter((e) => e.id !== 'merchant' && e.id !== 'trap')).id);
      break;
    case 'distress':
      run.node = eventNode(run, rng.pick(['merchant', 'trap', 'refugees', 'plague']));
      break;
    case 'store':
      b.store = makeStore(run, rng);
      run.node = { kind: 'store' };
      break;
    case 'exit':
      run.node = exitNode(run);
      break;
    default:
      if (rng.chance(0.4)) {
        const n = Math.round(rng.int(6, 12) * scrapMult(run));
        gainScrap(run, n);
        run.fuel++;
        run.node = { kind: 'event', id: 'empty', title: 'Quiet Beacon', icon: '✨', text: 'Nothing here but some floating junk.', choices: [], result: 'You scoop up scrap and a fuel cell.', gains: [`+${n} scrap`, '+1 fuel'] };
      } else run.node = { kind: 'event', id: 'empty', title: 'Empty Beacon', icon: '✨', text: 'This beacon is quiet. Nothing happens.', choices: [{ text: 'Continue', ok: true, act: 'continue' }] };
  }
}

export function fightNode(tpl: string, text?: string): Node {
  const e = ENEMIES[tpl];
  return { kind: 'event', id: 'fight', title: e.name, icon: tpl === 'flagship' ? '🚩' : '⚔️', text: text ?? FIGHT_LINES[tpl] ?? e.text, choices: [{ text: 'Battle stations!', ok: true, act: `fight:${tpl}` }] };
}

export function exitNode(run: RunState): Node {
  const last = run.sector >= SECTORS.length - 1;
  return {
    kind: 'event',
    id: 'exit',
    title: last ? 'Final Beacon' : 'Exit Beacon',
    icon: '⭐',
    text: last ? 'The jump point to the Federation base. The Rebel Flagship guards it. A Federation tender waits to patch 10 hull before the battle.' : 'The jump point to the next sector.',
    choices: [
      { text: last ? 'Face the Rebel Flagship' : `Jump to sector ${run.sector + 2}`, ok: true, act: last ? 'fight:flagship' : 'sector' },
      { text: 'Stay in this sector', ok: true, act: 'continue' },
    ],
  };
}

export function meets(run: RunState, req?: Req): boolean {
  if (!req) return true;
  if (req.race && !run.ship.crew.some((c) => c.race === req.race)) return false;
  if (req.sys) {
    const s = run.ship.systems[req.sys];
    if (!s) return false;
    if (req.lvl && s.level < req.lvl) return false;
    if (!req.lvl && s.level >= SYSTEMS[req.sys].max) return false;
  }
  if (req.scrap && run.scrap < req.scrap) return false;
  if (req.fuel && run.fuel < req.fuel) return false;
  if (req.missiles && run.ship.missiles < req.missiles) return false;
  return true;
}

export function eventNode(run: RunState, id: string): Node {
  const e = EVENT_MAP[id];
  return {
    kind: 'event',
    id,
    title: e.title,
    icon: e.icon,
    text: e.text,
    choices: e.choices.map((ch, i) => ({ text: ch.text + (ch.req?.race ? ` (${RACES[ch.req.race].name})` : ''), ok: meets(run, ch.req), act: `c${i}` })),
  };
}

/** Resolve a choice of the event on screen. */
export function choose(run: RunState, idx: number): void {
  const n = run.node;
  if (!n || n.kind !== 'event' || n.result) return;
  const ch = n.choices[idx];
  if (!ch || !ch.ok) return;
  const act = ch.act;
  if (act === 'continue') {
    run.node = null;
    return;
  }
  if (act === 'sector') {
    enterSector(run, run.sector + 1);
    return;
  }
  if (act === 'fight:flagship') run.ship.hull = Math.min(run.ship.maxHull, run.ship.hull + 10);
  if (act.startsWith('fight:')) {
    startFight(run, act.slice(6), 0);
    return;
  }
  const e = EVENT_MAP[n.id];
  const c = e.choices[Number(act.slice(1))];
  const rng = new Rng(hash(run.seed, run.sector, run.at, run.stats.jumps, 'choice', idx));
  if (c.pay) {
    run.scrap -= c.pay.scrap ?? 0;
    run.fuel -= c.pay.fuel ?? 0;
    run.ship.missiles -= c.pay.missiles ?? 0;
  }
  const out = rng.weighted(c.out);
  const gains = applyOutcome(run, out, rng);
  n.result = out.text;
  n.gains = gains;
  n.next = out.fight ? { fight: out.fight, bonus: out.bonus ?? 0 } : out.store ? { store: true } : undefined;
  if (run.ship.hull <= 0 || run.ship.crew.length === 0) endRun(run, false);
}

/** "Continue" after an event result or a reward. */
export function proceed(run: RunState): void {
  const n = run.node;
  if (!n) return;
  if (n.kind === 'reward') {
    if (n.victory) return;
    run.node = null;
    return;
  }
  if (n.kind === 'store') {
    run.node = null;
    return;
  }
  if (n.next?.fight) {
    startFight(run, n.next.fight === 'sector' ? 'pirate' : n.next.fight, n.next.bonus ?? 0);
    return;
  }
  if (n.next?.store) {
    const b = run.map[run.at];
    b.store = makeStore(run, new Rng(hash(run.seed, run.sector, run.at, 'smuggler')));
    b.kind = 'store';
    run.node = { kind: 'store' };
    return;
  }
  run.node = null;
}

const scrapMult = (run: RunState): number => (run.ship.augments.includes('scrap_arm') ? 1.15 : 1);

function gainScrap(run: RunState, n: number): void {
  run.scrap += n;
  if (n > 0) run.stats.scrap += n;
}

export function randomWeapon(run: RunState, rng: Rng): string {
  const maxTier = Math.min(2, Math.floor(run.sector / 2) + 1);
  return rng.pick(WEAPON_IDS.filter((id) => WEAPONS[id].tier <= maxTier));
}

export function randomRace(rng: Rng): Race {
  return rng.weighted<Race>([['human', 4], ['engi', 2], ['rock', 2], ['zoltan', 2], ['lanius', 1]]);
}

function giveWeapon(run: RunState, id: string): string {
  if (run.ship.weapons.length < MAX_WEAPONS) {
    addWeapon(run.ship, id);
    return `Weapon: ${WEAPONS[id].name}`;
  }
  if (run.cargo.length < MAX_CARGO) {
    run.cargo.push(id);
    return `Weapon to cargo: ${WEAPONS[id].name}`;
  }
  const n = Math.round(WEAPONS[id].cost / 2);
  gainScrap(run, n);
  return `${WEAPONS[id].name} sold (no room): +${n} scrap`;
}

export function giveCrew(run: RunState, race: Race, rng: Rng): string {
  if (run.ship.crew.length >= MAX_CREW) {
    gainScrap(run, 20);
    return 'No room for crew: +20 scrap';
  }
  const used = new Set(run.ship.crew.map((c) => c.name));
  const name = rng.pick(NAMES.filter((n) => !used.has(n)).concat(['Nova']));
  const c = makeCrew(run.ship, race, name);
  run.ship.crew.push(c);
  placeCrew(run.ship, c);
  return `Crew: ${name} the ${RACES[race].name}`;
}

function giveAugment(run: RunState, id: string): string {
  if (run.ship.augments.length >= MAX_AUG || run.ship.augments.includes(id)) {
    const n = Math.round(AUGMENTS[id].cost / 2);
    gainScrap(run, n);
    return `${AUGMENTS[id].name} sold: +${n} scrap`;
  }
  run.ship.augments.push(id);
  return `Augment: ${AUGMENTS[id].name}`;
}

export function applyOutcome(run: RunState, o: Outcome, rng: Rng): string[] {
  const g: string[] = [];
  const s = run.ship;
  if (o.scrap) {
    const n = Math.round(rng.int(o.scrap[0], o.scrap[1]) * scrapMult(run));
    gainScrap(run, n);
    g.push(`+${n} scrap`);
  }
  if (o.fuel) {
    run.fuel += o.fuel;
    g.push(`${o.fuel > 0 ? '+' : ''}${o.fuel} fuel`);
  }
  if (o.missiles) {
    s.missiles += o.missiles;
    g.push(`+${o.missiles} missiles`);
  }
  if (o.hull) {
    s.hull = Math.min(s.maxHull, s.hull + o.hull);
    g.push(`${o.hull > 0 ? '+' : ''}${o.hull} hull`);
  }
  if (o.hurt) {
    s.crew.forEach((c) => (c.hp = Math.max(1, c.hp - o.hurt!)));
    g.push(`Crew hurt (-${o.hurt} HP)`);
  }
  if (o.crewLose && s.crew.length > 1) {
    const c = rng.pick(s.crew);
    s.crew = s.crew.filter((x) => x !== c);
    g.push(`${c.name} died`);
  }
  if (o.crewGain) g.push(giveCrew(run, o.crewGain === 'random' ? randomRace(rng) : o.crewGain, rng));
  if (o.weapon) g.push(giveWeapon(run, o.weapon === 'random' ? randomWeapon(run, rng) : o.weapon));
  if (o.augment) {
    const free = AUG_IDS.filter((a) => !s.augments.includes(a));
    g.push(giveAugment(run, o.augment === 'random' ? rng.pick(free.length ? free : AUG_IDS) : o.augment));
  }
  if (o.upgrade) {
    const sys = s.systems[o.upgrade];
    if (sys && sys.level < SYSTEMS[o.upgrade].max) {
      sys.level++;
      g.push(`${SYSTEMS[o.upgrade].name} level ${sys.level}`);
    }
  }
  if (o.fleet) run.fleet += o.fleet;
  return g;
}

// ---------- Combat ----------

export function startFight(run: RunState, tpl: string, bonus: number): void {
  const rng = new Rng(hash(run.seed, run.sector, run.at, run.stats.jumps, 'enemy', tpl));
  const enemy = makeEnemy(tpl, run.sector, rng);
  run.bonus = bonus;
  run.node = null;
  run.combat = newCombat(run.ship, enemy, tpl, hash(run.seed, run.sector, run.at, run.stats.jumps, 'fight'));
  run.combat.paused = true;
}

/** Turn the finished combat into a reward screen (or the end of the run). */
export function endCombat(run: RunState): void {
  const c = run.combat;
  if (!c || !c.result) return;
  const res = c.result;
  run.combat = null;
  if (res === 'lose') {
    endRun(run, false);
    return;
  }
  cleanUp(run.ship);
  if (res === 'fled') {
    run.stats.fled++;
    run.node = { kind: 'reward', title: 'Escaped', text: 'You jump away from the fight.', gains: [] };
    return;
  }
  run.stats.kills++;
  if (c.tpl === 'flagship') {
    endRun(run, true);
    return;
  }
  const rng = new Rng(hash(run.seed, run.sector, run.at, run.stats.jumps, 'loot'));
  const crewKill = res === 'crew';
  const mult = (crewKill ? 1.5 : 1) * (c.tpl === 'elite' ? 0.8 : 1);
  const o: Outcome = { text: '', scrap: [Math.round((15 + 7 * run.sector) * mult), Math.round((24 + 8 * run.sector) * mult)] };
  if (rng.chance(0.75)) o.fuel = rng.int(1, 3);
  if (rng.chance(0.35)) o.missiles = rng.int(1, 3);
  if (rng.chance(crewKill ? 0.22 : 0.1)) o.weapon = 'random';
  else if (rng.chance(0.05)) o.augment = 'random';
  if (crewKill && rng.chance(0.2)) o.crewGain = 'random';
  const gains = applyOutcome(run, o, rng);
  if (run.bonus) {
    const n = Math.round(run.bonus * scrapMult(run));
    gainScrap(run, n);
    gains.push(`Bonus: +${n} scrap`);
    run.bonus = 0;
  }
  run.node = {
    kind: 'reward',
    title: crewKill ? 'Crew defeated' : 'Ship destroyed',
    text: crewKill ? 'The enemy crew is dead. You strip their ship.' : 'The enemy ship breaks apart. You collect the wreckage.',
    gains,
  };
}

// ---------- Store and upgrades ----------

export function makeStore(run: RunState, rng: Rng): StoreItem[] {
  const items: StoreItem[] = [];
  const maxTier = Math.min(2, Math.floor(run.sector / 2) + 1);
  const ws = rng.shuffle(WEAPON_IDS.filter((id) => WEAPONS[id].tier <= maxTier)).slice(0, 3);
  ws.forEach((id) => items.push({ kind: 'weapon', id, cost: WEAPONS[id].cost }));
  items.push({ kind: 'crew', id: randomRace(rng), cost: 45 + run.sector * 3 });
  const augs = rng.shuffle(AUG_IDS.filter((a) => !run.ship.augments.includes(a))).slice(0, 1);
  augs.forEach((id) => items.push({ kind: 'augment', id, cost: AUGMENTS[id].cost }));
  return items;
}

export const FUEL_COST = 3;
export const MISSILE_COST = 5;
export const hullCost = (run: RunState): number => (run.sector >= 3 ? 3 : 2);

export function buyItem(run: RunState, i: number): string | null {
  const b = run.map[run.at];
  const it = b.store?.[i];
  if (!it || it.sold || run.scrap < it.cost) return null;
  if (it.kind === 'weapon' && run.ship.weapons.length >= MAX_WEAPONS && run.cargo.length >= MAX_CARGO) return null;
  if (it.kind === 'crew' && run.ship.crew.length >= MAX_CREW) return null;
  if (it.kind === 'augment' && run.ship.augments.length >= MAX_AUG) return null;
  run.scrap -= it.cost;
  it.sold = true;
  const rng = new Rng(hash(run.seed, run.sector, run.at, i, 'buy'));
  if (it.kind === 'weapon') return giveWeapon(run, it.id);
  if (it.kind === 'crew') return giveCrew(run, it.id as Race, rng);
  return giveAugment(run, it.id);
}

export function buyFuel(run: RunState): boolean {
  if (run.scrap < FUEL_COST) return false;
  run.scrap -= FUEL_COST;
  run.fuel++;
  return true;
}

export function buyMissile(run: RunState): boolean {
  if (run.scrap < MISSILE_COST) return false;
  run.scrap -= MISSILE_COST;
  run.ship.missiles++;
  return true;
}

export function buyHull(run: RunState, n = 1): number {
  let k = 0;
  while (k < n && run.scrap >= hullCost(run) && run.ship.hull < run.ship.maxHull) {
    run.scrap -= hullCost(run);
    run.ship.hull++;
    k++;
  }
  return k;
}

export const sellPrice = (id: string): number => Math.round(WEAPONS[id].cost / 2);

/** Sell an equipped weapon (`w<i>`) or a cargo weapon (`c<i>`). */
export function sellWeapon(run: RunState, ref: string): boolean {
  const i = Number(ref.slice(1));
  if (ref[0] === 'w') {
    const w = run.ship.weapons[i];
    if (!w || run.ship.weapons.length <= 1) return false;
    run.ship.weapons.splice(i, 1);
    run.scrap += sellPrice(w.id);
    return true;
  }
  const id = run.cargo[i];
  if (!id) return false;
  run.cargo.splice(i, 1);
  run.scrap += sellPrice(id);
  return true;
}

/** Move a weapon between the ship and the cargo hold. */
export function swapWeapon(run: RunState, ref: string): boolean {
  const i = Number(ref.slice(1));
  if (ref[0] === 'w') {
    const w = run.ship.weapons[i];
    if (!w || run.cargo.length >= MAX_CARGO || run.ship.weapons.length <= 1) return false;
    run.ship.weapons.splice(i, 1);
    run.cargo.push(w.id);
    return true;
  }
  const id = run.cargo[i];
  if (!id || run.ship.weapons.length >= MAX_WEAPONS) return false;
  run.cargo.splice(i, 1);
  addWeapon(run.ship, id);
  return true;
}

export function upgradeSys(run: RunState, id: SysId): boolean {
  const s = run.ship.systems[id];
  if (!s || s.level >= SYSTEMS[id].max) return false;
  const cost = upgradeCost(id, s.level);
  if (run.scrap < cost) return false;
  run.scrap -= cost;
  s.level++;
  return true;
}

export function upgradeReactor(run: RunState): boolean {
  if (run.ship.reactor >= REACTOR_MAX) return false;
  const cost = reactorCost(run.ship.reactor);
  if (run.scrap < cost) return false;
  run.scrap -= cost;
  run.ship.reactor++;
  return true;
}

// ---------- End, score, save ----------

export function score(run: RunState, victory: boolean): number {
  return run.stats.scrap + run.stats.kills * 15 + run.sector * 150 + (victory ? 2000 + run.ship.hull * 20 : 0);
}

export function endRun(run: RunState, victory: boolean): void {
  run.combat = null;
  run.over = { victory, score: score(run, victory) };
  run.node = null;
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || run.over || !run.ship || !layoutOf(run.ship.layout)) return null;
    if (run.ship.weapons.some((w) => !WEAPONS[w.id])) return null;
    if (run.combat) run.ship = run.combat.player;
    return run;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, bestSector: 0, best: 0, kills: 0, unlocked: ['kestrel'] };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
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

/** Record a finished run. Returns the names of ships unlocked now. */
export function recordRun(meta: Meta, run: RunState): string[] {
  const v = run.over!;
  meta.runs++;
  if (v.victory) meta.wins++;
  meta.bestSector = Math.max(meta.bestSector, run.sector + 1);
  meta.best = Math.max(meta.best, v.score);
  meta.kills += run.stats.kills;
  const before = new Set(meta.unlocked);
  if (meta.bestSector >= 3) meta.unlocked.push('torus');
  if (meta.bestSector >= 5) meta.unlocked.push('basalt');
  if (meta.wins >= 1) meta.unlocked.push('lantern');
  meta.unlocked = [...new Set(meta.unlocked)];
  return meta.unlocked.filter((id) => !before.has(id)).map((id) => SHIPS.find((s) => s.id === id)!.name);
}
