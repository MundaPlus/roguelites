/** Run state, door generation, rewards, shop, score and save data. */
import { BASE_SPELLS, CHARMS, FLOORS, MONSTERS, START, UNLOCKS, type Trait } from './data';
import { givensFor, pickFog, randomGrid } from './nonogram';
import { PICTURES, PIC_BY_ID, picSize, picSolution, type PicKind } from './pictures';
import { newPuzzle, type Puzzle } from './puzzle';
import { Rng, hash, randomSeedText } from './rng';

export type DoorKind = 'monster' | 'chest' | 'key' | 'mystery' | 'rune' | 'shrine' | 'shop' | 'vault' | 'guardian';

export interface Door {
  kind: DoorKind;
  size: number;
  pic: string | null;
}

export interface Reward {
  lines: string[];
  charms: string[];
  picked: boolean;
}

export interface ShopItem {
  id: 'heal' | 'maxhp' | 'mana' | 'key' | 'charm';
  charm?: string;
  cost: number;
  sold: boolean;
}

export interface Room {
  door: Door;
  puzzle: Puzzle | null;
  reward: Reward | null;
  shop: ShopItem[] | null;
  /** Vault charm choices. */
  choices: string[];
  /** Vault and shrine: done after the choice. */
  used: boolean;
}

export interface Stats {
  solved: number;
  clean: number;
  mistakes: number;
  kills: number;
  pics: string[];
}

export interface RunState {
  v: 1;
  seed: string;
  floor: number;
  step: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  gold: number;
  keys: number;
  charms: string[];
  spells: string[];
  packs: string[];
  doors: Door[];
  room: Room | null;
  stats: Stats;
  result: 'win' | 'lose' | null;
}

export interface Meta {
  shards: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestFloor: number;
  best: number;
  pics: string[];
  muted?: boolean;
}

/** Choice steps per floor. The guardian comes after them. */
export const STEPS = 2;

const RUN_KEY = 'pixel-oracle.run';
const META_KEY = 'pixel-oracle.meta';

export const DOOR_INFO: Record<DoorKind, { icon: string; name: string; text: string }> = {
  monster: { icon: '⚔️', name: 'Monster', text: 'A fight. Each mistake costs the monster damage. Drops gold.' },
  chest: { icon: '🧰', name: 'Chest', text: 'Gold, and maybe a charm or a potion.' },
  key: { icon: '🗝️', name: 'Key', text: 'Solve it for a key. Keys open vaults.' },
  mystery: { icon: '❓', name: 'Mystery', text: 'A hidden picture. Its picture decides the prize.' },
  rune: { icon: '🔣', name: 'Rune', text: 'A random rune grid. Gives extra mana.' },
  shrine: { icon: '⛩️', name: 'Shrine', text: 'Refill all HP.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Spend gold on healing, mana and charms.' },
  vault: { icon: '🔐', name: 'Vault', text: 'Use a key. Choose 1 of 3 charms.' },
  guardian: { icon: '👑', name: 'Guardian', text: 'The floor boss. Beat it to go up.' },
};

export const MYSTERY_KINDS: PicKind[] = ['treasure', 'potion', 'mana', 'charm', 'key'];

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const isPuzzleDoor = (k: DoorKind): boolean => !['shrine', 'shop', 'vault'].includes(k);

export function newRun(meta: Meta, seed = randomSeedText()): RunState {
  const run: RunState = {
    v: 1,
    seed,
    floor: 0,
    step: 0,
    hp: START.hp,
    maxHp: START.hp,
    mana: START.mana,
    maxMana: START.maxMana,
    gold: 0,
    keys: 0,
    charms: [],
    spells: [...BASE_SPELLS, ...UNLOCKS.filter((u) => u.kind === 'spell' && meta.unlocked.includes(u.id)).map((u) => u.id)],
    packs: ['base', ...UNLOCKS.filter((u) => u.kind === 'pack' && meta.unlocked.includes(u.id)).map((u) => u.id)],
    doors: [],
    room: null,
    stats: { solved: 0, clean: 0, mistakes: 0, kills: 0, pics: [] },
    result: null,
  };
  run.doors = makeDoors(run);
  return run;
}

