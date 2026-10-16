/** Run state and every game action. Pure logic, no DOM, so the sim can use it too. */
import { type Card, type Edition, type Enh, type HandType, type Seal, type Suit, HAND_TYPES, sortHand, standardDeck } from './cards';
import { BLIND_REWARD, BOSS, BOSSES, PLANET, PLANETS, TAROT, TAROTS, WIN_ANTE, blindTarget } from './data';
import { JOKERS, JOKER_IDS, LOCKED_JOKERS, BLINDS_PER_UNLOCK, type JokerInst, sellValue } from './jokers';
import { Rng, hash } from './rng';
import { type ScoreInput, type ScoreResult, hasPassive, score } from './score';

export type Stage = 'blind' | 'round' | 'cashout' | 'shop' | 'pack' | 'won';

export interface Round {
  blind: number;
  target: number;
  score: number;
  draw: Card[];
  hand: Card[];
  played: Card[];
  handsLeft: number;
  discardsLeft: number;
  discardsUsed: number;
  handSize: number;
  roundTypes: HandType[];
  mouthType: HandType | null;
  disabled: number;
}

export interface Cons {
  kind: 'planet' | 'tarot';
  id: string;
}

export interface ShopItem {
  kind: 'joker' | 'planet' | 'tarot';
  id: string;
  ed?: Edition;
  price: number;
  sold?: boolean;
}

export type PackKind = 'buffoon' | 'celestial' | 'arcana' | 'standard';
export const PACK_INFO: Record<PackKind, { name: string; icon: string; text: string; price: number }> = {
  buffoon: { name: 'Buffoon Pack', icon: '🎪', text: 'Choose 1 of 2 jokers', price: 5 },
  celestial: { name: 'Celestial Pack', icon: '🌌', text: 'Choose 1 of 3 planets (used at once)', price: 4 },
  arcana: { name: 'Arcana Pack', icon: '🔮', text: 'Choose 1 of 3 tarots', price: 4 },
  standard: { name: 'Standard Pack', icon: '🂠', text: 'Add 1 of 3 special cards to your deck', price: 4 },
};

export interface PackOpt {
  kind: 'joker' | 'planet' | 'tarot' | 'card';
  id: string;
  ed?: Edition;
  card?: Card;
}

export interface Shop {
  items: ShopItem[];
  packs: { kind: PackKind; sold?: boolean }[];
  reroll: number;
}

export interface Cash {
  lines: { text: string; $: number }[];
  total: number;
}

export interface RunState {
  v: 1;
  seed: string;
  deckId: string;
  ante: number;
  blind: number;
  boss: string;
  bossHistory: string[];
  money: number;
  cards: Card[];
  nextId: number;
  jokers: JokerInst[];
  nextUid: number;
  cons: Cons[];
  levels: Record<HandType, number>;
  handPlays: Record<HandType, number>;
  slots: number;
  consSlots: number;
  hands: number;
  discards: number;
  handSize: number;
  stage: Stage;
  round: Round | null;
  shop: Shop | null;
  pack: { kind: PackKind; opts: PackOpt[] } | null;
  cash: Cash | null;
  planetsUsed: number;
  cardsAdded: number;
  rc: number;
  endless: boolean;
  sortBy: 'rank' | 'suit';
  lastType: HandType | null;
  stats: { best: number; bestType: string; blinds: number; hands: number; rec?: number };
  /** Jokers that may show up in this run (meta unlocks). */
  pool: string[];
}

export interface Meta {
  runs: number;
  wins: number;
  bestAnte: number;
  blinds: number;
  bestHand: number;
  bestScore: number;
}

const RUN_KEY = 'highcard.run';
const META_KEY = 'highcard.meta';

export const rngFor = (run: RunState, tag: string): Rng => new Rng(hash(run.seed, tag, run.rc++));

function zeroTypes(v: number): Record<HandType, number> {
  return Object.fromEntries(HAND_TYPES.map((t) => [t, v])) as Record<HandType, number>;
}

export function unlockedJokers(meta: Meta): string[] {
  const n = Math.floor(meta.blinds / BLINDS_PER_UNLOCK);
  const open = new Set(LOCKED_JOKERS.slice(0, n));
  return JOKER_IDS.filter((id) => !LOCKED_JOKERS.includes(id) || open.has(id));
}

