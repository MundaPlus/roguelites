/** Player bots for the debug API and the balance sim. */
import { DEFAULT_HORIZON, bestPlacement, randomPlacement, type AiCtx, type Stamp } from './ai';
import { boardFromString } from './engine';
import { ENEMIES } from './data';
import type { Rng } from './rng';
import { enemyCfg, playerCfg, tplCost, turnBudget, zoneExtra, type Reward, type RunState } from './run';

export type BotKind = 'random' | 'smart';

export function playerCtx(run: RunState): AiCtx {
  const f = run.fight!;
  return {
    board: boardFromString(f.board),
    side: 1,
    templates: run.templates,
    budget: turnBudget(run),
    zoneExtra: zoneExtra(run),
    cost: (t) => tplCost(run, t),
    p: playerCfg(run),
    e: enemyCfg(ENEMIES[f.enemy]),
    coreP: run.core,
    coreE: f.eCore,
    caution: 1,
    horizon: DEFAULT_HORIZON,
  };
}

export function botPlacement(kind: BotKind, run: RunState, rng: Rng, tries = 40): Stamp[] {
  const ctx = playerCtx(run);
  return kind === 'random' ? randomPlacement(rng, ctx) : bestPlacement(rng, ctx, tries);
}

const CARD_RANK = ['wild', 'thick', 'stubborn', 'regrow', 'sharp', 'forward', 'stencil', 'leech', 'highlife', 'bank', 'lone'];
const TPL_RANK = ['lwss', 'mwss', 'eater', 'loaf', 'beehive', 'toad', 'beacon', 'boat', 'rpent', 'diehard', 'acorn'];

/** Index of the reward a bot takes. */
export function pickReward(kind: BotKind, run: RunState, offer: Reward[], rng: Rng): number {
  if (kind === 'random') return rng.int(0, offer.length - 1);
  const val = (r: Reward): number => {
    if (r.kind === 'heal') return run.core < run.maxCore * 0.5 ? 90 : 10;
    if (r.kind === 'cells') return 80;
    if (r.kind === 'max') return 40;
    if (r.kind === 'card') return 70 - CARD_RANK.indexOf(r.id) * 4;
    return 60 - TPL_RANK.indexOf(r.id) * 4;
  };
  let best = 0;
  offer.forEach((r, i) => {
    if (val(r) > val(offer[best])) best = i;
  });
  return best;
}