/** Pick a picture of a kind for this floor. Unseen pictures come first. */
function pickPic(run: RunState, rng: Rng, kinds: PicKind[], taken: Set<string>): string | null {
  const fl = FLOORS[run.floor];
  const maxSize = Math.max(...fl.sizes);
  let pool = PICTURES.filter((p) => kinds.includes(p.kind) && run.packs.includes(p.pack));
  if (kinds.includes('monster')) pool = pool.filter((p) => !FLOORS.some((f) => f.guardian === p.id));
  let fit = pool.filter((p) => fl.sizes.includes(picSize(p)));
  if (!fit.length) {
    const smaller = pool.filter((p) => picSize(p) <= maxSize);
    const top = Math.max(...smaller.map(picSize));
    fit = smaller.filter((p) => picSize(p) === top);
  }
  if (!fit.length) return null;
  const fresh = fit.filter((p) => !taken.has(p.id) && !run.stats.pics.includes(p.id));
  const free = fit.filter((p) => !taken.has(p.id));
  return rng.pick(fresh.length ? fresh : free.length ? free : fit).id;
}

export function makeDoors(run: RunState): Door[] {
  const fl = FLOORS[run.floor];
  if (run.step >= STEPS) return [{ kind: 'guardian', size: picSize(PIC_BY_ID[fl.guardian]), pic: fl.guardian }];
  const rng = rngFor(run, 'doors', run.floor, run.step);
  const doors: Door[] = [];
  const taken = new Set<string>();
  const used = new Set<DoorKind>();
  for (let n = 0; n < 3; n++) {
    const puzzles = doors.filter((d) => isPuzzleDoor(d.kind)).length;
    const opts: [DoorKind, number][] = [
      ['monster', 34],
      ['chest', 14],
      ['mystery', 18],
      ['rune', 9],
      ['key', 9],
    ];
    if (puzzles >= 1 || n < 2) {
      if (!used.has('shrine') && !(run.floor === 0 && run.step === 0)) opts.push(['shrine', 5]);
      if (!used.has('shop') && run.floor + run.step > 0) opts.push(['shop', 10]);
      if (!used.has('vault') && run.keys > 0) opts.push(['vault', 14]);
    }
    let kind = rng.weighted(opts);
    if (n === 2 && puzzles === 0) kind = 'monster';
    used.add(kind);
    let pic: string | null = null;
    let size = 0;
    if (kind === 'monster') pic = pickPic(run, rng, ['monster'], taken);
    else if (kind === 'chest') pic = pickPic(run, rng, ['chest'], taken);
    else if (kind === 'key') pic = pickPic(run, rng, ['key'], taken);
    else if (kind === 'mystery') pic = pickPic(run, rng, MYSTERY_KINDS, taken);
    else if (kind === 'rune') size = rng.int(fl.rune[0], fl.rune[1]);
    if (pic) {
      taken.add(pic);
      size = picSize(PIC_BY_ID[pic]);
    }
    doors.push({ kind, size, pic });
  }
  return doors;
}

export function monsterDmg(run: RunState, door: Door): number {
  if (door.kind !== 'monster' && door.kind !== 'guardian') return 1 + Math.floor(run.floor / 3);
  let d = MONSTERS[door.pic!].dmg + Math.floor(run.floor / 3);
  if (run.charms.includes('calm')) d -= 1;
  if (door.kind === 'guardian' && run.charms.includes('hourglass')) d -= 1;
  return Math.max(1, d);
}