export function deckUnlocked(meta: Meta, unlock: number): boolean {
  return unlock === 9 ? meta.wins > 0 : meta.bestAnte >= unlock;
}

export function newRun(seed: string, deckId: string, pool: string[]): RunState {
  let cards: Card[];
  if (deckId === 'checkered') {
    cards = standardDeck(1).map((c) => ({ ...c, suit: (c.suit === 2 ? 0 : c.suit === 3 ? 1 : c.suit) as Suit }));
  } else if (deckId === 'abandoned') {
    cards = standardDeck(1, (c) => c.rank < 11 || c.rank > 13);
  } else cards = standardDeck(1);
  const run: RunState = {
    v: 1,
    seed,
    deckId,
    ante: 1,
    blind: 0,
    boss: '',
    bossHistory: [],
    money: deckId === 'yellow' ? 14 : 4,
    cards,
    nextId: 100,
    jokers: [],
    nextUid: 1,
    cons: [],
    levels: zeroTypes(1),
    handPlays: zeroTypes(0),
    slots: deckId === 'black' ? 6 : 5,
    consSlots: 2,
    hands: 4 + (deckId === 'blue' ? 1 : 0) - (deckId === 'black' ? 1 : 0),
    discards: 3 + (deckId === 'red' ? 1 : 0),
    handSize: 8,
    stage: 'blind',
    round: null,
    shop: null,
    pack: null,
    cash: null,
    planetsUsed: 0,
    cardsAdded: 0,
    rc: 0,
    endless: false,
    sortBy: 'rank',
    lastType: null,
    stats: { best: 0, bestType: '', blinds: 0, hands: 0 },
    pool,
  };
  run.boss = pickBoss(run);
  return run;
}

const poolOf = (run: RunState): string[] => (run.pool?.length ? run.pool : JOKER_IDS);

function pickBoss(run: RunState): string {
  const r = rngFor(run, 'boss');
  const final = run.ante % WIN_ANTE === 0;
  let list = BOSSES.filter((b) => (final ? b.final : !b.final && b.minAnte <= run.ante));
  const fresh = list.filter((b) => !run.bossHistory.includes(b.id));
  if (fresh.length) list = fresh;
  const id = r.pick(list).id;
  run.bossHistory.push(id);
  return id;
}

export const curBoss = (run: RunState): string | null => (run.round && run.round.blind === 2 ? run.boss : null);
export const targetFor = (run: RunState, blind: number): number => blindTarget(run.ante, blind, blind === 2 ? run.boss : null);

// ---------- Round ----------

export function startRound(run: RunState): void {
  const r = rngFor(run, 'deal');
  const boss = run.blind === 2 ? run.boss : null;
  const handSize = run.handSize + (hasPassive(run.jokers, 'handSize') ? 1 : 0) - (boss === 'manacle' ? 1 : 0);
  run.round = {
    blind: run.blind,
    target: targetFor(run, run.blind),
    score: 0,
    draw: r.shuffle(run.cards.map((c) => ({ ...c }))),
    hand: [],
    played: [],
    handsLeft: boss === 'needle' ? 1 : run.hands,
    discardsLeft: boss === 'water' ? 0 : run.discards + (hasPassive(run.jokers, 'discard') ? 1 : 0),
    discardsUsed: 0,
    handSize,
    roundTypes: [],
    mouthType: null,
    disabled: -1,
  };
  pickDisabled(run);
  drawUp(run);
  run.stage = 'round';
}

function pickDisabled(run: RunState): void {
  const rd = run.round!;
  rd.disabled = curBoss(run) === 'crimson' && run.jokers.length ? rngFor(run, 'crimson').int(0, run.jokers.length - 1) : -1;
}

export function drawUp(run: RunState): void {
  const rd = run.round!;
  while (rd.hand.length < rd.handSize && rd.draw.length) rd.hand.push(rd.draw.pop()!);
  rd.hand = sortHand(rd.hand, run.sortBy);
}

export function setSort(run: RunState, by: 'rank' | 'suit'): void {
  run.sortBy = by;
  if (run.round) run.round.hand = sortHand(run.round.hand, by);
}

export function playError(run: RunState, ids: number[]): string | null {
  const rd = run.round;
  if (!rd || rd.handsLeft <= 0) return 'No hands left';
  if (ids.length < 1) return 'Select 1 to 5 cards';
  if (ids.length > 5) return 'Play at most 5 cards';
  if (curBoss(run) === 'psychic' && ids.length < Math.min(5, rd.hand.length)) return 'The Psychic: play 5 cards';
  return null;
}

