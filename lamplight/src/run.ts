/** Run state between rooms: roster, lamps, doors, rewards, score, save data. */
import { makeBattle, newHeroState, newLampState, type Battle, type HeroState, type LampState, type RoomKind } from './battle';
import { ACTS, HEROES, LAMPS, START_HEROES, type HeroKind, type LampKind } from './data';
import { Rng, hash } from './rng';

export type Door = 'fight' | 'elite' | 'rest';
export type UpKind = 'len' | 'reach' | 'move' | 'sharp' | 'hp' | 'atk' | 'tall' | 'heal' | 'extra';

export type Offer =
  | { kind: 'lamp'; lamp: LampKind }
  | { kind: 'hero'; hero: HeroKind }
  | { kind: 'up'; up: UpKind; target: number };

export interface RunState {
  v: 1;
  seed: string;
  act: number;
  /** 0..3 inside the act. 3 is the boss. */
  room: number;
  heroes: HeroState[];
  lamps: LampState[];
  perTurn: number;
  kills: number;
  cleared: number;
  bosses: number;
  phase: 'map' | 'battle' | 'reward';
  doors: Door[];
  roomKind: RoomKind | null;
  battle: Battle | null;
  offers: Offer[];
  picks: number;
}

export interface Meta {
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
  kills: number;
  unlocked: string[];
}

export const MAX_LAMPS = 4;
export const MAX_HEROES = 5;
export const ROOMS_PER_ACT = 4;
/** Every figure heals this much after a won room. */
export const AFTER_HEAL = 2;

const RUN_KEY = 'lamp.run';
const META_KEY = 'lamp.meta';

export const UNLOCKS: { id: string; what: string; how: string }[] = [
  { id: 'flicker', what: '✨ Flicker Lamp', how: 'Reach act 2' },
  { id: 'giant', what: '🧌 Giant', how: 'Beat the Bone Serpent' },
  { id: 'moon', what: '🌕 Moon', how: 'Beat the Spider Queen' },
  { id: 'witch', what: '🧙 Witch', how: 'Win a run' },
];

export function lampPool(meta: Meta): LampKind[] {
  return ['lantern', 'candle', 'rose', ...(['flicker', 'moon'] as LampKind[]).filter((k) => meta.unlocked.includes(k))];
}

export function heroPool(meta: Meta): HeroKind[] {
  return [...START_HEROES, ...(['giant', 'witch'] as HeroKind[]).filter((k) => meta.unlocked.includes(k))];
}

export function newRun(seed: string): RunState {
  const run: RunState = {
    v: 1,
    seed,
    act: 0,
    room: 0,
    heroes: START_HEROES.map(newHeroState),
    lamps: [newLampState('lantern'), newLampState('candle')],
    perTurn: 1,
    kills: 0,
    cleared: 0,
    bosses: 0,
    phase: 'map',
    doors: ['fight'],
    roomKind: null,
    battle: null,
    offers: [],
    picks: 0,
  };
  return run;
}

const seedNum = (run: RunState, ...p: (string | number)[]) => hash(run.seed, ...p);

export function makeDoors(run: RunState): Door[] {
  if (run.room === 0) return ['fight'];
  if (run.room >= 3) return [];
  const rng = new Rng(seedNum(run, 'doors', run.act, run.room));
  const pool: Door[] = ['fight', 'elite', 'rest'];
  rng.shuffle(pool);
  const two = pool.slice(0, 2);
  if (!two.includes('fight') && !two.includes('elite')) two[0] = 'fight';
  return two;
}

export const DOOR_INFO: Record<Door | 'boss', { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'A normal room. One reward pick.' },
  elite: { icon: '💀', name: 'Elite', text: 'One more enemy, all with +1 HP. Two reward picks.' },
  rest: { icon: '🔥', name: 'Hearth', text: 'No fight. All figures heal 4 HP.' },
  boss: { icon: '👑', name: 'Boss', text: 'A large boss with its own lamps. Full heal after.' },
};

export function enterDoor(run: RunState, door: Door | 'boss'): void {
  if (door === 'rest') {
    for (const h of run.heroes) h.hp = Math.min(h.max, h.hp + 4);
    nextRoom(run);
    return;
  }
  const kind: RoomKind = door;
  run.roomKind = kind;
  run.battle = makeBattle(seedNum(run, 'battle', run.act, run.room), run.act, run.room, kind, run.heroes, run.lamps, run.perTurn);
  run.phase = 'battle';
}

