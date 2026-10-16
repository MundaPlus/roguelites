/** The run: path choices, rewards, shop, score and save data. */
import type { HoleKind } from './course';
import { ACES, ACE_IDS, CHARMS, CHARM_IDS, CLUBS, CLUB_IDS, CURSE_IDS, HAND_MAX, MAX_CLUB_LVL, ZONES } from './data';
import { commitShot, mulligan, newHole, settle, type HoleState, type Kit } from './golf';
import { Rng, hash } from './rng';

export type NodeKind = 'hole' | 'curse' | 'shortcut' | 'shop' | 'boss';

export const HOLES = 18;
export const BOSS_AT = [3, 7, 12, 17];
export const ZONE_START = [0, 4, 8, 13];

export const zoneOf = (idx: number): number => (idx < 4 ? 0 : idx < 8 ? 1 : idx < 13 ? 2 : 3);

export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  hole: { icon: '⛳', name: 'Hole', text: 'A normal hole.' },
  curse: { icon: '☠️', name: 'Curse hole', text: 'A curse makes it harder. Double gold and a free ace.' },
  shortcut: { icon: '⏩', name: 'Shortcut', text: 'One long hole that counts as two.' },
  shop: { icon: '🛒', name: 'Pro shop', text: 'Buy aces, charms and club upgrades. Then play a hole.' },
  boss: { icon: '👑', name: 'Boss hole', text: 'The keeper of this zone plays tricks on you.' },
};

export interface Stats {
  holes: number;
  strokes: number;
  idols: number;
  coins: number;
  aces: number;
  holeInOnes: number;
  curses: number;
  bosses: number;
  left: number;
}

export interface Reward {
  gold: number;
  lines: string[];
  aces: string[];
  charms: string[];
  bonusAce: string | null;
  taken: boolean;
}

export type ShopItem =
  | { kind: 'ace'; id: string; cost: number; sold: boolean }
  | { kind: 'charm'; id: string; cost: number; sold: boolean }
  | { kind: 'club'; cost: number; sold: boolean }
  | { kind: 'shots'; cost: number; sold: boolean };

export interface RunState {
  v: 1;
  seed: string;
  idx: number;
  gold: number;
  clubs: Record<string, number>;
  hand: string[];
  charms: string[];
  acePool: string[];
  stage: 'map' | 'hole' | 'reward' | 'shop';
  hole: HoleState | null;
  next: NodeKind | null;
  reward: Reward | null;
  shop: ShopItem[] | null;
  /** Extra shots bought in the shop for the next hole. */
  bonusShots: number;
  stats: Stats;
}

export interface Meta {
  tokens: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestHole: number;
  best: number;
}

const RUN_KEY = 'cursedfairway.run';
const META_KEY = 'cursedfairway.meta';

export const LOCKED: string[] = [...CLUB_IDS.filter((id) => CLUBS[id].unlock > 0), ...ACE_IDS.filter((id) => ACES[id].unlock > 0)];
export const unlockCost = (id: string): number => (CLUBS[id] ? CLUBS[id].unlock : ACES[id].unlock);

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const kit = (run: RunState): Kit => ({ clubs: run.clubs, charms: run.charms });

export const handMax = (run: RunState): number => HAND_MAX + (run.charms.includes('sleeve') ? 2 : 0);

export function newRun(seed: string, meta: Meta): RunState {
  const clubs: Record<string, number> = {};
  for (const id of CLUB_IDS) if (CLUBS[id].unlock === 0 || meta.unlocked.includes(id)) clubs[id] = 1;
  return {
    v: 1,
    seed,
    idx: 0,
    gold: 20,
    clubs,
    hand: ['extra', 'curve'],
    charms: [],
    acePool: ACE_IDS.filter((id) => ACES[id].unlock === 0 || meta.unlocked.includes(id)),
    stage: 'map',
    hole: null,
    next: null,
    reward: null,
    shop: null,
    bonusShots: 0,
    stats: { holes: 0, strokes: 0, idols: 0, coins: 0, aces: 0, holeInOnes: 0, curses: 0, bosses: 0, left: 0 },
  };
}

export const ownedClubs = (run: RunState): string[] => CLUB_IDS.filter((id) => run.clubs[id]);

/** The path choices before the current hole. */
export function nodesFor(run: RunState): NodeKind[] {
  if (BOSS_AT.includes(run.idx)) return ['boss', 'shop'];
  const rng = rngFor(run, 'nodes', run.idx);
  const extra: NodeKind[] = ['curse', 'shop'];
  if (run.idx + 1 < HOLES && !BOSS_AT.includes(run.idx + 1)) extra.push('shortcut');
  return ['hole', ...rng.shuffle(extra).slice(0, 2)];
}

