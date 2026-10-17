/** Run state: floors, rooms, memory, echoes, rewards, score and save data. */
import { ACTS, BARS, FLOORS_PER_ACT, LAST_FLOOR, MAX_LVL, RELICS, SKILLS, TUNE, skillPower } from './data';
import { newFight, type EchoTag, type Fight, type FightKind } from './fight';
import { Rng, hash } from './rng';

export type RoomKind = 'fight' | 'elite' | 'shrine' | 'rest' | 'boss' | 'final';

export interface SkillInst {
  id: string;
  lvl: number;
}

export type EchoState = 'pending' | 'escaped' | 'beaten';

export interface Echo extends EchoTag {
  due: number;
  state: EchoState;
}

export interface Reward {
  source: RoomKind;
  offers: SkillInst[];
  learned: boolean;
  /** Free skill upgrades left (one per defeated echo). */
  upgrades: number;
  relics: string[];
  relicTaken: boolean;
  beaten: number[];
  fled: number[];
  healed: number;
  /** Shrine or rest: the option the player chose. */
  choice?: string;
}

export interface RunState {
  v: 1;
  seed: string;
  bar: string;
  floor: number;
  hp: number;
  maxHp: number;
  slots: number;
  memory: SkillInst[];
  relics: string[];
  echoes: Echo[];
  nextEid: number;
  route: RoomKind[];
  room: RoomKind | null;
  fight: Fight | null;
  reward: Reward | null;
  /** Shrine or rest: true once the player used it. */
  roomDone: boolean;
  stats: { kills: number; fights: number; forgotten: number };
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  bestFloor: number;
  petals: number;
  echoesBeaten: number;
  unlocked: string[];
  muted?: boolean;
}

export const actOf = (floor: number): number => Math.min(ACTS.length, Math.ceil(floor / FLOORS_PER_ACT));
export const floorInAct = (floor: number): number => ((floor - 1) % FLOORS_PER_ACT) + 1;

export function rngFor(r: RunState, ...parts: (string | number)[]): Rng {
  return new Rng(hash(r.seed, ...parts));
}

// ---------- Map ----------

/** The room choices on a floor. The same seed always gives the same choices. */
export function floorChoices(seed: string, floor: number): RoomKind[] {
  if (floor === LAST_FLOOR) return ['final'];
  const fa = floorInAct(floor);
  if (fa === FLOORS_PER_ACT) return ['boss'];
  if (floor === 1) return ['fight'];
  const rng = new Rng(hash(seed, 'map', floor));
  const weights: [RoomKind, number][] = [
    ['fight', 50],
    ['elite', fa >= 3 ? 16 : 0],
    ['shrine', 20],
    ['rest', fa >= 3 ? 16 : 4],
  ];
  const a = rng.weighted(weights);
  let b = rng.weighted(weights.filter(([k]) => k !== a));
  if (fa === FLOORS_PER_ACT - 1 && a !== 'rest') b = 'rest';
  const out = [a, b];
  if (!out.includes('fight') && !out.includes('elite') && fa === 2) out[0] = 'fight';
  return out;
}

export const isFightRoom = (k: RoomKind): boolean => k === 'fight' || k === 'elite' || k === 'boss' || k === 'final';

// ---------- New run ----------

export function newRun(seed: string, barId: string, meta: Meta): RunState {
  const bar = BARS.find((b) => b.id === barId) ?? BARS[0];
  void meta;
  return {
    v: 1,
    seed,
    bar: bar.id,
    floor: 1,
    hp: TUNE.heroHp,
    maxHp: TUNE.heroHp,
    slots: TUNE.startSlots,
    memory: bar.skills.map((id) => ({ id, lvl: 1 })),
    relics: [],
    echoes: [],
    nextEid: 1,
    route: [],
    room: null,
    fight: null,
    reward: null,
    roomDone: false,
    stats: { kills: 0, fights: 0, forgotten: 0 },
  };
}

// ---------- Echoes ----------

export const pendingEchoes = (r: RunState): Echo[] => r.echoes.filter((e) => e.state === 'pending');
export const escapedEchoes = (r: RunState): Echo[] => r.echoes.filter((e) => e.state === 'escaped');
export const beatenEchoes = (r: RunState): Echo[] => r.echoes.filter((e) => e.state === 'beaten');

/** Echoes that join a fight on this floor, oldest first. */
export function dueEchoes(r: RunState, floor = r.floor): Echo[] {
  return pendingEchoes(r)
    .filter((e) => e.due <= floor)
    .sort((a, b) => a.due - b.due || a.eid - b.eid)
    .slice(0, TUNE.maxEchoesPerFight);
}