function nextRoom(run: RunState): void {
  run.room++;
  if (run.room >= ROOMS_PER_ACT) {
    run.act++;
    run.room = 0;
  }
  run.phase = 'map';
  run.doors = run.room >= 3 ? [] : makeDoors(run);
  run.battle = null;
  run.roomKind = null;
}

/** Copy HP back to the roster and drop dead figures. */
function syncHeroes(run: RunState, b: Battle): void {
  const alive: HeroState[] = [];
  run.heroes.forEach((h, slot) => {
    const f = b.figs.find((g) => g.side === 'you' && g.slot === slot);
    if (f) alive.push({ ...h, hp: f.hp });
  });
  run.heroes = alive;
}

export type Finish = 'next' | 'win' | 'lose';

/** Called when the battle is over. Sets up the reward or ends the run. */
export function finishBattle(run: RunState): Finish {
  const b = run.battle!;
  run.kills += b.kills;
  syncHeroes(run, b);
  if (b.over === 'lose' || !run.heroes.length) return 'lose';
  run.cleared++;
  for (const h of run.heroes) h.hp = Math.min(h.max, h.hp + AFTER_HEAL);
  if (run.roomKind === 'boss') {
    run.bosses++;
    for (const h of run.heroes) h.hp = h.max;
    if (run.act >= ACTS.length - 1) return 'win';
  }
  run.picks = run.roomKind === 'elite' ? 2 : 1;
  run.phase = 'reward';
  run.battle = null;
  return 'next';
}