export function startHole(run: RunState, node: NodeKind): void {
  const kind: HoleKind = node === 'boss' ? 'boss' : node === 'curse' ? 'curse' : node === 'shortcut' ? 'shortcut' : 'hole';
  const rng = rngFor(run, 'hole', run.idx, kind);
  const spec = { seed: hash(run.seed, 'course', run.idx, kind), zone: zoneOf(run.idx), kind, curse: kind === 'curse' ? rng.pick(CURSE_IDS) : null };
  run.hole = newHole(spec, kit(run));
  // The first two holes give 1 extra shot to learn the game.
  const bonus = run.bonusShots + (run.idx < 2 ? 1 : 0);
  run.hole.shots += bonus;
  run.hole.start += bonus;
  run.bonusShots = 0;
  run.stage = 'hole';
}

/** Pick a path node. A shop comes first, then the hole. */
export function chooseNode(run: RunState, node: NodeKind): void {
  if (node === 'shop') {
    run.next = BOSS_AT.includes(run.idx) ? 'boss' : 'hole';
    run.shop = makeShop(run);
    run.stage = 'shop';
    return;
  }
  startHole(run, node);
}

export function leaveShop(run: RunState): void {
  const n = run.next ?? 'hole';
  run.next = null;
  run.shop = null;
  startHole(run, n);
}

export function randomAces(run: RunState, rng: Rng, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(rng.pick(run.acePool));
  return out;
}

export function addAce(run: RunState, id: string): boolean {
  if (run.hand.length >= handMax(run)) return false;
  run.hand.push(id);
  return true;
}

export function useAce(run: RunState, slot: number): string | null {
  const id = run.hand[slot];
  if (!id) return null;
  run.hand.splice(slot, 1);
  run.stats.aces++;
  return id;
}

/** Play an "now" ace. Returns false if it can not be used. */
export function playNowAce(run: RunState, slot: number): boolean {
  const hs = run.hole;
  const id = run.hand[slot];
  if (!hs || !id) return false;
  if (id === 'mulligan' && !hs.prev) return false;
  if (id === 'freeze' && hs.frozen) return false;
  useAce(run, slot);
  if (id === 'extra') hs.shots++;
  if (id === 'mulligan') mulligan(hs);
  if (id === 'freeze') hs.frozen = true;
  return true;
}

/** Arm or disarm an ace for the next shot. Armed aces are used up when you shoot. */
export function toggleArm(run: RunState, slot: number): void {
  const hs = run.hole!;
  const id = run.hand[slot];
  const i = hs.armed.indexOf(id);
  if (i >= 0) hs.armed.splice(i, 1);
  else hs.armed.push(id);
}

/** Remove armed aces from the hand when the shot goes. */
export function spendArmed(run: RunState): void {
  for (const id of run.hole!.armed) {
    const i = run.hand.indexOf(id);
    if (i >= 0) useAce(run, i);
  }
}

/** Shoot: uses the armed aces and one shot. */
export function shoot(run: RunState, clubId: string, aim: { a: number; p: number }) {
  spendArmed(run);
  run.stats.strokes++;
  return commitShot(run.hole!, kit(run), clubId, aim);
}

/** Settle a shot, then use an Extra Shot ace by itself if the counter hit 0. */
export function afterShot(run: RunState, shot: Parameters<typeof settle>[2]): ReturnType<typeof settle> & { autoExtra: boolean; out: boolean } {
  const hs = run.hole!;
  const o = settle(hs, kit(run), shot);
  run.stats.idols += o.idols;
  run.stats.coins += o.coins;
  const goldGain = o.coins * coinGold(run);
  run.gold += goldGain;
  let autoExtra = false;
  if (!hs.done && hs.shots <= 0) {
    const i = run.hand.indexOf('extra');
    if (i >= 0) {
      useAce(run, i);
      hs.shots++;
      autoExtra = true;
    }
  }
  return { ...o, autoExtra, out: !hs.done && hs.shots <= 0 };
}

export const coinGold = (run: RunState): number => (run.charms.includes('glove') ? 6 : 4);

