/** Run state: floors, doors, rooms, shop, rewards and score. Pure functions, no DOM. */
import { FINAL, FLOORS, GEAR, GEAR_IDS, MODS, STEPS_PER_FLOOR, TOOLS, type GearId, type ModId, type RoomKind, type ToolId } from './data';
import { newLock, toolCost, triesLeft, triesMax, useTool, type Lock, type LockSpec } from './lock';
import { hash, Rng } from './rng';

export interface Door {
  room: RoomKind;
  spec: LockSpec;
}

export type Reward = { kind: 'energy'; n: number } | { kind: 'heal'; n: number } | { kind: 'maxheart' } | { kind: 'gear'; id: GearId };

export interface ShopItem {
  reward: Reward;
  price: number;
  sold: boolean;
}

export type Room =
  | { kind: 'loot'; offers: Reward[]; rich: boolean }
  | { kind: 'shop'; items: ShopItem[] }
  | { kind: 'trap'; cost: number }
  | { kind: 'vault'; offers: Reward[] };

export interface RunStats {
  opened: number;
  failed: number;
  guesses: number;
  tools: number;
  energyEarned: number;
  fastest: number;
}

export interface Run {
  seed: string;
  /** Counter for derived RNGs, so a saved run continues the same way. */
  n: number;
  floor: number;
  step: number;
  tumbler: number;
  hearts: number;
  maxHearts: number;
  energy: number;
  gear: GearId[];
  tools: ToolId[];
  mods: ModId[];
  lens: boolean;
  doors: Door[];
  door: Door | null;
  lock: Lock | null;
  room: Room | null;
  phase: 'map' | 'lock' | 'room' | 'done';
  won: boolean;
  stats: RunStats;
  /** Last lock result, for the result banner. */
  last: { won: boolean; energy: number; tries: number } | null;
}

export interface RunOptions {
  unlocks: readonly string[];
  bestFloor: number;
}

export const rngOf = (r: Run, tag: string): Rng => new Rng(hash(r.seed, tag, r.n++));
export const has = (r: Run, id: GearId): boolean => r.gear.includes(id);
export const isFinal = (r: Run): boolean => r.floor >= FLOORS.length;

export function newRun(seed: string, o: RunOptions): Run {
  const r: Run = {
    seed,
    n: 0,
    floor: 0,
    step: 0,
    tumbler: 0,
    hearts: 3,
    maxHearts: 3,
    energy: 4,
    gear: [],
    tools: TOOLS.filter((t) => !t.unlock || o.unlocks.includes(t.unlock)).map((t) => t.id),
    mods: (Object.keys(MODS) as ModId[]).filter((m) => m !== 'none' && MODS[m].needFloor <= o.bestFloor),
    lens: o.unlocks.includes('lens'),
    doors: [],
    door: null,
    lock: null,
    room: null,
    phase: 'map',
    won: false,
    stats: { opened: 0, failed: 0, guesses: 0, tools: 0, energyEarned: 0, fastest: 99 },
    last: null,
  };
  if (o.unlocks.includes('energy')) r.energy += 4;
  if (o.unlocks.includes('heart')) {
    r.maxHearts++;
    r.hearts++;
  }
  if (o.unlocks.includes('kit')) addGear(r, rngOf(r, 'kit').pick(GEAR_IDS));
  r.doors = makeDoors(r);
  return r;
}

function pickMod(r: Run, rng: Rng, chance: number): ModId {
  if (!r.mods.length || !rng.chance(chance)) return 'none';
  return rng.pick(r.mods);
}

/** Adds the extra tries of the lock rule. */
function withMod(s: LockSpec): LockSpec {
  s.limit += MODS[s.mod].tries;
  return s;
}

/** Door choices for the current step. The last step of a floor is the floor vault. */
export function makeDoors(r: Run): Door[] {
  const rng = rngOf(r, 'doors');
  if (isFinal(r)) return [];
  const f = FLOORS[r.floor];
  if (r.step >= STEPS_PER_FLOOR) {
    const v = f.vault;
    return [{ room: 'vault', spec: withMod({ len: v.len, colors: v.colors, rep: v.rep, limit: v.limit, mod: v.mod ? pickMod(r, rng, 1) : 'none', kind: 'vault' }) }];
  }
  const rooms: RoomKind[] = [];
  if (r.step === 1) rooms.push('shop');
  while (rooms.length < 3) rooms.push(rng.weighted<RoomKind>([['loot', 4], ['mystery', 3], ['shop', r.step === 1 ? 0 : 2]]));
  rng.shuffle(rooms);
  return rooms.map((room) => {
    const spec = withMod({ len: f.len, colors: f.colors, rep: rng.chance(f.rep), limit: f.limit, mod: pickMod(r, rng, f.modChance), kind: 'door' });
    // Mystery doors hide a harder lock: one more color.
    if (room === 'mystery' && spec.colors < 8) spec.colors++;
    return { room, spec };
  });
}