export function makeOffers(run: RunState, meta: Meta): Offer[] {
  const rng = new Rng(seedNum(run, 'offer', run.act, run.room, run.picks));
  const out: Offer[] = [];
  if (run.lamps.length < MAX_LAMPS) out.push({ kind: 'lamp', lamp: rng.pick(lampPool(meta)) });
  if (run.heroes.length < MAX_HEROES) out.push({ kind: 'hero', hero: rng.pick(heroPool(meta)) });
  const ups: Offer[] = [];
  run.lamps.forEach((l, i) => {
    if (LAMPS[l.kind].len > 0 || l.kind === 'flicker') ups.push({ kind: 'up', up: 'len', target: i });
    if (l.reach < 9) ups.push({ kind: 'up', up: 'reach', target: i });
    if (l.move < 5 && l.kind !== 'moon') ups.push({ kind: 'up', up: 'move', target: i });
    if (LAMPS[l.kind].len > 0 || l.kind === 'flicker') ups.push({ kind: 'up', up: 'sharp', target: i });
  });
  run.heroes.forEach((_, i) => {
    ups.push({ kind: 'up', up: 'hp', target: i });
    ups.push({ kind: 'up', up: 'atk', target: i });
    ups.push({ kind: 'up', up: 'tall', target: i });
  });
  if (run.heroes.some((h) => h.hp < h.max)) ups.push({ kind: 'up', up: 'heal', target: -1 });
  if (run.perTurn < 2 && run.act >= 1) ups.push({ kind: 'up', up: 'extra', target: -1 }, { kind: 'up', up: 'extra', target: -1 });
  rng.shuffle(ups);
  const seen = new Set<string>();
  for (const u of ups) {
    if (out.length >= 3) break;
    const key = u.kind === 'up' ? u.up : '';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

export function offerInfo(run: RunState, o: Offer): { icon: string; title: string; text: string } {
  if (o.kind === 'lamp') {
    const d = LAMPS[o.lamp];
    return { icon: d.icon, title: `New lamp: ${d.name}`, text: d.text };
  }
  if (o.kind === 'hero') {
    const d = HEROES[o.hero];
    return { icon: d.icon, title: `New figure: ${d.name}`, text: `HP ${d.hp}, attack ${d.atk}${d.tall ? `, tall +${d.tall}` : ''}. ${d.text}` };
  }
  const l = run.lamps[o.target];
  const h = run.heroes[o.target];
  switch (o.up) {
    case 'len':
      return { icon: LAMPS[l.kind].icon, title: `${LAMPS[l.kind].name}: longer shadows`, text: 'Its shadows are 1 tile longer.' };
    case 'reach':
      return { icon: LAMPS[l.kind].icon, title: `${LAMPS[l.kind].name}: brighter`, text: `Reach ${l.reach} → ${l.reach + 1}.` };
    case 'move':
      return { icon: LAMPS[l.kind].icon, title: `${LAMPS[l.kind].name}: lighter`, text: `Moves ${l.move} → ${l.move + 2} tiles.` };
    case 'sharp':
      return { icon: LAMPS[l.kind].icon, title: `${LAMPS[l.kind].name}: sharper`, text: 'Its shadows deal +1 damage.' };
    case 'hp':
      return { icon: HEROES[h.kind].icon, title: `${HEROES[h.kind].name}: +3 max HP`, text: `HP ${h.hp}/${h.max} → ${h.hp + 3}/${h.max + 3}.` };
    case 'atk':
      return { icon: HEROES[h.kind].icon, title: `${HEROES[h.kind].name}: +1 attack`, text: `Each of its shadows deals ${h.atk + 1}.` };
    case 'tall':
      return { icon: HEROES[h.kind].icon, title: `${HEROES[h.kind].name}: taller`, text: 'Its shadows are 1 tile longer.' };
    case 'heal':
      return { icon: '💗', title: 'Rest', text: 'Heal all figures by 5.' };
    case 'extra':
      return { icon: '🤲', title: 'Second hand', text: 'Move 2 lamps per turn instead of 1.' };
  }
}

export function takeOffer(run: RunState, o: Offer): void {
  if (o.kind === 'lamp') run.lamps.push(newLampState(o.lamp));
  else if (o.kind === 'hero') run.heroes.push(newHeroState(o.hero));
  else {
    const l = run.lamps[o.target];
    const h = run.heroes[o.target];
    switch (o.up) {
      case 'len':
        l.plus++;
        break;
      case 'reach':
        l.reach++;
        break;
      case 'move':
        l.move += 2;
        break;
      case 'sharp':
        l.dmg++;
        break;
      case 'hp':
        h.max += 3;
        h.hp += 3;
        break;
      case 'atk':
        h.atk++;
        break;
      case 'tall':
        h.tall++;
        break;
      case 'heal':
        for (const x of run.heroes) x.hp = Math.min(x.max, x.hp + 5);
        break;
      case 'extra':
        run.perTurn = 2;
        break;
    }
  }
  run.picks--;
  if (run.picks <= 0) nextRoom(run);
}

export function skipOffer(run: RunState): void {
  run.picks = 0;
  nextRoom(run);
}

export function score(run: RunState, won: boolean): number {
  const hp = run.heroes.reduce((a, h) => a + h.hp, 0);
  return run.cleared * 50 + run.kills * 10 + run.bosses * 150 + (won ? 500 + hp * 10 : 0);
}

/** Update meta after a run. Returns the new unlock names. */
export function recordRun(meta: Meta, run: RunState, won: boolean, sc: number): string[] {
  meta.runs++;
  if (won) meta.wins++;
  meta.best = Math.max(meta.best, sc);
  meta.bestAct = Math.max(meta.bestAct, won ? 4 : run.act + 1);
  meta.kills += run.kills;
  return checkUnlocks(meta, run, won);
}

export function checkUnlocks(meta: Meta, run: RunState, won: boolean): string[] {
  const got: string[] = [];
  const give = (id: string, ok: boolean) => {
    if (ok && !meta.unlocked.includes(id)) {
      meta.unlocked.push(id);
      got.push(UNLOCKS.find((u) => u.id === id)!.what);
    }
  };
  give('flicker', run.act >= 1);
  give('giant', run.bosses >= 1);
  give('moon', run.bosses >= 2);
  give('witch', won);
  return got;
}

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
    if (run.v !== 1 || !Array.isArray(run.heroes) || run.heroes.some((h) => !HEROES[h.kind])) return null;
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
  const base: Meta = { runs: 0, wins: 0, bestAct: 0, best: 0, kills: 0, unlocked: [] };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!Array.isArray(m.unlocked)) m.unlocked = [];
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

