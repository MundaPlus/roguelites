import { ENEMIES, FLOORS, enemyPool, type EnemyDef } from './enemies';
import { EQUIP, REWARD_POOL, getEquip } from './equipment';
import { RELICS, RELIC_IDS } from './relics';
import { Rng, hash } from './rng';
import { D6, type ClassId, type OwnedEquip, type RoomType } from './types';

export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string;
  hp: number;
  dice: number;
  cap: number;
  kit: string[];
  perk: string;
  perkText: string;
  /** Best floor reached that unlocks this class. */
  unlock: number;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Warrior', icon: '🛡️', hp: 44, dice: 2, cap: 6,
    kit: ['broadsword', 'buckler', 'spear'],
    perk: 'second-wind', perkText: 'Second Wind: the first time your HP drops below half in a fight, gain 8 shield.',
    unlock: 0,
  },
  thief: {
    id: 'thief', name: 'Thief', icon: '🗝️', hp: 36, dice: 2, cap: 6,
    kit: ['dagger', 'lockpick', 'rapier'],
    perk: 'reroll', perkText: 'Quick Hands: reroll up to 2 dice each turn.',
    unlock: 2,
  },
  inventor: {
    id: 'inventor', name: 'Inventor', icon: '⚙️', hp: 34, dice: 3, cap: 6,
    kit: ['spatula', 'hammer', 'war-hammer', 'buckler'],
    perk: 'tinker', perkText: 'Tinker: each die put into a Σ slot counts 1 more. Starts with 3 dice.',
    unlock: 4,
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

/** Room choices for each step of a floor. One choice means no choice. */
export const PLAN: RoomType[][] = [['fight'], ['fight', 'event'], ['elite', 'shop'], ['fight', 'event'], ['rest', 'shop'], ['boss']];

export const ROOM_INFO: Record<RoomType, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'A monster blocks the way. Win to choose a reward.' },
  elite: { icon: '😈', name: 'Elite', text: 'A strong monster. Better rewards and a relic.' },
  boss: { icon: '💀', name: 'Boss', text: 'The guardian of this floor.' },
  event: { icon: '❓', name: 'Event', text: 'Something strange. Could be good, could be bad.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy equipment, relics and dice upgrades.' },
  rest: { icon: '🔥', name: 'Campfire', text: 'Heal, or upgrade one equipment.' },
};

export interface RunState {
  v: 1;
  seed: string;
  cls: ClassId;
  floor: number;
  step: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** Faces of each die. 0 is a wild face. */
  dice: number[][];
  equipment: OwnedEquip[];
  relics: string[];
  kills: number;
}

export interface Meta {
  bestFloor: number;
  wins: number;
  runs: number;
  best: number;
}

const RUN_KEY = 'dd-run';
const META_KEY = 'dd-meta';