export function makePuzzle(run: RunState, door: Door, salt = 0): Puzzle {
  const rng = rngFor(run, 'puzzle', run.floor, run.step, door.kind, door.pic ?? door.size, salt);
  let sol: Uint8Array;
  if (door.pic) sol = Uint8Array.from(picSolution(PIC_BY_ID[door.pic]), (ch) => (ch === '1' ? 1 : 0));
  else sol = randomGrid(rng, door.size, door.size);
  const n = door.size;
  const isFight = door.kind === 'monster' || door.kind === 'guardian';
  const def = isFight ? MONSTERS[door.pic!] : null;
  const trait: Trait = def?.trait ?? 'none';
  const givens = givensFor(sol, n, n, rng, [], run.charms.includes('chart') ? 2 : 0);
  let fog = 0;
  if (trait === 'fog') fog = Math.max(0, (def!.fog ?? 1) - (run.charms.includes('lantern') ? 2 : 0));
  const hidden = fog ? pickFog(sol, n, n, rng, fog, givens) : [];
  let ward = 0;
  if (run.charms.includes('quill')) ward++;
  if (isFight && run.charms.includes('amulet')) ward++;
  return newPuzzle(sol, n, n, {
    pic: door.pic,
    givens,
    hidden,
    dmg: monsterDmg(run, door),
    trait: fog || trait !== 'fog' ? trait : 'none',
    ward,
    freePeek: run.charms.includes('lens') ? 1 : 0,
  });
}

export function enterDoor(run: RunState, index: number): Room {
  const door = run.doors[index];
  const room: Room = { door, puzzle: null, reward: null, shop: null, choices: [], used: false };
  if (isPuzzleDoor(door.kind)) room.puzzle = makePuzzle(run, door);
  if (door.kind === 'shop') room.shop = makeShop(run);
  if (door.kind === 'vault') room.choices = charmChoices(run, rngFor(run, 'vault', run.floor, run.step), 3);
  run.room = room;
  return room;
}

export function charmChoices(run: RunState, rng: Rng, n: number): string[] {
  const pool = Object.keys(CHARMS).filter((id) => !run.charms.includes(id));
  return rng.shuffle(pool).slice(0, n);
}

export function addCharm(run: RunState, id: string): void {
  if (run.charms.includes(id)) return;
  run.charms.push(id);
  if (id === 'heartstone') {
    run.maxHp += 3;
    run.hp += 3;
  }
  if (id === 'well') {
    run.maxMana += 3;
    run.mana = Math.min(run.maxMana, run.mana + 2);
  }
}

export const heal = (run: RunState, n: number): number => {
  const before = run.hp;
  run.hp = Math.min(run.maxHp, run.hp + n);
  return run.hp - before;
};

export const gainMana = (run: RunState, n: number): number => {
  const before = run.mana;
  run.mana = Math.min(run.maxMana, run.mana + n);
  return run.mana - before;
};

const goldGain = (run: RunState, n: number): number => {
  const g = Math.round(n * (run.charms.includes('coin') ? 1.4 : 1));
  run.gold += g;
  return g;
};

/** Apply the prize of a solved puzzle. Charm choices wait for the player. */
export function solveRewards(run: RunState): Reward {
  const room = run.room!;
  const p = room.puzzle!;
  const door = room.door;
  const f = run.floor;
  const rng = rngFor(run, 'reward', f, run.step);
  const lines: string[] = [];
  const reward: Reward = { lines, charms: [], picked: false };
  run.stats.solved++;
  run.stats.mistakes += p.mistakes;
  if (p.pic && !run.stats.pics.includes(p.pic)) run.stats.pics.push(p.pic);
  const clean = p.mistakes === 0;
  if (clean) run.stats.clean++;
  let mana = clean ? 1 + (run.charms.includes('prism') ? 1 : 0) : 0;
  if (door.kind === 'rune') mana += 1;
  const m = gainMana(run, mana);
  if (clean) lines.push(`✨ Clean solve: +${m} mana`);
  else if (m) lines.push(`✨ +${m} mana`);
  else lines.push(`✖ ${p.mistakes} mistake${p.mistakes > 1 ? 's' : ''}: no mana`);
  if (run.charms.includes('bandage')) {
    const h = heal(run, 1);
    if (h) lines.push(`🩹 +${h} HP`);
  }
  const kind = door.pic ? PIC_BY_ID[door.pic].kind : 'rune';
  switch (door.kind) {
    case 'monster': {
      run.stats.kills++;
      lines.push(`💰 +${goldGain(run, 5 + 2 * f + MONSTERS[door.pic!].dmg * 2)} gold`);
      if (rng.chance(0.15)) {
        run.keys++;
        lines.push('🗝️ It dropped a key!');
      }
      break;
    }
    case 'guardian': {
      run.stats.kills++;
      lines.push(`💰 +${goldGain(run, 6 + 3 * f)} gold`);
      reward.charms = charmChoices(run, rng, 3);
      break;
    }
    case 'rune':
      lines.push(`💰 +${goldGain(run, 2 + f)} gold`);
      break;
    case 'chest':
      lines.push(`💰 +${goldGain(run, 5 + 2 * f)} gold`);
      if (rng.chance(0.25)) reward.charms = charmChoices(run, rng, 2);
      else lines.push(`🧪 A potion: +${heal(run, 2)} HP`);
      break;
    case 'key':
    case 'mystery':
      if (kind === 'key') {
        const k = run.charms.includes('keyring') ? 2 : 1;
        run.keys += k;
        lines.push(`🗝️ +${k} key${k > 1 ? 's' : ''}`);
        lines.push(`💰 +${goldGain(run, 2 + f)} gold`);
      } else if (kind === 'treasure') lines.push(`💰 Treasure: +${goldGain(run, 12 + 4 * f)} gold`);
      else if (kind === 'potion') lines.push(`❤️ Healing: +${heal(run, 3)} HP`);
      else if (kind === 'mana') lines.push(`🔮 Mana: +${gainMana(run, 3)} mana`);
      else if (kind === 'charm') reward.charms = charmChoices(run, rng, 2);
      break;
    default:
      break;
  }
  if (!reward.charms.length) reward.picked = true;
  room.reward = reward;
  return reward;
}