/** All echoes the final boss calls back. */
export const finalEchoes = (r: RunState): Echo[] =>
  r.echoes.filter((e) => e.state !== 'beaten').sort((a, b) => a.due - b.due || a.eid - b.eid);

export function echoDelay(r: RunState): number {
  return TUNE.echoDelay + (r.relics.includes('lethe') ? 2 : 0);
}

/** The floor where an echo of a skill forgotten now will appear. */
export function dueFloor(r: RunState): number {
  return Math.min(LAST_FLOOR, r.floor + echoDelay(r));
}

/** Forget the skill in memory slot i. It becomes a pending echo. */
export function forget(r: RunState, i: number): Echo {
  const s = r.memory[i];
  r.memory.splice(i, 1);
  const e: Echo = { eid: r.nextEid++, skill: s.id, lvl: s.lvl, forgotOn: r.floor, due: dueFloor(r), state: 'pending' };
  r.echoes.push(e);
  r.stats.forgotten++;
  return e;
}

// ---------- Rooms ----------

function encounter(r: RunState, kind: FightKind): string[] {
  const act = ACTS[actOf(r.floor) - 1];
  const rng = rngFor(r, 'enc', r.floor);
  if (kind === 'boss' || kind === 'final') return [act.boss];
  if (kind === 'elite') return [act.elite];
  const fa = floorInAct(r.floor);
  const n = fa <= 2 ? (r.floor <= 2 ? 1 : rng.int(1, 2)) : fa <= 4 ? 2 : rng.int(2, 3);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(rng.pick(act.pool));
  return out;
}

export function enterRoom(r: RunState, kind: RoomKind): void {
  r.room = kind;
  r.route[r.floor - 1] = kind;
  r.roomDone = false;
  r.reward = null;
  r.fight = null;
  if (!isFightRoom(kind)) return;
  const fk = kind as FightKind;
  let echoes: EchoTag[];
  let reserve: EchoTag[] = [];
  if (fk === 'final') {
    const all = finalEchoes(r);
    echoes = all.slice(0, TUNE.finalEchoesOnField);
    reserve = all.slice(TUNE.finalEchoesOnField);
  } else echoes = dueEchoes(r);
  r.fight = newFight({
    kind: fk,
    act: actOf(r.floor),
    hp: r.hp,
    maxHp: r.maxHp,
    memory: r.memory,
    relics: r.relics,
    monsters: encounter(r, fk),
    echoes: echoes.map((e) => ({ eid: e.eid, skill: e.skill, lvl: e.lvl, forgotOn: e.forgotOn })),
    reserve: reserve.map((e) => ({ eid: e.eid, skill: e.skill, lvl: e.lvl, forgotOn: e.forgotOn })),
  });
  r.stats.fights++;
}

/** Apply the result of a won fight and build the reward. */
export function winFight(r: RunState): Reward {
  const f = r.fight!;
  r.hp = f.hero.hp;
  r.stats.kills += f.kills;
  for (const t of f.beaten) {
    const e = r.echoes.find((x) => x.eid === t.eid);
    if (e) e.state = 'beaten';
  }
  for (const t of f.escaped) {
    const e = r.echoes.find((x) => x.eid === t.eid);
    if (e) e.state = 'escaped';
  }
  let healed = 0;
  if (r.relics.includes('herb')) {
    healed = Math.min(5, r.maxHp - r.hp);
    r.hp += healed;
  }
  const kind = r.room!;
  const rng = rngFor(r, 'reward', r.floor);
  const relicN = kind === 'elite' ? 2 : kind === 'boss' ? 3 : 0;
  const reward: Reward = {
    source: kind,
    offers: skillOffers(r, rng, 3, kind === 'boss' || kind === 'elite' ? 1 : 0),
    learned: false,
    upgrades: f.beaten.length,
    relics: relicOffers(r, rng, relicN),
    relicTaken: relicN === 0,
    beaten: f.beaten.map((t) => t.eid),
    fled: f.escaped.map((t) => t.eid),
    healed,
  };
  r.fight = null;
  r.reward = reward;
  return reward;
}

export function skillPool(r: RunState, meta: Meta): string[] {
  void r;
  return Object.values(SKILLS)
    .filter((s) => !s.unlock || meta.unlocked.includes(s.id))
    .filter((s) => s.id !== 'jab' && s.id !== 'brace')
    .map((s) => s.id);
}

let poolMeta: Meta | null = null;
/** The meta progress used for skill offers (set by the app and the sim). */
export function setPoolMeta(m: Meta): void {
  poolMeta = m;
}

