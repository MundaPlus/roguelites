import { CARDS, canUpgrade, getCard } from './cards';
import { Combat } from './combat';
import { ACTS, ENEMIES } from './enemies';
import { EVENTS, NEOW, type EventCtx, type EventDef, type EventPage } from './events';
import { COLS, ROWS, type MapNode } from './map';
import { POTIONS, POTION_IDS } from './potions';
import { RELICS, relicsOf } from './relics';
import { INTENT_ICON, cardHtml, hpBar, statusRow } from './render';
import type { Rng } from './rng';
import {
  addCard,
  addRelic,
  cardChoices,
  cardPrice,
  clearRun,
  hasRelic,
  loadMeta,
  loadRun,
  newRun,
  obtainPotion,
  randomRelic,
  relicPrice,
  removeCard,
  rngFor,
  rollRelicRarity,
  saveMeta,
  saveRun,
  score,
  startAct,
  upgradeCard,
  type RewardKind,
  type RunState,
} from './run';
import { STATUSES } from './statuses';
import type { CardInst, RoomType } from './types';

type Screen = 'title' | 'map' | 'combat' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure' | 'bossRelic' | 'end';

interface Reward {
  kind: 'gold' | 'potion' | 'relic' | 'card';
  gold?: number;
  id?: string;
  cards?: string[];
  taken: boolean;
}

interface ShopItem {
  kind: 'card' | 'relic' | 'potion';
  id: string;
  price: number;
  sale: boolean;
  sold: boolean;
}

