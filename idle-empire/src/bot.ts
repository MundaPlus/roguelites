/** Bots for the debug API and the balance sim. They act once per game second. */
import { CHALLENGES, LAYERS, UPGRADES } from './data';
import {
  bestOffer,
  buyDecree,
  buyGen,
  buyMax,
  buyNode,
  buyRegion,
  buyUp,
  buyWonder,
  calcMods,
  canNode,
  click,
  enterChallenge,
  exitChallenge,
  gainOf,
  has,
  layerOpen,
  pickOffer,
  prestige,
  tierOpen,
  type Game,
} from './game';
import { Rng } from './rng';

export interface BotMem {
  /** Crowns earned when a challenge attempt last failed. */
  failedAt: Record<string, number>;
}

export const newMem = (): BotMem => ({ failedAt: {} });

/** Clicks per second the bot makes while clicks still matter. */
export function botClicks(g: Game, smart: boolean): number {
  if (!smart) return 0;
  return g.runTime < 180 || g.gens[0].bought === 0 ? 5 : 0;
}

/** One second of good play: clicks, buys, tree nodes, prestige and challenges. */
export function smartAct(g: Game, mem: BotMem): void {
  for (let i = botClicks(g, true); i > 0; i--) click(g);
  if (g.offers) pickOffer(g, bestOffer(g.offers));
  // Tree nodes, in list order (the list is roughly the best order).
  LAYERS.forEach((l, i) => {
    for (const n of l.tree) if (canNode(g, i, n.id)) buyNode(g, i, n.id);
  });
  while (buyWonder(g));
  while (buyRegion(g));
  buyMax(g, [0, 1, 2, 3, 4, 5, 6, 7], true, true);
  if (g.finished) return;

  // Prestige: the highest layer first, when the gain at least doubles what was earned.
  for (let i = 2; i >= 1; i--) {
    if (!layerOpen(g, i) || g.challenge) continue;
    const gain = gainOf(g, i);
    if (gain.gte(1) && gain.gte(g.layers[i].earned)) {
      prestige(g, i);
      return;
    }
  }
  const c0 = g.layers[0].earned.log10();
  if (g.challenge) {
    if (gainOf(g, 0).gte(1)) prestige(g, 0);
    else if (g.runTime > 900) {
      mem.failedAt[g.challenge] = c0;
      exitChallenge(g);
    }
    return;
  }
  const gain = gainOf(g, 0);
  if (gain.gte(1) && (gain.gte(g.layers[0].earned) || g.runTime > 1200)) {
    prestige(g, 0);
    // Try an open challenge right after an ascension, if strong enough.
    if (has(g, 'c_chal') && g.layers[0].earned.gte(20)) {
      const ch = CHALLENGES.find((c) => !g.chDone.includes(c.id) && (mem.failedAt[c.id] === undefined || c0 > mem.failedAt[c.id] + 1));
      if (ch) enterChallenge(g, ch.id);
    }
  }
}

/** One second of weak play: random single buys, no clicks, eager prestige. */
export function weakAct(g: Game, rng: Rng): void {
  if (g.offers) pickOffer(g, 0);
  LAYERS.forEach((l, i) => {
    const open = l.tree.filter((n) => canNode(g, i, n.id));
    if (open.length) buyNode(g, i, rng.pick(open).id);
  });
  buyWonder(g);
  buyRegion(g);
  for (let k = 0; k < 3; k++) {
    const m = calcMods(g);
    const r = rng.int(0, 9);
    if (r < 8) {
      if (tierOpen(g, r, m)) buyGen(g, r, 1, m);
    } else if (r === 8) buyDecree(g, 1, m);
    else buyUp(g, rng.pick(UPGRADES).id, m);
  }
  for (let i = 2; i >= 0; i--) {
    if (gainOf(g, i).gte(1) && g.runTime > 60) {
      prestige(g, i);
      return;
    }
  }
}