export function scoreInput(run: RunState, played: Card[], held: Card[], rnd?: () => number): ScoreInput {
  const rd = run.round!;
  return {
    played,
    held,
    jokers: run.jokers,
    levels: run.levels,
    boss: curBoss(run),
    money: run.money,
    discardsLeft: rd.discardsLeft,
    discardsUsed: rd.discardsUsed,
    handsLeft: rd.handsLeft - (rnd ? 0 : 1),
    drawLeft: rd.draw.length,
    handPlays: run.handPlays,
    roundTypes: rd.roundTypes,
    slots: run.slots,
    planetsUsed: run.planetsUsed,
    cardsAdded: run.cardsAdded,
    steelCount: run.cards.filter((c) => c.enh === 'steel').length,
    disabled: rd.disabled,
    mouthType: rd.mouthType,
    rnd,
  };
}

/** Score preview for selected cards (no random effects, no state change). */
export function preview(run: RunState, ids: number[]): ScoreResult {
  const rd = run.round!;
  const played = rd.hand.filter((c) => ids.includes(c.id));
  const held = rd.hand.filter((c) => !ids.includes(c.id));
  return score(scoreInput(run, played, held));
}

/** Step 1 of a play: move the cards to the play area. */
export function beginPlay(run: RunState, ids: number[]): void {
  const rd = run.round!;
  rd.played = rd.hand.filter((c) => ids.includes(c.id));
  rd.hand = rd.hand.filter((c) => !ids.includes(c.id));
  rd.handsLeft--;
}

/** Step 2: score the played cards and apply the results. */
export function scorePlayed(run: RunState): ScoreResult {
  const rd = run.round!;
  const r = rngFor(run, 'score');
  const boss = curBoss(run);
  const res = score({ ...scoreInput(run, rd.played, rd.hand, () => r.next()), log: true });
  rd.score += res.total;
  run.money += res.money;
  if (boss === 'tooth') run.money -= rd.played.length;
  if (boss === 'arm' && run.levels[res.type] > 1) run.levels[res.type]--;
  if (boss === 'mouth' && !rd.mouthType) rd.mouthType = res.type;
  run.jokers.forEach((j, i) => (j.v = res.newVals[i]));
  for (const j of [...run.jokers]) {
    if (j.id === 'icecream') {
      j.v -= 5;
      if (j.v <= 0) run.jokers = run.jokers.filter((x) => x !== j);
    }
  }
  run.handPlays[res.type]++;
  rd.roundTypes.push(res.type);
  run.lastType = res.type;
  run.stats.hands++;
  if (res.total > run.stats.best) {
    run.stats.best = res.total;
    run.stats.bestType = res.type;
  }
  if (res.broken.length) {
    run.cards = run.cards.filter((c) => !res.broken.includes(c.id));
    rd.played = rd.played.filter((c) => !res.broken.includes(c.id));
  }
  return res;
}

/** Step 3: clear the play area and draw. Returns the round state. */
export function finishPlay(run: RunState): 'won' | 'lost' | 'go' {
  const rd = run.round!;
  rd.played = [];
  if (rd.score >= rd.target) return 'won';
  if (rd.handsLeft <= 0) return 'lost';
  if (curBoss(run) === 'hook' && rd.hand.length) {
    const r = rngFor(run, 'hook');
    for (let k = 0; k < 2 && rd.hand.length; k++) rd.hand.splice(r.int(0, rd.hand.length - 1), 1);
  }
  drawUp(run);
  pickDisabled(run);
  return 'go';
}

export function discard(run: RunState, ids: number[]): string | null {
  const rd = run.round!;
  if (rd.discardsLeft <= 0) return 'No discards left';
  if (ids.length < 1 || ids.length > 5) return 'Discard 1 to 5 cards';
  const cards = rd.hand.filter((c) => ids.includes(c.id));
  for (const c of cards) if (c.seal === 'purple') addCons(run, { kind: 'tarot', id: randomTarot(run) });
  run.jokers.forEach((j) => {
    const d = JOKERS[j.id];
    if (d.discard) j.v = d.discard(j.v, cards);
  });
  rd.hand = rd.hand.filter((c) => !ids.includes(c.id));
  rd.discardsLeft--;
  rd.discardsUsed++;
  drawUp(run);
  return null;
}