export function newRun(cls: ClassId, seed: string): RunState {
  const c = CLASSES[cls];
  const run: RunState = {
    v: 1, seed, cls, floor: 1, step: 0, hp: c.hp, maxHp: c.hp, gold: 0,
    dice: Array.from({ length: c.dice }, () => [...D6]),
    equipment: [], relics: [], kills: 0,
  };
  for (const id of c.kit) addEquip(run, id);
  return run;
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const hasRelic = (run: RunState, id: string): boolean => run.relics.includes(id);

export const capacity = (run: RunState): number => CLASSES[run.cls].cap + (hasRelic(run, 'backpack') ? 2 : 0);

export const usedSpace = (run: RunState): number =>
  run.equipment.filter((e) => e.on).reduce((a, e) => a + getEquip(e.id).size, 0);

/** Add equipment. It goes into the backpack if it fits, else into the stash. */
export function addEquip(run: RunState, id: string, lvl = 0): boolean {
  const fits = usedSpace(run) + getEquip(id).size <= capacity(run);
  run.equipment.push({ id, lvl, on: fits });
  return fits;
}

export function toggleEquip(run: RunState, i: number): string | null {
  const e = run.equipment[i];
  if (!e) return null;
  if (e.on) {
    e.on = false;
    return null;
  }
  if (usedSpace(run) + getEquip(e.id).size > capacity(run)) return 'Not enough space in the backpack.';
  e.on = true;
  return null;
}

export function perks(run: RunState): Set<string> {
  return new Set([CLASSES[run.cls].perk, ...run.relics]);
}

export function addRelic(run: RunState, id: string): void {
  if (!run.relics.includes(id)) run.relics.push(id);
}

export function randomRelic(run: RunState, rng: Rng): string | null {
  const left = RELIC_IDS.filter((id) => !run.relics.includes(id));
  return left.length ? rng.pick(left) : null;
}

export function relicChoices(run: RunState, rng: Rng, n: number): string[] {
  return rng.shuffle(RELIC_IDS.filter((id) => !run.relics.includes(id))).slice(0, n);
}

/** Replace the lowest face of a die. face 0 makes a wild face. */
export function applyFace(run: RunState, di: number, face: number): boolean {
  const faces = run.dice[di];
  if (!faces) return false;
  let low = -1;
  for (let i = 0; i < faces.length; i++) {
    if (faces[i] === 0) continue;
    if (low < 0 || faces[i] < faces[low]) low = i;
  }
  if (low < 0 || (face !== 0 && faces[low] >= face)) return false;
  faces[low] = face;
  return true;
}

export const canFace = (run: RunState, face: number): boolean =>
  run.dice.some((f) => f.some((v) => v !== 0 && (face === 0 || v < face)));

export const upgradable = (run: RunState): number[] =>
  run.equipment.map((e, i) => (e.lvl === 0 ? i : -1)).filter((i) => i >= 0);

export function encounter(run: RunState, room: RoomType): EnemyDef {
  const tier = room === 'boss' ? 'boss' : room === 'elite' ? 'elite' : 'normal';
  const pool = enemyPool(run.floor, tier);
  return rngFor(run, 'enc', run.floor, run.step).pick(pool);
}

// ---------- Rewards ----------

export type Pick =
  | { t: 'equip'; id: string }
  | { t: 'upgrade' }
  | { t: 'face'; face: number }
  | { t: 'maxhp'; n: number }
  | { t: 'relic'; id: string }
  | { t: 'die' };

export interface Rewards {
  gold: number;
  relic: string | null;
  bonus: string[];
  picks: Pick[];
}

function equipChoices(run: RunState, rng: Rng, n: number, rareChance: number): string[] {
  const out: string[] = [];
  const owned = new Set(run.equipment.map((e) => e.id));
  for (let tries = 0; out.length < n && tries < 100; tries++) {
    const rare = rng.chance(rareChance);
    const pool = REWARD_POOL.filter((id) => {
      const r = EQUIP[id].rarity;
      return (rare ? r === 'rare' : r !== 'rare') && !out.includes(id) && !owned.has(id);
    });
    if (pool.length) out.push(rng.pick(pool));
  }
  return out;
}

function extraPick(run: RunState, rng: Rng): Pick {
  const opts: Pick[] = [{ t: 'maxhp', n: 4 }];
  if (canFace(run, 6)) opts.push({ t: 'face', face: 6 }, { t: 'face', face: 6 });
  if (canFace(run, 0)) opts.push({ t: 'face', face: 0 });
  if (upgradable(run).length) opts.push({ t: 'upgrade' }, { t: 'upgrade' });
  return rng.pick(opts);
}

export function fightRewards(run: RunState, room: RoomType): Rewards {
  const rng = rngFor(run, 'reward', run.floor, run.step);
  const purse = hasRelic(run, 'coin-purse') ? 1.5 : 1;
  if (room === 'boss') {
    const bonus: string[] = [];
    if (run.floor === 1 || run.floor === 3) bonus.push('die');
    else bonus.push('maxhp');
    return {
      gold: Math.round(35 * purse), relic: null, bonus,
      picks: relicChoices(run, rng, 3).map((id) => ({ t: 'relic', id }) as Pick),
    };
  }
  const elite = room === 'elite';
  const gold = Math.round(rng.int(elite ? 20 : 9, elite ? 28 : 15) * purse);
  const picks: Pick[] = equipChoices(run, rng, 2, elite ? 0.35 : 0.12).map((id) => ({ t: 'equip', id }) as Pick);
  picks.push(extraPick(run, rng));
  return { gold, relic: elite ? randomRelic(run, rng) : null, bonus: [], picks };
}

// ---------- Shop ----------

export interface ShopItem {
  kind: 'equip' | 'relic' | 'face6' | 'wild' | 'heal' | 'upgrade' | 'die';
  id?: string;
  price: number;
  sold: boolean;
}

export const equipPrice = (id: string): number => ({ start: 28, common: 38, rare: 62, enemy: 99 })[getEquip(id).rarity];

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.floor, run.step);
  const items: ShopItem[] = equipChoices(run, rng, 4, 0.25).map((id) => ({ kind: 'equip', id, price: equipPrice(id), sold: false }));
  const relic = randomRelic(run, rng);
  if (relic) items.push({ kind: 'relic', id: relic, price: 85, sold: false });
  items.push({ kind: 'face6', price: 32, sold: false });
  items.push({ kind: 'wild', price: 50, sold: false });
  items.push({ kind: 'upgrade', price: 45, sold: false });
  items.push({ kind: 'heal', price: 18, sold: false });
  if (run.floor >= 2 && run.dice.length < 5) items.push({ kind: 'die', price: 140, sold: false });
  return items;
}

// ---------- Events ----------

export interface EventOption {
  label: string;
  can?: (run: RunState) => boolean;
  /** Returns the result text. */
  run: (run: RunState, rng: Rng) => string;
}

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  options: EventOption[];
}

const leave: EventOption = { label: 'Leave', run: () => 'You walk on.' };

function upgradeRandom(run: RunState, rng: Rng): string {
  const list = upgradable(run);
  if (!list.length) return 'Nothing could be upgraded.';
  const e = run.equipment[rng.pick(list)];
  e.lvl = 1;
  return `${getEquip(e.id).name} is now upgraded.`;
}