export function makeShop(run: RunState): ShopItem[] {
  const f = run.floor;
  const rng = rngFor(run, 'shop', f, run.step);
  const items: ShopItem[] = [
    { id: 'heal', cost: 8 + 2 * f, sold: false },
    { id: 'maxhp', cost: 22 + 3 * f, sold: false },
    { id: 'mana', cost: 6 + f, sold: false },
    { id: 'key', cost: 9 + 2 * f, sold: false },
  ];
  for (const c of charmChoices(run, rng, 2)) items.push({ id: 'charm', charm: c, cost: 24 + 4 * f, sold: false });
  return items;
}

export function buy(run: RunState, item: ShopItem): boolean {
  if (item.sold || run.gold < item.cost) return false;
  run.gold -= item.cost;
  item.sold = true;
  if (item.id === 'heal') heal(run, 3);
  else if (item.id === 'maxhp') {
    run.maxHp += 2;
    run.hp += 2;
  } else if (item.id === 'mana') gainMana(run, 3);
  else if (item.id === 'key') run.keys++;
  else if (item.charm) addCharm(run, item.charm);
  return true;
}

/** Leave the current room and go to the next step or floor. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  const wasGuardian = run.room?.door.kind === 'guardian';
  run.room = null;
  if (wasGuardian) {
    if (run.floor >= FLOORS.length - 1) {
      run.result = 'win';
      return true;
    }
    run.floor++;
    run.step = 0;
  } else run.step++;
  run.doors = makeDoors(run);
  return false;
}

export function score(run: RunState): number {
  const floors = run.floor + (run.result === 'win' ? 1 : 0);
  return floors * 100 + run.stats.solved * 10 + run.stats.clean * 15 + run.stats.kills * 5 + run.gold + (run.result === 'win' ? 500 : 0);
}

export const shardsFor = (sc: number): number => Math.floor(sc / 40);

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
    if (run.v !== 1 || run.result || !FLOORS[run.floor] || run.charms.some((c) => !CHARMS[c])) return null;
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
  const base: Meta = { shards: 0, unlocked: [], runs: 0, wins: 0, bestFloor: 0, best: 0, pics: [] };
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

/** Record the end of a run in the meta data. Returns the score and shards. */
export function finishRun(run: RunState, meta: Meta): { score: number; shards: number } {
  const sc = score(run);
  const sh = shardsFor(sc);
  meta.runs++;
  if (run.result === 'win') meta.wins++;
  meta.bestFloor = Math.max(meta.bestFloor, run.floor + 1);
  meta.best = Math.max(meta.best, sc);
  meta.shards += sh;
  for (const id of run.stats.pics) if (!meta.pics.includes(id)) meta.pics.push(id);
  return { score: sc, shards: sh };
}
