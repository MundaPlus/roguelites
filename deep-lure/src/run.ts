/** Save data and meta progress (localStorage). */
import type { Run, StartGear } from './game';

const RUN_KEY = 'deeplure.run';
const META_KEY = 'deeplure.meta';

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  pearls: number;
  unlocks: string[];
  journal: string[];
}

export interface UnlockDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'kits', icon: '🧰', name: 'Spare planks', text: 'Start with 2 repair kits.', cost: 3 },
  { id: 'chart', icon: '🗺️', name: 'Old chart', text: 'Start with Grey Shallows and Kelp Reach on the chart.', cost: 3 },
  { id: 'oil', icon: '🏮', name: 'Oil Lamp', text: 'Start with the Oil Lamp.', cost: 5 },
  { id: 'twin', icon: '⚙️', name: 'Twin Engine', text: 'Start with the Twin Engine.', cost: 6 },
  { id: 'wide', icon: '📦', name: 'Wide Hold', text: 'Start with the 6×4 hold.', cost: 6 },
  { id: 'fiber', icon: '🎣', name: 'Fiberglass Rod', text: 'Start with the Fiberglass Rod.', cost: 8 },
];

export function startGear(m: Meta): StartGear {
  const has = (id: string): boolean => m.unlocks.includes(id);
  return {
    kits: has('kits') ? 2 : 0,
    chart: has('chart'),
    lamp: has('oil') ? 1 : 0,
    engine: has('twin') ? 1 : 0,
    hold: has('wide') ? 1 : 0,
    rod: has('fiber') ? 1 : 0,
  };
}

export function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, best: 0, pearls: 0, unlocks: [], journal: [] };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Meta>) };
  } catch {
    /* ignore */
  }
  return base;
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    if (r.v !== 1 || r.over) return null;
    r.shades = [];
    r.phantoms = [];
    return r;
  } catch {
    return null;
  }
}

export function saveRun(r: Run): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
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
