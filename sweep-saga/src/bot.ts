/** Bots for tests and balance sims. The smart bot uses the logic solver on what the player can see. */
import { HIDDEN, MON, OPEN, SEEN, deduce, known, looksChest, nbrs } from './board';
import { BOONS, type BoonId } from './data';
import { baseDamage, canLevel, damageFor, slots, stairsOpen, type Action, type RunState } from './run';

const BOON_RANK: BoonId[] = ['armor', 'tough', 'phoenix', 'scholar', 'vamp', 'hunter', 'alchemy', 'pouch', 'lantern', 'lens', 'salt', 'greed', 'keyring', 'sense'];

function rewardAction(r: RunState, smart: boolean, rnd: () => number): Action {
  if (!r.boonPicked) {
    if (!smart) return { t: 'boon', k: Math.floor(rnd() * r.boonOffer.length) };
    let best = 0;
    r.boonOffer.forEach((b, k) => {
      if (BOON_RANK.indexOf(b) < BOON_RANK.indexOf(r.boonOffer[best])) best = k;
    });
    return { t: 'boon', k: best };
  }
  if (smart) {
    const order = ['maxhp', 'potion', 'ward', 'scroll', 'key'];
    for (const want of order) {
      const k = r.shop.findIndex((o) => !o.sold && o.price <= r.gold && (o.kind === want || o.item === want));
      if (k < 0) continue;
      const o = r.shop[k];
      if (o.kind === 'item' && r.items.length >= slots(r)) continue;
      return { t: 'buy', k };
    }
  }
  return { t: 'next' };
}

/** Picks one action. `rnd` makes the weak bot random. */
export function botAction(r: RunState, smart: boolean, rnd: () => number = Math.random): Action {
  if (r.phase === 'reward') return rewardAction(r, smart, rnd);
  const b = r.board;
  const n = b.w * b.h;
  if (!b.gen) return { t: 'tile', i: Math.floor(b.h / 2) * b.w + Math.floor(b.w / 2) };

  // Items left on open tiles.
  if (r.items.length < slots(r)) for (let i = 0; i < n; i++) if (b.st[i] === OPEN && b.item[i]) return { t: 'tile', i };

  if (!smart) return weakAction(r, rnd);

  const dom = deduce(b);
  for (let i = 0; i < n; i++) if (b.st[i] === HIDDEN && dom[i] === 1) return { t: 'tile', i };
  if (r.keys > 0) for (let i = 0; i < n; i++) if (looksChest(b, i) && dom[i] === 1) return { t: 'tile', i };

  // Known monsters, cheapest first.
  let best = -1;
  let bestD = 1e9;
  for (let i = 0; i < n; i++) {
    if (b.kind[i] !== MON || b.st[i] === OPEN) continue;
    const v = known(b, dom, i);
    const vis = b.st[i] === SEEN && !looksChest(b, i);
    if (!(v > 0 || vis)) continue;
    const d = Math.max(0, baseDamage(r, i) - r.ward);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0 && bestD < r.hp) {
    // Save the ward for a big fight.
    const wi = r.items.indexOf('ward');
    if (wi >= 0 && !r.ward && bestD >= 4) return { t: 'use', slot: wi };
    return { t: 'tile', i: best };
  }
  if (canLevel(r)) return { t: 'level' };
  const pi = r.items.indexOf('potion');
  if (pi >= 0 && r.hp < r.maxHp) return { t: 'use', slot: pi };
  const wi = r.items.indexOf('ward');
  if (wi >= 0 && !r.ward && best >= 0) return { t: 'use', slot: wi };
  // A bomb on a known monster we cannot afford (not the boss).
  const bi = r.items.indexOf('bomb');
  if (bi >= 0 && best >= 0 && b.mon[best] !== 'boss') return { t: 'use', slot: bi, i: best };
  // Scroll on the tile with the most unknown neighbors.
  const si = r.items.indexOf('scroll');
  const unknownAt = (i: number) => b.st[i] === HIDDEN && dom[i] !== 1 && known(b, dom, i) < 0;
  if (si >= 0) {
    let bt = -1;
    let bc = 0;
    for (let i = 0; i < n; i++) {
      let c = unknownAt(i) ? 1 : 0;
      for (const k of nbrs(b)[i]) if (unknownAt(k)) c++;
      if (c > bc) {
        bc = c;
        bt = i;
      }
    }
    if (bt >= 0) return { t: 'use', slot: si, i: bt };
  }
  if (stairsOpen(r)) return { t: 'descend' };
  // Forced guess: the unknown tile with the smallest worst case.
  let g = -1;
  let gScore = 1e9;
  for (let i = 0; i < n; i++) {
    if (!unknownAt(i)) continue;
    let mx = 0;
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < b.vals.length; k++)
      if (dom[i] & (1 << k)) {
        mx = Math.max(mx, b.vals[k]);
        sum += b.vals[k];
        cnt++;
      }
    const s = (damageFor(r, mx) >= r.hp ? 1000 : 0) + sum / cnt;
    if (s < gScore) {
      gScore = s;
      g = i;
    }
  }
  if (g >= 0) return { t: 'tile', i: g };
  // Nothing left but too-strong monsters: fight the cheapest.
  if (best >= 0) return { t: 'tile', i: best };
  return { t: 'descend' };
}

function weakAction(r: RunState, rnd: () => number): Action {
  const b = r.board;
  if (canLevel(r)) return { t: 'level' };
  const pi = r.items.indexOf('potion');
  if (pi >= 0 && r.hp <= 3) return { t: 'use', slot: pi };
  if (stairsOpen(r)) return { t: 'descend' };
  const opts: number[] = [];
  for (let i = 0; i < b.st.length; i++) if (b.st[i] === HIDDEN || (b.st[i] === SEEN && !looksChest(b, i))) opts.push(i);
  if (!opts.length) return { t: 'descend' };
  return { t: 'tile', i: opts[Math.floor(rnd() * opts.length)] };
}

export const boonName = (b: BoonId): string => BOONS[b].name;