/** The round is won: compute the payout. */
export function endRound(run: RunState): Cash {
  const rd = run.round!;
  const lines: Cash['lines'] = [];
  lines.push({ text: `${rd.blind === 2 ? BOSS[run.boss].name : rd.blind === 1 ? 'Big Blind' : 'Small Blind'} reward`, $: BLIND_REWARD[rd.blind] });
  if (rd.handsLeft) lines.push({ text: `${rd.handsLeft} hand${rd.handsLeft > 1 ? 's' : ''} left ($1 each)`, $: rd.handsLeft });
  const interest = Math.min(5, Math.floor(Math.max(0, run.money) / 5));
  if (interest) lines.push({ text: 'Interest ($1 per $5, max $5)', $: interest });
  const gold = rd.hand.filter((c) => c.enh === 'gold').length;
  if (gold) lines.push({ text: `${gold} Gold card${gold > 1 ? 's' : ''} held`, $: 3 * gold });
  const r = rngFor(run, 'end');
  for (const j of [...run.jokers]) {
    const d = JOKERS[j.id];
    if (j.id === 'delayed' && rd.discardsUsed === 0 && rd.discardsLeft) lines.push({ text: `${d.name}`, $: 2 * rd.discardsLeft });
    const e = d.endRound?.(j.v, () => r.next());
    if (!e) continue;
    if (e.$) lines.push({ text: d.name, $: e.$ });
    if (e.v !== undefined) j.v = e.v;
    if (e.destroy) {
      run.jokers = run.jokers.filter((x) => x !== j);
      lines.push({ text: `${d.icon} ${d.name} spoiled!`, $: 0 });
    }
  }
  if (run.lastType) {
    const blue = rd.hand.filter((c) => c.seal === 'blue').length;
    const pl = PLANETS.find((p) => p.hand === run.lastType)!;
    for (let k = 0; k < blue; k++) addCons(run, { kind: 'planet', id: pl.id });
  }
  const cash = { lines, total: lines.reduce((a, l) => a + l.$, 0) };
  run.cash = cash;
  run.stats.blinds++;
  run.stage = 'cashout';
  return cash;
}

/** Take the payout and go on. Returns true when the run is won. */
export function collect(run: RunState): boolean {
  run.money += run.cash?.total ?? 0;
  run.cash = null;
  const wasBoss = run.round?.blind === 2;
  run.round = null;
  if (wasBoss) {
    if (run.ante === WIN_ANTE && !run.endless) {
      run.stage = 'won';
      return true;
    }
    run.ante++;
    run.blind = 0;
    run.boss = pickBoss(run);
  } else run.blind++;
  makeShop(run);
  return false;
}

export function continueEndless(run: RunState): void {
  run.endless = true;
  run.ante++;
  run.blind = 0;
  run.boss = pickBoss(run);
  makeShop(run);
}

// ---------- Shop ----------

function randomJoker(run: RunState, r: Rng): string {
  const owned = new Set(run.jokers.map((j) => j.id));
  const pool = poolOf(run).filter((id) => !owned.has(id));
  const rarity = r.weighted<1 | 2 | 3>([
    [1, 70],
    [2, 25],
    [3, 5],
  ]);
  const list = pool.filter((id) => JOKERS[id].rarity === rarity);
  return r.pick(list.length ? list : pool.length ? pool : JOKER_IDS);
}

function randomEdition(r: Rng): Edition | undefined {
  const x = r.next();
  return x < 0.015 ? 'poly' : x < 0.045 ? 'holo' : x < 0.085 ? 'foil' : undefined;
}

const ED_PRICE: Record<Edition, number> = { foil: 2, holo: 3, poly: 5 };

export function randomTarot(run: RunState, r: Rng = rngFor(run, 'tarot')): string {
  const rare = r.chance(0.12);
  return r.pick(TAROTS.filter((t) => !!t.rare === rare)).id;
}

