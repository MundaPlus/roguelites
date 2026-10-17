/** Bots for tests and balance: a weak random bot and a lookahead bot. */
import { WORDS } from './data';
import { Rng } from './rng';
import type { Claim } from './rumor';
import { canPlant, freeAgents, isOver, isWon, plant, share, spread, type Town } from './town';

export interface PlantMove {
  agent: number;
  node: number;
  claim: Claim;
}

/** All claims the player can write with these words. */
export function claimsOf(words: string[]): Claim[] {
  const verbs = words.filter((w) => WORDS[w].slot === 'verb');
  const objs = words.filter((w) => WORDS[w].slot === 'obj');
  const mods: (string | null)[] = [null, ...words.filter((w) => WORDS[w].slot === 'mod')];
  const out: Claim[] = [];
  for (const verb of verbs) for (const obj of objs) for (const mod of mods) out.push({ verb, obj, mod, not: false });
  return out;
}

/** Play the town to its end without more plants. */
function rollout(t: Town): { won: boolean; turn: number; share: number; exposed: number } {
  let s = t;
  let exposed = 0;
  while (!isOver(s)) {
    const r = spread(s);
    exposed += r.events.filter((e) => e.kind === 'expose').length;
    s = r.town;
  }
  return { won: isWon(s), turn: s.turn, share: share(s), exposed };
}

function value(t: Town): number {
  const r = rollout(t);
  return (r.won ? 1 + (t.maxTurns - r.turn) * 0.02 : r.share) - r.exposed * 0.3;
}

export function weakMove(t: Town, words: string[], rng: Rng): PlantMove | null {
  const free = freeAgents(t);
  if (!free.length || t.planted || !rng.chance(0.5)) return null;
  const nodes = t.people.map((p) => p.id).filter((i) => canPlant(t, free[0], i));
  if (!nodes.length) return null;
  return { agent: rng.pick(free), node: rng.pick(nodes), claim: rng.pick(claimsOf(words)) };
}

/** Greedy lookahead: try plants, play each to the end, keep the best if it beats waiting. */
export function goodMove(t: Town, words: string[], rng: Rng, budget = 260): PlantMove | null {
  const free = freeAgents(t);
  if (!free.length || t.planted) return null;
  const types = [...new Set(free.map((i) => t.agents[i]))].map((ty) => free.find((i) => t.agents[i] === ty)!);
  const nodes = t.people.map((p) => p.id).filter((i) => canPlant(t, free[0], i));
  if (!nodes.length) return null;
  const claims = claimsOf(words);
  const tries: PlantMove[] = [];
  for (const agent of types) for (const node of nodes) for (const claim of claims) tries.push({ agent, node, claim });
  rng.shuffle(tries);
  const base = value(t);
  let best: PlantMove | null = null;
  let bv = -1e9;
  for (const m of tries.slice(0, budget)) {
    const v = value(plant(t, m.agent, m.node, m.claim));
    if (v > bv) {
      bv = v;
      best = m;
    }
  }
  // Plant when it helps, or when agents would go unused at the end.
  const late = t.maxTurns - t.turn <= free.length + 1;
  return best && (bv > base + 0.01 || late) ? best : null;
}