export const EVENTS: EventDef[] = [
  {
    id: 'shrine', icon: '⛩️', title: 'Shrine of Blades',
    text: 'A shrine covered in old swords. A voice asks for blood.',
    options: [
      { label: 'Give 8 HP: upgrade a random equipment', can: (r) => r.hp > 8 && upgradable(r).length > 0, run: (r, rng) => ((r.hp -= 8), upgradeRandom(r, rng)) },
      leave,
    ],
  },
  {
    id: 'gambler', icon: '🎩', title: 'The Gambler',
    text: 'A man in a tall hat shakes two dice. "Double or nothing, friend?"',
    options: [
      {
        label: 'Bet 20 gold', can: (r) => r.gold >= 20,
        run: (r, rng) => {
          if (rng.chance(0.5)) {
            r.gold += 30;
            return 'Sevens! You win 50 gold back.';
          }
          r.gold -= 20;
          return 'Snake eyes. You lose 20 gold.';
        },
      },
      leave,
    ],
  },
  {
    id: 'fountain', icon: '⛲', title: 'Clear Fountain',
    text: 'Cold, clean water in a dark cave.',
    options: [
      { label: 'Drink: heal 14 HP', run: (r) => ((r.hp = Math.min(r.maxHp, r.hp + 14)), 'You feel better.') },
      { label: 'Fill a flask: +4 max HP', run: (r) => ((r.maxHp += 4), (r.hp += 4), 'You will need this later.') },
    ],
  },
  {
    id: 'chest', icon: '🧰', title: 'Old Chest',
    text: 'A chest with a rusty lock. Something rattles inside.',
    options: [
      {
        label: 'Open it',
        run: (r, rng) => {
          if (rng.chance(0.25)) {
            r.hp = Math.max(1, r.hp - 7);
            return 'It bites! Lose 7 HP.';
          }
          const id = randomRelic(r, rng);
          if (!id) return ((r.gold += 40), 'You find 40 gold.');
          addRelic(r, id);
          return `You find a relic: ${RELICS[id].name}.`;
        },
      },
      { label: 'Take the gold coins on top (25 gold)', run: (r) => ((r.gold += 25), 'You take 25 gold.') },
    ],
  },
  {
    id: 'strange-die', icon: '🎲', title: 'A Strange Die',
    text: 'A glowing die sits on a pedestal. One face is blank.',
    options: [
      {
        label: 'Take it: one die gets a wild face, lose 5 max HP', can: (r) => r.maxHp > 10 && canFace(r, 0),
        run: (r, rng) => {
          const order = rng.shuffle(r.dice.map((_, i) => i));
          for (const i of order) if (applyFace(r, i, 0)) break;
          r.maxHp -= 5;
          r.hp = Math.min(r.hp, r.maxHp);
          return 'One of your dice now has a wild face. You can set it to any value.';
        },
      },
      leave,
    ],
  },
  {
    id: 'smith', icon: '⚒️', title: 'Wandering Smith',
    text: 'A dwarf with a portable anvil. "I can make that better. For a price."',
    options: [
      { label: 'Pay 30 gold: upgrade a random equipment', can: (r) => r.gold >= 30 && upgradable(r).length > 0, run: (r, rng) => ((r.gold -= 30), upgradeRandom(r, rng)) },
      { label: 'Sharpen for free: one die gets a 6 face', can: (r) => canFace(r, 6), run: (r, rng) => {
        const order = rng.shuffle(r.dice.map((_, i) => i));
        for (const i of order) if (applyFace(r, i, 6)) return 'One die face is now a 6.';
        return 'Nothing happens.';
      } },
      leave,
    ],
  },
  {
    id: 'ghost', icon: '👻', title: 'Restless Ghost',
    text: 'A ghost points at its lost sword on the floor.',
    options: [
      {
        label: 'Take the sword (gain a random equipment, lose 6 HP)', can: (r) => r.hp > 6,
        run: (r, rng) => {
          const pool = REWARD_POOL.filter((id) => !r.equipment.some((e) => e.id === id));
          const id = rng.pick(pool.length ? pool : REWARD_POOL);
          r.hp -= 6;
          const fits = addEquip(r, id);
          return `You take ${getEquip(id).name}${fits ? '' : ' (it goes to the stash)'}. The ghost screams.`;
        },
      },
      { label: 'Bury it (heal 6 HP)', run: (r) => ((r.hp = Math.min(r.maxHp, r.hp + 6)), 'The ghost smiles and fades.') },
    ],
  },
];

export const pickEvent = (run: RunState): EventDef => rngFor(run, 'event', run.floor, run.step).pick(EVENTS);

// ---------- Save data ----------

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
    if (run.v !== 1 || !CLASSES[run.cls] || run.equipment.some((e) => !EQUIP[e.id])) return null;
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
  const base: Meta = { bestFloor: 1, wins: 0, runs: 0, best: 0 };
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

export const score = (run: RunState, victory: boolean): number =>
  (run.floor - 1) * 150 + run.step * 20 + run.kills * 10 + run.gold + (victory ? 1000 : 0);

export { ENEMIES, FLOORS };
