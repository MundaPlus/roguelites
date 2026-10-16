import { Combat, enemyFighter, playerFighter, type EquipInst } from './combat';
import type { EnemyDef } from './enemies';
import { getEquip, usesOf } from './equipment';
import { RELICS } from './relics';
import { randomSeedText } from './rng';
import {
  CLASSES,
  CLASS_IDS,
  FLOORS,
  PLAN,
  ROOM_INFO,
  addEquip,
  addRelic,
  applyFace,
  capacity,
  clearRun,
  encounter,
  fightRewards,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  perks,
  pickEvent,
  rngFor,
  saveMeta,
  saveRun,
  score,
  toggleEquip,
  upgradable,
  usedSpace,
  type EventDef,
  type Pick,
  type Rewards,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import { D6, STATUS_INFO, STATUS_LIST, accepts, reqLabel, type ClassId, type Die, type RoomType, type Status } from './types';

type Screen = 'title' | 'map' | 'combat' | 'reward' | 'shop' | 'rest' | 'event' | 'end';

type Modal =
  | { kind: 'die'; face: number; done: () => void }
  | { kind: 'upgrade'; done: () => void }
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean };

interface Drag {
  uid: number;
  x0: number;
  y0: number;
  ghost: HTMLElement | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function pips(v: number): string {
  if (v === 0) return '<span class="wild">★</span>';
  const on = PIPS[v] ?? [];
  return `<span class="pips">${Array.from({ length: 9 }, (_, i) => `<i class="${on.includes(i) ? 'on' : ''}"></i>`).join('')}</span>`;
}

function dieHtml(d: Die, cls = ''): string {
  return `<div class="die ${cls} ${d.burning ? 'burning' : ''} ${d.wild ? 'is-wild' : ''}" data-uid="${d.uid}">${pips(d.wild ? 0 : d.value)}</div>`;
}

const facesHtml = (faces: readonly number[]): string =>
  `<span class="faces">${faces.map((f) => `<span class="mini">${f === 0 ? '★' : f}</span>`).join('')}</span>`;

const fxText = (s: string): string => s.replace(/▢/g, '<i class="x">▢</i>');

function hpBar(hp: number, max: number, shield = 0): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<div class="hp"><div class="hp-fill" style="width:${pct}%"></div><span>${hp} / ${max}</span>${shield > 0 ? `<b class="shield">🛡️${shield}</b>` : ''}</div>`;
}

function statusHtml(status: Record<Status, number>, extra = ''): string {
  const parts = STATUS_LIST.filter((s) => status[s] > 0).map(
    (s) => `<span class="st" title="${STATUS_INFO[s].name}: ${STATUS_INFO[s].text}">${STATUS_INFO[s].icon}${status[s]}</span>`,
  );
  return `<div class="statuses">${parts.join('')}${extra}</div>`;
}

function equipCard(e: { id: string; lvl: number }, o: { ei?: number; inst?: EquipInst; can?: boolean; small?: boolean; flash?: boolean; enemy?: boolean } = {}): string {
  const def = getEquip(e.id);
  const req = def.req(e.lvl);
  const uses = usesOf(def, e.lvl);
  const inst = o.inst;
  const spent = inst ? inst.used >= uses : false;
  let slot = reqLabel(req);
  let bar = '';
  if (req.k === 'count') {
    const fill = inst?.fill ?? 0;
    slot = `Σ ${req.n - fill} left`;
    bar = `<div class="charge"><div style="width:${(fill / req.n) * 100}%"></div></div>`;
  }
  const usesRow = uses > 1 && uses < Infinity && inst ? `<div class="uses">${'●'.repeat(Math.max(0, uses - inst.used))}${'○'.repeat(Math.min(uses, inst.used))}</div>` : '';
  const lvl = e.lvl > 0 && !o.enemy ? '+' : '';
  const cls = [
    'equip', `k-${def.kind}`, def.size === 2 ? 'sz2' : '', o.small ? 'small' : '',
    inst?.shocked ? 'shocked' : '', spent && !inst?.shocked ? 'spent' : '', o.can ? 'can' : '', o.flash ? 'flash' : '',
  ].join(' ');
  const act = o.ei !== undefined ? `data-act="equip" data-ei="${o.ei}"` : '';
  return `<div class="${cls}" ${act}>
    <div class="eq-head"><span class="eq-icon">${def.icon}</span><b>${def.name}${lvl}</b></div>
    <div class="slot">${inst?.shocked ? '⚡ Shocked' : slot}</div>${bar}
    <p class="eq-text">${fxText(def.text(e.lvl))}</p>${usesRow}
  </div>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private god = false;