export function chooseDoor(r: Run, i: number): void {
  const d = r.doors[i];
  if (!d || r.phase !== 'map') return;
  r.door = d;
  r.lock = newLock(d.spec, rngOf(r, 'lock'), r.gear);
  r.phase = 'lock';
}

function finalSpec(r: Run, rng: Rng): LockSpec {
  const t = FINAL[r.tumbler];
  return withMod({ len: t.len, colors: t.colors, rep: t.rep, limit: t.limit, mod: r.tumbler === 0 ? 'none' : pickMod(r, rng, 1), kind: 'final' });
}

function startFinal(r: Run): void {
  const spec = finalSpec(r, rngOf(r, 'final'));
  r.door = { room: 'vault', spec };
  r.lock = newLock(spec, rngOf(r, 'lock'), r.gear);
  r.phase = 'lock';
}

/** Energy for opening the current lock. */
export function lockReward(r: Run, l: Lock): number {
  const left = triesLeft(l);
  let e = 1 + left + MODS[l.spec.mod].bonus;
  if (has(r, 'battery')) e += 2;
  if (has(r, 'echo') && left * 2 >= triesMax(l)) e += 3;
  if (l.spec.kind !== 'door') e += 2;
  return e;
}

/** Spends energy and uses a tool on the open lock. */
export function runTool(r: Run, id: ToolId, sel?: { pos: number; color: number | null }): { ok: boolean; msg: string; pos?: number; color?: number } {
  const l = r.lock;
  if (!l || r.phase !== 'lock') return { ok: false, msg: 'No lock.' };
  if (!r.tools.includes(id)) return { ok: false, msg: 'Locked tool.' };
  const cost = toolCost(l, id);
  if (r.energy < cost) return { ok: false, msg: `Needs ${cost} energy.` };
  const res = useTool(l, id, rngOf(r, 'tool'), sel);
  if (res.ok) {
    r.energy -= cost;
    r.stats.tools++;
  }
  return res;
}

/** Call after the lock is won or lost. Moves the run on. */
export function finishLock(r: Run): void {
  const l = r.lock!;
  const d = r.door!;
  r.stats.guesses += l.guesses.length;
  if (l.state === 'won') {
    const e = lockReward(r, l);
    r.energy += e;
    r.stats.energyEarned += e;
    r.stats.opened++;
    r.stats.fastest = Math.min(r.stats.fastest, l.guesses.length);
    r.last = { won: true, energy: e, tries: l.guesses.length };
    r.lock = null;
    if (d.spec.kind === 'final') {
      r.tumbler++;
      if (r.tumbler >= FINAL.length) {
        r.won = true;
        r.phase = 'done';
        return;
      }
      startFinal(r);
      return;
    }
    enterRoom(r, d.room);
    return;
  }
  r.stats.failed++;
  r.hearts--;
  r.last = { won: false, energy: 0, tries: l.guesses.length };
  r.lock = null;
  if (r.hearts <= 0) {
    r.phase = 'done';
    return;
  }
  if (d.spec.kind === 'door') {
    advance(r);
    return;
  }
  // Vaults must be opened: a new code, the same rules.
  const spec = d.spec.kind === 'final' ? finalSpec(r, rngOf(r, 'final')) : d.spec;
  r.door = { room: d.room, spec };
  r.lock = newLock(spec, rngOf(r, 'lock'), r.gear);
  r.phase = 'lock';
}

function gearOffers(r: Run, rng: Rng, n: number): GearId[] {
  const pool = rng.shuffle(GEAR_IDS.filter((g) => !r.gear.includes(g)));
  return pool.slice(0, n);
}

