/** Workshop (shop) rules, score, and save data. Pure functions over the World. */
import { DOMES, MAX_LV, REPAIR_COST, REPAIR_HP, RES_IDS, UPGRADES, type Cost, type DomeId, type UpId } from './data';
import { newWorld, type World } from './world';

const RUN_KEY = 'domedig.run';
const META_KEY = 'domedig.meta';

export interface Meta {
  cores: number;
  domes: DomeId[];
  pick: DomeId;
  runs: number;
  wins: number;
  bestWave: number;
  best: number;
  muted: boolean;
}

export function canPay(w: World, c: Cost): boolean {
  return RES_IDS.every((r) => w.res[r] >= (c[r] ?? 0));
}

export function pay(w: World, c: Cost): void {
  for (const r of RES_IDS) w.res[r] -= c[r] ?? 0;
}

export const upCost = (w: World, id: UpId): Cost | null => (w.lv[id] >= MAX_LV ? null : UPGRADES[id].costs[w.lv[id] - 1]);

export function canUpgrade(w: World, id: UpId): boolean {
  const c = upCost(w, id);
  return !!c && canPay(w, c);
}

export function buyUpgrade(w: World, id: UpId): boolean {
  const c = upCost(w, id);
  if (!c || !canPay(w, c)) return false;
  pay(w, c);
  w.lv[id]++;
  return true;
}

export const canRepair = (w: World): boolean => w.domeHp < w.domeMax && canPay(w, REPAIR_COST);

export function repair(w: World): boolean {
  if (!canRepair(w)) return false;
  pay(w, REPAIR_COST);
  w.domeHp = Math.min(w.domeMax, w.domeHp + REPAIR_HP);
  return true;
}

export const canConvert = (w: World): boolean => w.gadgets.includes('converter') && w.res.iron >= 4;

export function convert(w: World): boolean {
  if (!canConvert(w)) return false;
  w.res.iron -= 4;
  w.res.crystal++;
  return true;
}

export function costText(c: Cost): string {
  const icons = { iron: '🔩', water: '💧', crystal: '💎' } as const;
  return RES_IDS.filter((r) => c[r])
    .map((r) => `${icons[r]}${c[r]}`)
    .join(' ');
}

/** Waves cleared so far. */
export const cleared = (w: World): number => (w.phase === 'won' ? w.wave : w.phase === 'cleared' ? w.wave : w.wave - 1);

export function score(w: World): number {
  const won = w.phase === 'won';
  return Math.round(cleared(w) * 150 + w.stats.kills * 4 + w.stats.ore * 3 + w.stats.gadgets * 50 + (won ? 1500 + w.domeHp * 10 : 0));
}

export const coresFor = (s: number): number => Math.floor(s / 150);

export function newRun(seed: string, dome: DomeId): World {
  return newWorld(seed, dome);
}

export function saveRun(w: World): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(w));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): World | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as World;
    if (w.v !== 1 || !DOMES[w.dome] || !Array.isArray(w.hp) || w.phase === 'won' || w.phase === 'lost') return null;
    return w;
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
  const base: Meta = { cores: 0, domes: ['laser'], pick: 'laser', runs: 0, wins: 0, bestWave: 0, best: 0, muted: false };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!m.domes.includes(m.pick)) m.pick = 'laser';
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
