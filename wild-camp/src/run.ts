/** Save data, meta progress and score. */
import { CHARS, CHAR_IDS, DAY, PARTS } from './data';
import { deserialize, serialize, type Game } from './game';

const RUN_KEY = 'wc.run';
const META_KEY = 'wc.meta';

export interface Meta {
  runs: number;
  wins: number;
  bestDays: number;
  best: number;
  totalDays: number;
  kills: number;
  char: string;
}

export function saveRun(g: Game): void {
  try {
    localStorage.setItem(RUN_KEY, serialize(g));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): Game | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const g = deserialize(raw);
    if (!g || g.over || !CHARS[g.char]) return null;
    return g;
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
  const base: Meta = { runs: 0, wins: 0, bestDays: 0, best: 0, totalDays: 0, kills: 0, char: 'wren' };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
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

export const daysSurvived = (g: Game): number => Math.floor((g.time / DAY) * 10) / 10;

export function partsDone(g: Game): number {
  const portal = g.st.find((s) => s.k === 'portal');
  return portal?.parts?.length ?? 0;
}

export function score(g: Game): number {
  const days = g.time / DAY;
  let s = Math.round(days * 100) + g.kills * 5 + g.bossKills * 200 + partsDone(g) * 300;
  if (g.over === 'win') s += 3000 + Math.max(0, 30 - Math.floor(days)) * 100;
  return s;
}

export function unlocked(m: Meta): string[] {
  return CHAR_IDS.filter((id) => CHARS[id].unlock <= m.totalDays);
}

/** Record a finished run. Returns the characters that this run unlocked. */
export function recordEnd(m: Meta, g: Game): string[] {
  const before = unlocked(m);
  const days = g.time / DAY;
  m.runs++;
  if (g.over === 'win') m.wins++;
  m.bestDays = Math.max(m.bestDays, Math.floor(days * 10) / 10);
  m.best = Math.max(m.best, score(g));
  m.totalDays = Math.round((m.totalDays + days) * 10) / 10;
  m.kills += g.kills;
  saveMeta(m);
  return unlocked(m).filter((id) => !before.includes(id));
}

export { PARTS };