export function skillOffers(r: RunState, rng: Rng, n: number, bonus = 0): SkillInst[] {
  const meta = poolMeta ?? defaultMeta();
  const known = new Set(r.memory.map((m) => m.id));
  const pool = rng.shuffle(skillPool(r, meta).filter((id) => !known.has(id)));
  const act = actOf(r.floor);
  const out: SkillInst[] = [];
  for (const id of pool) {
    if (out.length >= n) break;
    // Strong skills show up less often early.
    if (SKILLS[id].power >= 6 && act === 1 && rng.chance(0.6)) continue;
    let lvl = 1;
    if (act === 2 && rng.chance(0.45)) lvl = 2;
    if (act === 3) lvl = rng.chance(0.35) ? 3 : 2;
    lvl = Math.min(MAX_LVL, lvl + bonus);
    out.push({ id, lvl });
  }
  return out;
}

function relicOffers(r: RunState, rng: Rng, n: number): string[] {
  const pool = rng.shuffle(Object.keys(RELICS).filter((id) => !r.relics.includes(id)));
  return pool.slice(0, n);
}

export function takeRelic(r: RunState, id: string): void {
  r.relics.push(id);
  if (id === 'heart') {
    r.maxHp += 12;
    r.hp += 12;
  }
  if (id === 'palace') r.slots = Math.min(TUNE.maxSlots + 1, r.slots + 1);
}

/** Learn a skill. If memory is full, `forgetIdx` names the skill that becomes an echo. */
export function learn(r: RunState, s: SkillInst, forgetIdx?: number): Echo | null {
  let e: Echo | null = null;
  if (r.memory.length >= r.slots) {
    if (forgetIdx === undefined || forgetIdx < 0 || forgetIdx >= r.memory.length) return null;
    e = forget(r, forgetIdx);
    r.memory.splice(forgetIdx, 0, { ...s });
  } else r.memory.push({ ...s });
  return e;
}

export const canUpgrade = (r: RunState, i: number): boolean => !!r.memory[i] && r.memory[i].lvl < MAX_LVL;

export function upgrade(r: RunState, i: number): boolean {
  if (!canUpgrade(r, i)) return false;
  r.memory[i].lvl++;
  return true;
}

export const canExpand = (r: RunState): boolean => r.slots < TUNE.maxSlots && r.maxHp > TUNE.slotHpCost + 10;

/** One more memory slot for max HP. */
export function expand(r: RunState): boolean {
  if (!canExpand(r)) return false;
  r.slots++;
  r.maxHp -= TUNE.slotHpCost;
  r.hp = Math.min(r.hp, r.maxHp);
  return true;
}

export function restHeal(r: RunState): number {
  const n = Math.min(r.maxHp - r.hp, Math.round(r.maxHp * TUNE.restHeal));
  r.hp += n;
  return n;
}

export function shrineOffers(r: RunState): SkillInst[] {
  return skillOffers(r, rngFor(r, 'shrine', r.floor), 3, 1);
}

export function nextFloor(r: RunState): void {
  r.floor++;
  r.room = null;
  r.fight = null;
  r.reward = null;
  r.roomDone = false;
}

export function memoryPower(r: RunState): number {
  return r.memory.reduce((a, m) => a + skillPower(m.id, m.lvl), 0);
}

// ---------- Score and save data ----------

export function score(r: RunState, won: boolean): number {
  const floors = won ? LAST_FLOOR : r.floor - 1;
  return floors * 10 + r.stats.kills * 3 + beatenEchoes(r).length * 20 + (won ? 400 + r.hp * 3 : 0);
}

export const petalsFor = (s: number): number => Math.floor(s / 40);

const RUN_KEY = 'forget.run';
const META_KEY = 'forget.meta';

export function defaultMeta(): Meta {
  return { runs: 0, wins: 0, best: 0, bestFloor: 0, petals: 0, echoesBeaten: 0, unlocked: [] };
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r && r.v === 1 && Array.isArray(r.memory) ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* storage full or blocked */
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* blocked */
  }
}

export function loadMeta(): Meta {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return { ...defaultMeta(), ...(JSON.parse(s) as Partial<Meta>) };
  } catch {
    /* blocked */
  }
  return defaultMeta();
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* blocked */
  }
}

/** Unlock costs on the title screen: skills and starting bars. */
export function unlockList(): { id: string; icon: string; name: string; text: string; cost: number }[] {
  const out = Object.values(SKILLS)
    .filter((s) => s.unlock)
    .map((s) => ({ id: s.id, icon: s.icon, name: s.name, text: `New skill in offers.`, cost: s.unlock! }));
  for (const b of BARS) if (b.unlock) out.push({ id: b.id, icon: b.icon, name: `${b.name} bar`, text: b.text, cost: b.unlock });
  return out.sort((a, b) => a.cost - b.cost);
}