  private combat: Combat | null = null;
  private room: RoomType = 'fight';
  private enemyDef: EnemyDef | null = null;
  private sel: number | null = null;
  private busy = false;
  private flashEnemy = -1;
  private drag: Drag | null = null;

  private rewards: Rewards | null = null;
  private shop: ShopItem[] = [];
  private event: { def: EventDef; result: string | null } | null = null;
  private end: { victory: boolean; score: number; floor: number; cls: ClassId } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (new URLSearchParams(location.search).has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'combat':
        body = this.combatView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'rest':
        body = this.restView();
        break;
      case 'event':
        body = this.eventView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private topBar(): string {
    const r = this.run!;
    const relics = r.relics.map((id) => `<span class="relic" title="${RELICS[id].name}: ${RELICS[id].text}">${RELICS[id].icon}</span>`).join('');
    const hp = this.combat && this.screen === 'combat' ? this.combat.player.hp : r.hp;
    return `<header class="top">
      <span class="cls">${CLASSES[r.cls].icon}</span>
      <span>❤️ ${hp}/${r.maxHp}</span>
      <span>💰 ${r.gold}</span>
      <span>🏰 ${r.floor}-${r.step + 1}</span>
      <span class="relics">${relics}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const cards = CLASS_IDS.map((id) => {
      const c = CLASSES[id];
      const locked = m.bestFloor < c.unlock;
      const kit = c.kit.map((k) => `${getEquip(k).icon} ${getEquip(k).name}`).join(', ');
      return `<button class="class-card ${locked ? 'locked' : ''}" ${locked ? 'disabled' : `data-act="start" data-cls="${id}"`}>
        <span class="big">${locked ? '🔒' : c.icon}</span>
        <b>${c.name}</b>
        <small>❤️ ${c.hp} · 🎲 ${c.dice} dice</small>
        <small>${locked ? `Reach floor ${c.unlock} to unlock.` : c.perkText}</small>
        ${locked ? '' : `<small class="kit">${kit}</small>`}
      </button>`;
    }).join('');
    return `<div class="title">
      <h1><span>🎲</span> Dice &amp; Dungeons</h1>
      <p class="sub">Roll your dice. Drop them into your equipment. Climb ${FLOORS} floors of the tower.</p>
      ${this.run ? `<button class="primary" data-act="continue">▶ Continue run (${CLASSES[this.run.cls].name}, floor ${this.run.floor})</button>` : ''}
      <h2>${this.run ? 'Or start a new run' : 'Choose a hero'}</h2>
      <div class="classes">${cards}</div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.best}</p>
      <button data-act="help">How to play</button>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const track = PLAN.map((opts, i) => {
      const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${state}">${opts.map((o) => ROOM_INFO[o].icon).join('/')}</span>`;
    }).join('<span class="link"></span>');
    const choices = PLAN[r.step]
      .map((room) => {
        const info = ROOM_INFO[room];
        let extra = '';
        if (room === 'fight' || room === 'elite' || room === 'boss') {
          const e = encounter(r, room);
          extra = `<small class="foe">${e.icon} ${e.name} · ❤️ ${e.hp} · 🎲 ${e.dice}</small>`;
        }
        return `<button class="room r-${room}" data-act="room" data-room="${room}">
          <span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>Floor ${r.floor} of ${FLOORS}</h2>
      <div class="track">${track}</div>
      <div class="rooms">${choices}</div>
      ${this.bagView()}
    </div>`;
  }

  private bagView(): string {
    const r = this.run!;
    const used = usedSpace(r);
    const cap = capacity(r);
    const items = r.equipment
      .map((e, i) => {
        const def = getEquip(e.id);
        return `<button class="bag-item ${e.on ? 'on' : ''}" data-act="toggle-eq" data-i="${i}" title="${def.text(e.lvl).replace(/"/g, '')}">
          <span>${def.icon}</span><b>${def.name}${e.lvl ? '+' : ''}</b><small>${reqLabel(def.req(e.lvl))} · size ${def.size}</small>
          <em>${e.on ? 'Equipped' : 'Stash'}</em></button>`;
      })
      .join('');
    const dice = r.dice.map((f, i) => `<span class="die-faces">🎲${i + 1} ${facesHtml(f)}</span>`).join('');
    return `<section class="bag">
      <h3>🎒 Backpack <small>${used} / ${cap} space · tap to equip or unequip</small></h3>
      <div class="bag-list">${items}</div>
      <h3>🎲 Dice</h3>
      <div class="dice-list">${dice}</div>
    </section>`;
  }

  private combatView(): string {
    const c = this.combat!;
    const p = c.player;
    const en = c.enemy;
    const myTurn = c.turn === 'player' && !this.busy && !c.over;
    const selDie = this.sel !== null ? p.dice.find((d) => d.uid === this.sel) : undefined;
    const tier = this.room === 'boss' ? '<em class="tier boss">BOSS</em>' : this.room === 'elite' ? '<em class="tier elite">ELITE</em>' : '';

    const enemyEquip = en.equip.map((e, i) => equipCard(e, { inst: e, small: true, enemy: true, flash: i === this.flashEnemy })).join('');
    const enemyDice = c.turn === 'enemy' ? en.dice.map((d) => dieHtml(d, 'small')).join('') : '';
    const playerEquip = p.equip
      .map((e, i) => equipCard(e, { ei: i, inst: e, can: !!selDie && myTurn && c.canPlace(p, selDie, i) }))
      .join('');
    const tray = p.dice.map((d) => dieHtml(d, d.uid === this.sel ? 'sel' : '')).join('') || '<span class="empty">No dice left</span>';

    let actions = '';
    if (selDie && myTurn) {
      if (selDie.wild) actions += `<span class="hint">Set the wild die:</span>${[1, 2, 3, 4, 5, 6].map((v) => `<button class="mini-btn" data-act="wild" data-v="${v}">${v}</button>`).join('')}`;
      if (c.rerolls > 0) actions += `<button class="mini-btn" data-act="reroll">🔄 Reroll (${c.rerolls})</button>`;
      if (c.canNudge(selDie.uid)) actions += `<button class="mini-btn" data-act="nudge">🎯 +1</button>`;
    }
    const focus = c.focus > 0 ? `<span class="st" title="Next hit bonus">🎯+${c.focus}</span>` : '';
    const log = c.log.slice(-2).map((l) => `<div>${l}</div>`).join('');
    const turnText = c.over ? (c.over === 'win' ? 'Victory!' : 'Defeat') : c.turn === 'player' ? 'Your turn' : `${en.name}'s turn`;

    return `<div class="combat">
      <section class="fighter enemy" data-side="enemy">
        <div class="f-head"><span class="f-icon">${en.icon}</span>
          <div class="f-info"><b>${en.name}</b> ${tier}${hpBar(en.hp, en.maxHp, en.shield)}${statusHtml(en.status)}</div>
          <div class="dice-row">${enemyDice}</div>
        </div>
        <div class="equip-grid small">${enemyEquip}</div>
      </section>
      <div class="mid"><div class="log">${log}</div><b class="turn ${c.turn}">${turnText}</b></div>
      <section class="fighter player" data-side="player">
        <div class="f-head"><span class="f-icon">${p.icon}</span>
          <div class="f-info"><b>${p.name}</b>${hpBar(p.hp, p.maxHp, p.shield)}${statusHtml(p.status, focus)}</div>
        </div>
        <div class="equip-grid pequip">${playerEquip}</div>
        <div class="dock"><div class="tray ${myTurn ? '' : 'wait'}">${tray}</div>
        <div class="actions"><div class="die-acts">${actions}</div>
          <button class="primary" data-act="end-turn" ${myTurn ? '' : 'disabled'}>End turn ⏎</button></div></div>
      </section>
    </div>`;
  }

  private pickHtml(p: Pick, i: number): string {
    let icon = '';
    let name = '';
    let text = '';
    switch (p.t) {
      case 'equip': {
        const d = getEquip(p.id);
        return `<button class="pick" data-act="pick" data-i="${i}">${equipCard({ id: p.id, lvl: 0 })}<small>Size ${d.size} · ${d.rarity}</small></button>`;
      }
      case 'upgrade':
        [icon, name, text] = ['⬆️', 'Upgrade', 'Upgrade one of your equipment.'];
        break;
      case 'face':
        [icon, name, text] = p.face === 0 ? ['★', 'Wild Face', 'The lowest face of one die becomes wild. You set its value when you roll it.'] : ['⚀', 'Loaded Face', `The lowest face of one die becomes a ${p.face}.`];
        break;
      case 'maxhp':
        [icon, name, text] = ['❤️', `+${p.n} Max HP`, `Raise max HP by ${p.n} and heal ${p.n}.`];
        break;
      case 'relic':
        [icon, name, text] = [RELICS[p.id].icon, RELICS[p.id].name, RELICS[p.id].text];
        break;
      case 'die':
        [icon, name, text] = ['🎲', 'New Die', 'Roll one more die every turn.'];
        break;
    }
    return `<button class="pick plain" data-act="pick" data-i="${i}"><span class="big">${icon}</span><b>${name}</b><small>${text}</small></button>`;
  }

  private rewardView(): string {
    const rw = this.rewards!;
    const got: string[] = [`💰 ${rw.gold} gold`];
    if (rw.relic) got.push(`${RELICS[rw.relic].icon} ${RELICS[rw.relic].name}: ${RELICS[rw.relic].text}`);
    if (rw.bonus.includes('die')) got.push('🎲 A new die! You now roll one more die each turn.');
    if (rw.bonus.includes('maxhp')) got.push('❤️ +8 max HP');
    got.push(this.room === 'boss' ? '❤️ Healed 55% of max HP' : '❤️ Caught your breath: healed 15% of max HP');
    return `<div class="reward">
      <h2>${this.enemyDef?.icon ?? ''} ${this.enemyDef?.name ?? 'Enemy'} defeated!</h2>
      <ul class="got">${got.map((g) => `<li>${g}</li>`).join('')}</ul>
      <h3>${this.room === 'boss' ? 'Choose a relic' : 'Choose one reward'}</h3>
      <div class="picks">${rw.picks.map((p, i) => this.pickHtml(p, i)).join('')}</div>
      <button data-act="advance">Skip</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = this.shop
      .map((it, i) => {
        let inner = '';
        switch (it.kind) {
          case 'equip':
            inner = equipCard({ id: it.id!, lvl: 0 });
            break;
          case 'relic':
            inner = `<span class="big">${RELICS[it.id!].icon}</span><b>${RELICS[it.id!].name}</b><small>${RELICS[it.id!].text}</small>`;
            break;
          case 'face6':
            inner = '<span class="big">⚀</span><b>Loaded Face</b><small>The lowest face of one die becomes a 6.</small>';
            break;
          case 'wild':
            inner = '<span class="big">★</span><b>Wild Face</b><small>The lowest face of one die becomes wild.</small>';
            break;
          case 'upgrade':
            inner = '<span class="big">⬆️</span><b>Upgrade</b><small>Upgrade one equipment.</small>';
            break;
          case 'heal':
            inner = '<span class="big">🍖</span><b>Hot Meal</b><small>Heal 12 HP.</small>';
            break;
          case 'die':
            inner = '<span class="big">🎲</span><b>New Die</b><small>Roll one more die every turn.</small>';
            break;
        }
        const cant = it.sold || r.gold < it.price;
        return `<button class="shop-item ${it.sold ? 'sold' : ''}" data-act="buy" data-i="${i}" ${cant ? 'disabled' : ''}>
          ${inner}<span class="price">${it.sold ? 'SOLD' : `💰 ${it.price}`}</span></button>`;
      })
      .join('');
    return `<div class="shop"><h2>🛒 Shop</h2><div class="shop-grid">${items}</div><button class="primary" data-act="advance">Leave shop</button></div>`;
  }

  private restView(): string {
    const r = this.run!;
    const heal = Math.ceil(r.maxHp * 0.35);
    return `<div class="rest"><h2>🔥 Campfire</h2><p>The fire is warm. You have time for one thing.</p>
      <div class="rooms">
        <button class="room" data-act="rest-heal"><span class="big">💤</span><b>Rest</b><small>Heal ${heal} HP.</small></button>
        <button class="room" data-act="rest-up" ${upgradable(r).length ? '' : 'disabled'}><span class="big">⚒️</span><b>Smith</b><small>Upgrade one equipment.</small></button>
      </div>${this.bagView()}</div>`;
  }

  private eventView(): string {
    const ev = this.event!;
    const r = this.run!;
    const body = ev.result
      ? `<p class="result">${ev.result}</p><button class="primary" data-act="advance">Continue</button>`
      : ev.def.options
          .map((o, i) => `<button class="opt" data-act="event-opt" data-i="${i}" ${o.can && !o.can(r) ? 'disabled' : ''}>${o.label}</button>`)
          .join('');
    return `<div class="event"><span class="big">${ev.def.icon}</span><h2>${ev.def.title}</h2><p>${ev.def.text}</p><div class="opts">${body}</div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end ${e.victory ? 'win' : 'lose'}">
      <span class="big">${e.victory ? '👑' : '🪦'}</span>
      <h1>${e.victory ? 'You conquered the tower!' : 'Your run is over'}</h1>
      <p>${CLASSES[e.cls].icon} ${CLASSES[e.cls].name} · reached floor ${e.floor}</p>
      <p class="score">Score ${e.score}</p>
      <p class="stats">Best score ${this.meta.best} · Wins ${this.meta.wins}</p>
      <button class="primary" data-act="title">Back to title</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    const r = this.run;
    let inner = '';
    switch (m.kind) {
      case 'die':
        inner = `<h3>${m.face === 0 ? 'Add a wild face' : `Add a ${m.face} face`}</h3><p>Choose a die. Its lowest face changes.</p>
          <div class="modal-list">${r!.dice.map((f, i) => `<button data-act="modal-die" data-i="${i}">🎲 Die ${i + 1} ${facesHtml(f)}</button>`).join('')}</div>
          <button data-act="modal-close">Cancel</button>`;
        break;
      case 'upgrade':
        inner = `<h3>Upgrade an equipment</h3>
          <div class="modal-list up">${upgradable(r!)
            .map((i) => {
              const e = r!.equipment[i];
              return `<button class="up-row" data-act="modal-up" data-i="${i}">${equipCard({ id: e.id, lvl: 0 })}<span>➜</span>${equipCard({ id: e.id, lvl: 1 })}</button>`;
            })
            .join('')}</div>
          <button data-act="modal-close">Cancel</button>`;
        break;
      case 'help':
        inner = `<h3>How to play</h3>
          <ul class="help">
            <li>Each turn you roll your dice. Drag a die onto an equipment, or tap the die and then the equipment.</li>
            <li>Each equipment has a slot rule: <b>Any</b>, <b>Even</b>, <b>Odd</b>, <b>≤3</b>, <b>≥4</b>, <b>=6</b>. <b>Σ</b> slots collect dice until the total is reached, then fire.</li>
            <li>Most equipment works once per turn. Utility items (Lockpick, Spatula, Hammer) give you new dice back.</li>
            <li>Shield blocks damage until the start of your next turn.</li>
            <li><b>Combos:</b> use the same number again for a Pair (+2 dmg), Triple (+5) and more. Use 3+ numbers in a row for a Straight (shield).</li>
            <li>Statuses: ☠️ poison, 🔥 burn (dice on fire cost 2 HP), ❄️ freeze (high dice become 1), ⚡ shock (equipment blocked until you feed it a die), 💔 weak (half damage).</li>
            <li>Between fights, manage your backpack on the map screen. Only equipped items go into a fight.</li>
            <li>Keys: 1–9 select a die, then 1–9 again for an equipment. Enter ends the turn.</li>
          </ul><button data-act="modal-close">Close</button>`;
        break;
      case 'menu':
        inner = m.confirm
          ? `<h3>Abandon this run?</h3><p>You lose the run. Your stats still count it.</p>
            <div class="row"><button class="danger" data-act="abandon">Abandon</button><button data-act="modal-close">Cancel</button></div>`
          : `<h3>Menu</h3><div class="modal-list"><button data-act="help">How to play</button>
            <button data-act="abandon-ask">Abandon run</button><button data-act="title">Save and go to title</button>
            <button data-act="modal-close">Close</button></div>`;
        break;
    }
    return `<div class="modal-bg"><div class="modal">${inner}</div></div>`;
  }

  // ---------- Effects ----------

  private flushFx(): void {
    const c = this.combat;
    if (!c) return;
    const count: Record<string, number> = { player: 0, enemy: 0 };
    for (const fx of c.fx) {
      if (fx.kind === 'combo') {
        const b = document.createElement('div');
        b.className = 'combo-banner';
        b.textContent = fx.text;
        document.body.appendChild(b);
        setTimeout(() => b.remove(), 1300);
        sfx.combo();
        continue;
      }
      const host = this.root.querySelector<HTMLElement>(`.fighter[data-side="${fx.side}"] .f-icon`);
      if (!host) continue;
      const rect = host.getBoundingClientRect();
      const n = count[fx.side]++;
      const el = document.createElement('div');
      el.className = `float fx-${fx.kind}`;
      el.textContent = fx.text;
      el.style.left = `${rect.left + rect.width / 2 + (n % 2 ? 26 : -26) * Math.min(n, 2)}px`;
      el.style.top = `${rect.top + 6 - n * 18}px`;
      el.style.animationDelay = `${n * 90}ms`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1400 + n * 90);
      if (fx.kind === 'dmg') {
        (fx.side === 'player' ? sfx.hurt : sfx.hit)();
        host.classList.remove('shake');
        void host.offsetWidth;
        host.classList.add('shake');
      } else if (fx.kind === 'heal') sfx.heal();
      else if (fx.kind === 'block') sfx.block();
      else if (fx.kind === 'status') sfx.status();
    }
    c.fx = [];
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private show(): void {
    this.render();
    this.flushFx();
  }

  // ---------- Input ----------

  private onClick(ev: MouseEvent): void {
    initAudio();
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    const act = t.dataset.act!;
    const i = Number(t.dataset.i ?? -1);
    switch (act) {
      case 'start':
        this.startRun(t.dataset.cls as ClassId);
        break;
      case 'continue':
        this.screen = 'map';
        this.render();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        break;
      case 'abandon-ask':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon':
        this.modal = null;
        this.endRun(false);
        break;
      case 'title':
        this.modal = null;
        this.combat = null;
        this.screen = 'title';
        this.render();
        break;
      case 'mute':
        toggleMute();
        this.render();
        break;
      case 'modal-close':
        this.modal = null;
        this.render();
        break;
      case 'room':
        this.enterRoom(t.dataset.room as RoomType);
        break;
      case 'toggle-eq': {
        const err = toggleEquip(this.run!, i);
        if (err) {
          sfx.deny();
          this.toast(err);
        } else saveRun(this.run!);
        this.render();
        break;
      }
      case 'equip':
        if (this.sel !== null) this.tryPlace(this.sel, Number(t.dataset.ei));
        break;
      case 'wild':
        if (this.sel !== null) this.combat?.setWild(this.sel, Number(t.dataset.v));
        this.render();
        break;
      case 'reroll':
        if (this.sel !== null && this.combat?.reroll(this.sel)) sfx.roll();
        this.render();
        break;
      case 'nudge':
        if (this.sel !== null && this.combat?.nudge(this.sel)) sfx.place();
        this.render();
        break;
      case 'end-turn':
        void this.endTurn();
        break;
      case 'pick':
        this.takePick(i);
        break;
      case 'advance':
        this.advance();
        break;
      case 'buy':
        this.buy(i);
        break;
      case 'rest-heal': {
        const r = this.run!;
        r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * 0.35));
        sfx.heal();
        this.advance();
        break;
      }
      case 'rest-up':
        this.modal = { kind: 'upgrade', done: () => this.advance() };
        this.render();
        break;
      case 'event-opt': {
        const ev = this.event!;
        const opt = ev.def.options[i];
        ev.result = opt.run(this.run!, rngFor(this.run!, 'event-res', this.run!.floor, this.run!.step));
        saveRun(this.run!);
        this.render();
        break;
      }
      case 'modal-die': {
        const m = this.modal;
        if (m?.kind !== 'die') break;
        if (!applyFace(this.run!, i, m.face)) {
          sfx.deny();
          this.toast('That die has no face to improve.');
          break;
        }
        sfx.item();
        this.modal = null;
        m.done();
        break;
      }
      case 'modal-up': {
        const m = this.modal;
        if (m?.kind !== 'upgrade') break;
        this.run!.equipment[i].lvl = 1;
        sfx.item();
        this.modal = null;
        m.done();
        break;
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    const c = this.combat;
    if (this.screen !== 'combat' || !c || this.modal || this.busy) return;
    if (e.key === 'Enter') {
      void this.endTurn();
      return;
    }
    if (e.key === 'Escape') {
      this.sel = null;
      this.render();
      return;
    }
    const n = Number(e.key);
    if (!n) return;
    if (this.sel === null) {
      const d = c.player.dice[n - 1];
      if (d) this.sel = d.uid;
      this.render();
    } else {
      this.tryPlace(this.sel, n - 1);
    }
  }

  private onDown(e: PointerEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.tray .die');
    if (!el || !this.combat || this.busy || this.combat.turn !== 'player') return;
    initAudio();
    e.preventDefault();
    this.drag = { uid: Number(el.dataset.uid), x0: e.clientX, y0: e.clientY, ghost: null };
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      const die = this.combat?.player.dice.find((x) => x.uid === d.uid);
      if (!die || die.wild) {
        this.drag = null;
        if (die?.wild) this.toast('Tap the wild die and set its value first.');
        return;
      }
      this.sel = d.uid;
      this.render();
      const ghost = document.createElement('div');
      ghost.innerHTML = dieHtml(die, 'ghost');
      d.ghost = ghost.firstElementChild as HTMLElement;
      document.body.appendChild(d.ghost);
      this.root.querySelector(`.tray .die[data-uid="${d.uid}"]`)?.classList.add('lifted');
    }
    d.ghost.style.left = `${e.clientX}px`;
    d.ghost.style.top = `${e.clientY}px`;
    this.root.querySelectorAll('.equip.hover').forEach((x) => x.classList.remove('hover'));
    this.targetAt(e.clientX, e.clientY)?.classList.add('hover');
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.ghost) {
      d.ghost.remove();
      const target = this.targetAt(e.clientX, e.clientY);
      if (target) this.tryPlace(d.uid, Number(target.dataset.ei));
      else {
        this.sel = null;
        this.render();
      }
      return;
    }
    // A tap without a drag selects the die.
    this.sel = this.sel === d.uid ? null : d.uid;
    sfx.place();
    this.render();
  }