function shopItem(run: RunState, r: Rng): ShopItem {
  const kind = r.weighted<ShopItem['kind']>([
    ['joker', 20],
    ['planet', 5],
    ['tarot', 5],
  ]);
  if (kind === 'joker') {
    const id = randomJoker(run, r);
    const ed = randomEdition(r);
    return { kind, id, ed, price: JOKERS[id].cost + (ed ? ED_PRICE[ed] : 0) };
  }
  if (kind === 'planet') return { kind, id: r.pick(PLANETS).id, price: 3 };
  return { kind, id: randomTarot(run, r), price: 3 };
}

export function makeShop(run: RunState): void {
  const r = rngFor(run, 'shop');
  const kinds: PackKind[] = ['buffoon', 'celestial', 'arcana', 'standard'];
  run.shop = {
    items: [shopItem(run, r), shopItem(run, r)],
    packs: [{ kind: r.pick(kinds) }, { kind: r.pick(kinds) }],
    reroll: 5,
  };
  run.stage = 'shop';
}

export function reroll(run: RunState): string | null {
  const s = run.shop!;
  if (run.money < s.reroll) return 'Not enough money';
  run.money -= s.reroll;
  s.reroll++;
  const r = rngFor(run, 'reroll');
  s.items = [shopItem(run, r), shopItem(run, r)];
  return null;
}

export function addCons(run: RunState, c: Cons): boolean {
  if (run.cons.length >= run.consSlots) return false;
  run.cons.push(c);
  return true;
}

export function addJoker(run: RunState, id: string, ed?: Edition): boolean {
  if (run.jokers.length >= run.slots) return false;
  run.jokers.push({ uid: run.nextUid++, id, v: JOKERS[id].v0 ?? 0, ed });
  return true;
}

export function buyItem(run: RunState, i: number): string | null {
  const it = run.shop!.items[i];
  if (!it || it.sold) return 'Sold out';
  if (run.money < it.price) return 'Not enough money';
  if (it.kind === 'joker') {
    if (!addJoker(run, it.id, it.ed)) return 'No free joker slot';
  } else if (!addCons(run, { kind: it.kind, id: it.id })) return 'No free consumable slot';
  run.money -= it.price;
  it.sold = true;
  return null;
}

export function buyPack(run: RunState, i: number): string | null {
  const p = run.shop!.packs[i];
  if (!p || p.sold) return 'Sold out';
  const info = PACK_INFO[p.kind];
  if (run.money < info.price) return 'Not enough money';
  run.money -= info.price;
  p.sold = true;
  const r = rngFor(run, 'pack');
  const opts: PackOpt[] = [];
  const n = p.kind === 'buffoon' ? 2 : 3;
  const seen = new Set<string>();
  for (let k = 0; k < n; k++) {
    let o: PackOpt;
    let tries = 0;
    do {
      if (p.kind === 'buffoon') o = { kind: 'joker', id: randomJoker(run, r), ed: randomEdition(r) };
      else if (p.kind === 'celestial') o = { kind: 'planet', id: r.pick(PLANETS).id };
      else if (p.kind === 'arcana') o = { kind: 'tarot', id: randomTarot(run, r) };
      else o = { kind: 'card', id: `c${k}`, card: specialCard(run, r) };
    } while (seen.has(o.id) && ++tries < 10);
    seen.add(o.id);
    opts.push(o);
  }
  run.pack = { kind: p.kind, opts };
  run.stage = 'pack';
  return null;
}

function specialCard(run: RunState, r: Rng): Card {
  const suits: Suit[] = run.deckId === 'checkered' ? [0, 1] : [0, 1, 2, 3];
  const ranks = run.deckId === 'abandoned' ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 14] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const c: Card = { id: 0, rank: r.pick(ranks), suit: r.pick(suits) };
  const enh: Enh[] = ['bonus', 'mult', 'glass', 'steel', 'gold', 'lucky'];
  const seals: Seal[] = ['red', 'gold', 'blue', 'purple'];
  c.enh = r.pick(enh);
  if (r.chance(0.25)) c.seal = r.pick(seals);
  c.ed = r.chance(0.2) ? randomEdition(r) ?? 'foil' : undefined;
  return c;
}

export function packError(run: RunState, i: number): string | null {
  const o = run.pack?.opts[i];
  if (!o) return 'Nothing there';
  if (o.kind === 'joker' && run.jokers.length >= run.slots) return 'No free joker slot';
  if (o.kind === 'tarot' && run.cons.length >= run.consSlots) return 'No free consumable slot';
  return null;
}