const ROOM_ICON: Record<RoomType, string> = { monster: '⚔️', elite: '😈', event: '❓', shop: '🛒', rest: '🔥', treasure: '🧰', boss: '💀' };
const ROOM_NAME: Record<RoomType, string> = { monster: 'Enemy', elite: 'Elite', event: 'Unknown', shop: 'Merchant', rest: 'Rest Site', treasure: 'Treasure', boss: 'Boss' };
const ROW_H = 78;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private lastScreen: Screen | null = null;

  private combat: Combat | null = null;
  private combatKind: RewardKind = 'monster';
  private encounter: string[] = [];
  private sel: number | null = null;
  private potionSel: number | null = null;
  private busy = false;
  private banner: string | null = null;

  private rewards: Reward[] = [];
  private shop: { items: ShopItem[]; removed: boolean } | null = null;
  private event: { def: EventDef; page: EventPage | null; result: string | null; rng: Rng } | null = null;
  private treasure: string | null = null;
  private bossRelics: string[] = [];
  private end: { victory: boolean; score: number } | null = null;
  private confirmAbandon = false;

  private modal = '';
  private modalResolve: ((v: unknown) => void) | null = null;
  private pickList: CardInst[] = [];

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (ev) => this.onClick(ev));
    root.addEventListener('contextmenu', (ev) => {
      if (this.sel !== null || this.potionSel !== null) {
        ev.preventDefault();
        this.cancelSelection();
      }
    });
    window.addEventListener('keydown', (ev) => this.onKey(ev));
    this.render();
  }

  // ================================================================ input

  private onClick(ev: MouseEvent): void {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el) {
      if (this.screen === 'combat' && !this.modal) this.cancelSelection();
      return;
    }
    if ((el as HTMLButtonElement).disabled) return;
    const v = el.dataset.v ?? '';
    const n = Number(v);
    switch (el.dataset.a) {
      case 'new': {
        const seed = this.root.querySelector<HTMLInputElement>('#seed')?.value ?? '';
        return this.newRun(seed);
      }
      case 'continue':
        return this.continueRun();
      case 'abandon':
        this.confirmAbandon = true;
        return this.render();
      case 'abandonYes':
        if (this.run) this.finishRun(false);
        return;
      case 'menu':
        this.screen = 'title';
        this.end = null;
        this.run = loadRun();
        return this.render();
      case 'node':
        return this.enterNode(v);
      case 'card':
        return this.clickCard(n);
      case 'enemy':
        return this.clickEnemy(n);
      case 'end':
        void this.endTurn();
        return;
      case 'pile':
        return this.showPile(v as 'draw' | 'discard' | 'exhaust');
      case 'deck':
        return void this.openModal(this.cardsModal('Your Deck', this.run!.deck));
      case 'mapview':
        return void this.openModal(`<div class="mbox wide mapmodal">${this.mapHtml(false)}<button data-a="close">Close</button></div>`);
      case 'potion':
        return this.potionMenu(n);
      case 'usePotion':
        this.closeModal(null);
        return this.usePotion(n);
      case 'dropPotion':
        this.run!.potions[n] = null;
        return this.closeModal(null);
      case 'close':
        return this.closeModal(null);
      case 'pick':
        return this.closeModal(this.pickList.find((c) => c.uid === n) ?? null);
      case 'pickId':
        return this.closeModal(v);
      case 'take':
        return void this.takeReward(n);
      case 'proceed':
        return this.leaveRewards();
      case 'buy':
        return this.buy(n);
      case 'removeSvc':
        return void this.removeService();
      case 'leave':
        return this.finishNode();
      case 'rest':
        return this.rest();
      case 'smith':
        return void this.smith();
      case 'choice':
        return void this.eventChoice(n);
      case 'eventDone':
        return this.eventDone();
      case 'openChest':
        return this.openChest();
      case 'bossRelic':
        return this.pickBossRelic(v);
      case 'skipBoss':
        return this.pickBossRelic(null);
    }
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.target instanceof HTMLInputElement) return;
    if (ev.key === 'Escape') {
      if (this.modal) this.closeModal(null);
      else this.cancelSelection();
      return;
    }
    if (this.modal || this.screen !== 'combat') return;
    if (ev.code === 'KeyE') void this.endTurn();
    const digit = /^Digit(\d)$/.exec(ev.code);
    if (digit) {
      const i = digit[1] === '0' ? 9 : Number(digit[1]) - 1;
      if (this.combat && i < this.combat.hand.length) this.clickCard(i);
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private openModal(html: string): Promise<unknown> {
    this.modalResolve?.(null);
    this.modal = html;
    this.render();
    return new Promise((r) => (this.modalResolve = r));
  }

  private closeModal(value: unknown): void {
    const resolve = this.modalResolve;
    this.modal = '';
    this.modalResolve = null;
    this.render();
    resolve?.(value);
  }

  // ================================================================ run flow

  private newRun(seed: string): void {
    this.run = newRun(seed);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.confirmAbandon = false;
    this.startEvent(NEOW);
  }

  private continueRun(): void {
    const run = this.run;
    if (!run) return;
    if (!run.blessed) return this.startEvent(NEOW);
    if (run.pending) return this.enterNode(run.pending, true);
    this.go('map');
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.render();
  }

  private available(): string[] {
    const run = this.run!;
    if (run.pos === null) return run.map.filter((n) => n.row === 0).map((n) => n.id);
    if (run.pos === 'boss') return [];
    const cur = run.map.find((n) => n.id === run.pos);
    if (!cur) return [];
    return cur.row === ROWS - 1 ? ['boss'] : cur.next;
  }

  private enterNode(id: string, resume = false): void {
    const run = this.run!;
    if (!resume) {
      if (!this.available().includes(id)) return;
      run.floor++;
      run.pos = id;
      run.path.push(id);
    }
    run.pending = id;
    saveRun(run);
    const act = ACTS[run.act - 1];
    const type: RoomType = id === 'boss' ? 'boss' : run.map.find((n) => n.id === id)!.type;
    const rng = rngFor(run, 'room');
    switch (type) {
      case 'monster':
        return this.startCombat(rng.pick(run.fightsThisAct < 3 ? act.weak : act.strong), 'monster');
      case 'elite': {
        const pool = act.elites.filter((e) => e.join() !== run.lastElite);
        return this.startCombat(rng.pick(pool.length ? pool : act.elites), 'elite');
      }
      case 'boss':
        return this.startCombat(act.boss, 'boss');
      case 'event': {
        let pool = EVENTS.filter((e) => !run.seenEvents.includes(e.id));
        if (!pool.length) {
          run.seenEvents = [];
          pool = EVENTS;
        }
        return this.startEvent(rng.pick(pool));
      }
      case 'shop':
        return this.openShop();
      case 'rest':
        return this.go('rest');
      case 'treasure':
        this.treasure = null;
        return this.go('treasure');
    }
  }

  /** The room is done. Back to the map. */
  private finishNode(): void {
    const run = this.run!;
    run.pending = null;
    saveRun(run);
    this.go('map');
  }

  private finishRun(victory: boolean): void {
    const run = this.run!;
    const s = score(run, victory);
    this.meta.wins += victory ? 1 : 0;
    this.meta.bestFloor = Math.max(this.meta.bestFloor, run.floor);
    this.meta.bestScore = Math.max(this.meta.bestScore, s);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory, score: s };
    this.combat = null;
    this.modal = '';
    this.confirmAbandon = false;
    this.go('end');
  }

  // ================================================================ combat

  private startCombat(encounter: string[], kind: RewardKind): void {
    const run = this.run!;
    this.encounter = encounter;
    this.combatKind = kind;
    this.combat = new Combat(run, encounter, rngFor(run, 'combat'));
    this.combat.start();
    this.sel = null;
    this.potionSel = null;
    this.busy = false;
    this.banner = kind === 'boss' ? ENEMIES[encounter[0]].name : kind === 'elite' ? 'Elite Battle' : 'Your Turn';
    this.screen = 'combat';
    this.render();
    this.animate();
  }

  private cancelSelection(): void {
    if (this.sel === null && this.potionSel === null) return;
    this.sel = null;
    this.potionSel = null;
    this.render();
  }

  private clickCard(i: number): void {
    const c = this.combat;
    if (!c || this.busy || c.over) return;
    this.potionSel = null;
    const inst = c.hand[i];
    const check = c.canPlay(inst);
    if (!check.ok) {
      if (check.why) this.toast(check.why);
      return;
    }
    if (getCard(inst).target === 'enemy') {
      const alive = c.alive();
      if (alive.length === 1) return this.playCard(i, alive[0].uid);
      this.sel = this.sel === i ? null : i;
      return this.render();
    }
    this.playCard(i);
  }

  private clickEnemy(uid: number): void {
    const c = this.combat;
    if (!c || this.busy) return;
    if (this.sel !== null) return this.playCard(this.sel, uid);
    if (this.potionSel !== null) {
      const slot = this.potionSel;
      this.potionSel = null;
      c.usePotion(slot, uid);
      void this.afterAction();
    }
  }

  private playCard(i: number, uid?: number): void {
    this.sel = null;
    if (this.combat!.play(i, uid)) void this.afterAction();
    else this.render();
  }

  private usePotion(slot: number): void {
    const c = this.combat;
    const id = this.run!.potions[slot];
    if (!c || !id || this.busy) return;
    const alive = c.alive();
    if (POTIONS[id].target === 'enemy' && alive.length > 1) {
      this.potionSel = slot;
      this.sel = null;
      this.toast('Choose a target.');
      return this.render();
    }
    c.usePotion(slot, alive[0]?.uid);
    void this.afterAction();
  }

  private async afterAction(): Promise<void> {
    this.render();
    this.animate();
    const c = this.combat;
    if (!c?.over) return;
    this.busy = true;
    await sleep(c.over === 'win' ? 800 : 1200);
    this.busy = false;
    if (c.over === 'win') this.winCombat();
    else this.finishRun(false);
  }

  private async endTurn(): Promise<void> {
    const c = this.combat;
    if (!c || this.busy || c.over || this.screen !== 'combat') return;
    this.busy = true;
    this.sel = null;
    this.potionSel = null;
    c.endPlayerTurn();
    this.banner = 'Enemy Turn';
    this.render();
    this.animate();
    await sleep(500);
    for (const e of c.enemies) {
      if (c.over) break;
      if (e.dead) continue;
      c.enemyAct(e);
      this.render();
      this.animate();
      await sleep(550);
    }
    if (!c.over) {
      c.startTurn();
      this.banner = 'Your Turn';
    }
    this.busy = false;
    await this.afterAction();
  }

  private showPile(which: 'draw' | 'discard' | 'exhaust'): void {
    const c = this.combat;
    if (!c) return;
    const pile = which === 'draw' ? c.drawPile : which === 'discard' ? c.discardPile : c.exhaustPile;
    const title = { draw: 'Draw Pile (random order)', discard: 'Discard Pile', exhaust: 'Exhausted' }[which];
    // The draw pile is shown sorted, so it does not reveal the order.
    const cards = which === 'draw' ? [...pile].sort((a, b) => a.id.localeCompare(b.id)) : pile;
    void this.openModal(this.cardsModal(title, cards));
  }

  private winCombat(): void {
    const run = this.run!;
    const kind = this.combatKind;
    const rng = rngFor(run, 'reward');
    if (kind === 'monster') run.fightsThisAct++;
    if (kind === 'elite') {
      run.stats.elites++;
      run.lastElite = this.encounter.join();
    }
    if (kind === 'boss') run.stats.bosses++;

    const gold = kind === 'boss' ? rng.int(95, 105) : kind === 'elite' ? rng.int(25, 35) : rng.int(10, 20);
    this.rewards = [{ kind: 'gold', gold, taken: false }];
    if (kind !== 'boss' && !hasRelic(run, 'sozu') && rng.chance(0.4)) this.rewards.push({ kind: 'potion', id: rng.pick(POTION_IDS), taken: false });
    if (kind === 'elite') {
      const id = randomRelic(run, rng, rollRelicRarity(rng));
      if (id) this.rewards.push({ kind: 'relic', id, taken: false });
    }
    this.rewards.push({ kind: 'card', cards: cardChoices(rng, kind), taken: false });
    this.combat = null;
    saveRun(run);
    this.go('reward');
  }

  // ================================================================ rewards

  private async takeReward(i: number): Promise<void> {
    const run = this.run!;
    const r = this.rewards[i];
    if (!r || r.taken) return;
    switch (r.kind) {
      case 'gold':
        run.gold += r.gold!;
        r.taken = true;
        break;
      case 'potion':
        if (!obtainPotion(run, r.id!)) return this.toast('Your potion slots are full.');
        r.taken = true;
        break;
      case 'relic':
        addRelic(run, r.id!);
        r.taken = true;
        break;
      case 'card': {
        const id = await this.openModal(this.cardChoiceModal(r.cards!));
        if (typeof id !== 'string') return;
        addCard(run, id);
        r.taken = true;
        this.toast(`${CARDS[id].name} added to your deck.`);
        break;
      }
    }
    saveRun(run);
    this.render();
  }

  private leaveRewards(): void {
    const run = this.run!;
    if (this.combatKind !== 'boss') return this.finishNode();
    if (run.act >= ACTS.length) return this.finishRun(true);
    const rng = rngFor(run, 'boss');
    this.bossRelics = rng.shuffle(relicsOf('boss').filter((id) => !hasRelic(run, id))).slice(0, 3);
    this.go('bossRelic');
  }

  private pickBossRelic(id: string | null): void {
    const run = this.run!;
    if (id) addRelic(run, id);
    startAct(run, run.act + 1);
    run.hp = run.maxHp;
    run.pending = null;
    saveRun(run);
    this.toast(`Act ${run.act}: ${ACTS[run.act - 1].name}. You are fully healed.`);
    this.go('map');
  }

  // ================================================================ rooms

  private rest(): void {
    const run = this.run!;
    if (hasRelic(run, 'emberCore')) return;
    const heal = Math.min(Math.floor(run.maxHp * 0.3), run.maxHp - run.hp);
    run.hp += heal;
    this.toast(`You rest and heal ${heal} HP.`);
    this.finishNode();
  }

  private async smith(): Promise<void> {
    const run = this.run!;
    const card = await this.pickCard('Choose a card to upgrade', run.deck.filter(canUpgrade), true);
    if (!card) return;
    upgradeCard(run, card.uid);
    this.toast(`${CARDS[card.id].name} upgraded.`);
    this.finishNode();
  }

  private openChest(): void {
    const run = this.run!;
    const rng = rngFor(run, 'chest');
    const id = randomRelic(run, rng, rollRelicRarity(rng));
    const gold = rng.int(25, 50);
    run.gold += gold;
    if (id) addRelic(run, id);
    this.treasure = id ? `${RELICS[id].icon} ${RELICS[id].name} and ${gold} gold` : `${gold} gold`;
    saveRun(run);
    this.render();
  }

  private openShop(): void {
    const run = this.run!;
    const rng = rngFor(run, 'shop');
    const items: ShopItem[] = [];
    for (const id of cardChoices(rng, 'elite', 5)) items.push({ kind: 'card', id, price: cardPrice(rng, id), sale: false, sold: false });
    const relics = new Set<string>();
    for (let i = 0; i < 6 && relics.size < 3; i++) {
      const id = randomRelic(run, rng, rollRelicRarity(rng));
      if (id) relics.add(id);
    }
    for (const id of relics) items.push({ kind: 'relic', id, price: relicPrice(rng, id), sale: false, sold: false });
    for (let i = 0; i < 3; i++) {
      const id = rng.pick(POTION_IDS);
      items.push({ kind: 'potion', id, price: rng.int(48, 75), sale: false, sold: false });
    }
    const sale = items[rng.int(0, 4)];
    sale.sale = true;
    sale.price = Math.floor(sale.price / 2);
    this.shop = { items, removed: false };
    this.go('shop');
  }

  private buy(i: number): void {
    const run = this.run!;
    const item = this.shop?.items[i];
    if (!item || item.sold) return;
    if (run.gold < item.price) return this.toast('Not enough gold.');
    if (item.kind === 'potion' && !obtainPotion(run, item.id)) return this.toast(hasRelic(run, 'sozu') ? 'Sozu stops you from taking potions.' : 'Your potion slots are full.');
    if (item.kind === 'card') addCard(run, item.id);
    if (item.kind === 'relic') addRelic(run, item.id);
    run.gold -= item.price;
    item.sold = true;
    saveRun(run);
    this.render();
  }

  private async removeService(): Promise<void> {
    const run = this.run!;
    if (!this.shop || this.shop.removed || run.gold < run.removeCost) return;
    const card = await this.pickCard(`Remove a card (${run.removeCost} gold)`, run.deck);
    if (!card) return;
    run.gold -= run.removeCost;
    run.removeCost += 25;
    removeCard(run, card.uid);
    this.shop.removed = true;
    this.toast(`${getCard(card).name} removed.`);
    saveRun(run);
    this.render();
  }

  // ================================================================ events

  private startEvent(def: EventDef): void {
    const run = this.run!;
    if (def !== NEOW && !run.seenEvents.includes(def.id)) run.seenEvents.push(def.id);
    const rng = rngFor(run, 'event:' + def.id);
    this.event = { def, page: null, result: null, rng };
    this.event.page = def.start(this.eventCtx());
    this.go('event');
  }

  private eventCtx(): EventCtx {
    const run = this.run!;
    const rng = this.event!.rng;
    return {
      run,
      rng,
      pickCard: (title, filter, preview) => this.pickCard(title, run.deck.filter(filter ?? (() => true)), preview),
      gainRelic: (rarity) => {
        const id = randomRelic(run, rng, rarity ?? rollRelicRarity(rng));
        if (!id) return 'nothing';
        addRelic(run, id);
        return `${RELICS[id].icon} ${RELICS[id].name}`;
      },
      loseHp: (n) => (run.hp = Math.max(0, run.hp - n)),
      heal: (n) => (run.hp = Math.min(run.maxHp, run.hp + n)),
    };
  }

  private async eventChoice(i: number): Promise<void> {
    const ev = this.event;
    const choice = ev?.page?.choices[i];
    if (!ev || !choice || choice.disabled || this.busy) return;
    this.busy = true;
    const res = await choice.run(this.eventCtx());
    this.busy = false;
    if (this.run!.hp <= 0) return this.finishRun(false);
    if (typeof res === 'string') {
      ev.result = res;
      ev.page = null;
    } else ev.page = res;
    saveRun(this.run!);
    this.render();
  }

  private eventDone(): void {
    const run = this.run!;
    if (this.event?.def === NEOW) {
      run.blessed = true;
      saveRun(run);
      return this.go('map');
    }
    this.finishNode();
  }

  // ================================================================ pickers

  private pickCard(title: string, cards: CardInst[], upgradePreview = false): Promise<CardInst | null> {
    if (!cards.length) {
      this.toast('No cards to choose from.');
      return Promise.resolve(null);
    }
    this.pickList = cards;
    const grid = cards
      .map((c) => cardHtml(upgradePreview ? { id: c.id, up: true } : c, { attrs: `data-a="pick" data-v="${c.uid}"`, cls: 'pickable' }))
      .join('');
    return this.openModal(`<div class="mbox wide"><h2>${title}</h2>${upgradePreview ? '<p class="muted">Cards are shown upgraded.</p>' : ''}<div class="cardgrid">${grid}</div><button data-a="close">Cancel</button></div>`) as Promise<CardInst | null>;
  }

  private cardsModal(title: string, cards: CardInst[]): string {
    const order = { attack: 0, skill: 1, power: 2, status: 3, curse: 4 };
    const sorted = title.startsWith('Your Deck') ? [...cards].sort((a, b) => order[CARDS[a.id].type] - order[CARDS[b.id].type] || a.id.localeCompare(b.id)) : cards;
    const grid = sorted.length ? sorted.map((c) => cardHtml(c)).join('') : '<p class="muted">No cards.</p>';
    return `<div class="mbox wide"><h2>${title} <small>(${cards.length})</small></h2><div class="cardgrid">${grid}</div><button data-a="close">Close</button></div>`;
  }

  private cardChoiceModal(ids: string[]): string {
    const cards = ids.map((id) => cardHtml({ id, up: false }, { attrs: `data-a="pickId" data-v="${id}"`, cls: 'pickable big' })).join('');
    return `<div class="mbox"><h2>Choose a card</h2><div class="cardrow">${cards}</div><button data-a="close">Skip</button></div>`;
  }

  private potionMenu(slot: number): void {
    const id = this.run!.potions[slot];
    if (!id) return;
    const p = POTIONS[id];
    const canUse = this.screen === 'combat' && this.combat && !this.busy && !this.combat.over;
    void this.openModal(`<div class="mbox small">
      <div class="bigicon">${p.icon}</div><h3>${p.name}</h3><p>${p.desc}</p>
      <div class="row">
        ${canUse ? `<button class="primary" data-a="usePotion" data-v="${slot}">Use</button>` : ''}
        <button data-a="dropPotion" data-v="${slot}">Discard</button>
        <button data-a="close">Cancel</button>
      </div>
      ${canUse ? '' : '<p class="muted">Potions can only be used in combat.</p>'}
    </div>`);
  }

  // ================================================================ render

  private render(): void {
    const run = this.run;
    const showTop = run && this.screen !== 'title' && this.screen !== 'end';
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleHtml();
        break;
      case 'map':
        body = `<div class="mapscreen">${this.mapHtml(true)}</div>`;
        break;
      case 'combat':
        body = this.combatHtml();
        break;
      case 'reward':
        body = this.rewardHtml();
        break;
      case 'shop':
        body = this.shopHtml();
        break;
      case 'rest':
        body = this.restHtml();
        break;
      case 'event':
        body = this.eventHtml();
        break;
      case 'treasure':
        body = this.treasureHtml();
        break;
      case 'bossRelic':
        body = this.bossRelicHtml();
        break;
      case 'end':
        body = this.endHtml();
        break;
    }
    this.root.innerHTML = `
      ${showTop ? this.topHtml() : ''}
      <main class="screen s-${this.screen}">${body}</main>
      <div class="modal-layer${this.modal ? ' open' : ''}">${this.modal}</div>`;

    if (this.screen === 'map' && this.lastScreen !== 'map') {
      this.root.querySelector('.mnode.avail')?.scrollIntoView({ block: 'center' });
    }
    this.lastScreen = this.screen;
  }

  private topHtml(): string {
    const run = this.run!;
    const hp = this.combat ? this.combat.player.hp : run.hp;
    const maxHp = this.combat ? this.combat.player.maxHp : run.maxHp;
    const potions = run.potions
      .map((p, i) =>
        p
          ? `<button class="potion${this.potionSel === i ? ' sel' : ''}" data-a="potion" data-v="${i}" title="${POTIONS[p].name}: ${POTIONS[p].desc}">${POTIONS[p].icon}</button>`
          : `<span class="potion empty" title="Empty potion slot"></span>`,
      )
      .join('');
    const relics = run.relics
      .map((r) => {
        const d = RELICS[r.id];
        return `<span class="relic" title="${d.name}: ${d.desc}">${d.icon}${d.showCounter && r.counter ? `<i>${r.counter}</i>` : ''}</span>`;
      })
      .join('');
    return `<header class="top">
      <div class="who">🤺 <b>The Warden</b></div>
      <div class="stat hp" title="HP">❤️ ${Math.max(0, hp)}/${maxHp}</div>
      <div class="stat gold" title="Gold">🪙 ${run.gold}</div>
      <div class="potions">${potions}</div>
      <div class="grow"></div>
      <div class="stat floor">Act ${run.act} · Floor ${run.floor}</div>
      <button class="iconbtn" data-a="mapview" title="Map">🗺️</button>
      <button class="iconbtn" data-a="deck" title="Deck">🂠 <span>${run.deck.length}</span></button>
    </header>
    <div class="relicbar">${relics}</div>`;
  }

  private titleHtml(): string {
    const run = this.run;
    const m = this.meta;
    const cont = run
      ? `<button class="primary" data-a="continue">Continue <small>Act ${run.act} · Floor ${run.floor} · Seed ${run.seedText}</small></button>`
      : '';
    const abandon = run
      ? this.confirmAbandon
        ? `<button class="danger" data-a="abandonYes">Click again to abandon the run</button>`
        : `<button class="link" data-a="abandon">Abandon run</button>`
      : '';
    return `<div class="title">
      <div class="logo">🃏</div>
      <h1>Deckbound <span>Spire</span></h1>
      <p class="tagline">Climb three acts. Build your deck. Defeat the Ashen Lord.</p>
      <div class="menu">
        ${cont}
        <button class="${run ? '' : 'primary'}" data-a="new">New Run${run ? ' <small>(replaces the saved run)</small>' : ''}</button>
        <label class="seed">Seed <input id="seed" placeholder="random" maxlength="12" autocomplete="off"></label>
        ${abandon}
      </div>
      <div class="metastats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.bestScore}</div>
      <div class="howto">
        <h3>How to play</h3>
        <p>Each turn you get 3 Energy and draw 5 cards. Attacks deal damage. Skills give Block and other effects. Powers last the whole fight.</p>
        <p>Enemies show their next move above their heads. Block what hits hard, and kill what grows strong.</p>
        <p><b>Click</b> a card to play it. For an attack with more than one enemy, click the card, then the enemy.<br><b>Keys:</b> 1–0 play cards · E ends the turn · Esc cancels. Hover over icons for details.</p>
      </div>
    </div>`;
  }

  private mapHtml(interactive: boolean): string {
    const run = this.run!;
    const act = ACTS[run.act - 1];
    const avail = interactive ? new Set(this.available()) : new Set<string>();
    const H = (ROWS + 1) * ROW_H + 60;
    const pos = (n: MapNode) => ({ x: ((n.col + 0.5 + n.jx) / COLS) * 100, y: H - 50 - n.row * ROW_H + n.jy * 24 });
    const boss = { x: 50, y: 50 };
    const byId = new Map(run.map.map((n) => [n.id, n]));
    const onPath = (a: string, b: string) => {
      const i = run.path.indexOf(a);
      return i >= 0 && run.path[i + 1] === b;
    };

    let lines = '';
    for (const n of run.map) {
      const a = pos(n);
      const targets = n.row === ROWS - 1 ? [['boss', boss] as const] : n.next.map((id) => [id, pos(byId.get(id)!)] as const);
      for (const [id, b] of targets) {
        lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${onPath(n.id, id) ? 'walked' : ''}"/>`;
      }
    }

    const nodes = run.map
      .map((n) => {
        const p = pos(n);
        const cls = [avail.has(n.id) ? 'avail' : '', run.path.includes(n.id) ? 'visited' : '', run.pos === n.id ? 'cur' : ''].join(' ');
        return `<button class="mnode t-${n.type} ${cls}" style="left:${p.x}%;top:${p.y}px" ${avail.has(n.id) ? `data-a="node" data-v="${n.id}"` : ''} title="${ROOM_NAME[n.type]}">${ROOM_ICON[n.type]}</button>`;
      })
      .join('');
    const bossDef = ENEMIES[act.boss[0]];
    const bossNode = `<button class="mnode boss ${avail.has('boss') ? 'avail' : ''} ${run.pos === 'boss' ? 'cur' : ''}" style="left:${boss.x}%;top:${boss.y}px" ${avail.has('boss') ? 'data-a="node" data-v="boss"' : ''} title="Boss: ${bossDef.name}">${bossDef.art}<small>${bossDef.name}</small></button>`;
    const legend = (Object.keys(ROOM_ICON) as RoomType[])
      .filter((t) => t !== 'boss')
      .map((t) => `<span>${ROOM_ICON[t]} ${ROOM_NAME[t]}</span>`)
      .join('');

    return `<div class="mapwrap">
      <div class="maphead"><h2>Act ${run.act}: ${act.name}</h2>${interactive ? '<p class="muted">Choose your next room.</p>' : ''}<div class="legend">${legend}</div></div>
      <div class="map" style="height:${H}px">
        <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>
        ${nodes}${bossNode}
      </div>
    </div>`;
  }

  private combatHtml(): string {
    const c = this.combat!;
    const selCard = this.sel !== null ? c.hand[this.sel] : null;
    const targeting = (selCard && getCard(selCard).target === 'enemy') || (this.potionSel !== null && POTIONS[this.run!.potions[this.potionSel] ?? '']?.target === 'enemy');

    const enemies = c.enemies
      .map((e) => {
        if (e.dead) {
          const cls = e.mem.shown ? 'gone' : 'dying';
          e.mem.shown = 1;
          return `<div class="fighter enemy size-${e.def.size ?? 'normal'} ${cls}" data-who="${e.uid}"><div class="art">${e.def.art}</div></div>`;
        }
        const it = c.intentOf(e);
        const dmg = it.dmg !== null ? `<b>${it.dmg}${it.times > 1 ? '×' + it.times : ''}</b>` : '';
        return `<div class="fighter enemy size-${e.def.size ?? 'normal'}${targeting ? ' targetable' : ''}" data-a="enemy" data-v="${e.uid}" data-who="${e.uid}">
          <div class="intent i-${it.intent}" title="${it.name}">${INTENT_ICON[it.intent]}${dmg}</div>
          <div class="art">${e.def.art}</div>
          <div class="name">${e.def.name}</div>
          ${hpBar(e)}
          ${statusRow(e)}
        </div>`;
      })
      .join('');

    const n = c.hand.length;
    const overlap = n <= 5 ? 6 : 6 + (n - 5) * 9;
    const hand = c.hand
      .map((inst, i) => {
        const off = i - (n - 1) / 2;
        const playable = c.canPlay(inst).ok && !this.busy;
        const style = `--r:${off * 3}deg;--y:${Math.abs(off) * Math.abs(off) * 2.5}px;--i:${i}`;
        return cardHtml(inst, {
          c,
          attrs: `data-a="card" data-v="${i}" style="${style}"`,
          cls: `${playable ? 'playable' : 'dim'}${this.sel === i ? ' selected' : ''}`,
        });
      })
      .join('');

    const banner = this.banner ? `<div class="banner">${this.banner}</div>` : '';
    this.banner = null;
    return `<div class="battle">
      ${banner}
      <div class="field">
        <div class="side left">
          <div class="fighter player" data-who="player">
            <div class="art">🤺</div>
            <div class="name">The Warden</div>
            ${hpBar(c.player)}
            ${statusRow(c.player)}
          </div>
        </div>
        <div class="side right">${enemies}</div>
      </div>
      ${targeting ? '<div class="hint">Choose a target · right-click or Esc to cancel</div>' : ''}
      <div class="bottom">
        <div class="lside">
          <div class="energy${c.energy ? '' : ' empty'}" title="Energy">${c.energy}<small>/${c.maxEnergy}</small></div>
          <button class="pile" data-a="pile" data-v="draw" title="Draw pile">🂠<b>${c.drawPile.length}</b></button>
        </div>
        <div class="hand" style="--ov:${overlap}px">${hand}</div>
        <div class="rside">
          <button class="endturn" data-a="end" ${this.busy ? 'disabled' : ''}>${this.busy ? 'Enemy Turn' : 'End Turn'}</button>
          <div class="piles">
            <button class="pile" data-a="pile" data-v="discard" title="Discard pile">🗑️<b>${c.discardPile.length}</b></button>
            <button class="pile" data-a="pile" data-v="exhaust" title="Exhausted cards">🔥<b>${c.exhaustPile.length}</b></button>
          </div>
        </div>
      </div>
    </div>`;
  }

  /** Floating numbers and hit animations for everything in the combat log. */
  private animate(): void {
    const log = this.combat?.log.splice(0) ?? [];
    const count = new Map<string, number>();
    for (const ev of log) {
      const el = this.root.querySelector<HTMLElement>(`[data-who="${ev.who}"]`);
      if (!el) continue;
      const k = String(ev.who);
      const i = count.get(k) ?? 0;
      count.set(k, i + 1);
      const float = (text: string, cls: string) => {
        const f = document.createElement('div');
        f.className = `float ${cls}`;
        f.textContent = text;
        f.style.animationDelay = `${i * 110}ms`;
        f.style.left = `${50 + (Math.random() * 30 - 15)}%`;
        el.appendChild(f);
      };
      switch (ev.t) {
        case 'dmg':
          if (ev.n > 0) {
            float(`-${ev.n}`, 'f-dmg');
            el.classList.add('hit');
          } else if (ev.blocked > 0) float('Blocked', 'f-block');
          break;
        case 'block':
          float(`+${ev.n} 🛡️`, 'f-block');
          break;
        case 'heal':
          float(`+${ev.n}`, 'f-heal');
          break;
        case 'status':
          float(`${STATUSES[ev.s].icon} ${ev.n > 0 ? '+' : ''}${ev.n}`, 'f-status');
          break;
        case 'negate':
          float('Negated', 'f-status');
          break;
        case 'act':
          el.classList.add(ev.who === 'player' ? 'lunge-r' : 'lunge-l');
          break;
        case 'death':
          break;
      }
    }
  }

  private rewardHtml(): string {
    const items = this.rewards
      .map((r, i) => {
        let label = '';
        if (r.kind === 'gold') label = `🪙 ${r.gold} Gold`;
        if (r.kind === 'potion') label = `${POTIONS[r.id!].icon} ${POTIONS[r.id!].name}`;
        if (r.kind === 'relic') label = `${RELICS[r.id!].icon} ${RELICS[r.id!].name} <small>${RELICS[r.id!].desc}</small>`;
        if (r.kind === 'card') label = '🂠 Add a card to your deck';
        return `<button class="rw${r.taken ? ' taken' : ''}" data-a="take" data-v="${i}" ${r.taken ? 'disabled' : ''}>${label}</button>`;
      })
      .join('');
    const title = this.combatKind === 'boss' ? 'Boss Defeated!' : this.combatKind === 'elite' ? 'Elite Defeated!' : 'Victory!';
    return `<div class="room"><h2>${title}</h2><div class="rewards">${items}</div><button class="primary" data-a="proceed">Proceed ➜</button></div>`;
  }

  private shopHtml(): string {
    const run = this.run!;
    const s = this.shop!;
    const priceTag = (it: ShopItem) => `<span class="price${run.gold < it.price ? ' poor' : ''}${it.sale ? ' sale' : ''}">🪙 ${it.price}${it.sale ? ' SALE' : ''}</span>`;
    const tile = (it: ShopItem, i: number) => {
      if (it.sold) return `<div class="ware sold"><span class="soldtxt">Sold</span></div>`;
      if (it.kind === 'card') return `<div class="ware" data-a="buy" data-v="${i}">${cardHtml({ id: it.id, up: false })}${priceTag(it)}</div>`;
      const d = it.kind === 'relic' ? RELICS[it.id] : POTIONS[it.id];
      return `<div class="ware item" data-a="buy" data-v="${i}" title="${d.desc}"><div class="bigicon">${d.icon}</div><b>${d.name}</b><small>${d.desc}</small>${priceTag(it)}</div>`;
    };
    const section = (kind: ShopItem['kind']) =>
      s.items
        .map((it, i) => [it, i] as const)
        .filter(([it]) => it.kind === kind)
        .map(([it, i]) => tile(it, i))
        .join('');
    const canRemove = !s.removed && run.gold >= run.removeCost;
    return `<div class="room shop">
      <div class="merchant"><span class="bigicon">🧙‍♂️</span><div><h2>The Merchant</h2><p class="muted">"Everything has a price, friend."</p></div></div>
      <div class="wares cards">${section('card')}</div>
      <div class="wares">
        ${section('relic')}
        ${section('potion')}
        <div class="ware item${s.removed ? ' sold' : ''}" ${canRemove ? 'data-a="removeSvc"' : ''}>
          <div class="bigicon">✂️</div><b>Card Removal</b><small>Remove a card from your deck.</small>
          ${s.removed ? '<span class="soldtxt">Used</span>' : `<span class="price${run.gold < run.removeCost ? ' poor' : ''}">🪙 ${run.removeCost}</span>`}
        </div>
      </div>
      <button class="primary" data-a="leave">Leave ➜</button>
    </div>`;
  }

  private restHtml(): string {
    const run = this.run!;
    const noRest = hasRelic(run, 'emberCore');
    const heal = Math.min(Math.floor(run.maxHp * 0.3), run.maxHp - run.hp);
    return `<div class="room rest">
      <div class="bigicon fire">🔥</div>
      <h2>Rest Site</h2>
      <div class="opts">
        <button class="opt" data-a="rest" ${noRest ? 'disabled' : ''}><span>💤</span><b>Rest</b><small>${noRest ? 'Ember Core stops you from resting.' : `Heal 30% of your Max HP (+${heal}).`}</small></button>
        <button class="opt" data-a="smith" ${run.deck.some(canUpgrade) ? '' : 'disabled'}><span>🔨</span><b>Smith</b><small>Upgrade a card in your deck.</small></button>
      </div>
    </div>`;
  }

  private eventHtml(): string {
    const ev = this.event!;
    const body = ev.page
      ? `<p class="etext">${ev.page.text}</p><div class="choices">${ev.page.choices
          .map((ch, i) => `<button class="choice" data-a="choice" data-v="${i}" ${ch.disabled ? 'disabled' : ''}><b>[${ch.label}]</b> ${ch.desc}</button>`)
          .join('')}</div>`
      : `<p class="etext">${ev.result}</p><button class="primary" data-a="eventDone">Continue ➜</button>`;
    return `<div class="room event"><div class="bigicon">${ev.def.art}</div><h2>${ev.def.title}</h2>${body}</div>`;
  }

  private treasureHtml(): string {
    return this.treasure
      ? `<div class="room"><div class="bigicon">🎁</div><h2>Treasure</h2><p class="etext">You found ${this.treasure}.</p><button class="primary" data-a="leave">Proceed ➜</button></div>`
      : `<div class="room"><button class="chest" data-a="openChest" title="Open the chest">🧰</button><h2>Treasure</h2><p class="muted">Click the chest to open it.</p></div>`;
  }

  private bossRelicHtml(): string {
    const tiles = this.bossRelics
      .map((id) => {
        const d = RELICS[id];
        return `<button class="ware item boss" data-a="bossRelic" data-v="${id}"><div class="bigicon">${d.icon}</div><b>${d.name}</b><small>${d.desc}</small></button>`;
      })
      .join('');
    return `<div class="room"><h2>Choose a Boss Relic</h2><p class="muted">Boss relics are strong, but each has a cost.</p><div class="wares">${tiles}</div><button data-a="skipBoss">Skip</button></div>`;
  }

  private endHtml(): string {
    const e = this.end!;
    const run = this.run!;
    return `<div class="room end ${e.victory ? 'win' : 'lose'}">
      <div class="bigicon">${e.victory ? '🏆' : '💀'}</div>
      <h1>${e.victory ? 'Victory!' : 'Defeated'}</h1>
      <p class="muted">${e.victory ? 'The Ashen Lord falls. The Spire is yours.' : `You fell on floor ${run.floor} in Act ${run.act}.`}</p>
      <div class="endstats">
        <div><small>Floor</small><b>${run.floor}</b></div>
        <div><small>Kills</small><b>${run.stats.kills}</b></div>
        <div><small>Elites</small><b>${run.stats.elites}</b></div>
        <div><small>Bosses</small><b>${run.stats.bosses}</b></div>
        <div><small>Score</small><b>${e.score}</b></div>
      </div>
      <p class="muted">Seed: ${run.seedText} · Deck: ${run.deck.length} cards · Relics: ${run.relics.map((r) => RELICS[r.id].icon).join(' ')}</p>
      <button class="primary" data-a="menu">Main Menu</button>
    </div>`;
  }
}