  private cancelDrag(): void {
    this.drag?.ghost?.remove();
    this.drag = null;
    this.render();
  }

  private targetAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>('.pequip .equip[data-ei]') ?? null;
  }

  // ---------- Combat flow ----------

  private tryPlace(uid: number, ei: number): void {
    const c = this.combat;
    if (!c || this.busy) return;
    const die = c.player.dice.find((d) => d.uid === uid);
    const e = c.player.equip[ei];
    if (!die || !e) return;
    if (!c.place(c.player, uid, ei)) {
      sfx.deny();
      const def = getEquip(e.id);
      if (die.wild) this.toast('Set the wild die value first.');
      else if (e.used >= usesOf(def, e.lvl)) this.toast(`${def.name} is used up this turn.`);
      else if (!accepts(def.req(e.lvl), die.value)) this.toast(`${def.name} needs ${reqLabel(def.req(e.lvl))}.`);
      this.sel = null;
      this.render();
      return;
    }
    sfx.place();
    this.sel = null;
    this.show();
    if (c.over) void this.finishCombat();
  }

  private async endTurn(): Promise<void> {
    const c = this.combat;
    if (!c || this.busy || c.turn !== 'player' || c.over) return;
    this.sel = null;
    c.endTurn(c.player);
    this.busy = true;
    sfx.roll();
    this.show();
    if (!c.over) {
      await sleep(650);
      for (let i = 0; i < 25 && this.combat === c && !c.over; i++) {
        const ei = c.aiStep();
        if (ei < 0) break;
        this.flashEnemy = ei;
        this.show();
        await sleep(this.god ? 60 : 700);
      }
      this.flashEnemy = -1;
      if (this.combat !== c) return;
      if (!c.over) {
        c.endTurn(c.enemy);
        sfx.roll();
      }
    }
    this.busy = false;
    this.show();
    if (c.over) void this.finishCombat();
  }

  private async finishCombat(): Promise<void> {
    const c = this.combat!;
    const r = this.run!;
    this.busy = true;
    this.render();
    await sleep(800);
    this.busy = false;
    if (this.combat !== c) return;
    this.combat = null;
    if (c.over === 'lose') {
      sfx.lose();
      r.hp = 0;
      this.endRun(false);
      return;
    }
    sfx.win();
    r.hp = c.player.hp;
    r.kills++;
    r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * 0.15) + (r.relics.includes('medkit') ? 5 : 0));
    const rw = fightRewards(r, this.room);
    r.gold += rw.gold;
    if (rw.relic) addRelic(r, rw.relic);
    if (rw.bonus.includes('die') && r.dice.length < 5) r.dice.push([...D6]);
    if (rw.bonus.includes('maxhp')) {
      r.maxHp += 8;
      r.hp += 8;
    }
    if (this.room === 'boss') r.hp = Math.min(r.maxHp, r.hp + Math.ceil(r.maxHp * 0.4));

    this.rewards = rw;
    this.screen = 'reward';
    saveRun(r);
    this.render();
  }

  // ---------- Run flow ----------

  private startRun(cls: ClassId): void {
    this.run = newRun(cls, randomSeedText());
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.screen = 'map';
    sfx.roll();
    this.render();
  }

  private enterRoom(room: RoomType): void {
    const r = this.run!;
    this.room = room;
    if (room === 'fight' || room === 'elite' || room === 'boss') {
      const def = encounter(r, room);
      this.enemyDef = def;
      const c = CLASSES[r.cls];
      this.combat = new Combat(
        playerFighter(c.name, c.icon, r.hp, r.maxHp, r.dice, r.equipment),
        enemyFighter(def),
        perks(r),
        rngFor(r, 'combat', r.floor, r.step),
      );
      this.combat.god = this.god;
      this.combat.start();
      this.sel = null;
      this.screen = 'combat';
      sfx.roll();
      this.show();
      return;
    }
    if (room === 'event') this.event = { def: pickEvent(r), result: null };
    if (room === 'shop') this.shop = makeShop(r);
    this.screen = room;
    this.render();
  }

  private takePick(i: number): void {
    const r = this.run!;
    const p = this.rewards?.picks[i];
    if (!p) return;
    switch (p.t) {
      case 'equip':
        if (!addEquip(r, p.id)) this.toast('No space in the backpack. It went to the stash.');
        break;
      case 'maxhp':
        r.maxHp += p.n;
        r.hp += p.n;
        break;
      case 'relic':
        addRelic(r, p.id);
        break;
      case 'die':
        if (r.dice.length < 5) r.dice.push([...D6]);
        break;
      case 'upgrade':
        this.modal = { kind: 'upgrade', done: () => this.advance() };
        this.render();
        return;
      case 'face':
        this.modal = { kind: 'die', face: p.face, done: () => this.advance() };
        this.render();
        return;
    }
    sfx.item();
    this.advance();
  }

  private buy(i: number): void {
    const r = this.run!;
    const it = this.shop[i];
    if (!it || it.sold || r.gold < it.price) return;
    const pay = () => {
      r.gold -= it.price;
      it.sold = true;
      sfx.coin();
      saveRun(r);
      this.screen = 'shop';
      this.render();
    };
    switch (it.kind) {
      case 'equip':
        if (!addEquip(r, it.id!)) this.toast('No space in the backpack. It went to the stash.');
        pay();
        break;
      case 'relic':
        addRelic(r, it.id!);
        pay();
        break;
      case 'heal':
        r.hp = Math.min(r.maxHp, r.hp + 12);
        sfx.heal();
        pay();
        break;
      case 'die':
        r.dice.push([...D6]);
        pay();
        break;
      case 'face6':
      case 'wild':
        this.modal = { kind: 'die', face: it.kind === 'wild' ? 0 : 6, done: pay };
        this.render();
        break;
      case 'upgrade':
        this.modal = { kind: 'upgrade', done: pay };
        this.render();
        break;
    }
  }

  private advance(): void {
    const r = this.run!;
    this.event = null;
    this.rewards = null;
    r.step++;
    if (r.step >= PLAN.length) {
      if (r.floor >= FLOORS) {
        this.endRun(true);
        return;
      }
      r.floor++;
      r.step = 0;
      if (r.floor > this.meta.bestFloor) {
        this.meta.bestFloor = r.floor;
        saveMeta(this.meta);
        const unlocked = CLASS_IDS.find((id) => CLASSES[id].unlock === r.floor);
        if (unlocked) this.toast(`New hero unlocked: ${CLASSES[unlocked].name}!`);
      }
    }
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run;
    if (!r) return;
    const sc = score(r, victory);
    const m = this.meta;
    if (victory) m.wins++;
    m.best = Math.max(m.best, sc);
    m.bestFloor = Math.max(m.bestFloor, r.floor);
    saveMeta(m);
    clearRun();
    this.end = { victory, score: sc, floor: r.floor, cls: r.cls };
    this.run = null;
    this.combat = null;
    this.screen = 'end';
    if (victory) sfx.win();
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      god: () => {
        this.god = true;
        if (this.combat) this.combat.god = true;
        return 'god on';
      },
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      give: (id: string) => {
        if (this.run) addEquip(this.run, id);
        this.render();
      },
      relic: (id: string) => {
        if (this.run) addRelic(this.run, id);
        this.render();
      },
      unlockAll: () => {
        this.meta.bestFloor = FLOORS;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        const c = this.combat;
        if (!c) return;
        c.enemy.hp = 0;
        c.over = 'win';
        void this.finishCombat();
      },
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        busy: this.busy,
        floor: this.run?.floor,
        step: this.run?.step,
        hp: this.run?.hp,
        gold: this.run?.gold,
        enemy: this.combat ? { name: this.combat.enemy.name, hp: this.combat.enemy.hp, turn: this.combat.turn } : null,
        end: this.end,
      }),
      /** One bot action for automatic tests. */
      step: async () => {
        if (this.busy) return 'busy';
        const m = this.modal;
        if (m) {
          const btn = this.root.querySelector<HTMLElement>('.modal [data-act="modal-die"], .modal [data-act="modal-up"]');
          if (btn) btn.click();
          else this.root.querySelector<HTMLElement>('.modal [data-act="modal-close"]')?.click();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            this.startRun('warrior');
            return 'start';
          case 'map': {
            const rooms = [...this.root.querySelectorAll<HTMLElement>('[data-act="room"]')];
            const r = this.run!;
            const safe = rooms.find((b) => !['elite', 'fight'].includes(b.dataset.room!));
            (r.hp < r.maxHp * 0.6 && safe ? safe : rooms[0])?.click();
            return 'room';
          }
          case 'combat': {
            const c = this.combat!;
            while (c.turn === 'player' && !c.over && c.aiStep(c.player) >= 0) this.show();
            if (c.over) void this.finishCombat();
            else await this.endTurn();
            return 'turn';
          }
          case 'reward':
            this.root.querySelector<HTMLElement>('[data-act="pick"]')?.click();
            return 'pick';
          case 'shop':
          case 'rest':
            this.root.querySelector<HTMLElement>(this.screen === 'rest' ? '[data-act="rest-heal"]' : '[data-act="advance"]')?.click();
            return this.screen;
          case 'event':
            (this.root.querySelector<HTMLElement>('[data-act="event-opt"]:not([disabled])') ?? this.root.querySelector<HTMLElement>('[data-act="advance"]'))?.click();
            return 'event';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { dice: typeof api }).dice = api;
  }
}