/** Called when the ball drops. Returns true if the run is won. */
export function finishHole(run: RunState): boolean {
  const hs = run.hole!;
  const rng = rngFor(run, 'reward', run.idx);
  const kind = hs.spec.kind;
  const lines: string[] = [];
  let gold = 10;
  lines.push(`Hole cleared: 💰 10`);
  if (hs.shots > 0) {
    gold += hs.shots * 4;
    lines.push(`${hs.shots} ${hs.shots === 1 ? 'shot' : 'shots'} left: 💰 ${hs.shots * 4}`);
  }
  if (hs.strokes === 1) {
    gold += 25;
    run.stats.holeInOnes++;
    lines.push('Hole in one: 💰 25');
  }
  if (kind === 'curse') {
    gold += 15;
    run.stats.curses++;
    lines.push('Curse lifted: 💰 15');
  }
  if (kind === 'shortcut') {
    gold += 15;
    lines.push('Shortcut: 💰 15');
  }
  if (kind === 'boss') {
    gold += 30;
    run.stats.bosses++;
    lines.push('Boss beaten: 💰 30');
  }
  if (kind === 'curse') gold *= 2;
  if (run.charms.includes('glove')) gold = Math.round(gold * 1.5);
  run.stats.holes += kind === 'shortcut' ? 2 : 1;
  run.stats.left += hs.shots;
  run.gold += gold;
  const oldZone = zoneOf(run.idx);
  run.idx += kind === 'shortcut' ? 2 : 1;
  run.hole = null;
  if (run.idx >= HOLES) return true;
  let bonusAce: string | null = null;
  if (kind === 'curse') {
    bonusAce = rng.pick(run.acePool);
    if (!addAce(run, bonusAce)) bonusAce = null;
  }
  if (zoneOf(run.idx) !== oldZone && run.charms.includes('sleeve')) addAce(run, rng.pick(run.acePool));
  const free = CHARM_IDS.filter((id) => !run.charms.includes(id));
  run.reward = {
    gold,
    lines,
    aces: randomAces(run, rng, 3),
    charms: kind === 'boss' ? rng.shuffle(free).slice(0, 3) : [],
    bonusAce,
    taken: false,
  };
  run.stage = 'reward';
  return false;
}

export function takeReward(run: RunState, kind: 'ace' | 'charm', id: string): boolean {
  const rw = run.reward;
  if (!rw || rw.taken) return false;
  if (kind === 'ace' && !addAce(run, id)) return false;
  if (kind === 'charm') run.charms.push(id);
  rw.taken = true;
  return true;
}

export function leaveReward(run: RunState): void {
  run.reward = null;
  run.stage = 'map';
}

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.idx);
  const z = zoneOf(run.idx);
  const items: ShopItem[] = [];
  for (const id of rng.shuffle([...new Set(run.acePool)]).slice(0, 3)) items.push({ kind: 'ace', id, cost: ACES[id].cost + z * 3, sold: false });
  for (const id of rng.shuffle(CHARM_IDS.filter((c) => !run.charms.includes(c))).slice(0, 2)) items.push({ kind: 'charm', id, cost: CHARMS[id].cost, sold: false });
  items.push({ kind: 'club', cost: 35 + z * 10, sold: false });
  items.push({ kind: 'shots', cost: 25 + z * 5, sold: false });
  return items;
}

export const upgradableClubs = (run: RunState): string[] => ownedClubs(run).filter((id) => run.clubs[id] < MAX_CLUB_LVL);

export function canBuy(run: RunState, it: ShopItem): boolean {
  if (it.sold || run.gold < it.cost) return false;
  if (it.kind === 'ace') return run.hand.length < handMax(run);
  if (it.kind === 'club') return upgradableClubs(run).length > 0;
  return true;
}

/** Buy a shop item. `club` picks the club for an upgrade. */
export function buy(run: RunState, i: number, club?: string): boolean {
  const it = run.shop?.[i];
  if (!it || !canBuy(run, it)) return false;
  if (it.kind === 'club') {
    if (!club || !upgradableClubs(run).includes(club)) return false;
    run.clubs[club]++;
  } else if (it.kind === 'ace') addAce(run, it.id);
  else if (it.kind === 'charm') run.charms.push(it.id);
  else run.bonusShots += 2;
  run.gold -= it.cost;
  it.sold = true;
  return true;
}

export function score(run: RunState, victory: boolean): number {
  const s = run.stats;
  return s.holes * 100 + s.idols * 20 + s.left * 10 + s.holeInOnes * 100 + s.bosses * 150 + run.gold + (victory ? 1500 : 0);
}

export const tokensFor = (sc: number): number => Math.floor(sc / 250);

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r && r.v === 1 ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* ignore */
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
  const base: Meta = { tokens: 0, unlocked: [], runs: 0, wins: 0, bestHole: 0, best: 0 };
  try {
    const s = localStorage.getItem(META_KEY);
    return s ? { ...base, ...(JSON.parse(s) as Partial<Meta>) } : base;
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export const zoneName = (idx: number): string => {
  const z = ZONES[zoneOf(Math.min(idx, HOLES - 1))];
  return `${z.icon} ${z.name}`;
};