function enterRoom(r: Run, kind: RoomKind): void {
  const rng = rngOf(r, 'room');
  if (has(r, 'piggy')) {
    r.energy += 2;
    r.stats.energyEarned += 2;
  }
  const fl = r.floor;
  r.phase = 'room';
  if (kind === 'vault') {
    const offers: Reward[] = gearOffers(r, rng, 3).map((id) => ({ kind: 'gear', id }));
    while (offers.length < 3) offers.push({ kind: 'energy', n: 8 + fl * 3 });
    r.room = { kind: 'vault', offers };
    return;
  }
  if (kind === 'shop') {
    const items: ShopItem[] = gearOffers(r, rng, 3).map((id) => ({ reward: { kind: 'gear', id }, price: GEAR[id].price + fl * 2, sold: false }));
    items.push({ reward: { kind: 'heal', n: 1 }, price: 8 + fl * 3, sold: false });
    r.room = { kind: 'shop', items };
    return;
  }
  const rich = kind === 'mystery';
  if (rich && rng.chance(0.45)) {
    r.room = { kind: 'trap', cost: 5 + fl * 2 };
    return;
  }
  const offers: Reward[] = [{ kind: 'energy', n: (rich ? 8 : 4) + fl * 2 + rng.int(0, 2) }];
  const g = gearOffers(r, rng, 1)[0];
  if (g && (rich || rng.chance(0.35))) offers.push({ kind: 'gear', id: g });
  offers.push(rich ? { kind: 'maxheart' } : { kind: 'heal', n: 1 });
  if (offers.length < 3) offers.push({ kind: 'energy', n: 3 + fl + rng.int(0, 2) });
  r.room = { kind: 'loot', offers, rich };
}

export function addGear(r: Run, id: GearId): void {
  if (r.gear.includes(id)) return;
  r.gear.push(id);
  if (id === 'plating') {
    r.maxHearts++;
    r.hearts = Math.min(r.maxHearts, r.hearts + 1);
  }
}

export function applyReward(r: Run, w: Reward): void {
  if (w.kind === 'energy') {
    r.energy += w.n;
    r.stats.energyEarned += w.n;
  } else if (w.kind === 'heal') r.hearts = Math.min(r.maxHearts, r.hearts + w.n);
  else if (w.kind === 'maxheart') {
    r.maxHearts++;
    r.hearts++;
  } else addGear(r, w.id);
}

export function rewardText(w: Reward): { icon: string; name: string; text: string } {
  if (w.kind === 'energy') return { icon: '⚡', name: `+${w.n} energy`, text: 'Spend it on tools and in shops.' };
  if (w.kind === 'heal') return { icon: '❤️', name: `Heal ${w.n}`, text: 'Get back a heart.' };
  if (w.kind === 'maxheart') return { icon: '💖', name: '+1 max heart', text: 'One more heart, filled.' };
  const g = GEAR[w.id];
  return { icon: g.icon, name: g.name, text: g.text };
}

/** Loot: take one offer. Vault: take one gear. */
export function pickOffer(r: Run, i: number): void {
  const room = r.room;
  if (!room) return;
  if (room.kind !== 'loot' && room.kind !== 'vault') return;
  if (room.offers[i]) applyReward(r, room.offers[i]);
  else if (room.offers.length) return;
  leaveRoom(r);
}

export function buy(r: Run, i: number): boolean {
  const room = r.room;
  if (!room || room.kind !== 'shop') return false;
  const it = room.items[i];
  if (!it || it.sold || r.energy < it.price) return false;
  if (it.reward.kind === 'heal' && r.hearts >= r.maxHearts) return false;
  r.energy -= it.price;
  applyReward(r, it.reward);
  if (it.reward.kind !== 'heal') it.sold = true;
  return true;
}

/** Trap: pay energy to disarm it, or take one heart of damage. */
export function resolveTrap(r: Run, pay: boolean): void {
  const room = r.room;
  if (!room || room.kind !== 'trap') return;
  if (pay && r.energy >= room.cost) r.energy -= room.cost;
  else r.hearts--;
  if (r.hearts <= 0) {
    r.room = null;
    r.phase = 'done';
    return;
  }
  leaveRoom(r);
}

export function leaveRoom(r: Run): void {
  const wasVault = r.room?.kind === 'vault';
  r.room = null;
  if (wasVault) {
    r.floor++;
    r.step = 0;
    if (isFinal(r)) {
      startFinal(r);
      return;
    }
    r.doors = makeDoors(r);
    r.phase = 'map';
    return;
  }
  advance(r);
}

function advance(r: Run): void {
  r.step++;
  r.doors = makeDoors(r);
  r.door = null;
  r.phase = 'map';
}

/** Floors fully cleared (the final vault counts as one more). */
export const floorsDone = (r: Run): number => r.floor + (r.won ? 1 : 0);

export function score(r: Run): number {
  let s = r.stats.opened * 20 + r.floor * 100 + r.stats.energyEarned;
  if (r.won) s += 400 + r.hearts * 50;
  return s;
}

/** Keys for the meta shop. */
export const keysFor = (score: number): number => Math.floor(score / 80);