export function pickPack(run: RunState, i: number): string | null {
  const err = packError(run, i);
  if (err) return err;
  const o = run.pack!.opts[i];
  if (o.kind === 'joker') addJoker(run, o.id, o.ed);
  else if (o.kind === 'tarot') addCons(run, { kind: 'tarot', id: o.id });
  else if (o.kind === 'planet') usePlanet(run, o.id);
  else if (o.card) {
    run.cards.push({ ...o.card, id: run.nextId++ });
    run.cardsAdded++;
  }
  run.pack = null;
  run.stage = 'shop';
  return null;
}

export function skipPack(run: RunState): void {
  run.pack = null;
  run.stage = 'shop';
}

export function sellJoker(run: RunState, i: number): void {
  const j = run.jokers[i];
  if (!j) return;
  run.money += sellValue(j);
  run.jokers.splice(i, 1);
  if (run.round) {
    pickDisabled(run);
    run.round.handSize = Math.max(1, run.handSize + (hasPassive(run.jokers, 'handSize') ? 1 : 0) - (curBoss(run) === 'manacle' ? 1 : 0));
  }
}

export function moveJoker(run: RunState, i: number, d: number): void {
  const k = i + d;
  if (k < 0 || k >= run.jokers.length) return;
  const rd = run.round;
  [run.jokers[i], run.jokers[k]] = [run.jokers[k], run.jokers[i]];
  if (rd && rd.disabled >= 0) rd.disabled = rd.disabled === i ? k : rd.disabled === k ? i : rd.disabled;
}

export function sellCons(run: RunState, i: number): void {
  if (!run.cons[i]) return;
  run.money += 1;
  run.cons.splice(i, 1);
}

export function nextBlind(run: RunState): void {
  run.shop = null;
  run.stage = 'blind';
}

// ---------- Consumables ----------

export function usePlanet(run: RunState, id: string): void {
  run.levels[PLANET[id].hand]++;
  run.planetsUsed++;
}

function mutCard(run: RunState, id: number, fn: (c: Card) => void): void {
  for (const list of [run.cards, run.round?.hand ?? [], run.round?.draw ?? []]) {
    const c = list.find((x) => x.id === id);
    if (c) fn(c);
  }
}

/** Why a consumable can not be used now, or null. */
export function consError(run: RunState, i: number, sel: number[]): string | null {
  const c = run.cons[i];
  if (!c) return 'Nothing there';
  if (c.kind === 'planet') return null;
  const t = TAROT[c.id];
  if (t.min === 0) {
    if (c.id === 'judgement' && run.jokers.length >= run.slots) return 'No free joker slot';
    if (c.id === 'wheel' && !run.jokers.some((j) => !j.ed)) return 'No joker without an edition';
    return null;
  }
  if (run.stage !== 'round' || !run.round) return 'Use it during a round on cards in your hand';
  if (sel.length < t.min || sel.length > t.max) return t.min === t.max ? `Select ${t.min} card${t.min > 1 ? 's' : ''}` : `Select ${t.min} to ${t.max} cards`;
  return null;
}

