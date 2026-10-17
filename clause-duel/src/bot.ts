/** Run bots for the debug API and the balance sim. Only the draft differs between the modes. */
import type { PerkId } from './data';
import { evalDraft, goodPick, randomPick, type BotPick, type Matchup } from './draft';
import type { Rng } from './rng';
import { encSeed, playerStats, type NodeKind, type Reward, type RunState } from './run';

export type DraftMode = 'good' | 'random';

export function matchup(run: RunState): Matchup {
  return { me: playerStats(run), foe: run.enc!.foe, def: run.enc!.def, seed: encSeed(run) };
}

export function pickNode(run: RunState): number {
  const row = run.map[run.row];
  const frac = run.hp / run.max;
  const pref = (k: NodeKind): number => {
    switch (k) {
      case 'rest':
        return frac < 0.6 ? 5 : 1;
      case 'scribe':
        return run.gold >= 45 ? 4 : 0.5;
      case 'elite':
        return frac > 0.8 ? 3 : -2;
      case 'fight':
        return frac > 0.45 ? 2 : 0;
      default:
        return 0;
    }
  };
  let best = 0;
  for (let i = 1; i < row.length; i++) if (pref(row[i]) > pref(row[best])) best = i;
  return best;
}

export function draftPick(run: RunState, mode: DraftMode, rng: Rng): BotPick {
  const d = run.draft!;
  if (mode === 'random') return randomPick(d, rng);
  return goodPick(d, evalDraft(matchup(run), d, 24), run.perks.includes('veto') && !d.vetoUsed);
}

const PERK_ORDER: PerkId[] = ['fourth', 'veto', 'extra', 'mind'];

function rewardValue(run: RunState, r: Reward): number {
  switch (r.k) {
    case 'perk':
      return 10 - PERK_ORDER.indexOf(r.id);
    case 'card':
      return run.pool.length < 5 ? 5 : 2;
    case 'up':
      return r.id === 'vit' ? 6 : r.id === 'str' ? 5.5 : r.id === 'stance' ? 4 : 3;
    case 'heal':
      return run.hp < run.max * 0.6 ? 7 : 0;
  }
}

export function pickReward(run: RunState, rewards: Reward[]): number {
  let best = 0;
  for (let i = 1; i < rewards.length; i++) if (rewardValue(run, rewards[i]) > rewardValue(run, rewards[best])) best = i;
  return best;
}

/** Index of the shop item to buy next, or -1 to leave. */
export function pickBuy(run: RunState): number {
  let best = -1;
  let bv = 2.5;
  run.shop.forEach((it, i) => {
    if (it.sold || it.cost > run.gold) return;
    if (it.r.k === 'heal' && run.hp >= run.max) return;
    const v = rewardValue(run, it.r);
    if (v > bv) {
      bv = v;
      best = i;
    }
  });
  return best;
}

export function restChoice(run: RunState): number {
  return run.hp < run.max * 0.75 ? -1 : pickReward(run, run.rewards);
}