/** Uses consumable `i` on the selected hand cards. Returns a message for the toast. */
export function useCons(run: RunState, i: number, sel: number[]): { err?: string; msg?: string } {
  const err = consError(run, i, sel);
  if (err) return { err };
  const c = run.cons.splice(i, 1)[0];
  if (c.kind === 'planet') {
    usePlanet(run, c.id);
    const t = PLANET[c.id].hand;
    return { msg: `${t} is now level ${run.levels[t]}` };
  }
  const r = rngFor(run, 'use');
  const hand = run.round?.hand ?? [];
  const cards = hand.filter((x) => sel.includes(x.id));
  const setEnh = (e: Enh): void => cards.forEach((x) => mutCard(run, x.id, (y) => (y.enh = e)));
  const setSuit = (s: Suit): void => cards.forEach((x) => mutCard(run, x.id, (y) => (y.suit = s)));
  const setSeal = (s: Seal): void => cards.forEach((x) => mutCard(run, x.id, (y) => (y.seal = s)));
  let msg = TAROT[c.id].name;
  switch (c.id) {
    case 'magician':
      setEnh('lucky');
      break;
    case 'empress':
      setEnh('mult');
      break;
    case 'hierophant':
      setEnh('bonus');
      break;
    case 'justice':
      setEnh('glass');
      break;
    case 'chariot':
      setEnh('steel');
      break;
    case 'devil':
      setEnh('gold');
      break;
    case 'star':
      setSuit(3);
      break;
    case 'moonc':
      setSuit(2);
      break;
    case 'sun':
      setSuit(1);
      break;
    case 'world':
      setSuit(0);
      break;
    case 'strength':
      cards.forEach((x) => mutCard(run, x.id, (y) => (y.rank = y.rank === 14 ? 2 : y.rank + 1)));
      break;
    case 'hanged': {
      const ids = cards.map((x) => x.id);
      run.cards = run.cards.filter((x) => !ids.includes(x.id));
      if (run.round) run.round.hand = run.round.hand.filter((x) => !ids.includes(x.id));
      msg = `Destroyed ${cards.length} card${cards.length > 1 ? 's' : ''}`;
      break;
    }
    case 'death': {
      const [a, b] = [...cards].sort((x, y) => hand.indexOf(x) - hand.indexOf(y));
      mutCard(run, a.id, (y) => {
        y.rank = b.rank;
        y.suit = b.suit;
        y.enh = b.enh;
        y.seal = b.seal;
        y.ed = b.ed;
      });
      break;
    }
    case 'hermit': {
      const g = Math.min(20, Math.max(0, run.money));
      run.money += g;
      msg = `+$${g}`;
      break;
    }
    case 'temperance': {
      const g = Math.min(50, run.jokers.reduce((a, j) => a + sellValue(j), 0));
      run.money += g;
      msg = `+$${g}`;
      break;
    }
    case 'priestess':
      for (let k = 0; k < 2; k++) addCons(run, { kind: 'planet', id: r.pick(PLANETS).id });
      break;
    case 'emperor':
      for (let k = 0; k < 2; k++) addCons(run, { kind: 'tarot', id: randomTarot(run, r) });
      break;
    case 'judgement':
      addJoker(run, randomJoker(run, r));
      msg = `New joker: ${JOKERS[run.jokers[run.jokers.length - 1].id].name}`;
      break;
    case 'wheel': {
      const list = run.jokers.filter((j) => !j.ed);
      if (r.chance(1 / 3)) {
        const j = r.pick(list);
        j.ed = r.pick<Edition>(['foil', 'foil', 'holo', 'holo', 'poly']);
        msg = `${JOKERS[j.id].name} got an edition!`;
      } else msg = 'Nope!';
      break;
    }
    case 'aura':
      cards.forEach((x) => mutCard(run, x.id, (y) => (y.ed = r.pick<Edition>(['foil', 'holo', 'poly']))));
      break;
    case 'dejavu':
      setSeal('red');
      break;
    case 'talisman':
      setSeal('gold');
      break;
    case 'trance':
      setSeal('blue');
      break;
    case 'medium':
      setSeal('purple');
      break;
  }
  if (run.round) drawUp(run);
  return { msg };
}

// ---------- Score and save ----------

export function runScore(run: RunState, won: boolean): number {
  return run.stats.blinds * 100 + (won ? 1000 : 0) + Math.floor(Math.log10(Math.max(1, run.stats.best)) * 20);
}

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
    if (run.v !== 1 || run.jokers.some((j) => !JOKERS[j.id]) || run.cons.some((c) => !(c.kind === 'planet' ? PLANET[c.id] : TAROT[c.id]))) return null;
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
  const base: Meta = { runs: 0, wins: 0, bestAnte: 0, blinds: 0, bestHand: 0, bestScore: 0 };
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

/** Adds a finished run to the meta stats. Returns the newly unlocked jokers. */
export function recordRun(meta: Meta, run: RunState, won: boolean): string[] {
  const before = unlockedJokers(meta);
  // A run in endless mode was already counted when it was won.
  if (run.stats.rec === undefined) {
    meta.runs++;
    if (won) meta.wins++;
  }
  meta.bestAnte = Math.max(meta.bestAnte, won || run.endless ? 9 : run.ante);
  meta.blinds += run.stats.blinds - (run.stats.rec ?? 0);
  run.stats.rec = run.stats.blinds;
  meta.bestHand = Math.max(meta.bestHand, run.stats.best);
  meta.bestScore = Math.max(meta.bestScore, runScore(run, won));
  return unlockedJokers(meta).filter((id) => !before.includes(id));
}
