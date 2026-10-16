import { goodBot, newBotMem, stepBattle, type AiMem, type BotMem } from './ai';
import { ACTS, BOSSES, CARDS, MAX_LVL, PERKS, TOWERS, lvlMult } from './data';
import { randomSeedText } from './rng';
import {
  PLAN,
  REST_HEAL,
  ROOM_INFO,
  addCard,
  addPerk,
  advance,
  battleSetup,
  botDraft,
  draftLevel,
  encounter,
  endRun,
  finishBattle,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  roomAt,
  saveMeta,
  saveRun,
  unlockList,
  upgradable,
  upgradeCard,
  upgradeCost,
  type Room,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import {
  CAMP_Y,
  DOUBLE_AT,
  DT,
  H,
  LANE_X,
  P_MAX_Y,
  P_MIN_Y,
  RIVER_Y,
  TOWER_Y,
  W,
  cardLevel,
  cluster,
  createBattle,
  deploy,
  dropPoint,
  keep,
  laneTower,
  type Battle,
  type Ent,
} from './sim';

type Screen = 'title' | 'map' | 'battle' | 'reward' | 'shop' | 'rest' | 'end';

type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'swap'; id: string; cost: number; shopIndex: number }
  | { kind: 'upgrade'; from: 'reward' | 'shop' | 'rest' };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  color: string;
  t: number;
  dur: number;
}
interface Shot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  color: string;
  big: boolean;
}
interface Puff {
  x: number;
  y: number;
  icon: string;
  t: number;
  big: boolean;
}

const params = new URLSearchParams(location.search);
/** `?debug&fast` shortens waits for bot tests. */
const FAST = params.has('fast');
const DEBUG = params.has('debug');

const BLUE = '#3a86ff';
const RED = '#ef476f';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const stars = (lvl: number): string => (lvl > 1 ? '★'.repeat(lvl - 1) : '');

export function cardStats(id: string, lvl: number): string {
  const c = CARDS[id];
  const m = lvlMult(lvl);
  if (c.unit) {
    const u = c.unit;
    const n = u.count ?? 1;
    const hits = u.targets === 'any' ? 'air + ground' : u.targets === 'ground' ? 'ground' : 'towers only';
    return `${n > 1 ? `${n}× ` : ''}❤️${Math.round(u.hp * m)} ⚔️${Math.round(u.dmg * m)}${u.splash ? ' 💥' : ''} · ${u.range > 40 ? 'ranged' : 'melee'} · hits ${hits}${u.air ? ' · flies' : ''}`;
  }
  const s = c.spell!;
  const parts: string[] = [];
  if (s.dmg) parts.push(`⚔️${Math.round(s.dmg * m)}${s.bolts ? ` ×${s.bolts}` : ''}`);
  if (s.heal) parts.push(`💚${Math.round(s.heal * m)}`);
  if (s.freeze) parts.push(`❄️${s.freeze}s`);
  if (s.stun) parts.push(`stun ${s.stun}s`);
  if (s.rage) parts.push(`${s.rage}s`);
  parts.push(`radius ${s.radius}`);
  return `Spell · ${parts.join(' · ')}`;
}

function cardHtml(id: string, lvl: number, opts: { act?: string; data?: string; disabled?: boolean; cls?: string; note?: string } = {}): string {
  const c = CARDS[id];
  const tag = opts.act ? 'button' : 'div';
  return `<${tag} class="card ${c.type} ${opts.cls ?? ''}" ${opts.act ? `data-act="${opts.act}"` : ''} ${opts.data ?? ''} ${opts.disabled ? 'disabled' : ''}>
    <span class="cost">${c.cost}</span>
    <span class="big">${c.icon}</span>
    <b>${c.name} <span class="stars">${stars(lvl)}</span></b>
    <small>${cardStats(id, lvl)}</small>
    <small class="dim">${c.text}</small>
    ${opts.note ? `<small class="note">${opts.note}</small>` : ''}
  </${tag}>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; gems: number; act: number; stats: RunState['stats'] } | null = null;

  // Battle
  private b: Battle | null = null;
  private ai: AiMem = { t: 1 };
  private room: Room = 'battle';
  private prev = new Map<number, [number, number]>();
  private acc = 0;
  private paused = false;
  private overShown = false;
  private overT = 0;
  private sel: string | null = null;
  private aim: { x: number; y: number } | null = null;
  private drag: { id: string; x0: number; y0: number; moved: boolean } | null = null;
  private handKey = '';
  private sideT = 0;
  private floats: Float[] = [];
  private rings: Ring[] = [];
  private shots: Shot[] = [];
  private puffs: Puff[] = [];
  private shake = 0;
  private banner: { text: string; t: number } | null = null;
  private doubled = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private scale = 1;
  private botMem: BotMem = newBotMem();

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
    window.addEventListener('resize', () => this.resize());
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------- DOM screens ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'battle':
        body = this.battleView();
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
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}<div id="ghost" class="ghost"></div>`;
    this.handKey = '';
    if (this.screen === 'battle') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.updateHand();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const camp = this.b && this.screen === 'battle' ? this.b.camp : r.camp;
    const perks = r.perks.map((p) => `<span class="perk" title="${PERKS[p].name}: ${PERKS[p].text}">${PERKS[p].icon}</span>`).join('');
    return `<header class="top">
      <span title="Camp HP. Enemy units that reach your camp hurt it. At 0 the run ends." id="camp">🏕️ ${Math.max(0, Math.round(camp))}/${r.campMax}</span>
      <span title="Gold">💰 ${r.gold}</span>
      <span title="Act and step">${ACTS[Math.min(r.act, 2)].icon} ${Math.min(r.act + 1, 3)}-${r.step + 1}</span>
      <span class="perks">${perks}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const unlocks = unlockList()
      .map((id) => {
        const c = CARDS[id];
        const own = m.unlocked.includes(id);
        return `<div class="arm ${own ? 'own' : ''}"><span class="big">${c.icon}</span><span><b>${c.name}</b> <small class="dim">(${c.cost}⚡)</small><small>${c.text}</small></span>
        ${own ? '<span class="ok">✔ In the draft</span>' : `<button data-act="unlock" data-id="${id}" ${m.gems >= c.unlock ? '' : 'disabled'}>💎 ${c.unlock}</button>`}</div>`;
      })
      .join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>🏹</span> Lane Push</h1>
      <p class="sub">You attack, they defend. Spend energy on unit cards, push down three lanes and break the enemy keep. Beat 3 bosses to win.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (act ${r.act + 1}, 🏕️ ${r.camp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best} · Towers broken ${m.towers}</p>
      <h2>Barracks <small>💎 ${m.gems} gems</small></h2>
      <p class="sub">Each run gives gems. Unlock new cards for the draft and the shop.</p>
      <div class="armory">${unlocks}</div>
    </div>`;
  }

  private deckHtml(): string {
    return `<div class="deck">${this.run!.deck.map((c) => `<span class="chip" title="${esc(CARDS[c.id].name)}: ${esc(cardStats(c.id, c.lvl))}">${CARDS[c.id].icon} ${CARDS[c.id].name} <span class="stars">${stars(c.lvl)}</span> <i>${CARDS[c.id].cost}⚡</i></span>`).join('')}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const track = PLAN.map((opts, i) => {
      const st = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${st}">${opts.map((o) => ROOM_INFO[o].icon).join('/')}</span>`;
    }).join('<span class="link"></span>');
    const rooms = roomAt(r)
      .map((room) => {
        const info = ROOM_INFO[room];
        let extra = '';
        if (room === 'battle' || room === 'elite' || room === 'boss') {
          const enc = encounter(r, room);
          const towers = enc.layout.lanes.map((t) => (t ? TOWERS[t].icon : '·')).join(' ');
          extra = `<small class="foe">${enc.layout.name}: ${towers}</small>`;
          if (enc.boss) {
            const bd = BOSSES.find((x) => x.id === enc.boss)!;
            extra += `<small class="foe">${bd.icon} ${bd.name}: ${bd.text}</small>`;
          }
          extra += `<small class="dim">Enemy card level ${enc.lvl}</small>`;
        }
        return `<button class="room r-${room}" data-act="room" data-room="${room}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="track">${track}</div>
      <div class="rooms">${rooms}</div>
      <h3>Your deck</h3>${this.deckHtml()}
    </div>`;
  }

  private battleView(): string {
    return `<div class="battle">
      <div class="field-col">
        <div class="cv-wrap" id="cvwrap"><canvas id="cv"></canvas><div class="over" id="over"></div></div>
        <div class="hand-row">
          <div class="next" id="next"></div>
          <div class="hand" id="hand"></div>
        </div>
        <div class="ebar"><div class="efill" id="efill"></div><div class="eticks"></div><span id="etext">5</span></div>
      </div>
      <aside class="side" id="side">${this.sideView()}</aside>
    </div>`;
  }

  private sideView(): string {
    const b = this.b;
    const r = this.run!;
    if (!b) return '';
    const enc = encounter(r, this.room);
    const selInfo = this.sel
      ? `<div class="einfo"><b>${CARDS[this.sel].icon} ${CARDS[this.sel].name}</b><small>${cardStats(this.sel, cardLevel(b.sides[0], this.sel))}</small><small class="dim">${CARDS[this.sel].text}</small></div>`
      : '<p class="hint">Drag a card onto the field, or tap a card and then a lane. Units go in your half (below the river). Spells go anywhere.</p>';
    const towers = enc.layout.lanes
      .map((t) => (t ? `<li>${TOWERS[t].icon} <b>${TOWERS[t].name}</b>: ${TOWERS[t].text}</li>` : '<li>· Open lane: walk straight to the keep.</li>'))
      .join('');
    const bd = b.boss ? BOSSES.find((x) => x.id === b.boss)! : null;
    const spy = r.perks.includes('spy')
      ? `<h3>🔭 Enemy hand <small>⚡${b.sides[1].energy.toFixed(1)}</small></h3><div class="mini">${b.sides[1].hand.map((id) => `<span title="${CARDS[id].name}">${CARDS[id].icon}</span>`).join('')}</div>`
      : '';
    return `${selInfo}
      <h3>${bd ? `${bd.icon} ${bd.name}` : enc.layout.name}</h3>
      ${bd ? `<p class="warn">${bd.text}</p>` : ''}
      <ul class="towers">${towers}<li>🏰 <b>Keep</b>: ${TOWERS.keep.text}</li></ul>
      <h3>Enemy deck</h3><div class="mini">${enc.deck.map((id) => `<span title="${CARDS[id].name}: ${esc(cardStats(id, enc.lvl))}">${CARDS[id].icon}</span>`).join('')}</div>
      ${spy}
      <p class="hint">Keys: 1–4 pick a card, Q W E play it in the left, middle or right lane. Space pauses.</p>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const rw = r.rewards!;
    const head = rw.win
      ? `<h2 class="good">${rw.room === 'boss' ? '👑 Boss defeated!' : '🏆 Victory!'}</h2>`
      : `<h2 class="bad">Defeat</h2><p>The camp loses ${rw.campLoss} HP while your army falls back.${rw.room === 'boss' ? ' The boss waits for your next try.' : ''}</p>`;
    const perks = rw.perks.length
      ? `<h3>Choose a perk</h3><div class="picks">${rw.perks
          .map((p) => `<button class="pick ${rw.perkDone ? 'off' : ''}" data-act="perk" data-id="${p}" ${rw.perkDone ? 'disabled' : ''}><span class="big">${PERKS[p].icon}</span><b>${PERKS[p].name}</b><small>${PERKS[p].text}</small></button>`)
          .join('')}</div>`
      : '';
    const draft = rw.draft.length
      ? `<h3>Draft a card <small class="dim">(new cards come at level ${draftLevel(r)})</small></h3>${
          rw.cardDone
            ? '<p class="dim">Card taken.</p>'
            : `<div class="picks">${rw.draft.map((id) => cardHtml(id, draftLevel(r), { act: 'draft', data: `data-id="${id}"` })).join('')}</div>
              <div class="row"><button data-act="reward-up" ${upgradable(r).length ? '' : 'disabled'}>⬆️ Upgrade a card instead</button><button data-act="skip">Skip</button></div>`
        }`
      : '';
    const can = rw.cardDone && rw.perkDone;
    return `<div class="reward">${head}
      <p>💰 +${rw.gold} gold · 🏰 ${rw.towers} tower${rw.towers === 1 ? '' : 's'} broken</p>
      ${perks}${draft}
      <button class="primary" data-act="advance" ${can ? '' : 'disabled'}>Continue ▶</button>
      <h3>Your deck</h3>${this.deckHtml()}
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = (r.shop ?? [])
      .map((it, i) => {
        let body = '';
        let cost = it.cost;
        let ok = !it.sold;
        if (it.kind === 'card') return cardHtml(it.id, draftLevel(r), { act: 'buy', data: `data-i="${i}"`, disabled: it.sold || r.gold < it.cost, cls: it.sold ? 'off' : '', note: it.sold ? 'Sold' : `💰 ${it.cost}` });
        if (it.kind === 'upgrade') {
          const up = upgradable(r);
          cost = up.length ? Math.min(...up.map((k) => upgradeCost(r.deck[k].lvl))) : 0;
          ok = ok && up.length > 0;
          body = `<span class="big">⬆️</span><b>Train a card</b><small>+1 level (max ${'★'.repeat(MAX_LVL - 1)}). From 💰 ${cost}.</small>`;
        } else if (it.kind === 'repair') {
          ok = ok && r.camp < r.campMax;
          body = `<span class="big">🔨</span><b>Repair camp</b><small>+15 camp HP (now ${r.camp}/${r.campMax}).</small>`;
        } else {
          body = `<span class="big">${PERKS[it.id].icon}</span><b>${PERKS[it.id].name}</b><small>${PERKS[it.id].text}</small>`;
        }
        ok = ok && r.gold >= cost;
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}>${body}<span class="price">${it.sold ? 'Sold' : `💰 ${cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Shop</h2><p>💰 ${r.gold} gold</p><div class="picks">${items}</div>
      <button class="primary" data-act="advance">Leave ▶</button>
      <h3>Your deck</h3>${this.deckHtml()}</div>`;
  }

  private restView(): string {
    const r = this.run!;
    const heal = Math.round(r.campMax * REST_HEAL);
    return `<div class="restv"><h2>🔥 Camp</h2><p class="sub">Rest the troops, or drill one card.</p>
      <div class="picks">
        <button class="pick" data-act="rest-heal"><span class="big">🔨</span><b>Repair</b><small>+${heal} camp HP (now ${r.camp}/${r.campMax}).</small></button>
        <button class="pick" data-act="rest-up" ${upgradable(r).length ? '' : 'disabled'}><span class="big">⬆️</span><b>Drill</b><small>Upgrade one card for free.</small></button>
      </div><h3>Your deck</h3>${this.deckHtml()}</div>`;
  }

  private endView(): string {
    const e = this.end!;
    const s = e.stats;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Defeat'}</h1>
      <p>${e.victory ? 'The Dragon Spire falls. All three bosses are beaten.' : `Your camp fell in act ${e.act + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>Battles won ${s.won} · lost ${s.lost} · towers broken ${s.towers} · elites ${s.elites} · bosses ${s.bosses}</p>
      <p>💎 +${e.gems} gems for the Barracks</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    const r = this.run;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>You attack.</b> The enemy towers stand at the top end of 3 lanes. The keep stands behind them. Break the keep to win the battle.</li>
          <li><b>Energy</b> (the purple bar) fills over time, up to 10. Every card costs energy. In the last 60 s energy fills twice as fast.</li>
          <li><b>Play a card:</b> drag it onto the field. Or tap a card, then tap the field. Keys: 1–4 pick a card, Q W E play it in a lane.</li>
          <li><b>Units</b> go in your half, below the river. They walk up their lane and fight the nearest enemy in it. Some units hit only ground, some fly, some (🗿 🐗 🎈) go only for towers.</li>
          <li><b>Spells</b> go anywhere: 🔥 Fireball, 🎯 Arrows, ✨ Zap, ❄️ Freeze, 💚 Heal and more.</li>
          <li><b>Hand:</b> your deck has 8 cards. You hold 4. The small card on the left comes next.</li>
          <li><b>The enemy</b> has its own deck, energy and hand. It counters you: splash against swarms, archers against flyers, swarms against tanks. Its units that reach the bottom hurt your 🏕️ camp.</li>
          <li><b>The keep</b> sleeps until a tower falls or you hit it. When a lane tower falls, units in that lane go for the keep.</li>
          <li><b>Time:</b> 3 minutes per battle. If time runs out, you lose the battle and the camp takes damage. A lost boss can be tried again.</li>
          <li><b>The run:</b> 3 acts. After a win, draft a new card (it replaces one of your 8) or upgrade a card. Elites have cannon or healing towers and give a perk. Beat the boss of each act.</li>
          <li>The run ends when your camp reaches 0 HP. Gems from each run unlock new cards in the Barracks.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'swap' && r) {
      const list = r.deck.map((c, i) => cardHtml(c.id, c.lvl, { act: 'swap', data: `data-i="${i}"` })).join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet wide" data-stop>
        <h2>Add ${CARDS[m.id].icon} ${CARDS[m.id].name}</h2><p>Your deck holds 8 cards. Pick the card it replaces.</p>
        <div class="picks">${list}</div><button data-act="modal-close">Cancel</button></div></div>`;
    }
    if (m.kind === 'upgrade' && r) {
      const list = r.deck
        .map((c, i) => {
          const cost = m.from === 'shop' ? upgradeCost(c.lvl) : 0;
          const ok = c.lvl < MAX_LVL && (m.from !== 'shop' || r.gold >= cost);
          return cardHtml(c.id, c.lvl, { act: 'upgrade', data: `data-i="${i}"`, disabled: !ok, note: c.lvl >= MAX_LVL ? 'Max level' : `→ ${cardStats(c.id, c.lvl + 1)}${cost ? ` · 💰 ${cost}` : ''}` });
        })
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet wide" data-stop>
        <h2>Upgrade a card</h2><p>+15% HP and damage per level.</p><div class="picks">${list}</div><button data-act="modal-close">Cancel</button></div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">▶ Resume</button>
      ${m.kind === 'menu' && m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run${this.screen === 'battle' ? ', the battle restarts' : ''})</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private startRun(): void {
    this.run = newRun(randomSeedText(), this.meta);
    saveRun(this.run);
    this.screen = 'map';
    this.render();
  }

  private continueRun(): void {
    const r = this.run!;
    if (r.rewards) this.screen = 'reward';
    else if (r.room === 'shop') {
      if (!r.shop) r.shop = makeShop(r);
      this.screen = 'shop';
    } else if (r.room === 'rest') this.screen = 'rest';
    else if (r.room) return this.startBattle(r.room);
    else this.screen = 'map';
    this.render();
  }

  private enterRoom(room: Room): void {
    const r = this.run!;
    r.room = room;
    if (room === 'shop') {
      r.shop = makeShop(r);
      this.screen = 'shop';
    } else if (room === 'rest') this.screen = 'rest';
    else {
      saveRun(r);
      return this.startBattle(room);
    }
    saveRun(r);
    this.render();
  }

  private startBattle(room: Room): void {
    const r = this.run!;
    this.room = room;
    this.b = createBattle(battleSetup(r, room));
    this.ai = { t: 1.2 };
    this.botMem = newBotMem();
    this.prev.clear();
    this.acc = 0;
    this.paused = false;
    this.overShown = false;
    this.overT = 0;
    this.sel = null;
    this.aim = null;
    this.drag = null;
    this.floats = [];
    this.rings = [];
    this.shots = [];
    this.puffs = [];
    this.doubled = false;
    this.banner = { text: room === 'boss' ? `${BOSSES[r.act].icon} ${BOSSES[r.act].name}` : room === 'elite' ? '💀 Elite battle' : '⚔️ Battle', t: 0 };
    this.screen = 'battle';
    this.render();
    if (room === 'boss') sfx.boss();
  }

  private finishBattle(): void {
    const r = this.run!;
    const b = this.b!;
    const rw = finishBattle(r, this.room, b.over === 'win', b.camp, b.towersDown);
    this.b = null;
    if (r.camp <= 0) return this.finishRun(false);
    r.rewards = rw;
    saveRun(r);
    this.screen = 'reward';
    this.render();
  }

  private next(): void {
    const r = this.run!;
    if (advance(r) === 'win') return this.finishRun(true);
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private finishRun(victory: boolean): void {
    const r = this.run!;
    const res = endRun(r, this.meta, victory);
    saveMeta(this.meta);
    this.end = { victory, score: res.score, gems: res.gems, act: r.act, stats: { ...r.stats } };
    this.run = null;
    this.b = null;
    saveRun(null);
    this.modal = null;
    this.screen = 'end';
    this.render();
    if (victory) sfx.win();
    else sfx.lose();
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if (el instanceof HTMLButtonElement && el.disabled) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        this.refreshTop();
        return;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        return;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        return;
      case 'modal-close':
        this.modal = null;
        this.render();
        return;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        return;
      case 'abandon-yes':
        this.modal = null;
        this.finishRun(false);
        return;
      case 'title':
        this.modal = null;
        this.b = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        if (this.run) {
          endRun(this.run, this.meta, false);
          saveMeta(this.meta);
        }
        sfx.click();
        this.startRun();
        return;
      case 'continue':
        sfx.click();
        this.continueRun();
        return;
      case 'unlock': {
        const id = d.id!;
        const c = CARDS[id];
        if (this.meta.gems < c.unlock || this.meta.unlocked.includes(id)) return;
        this.meta.gems -= c.unlock;
        this.meta.unlocked.push(id);
        if (this.run && !this.run.unlocked.includes(id)) this.run.unlocked.push(id);
        saveMeta(this.meta);
        if (this.run) saveRun(this.run);
        sfx.item();
        this.toast(`${c.icon} ${c.name} joins the draft pool.`);
        this.render();
        return;
      }
      case 'room':
        sfx.click();
        this.enterRoom(d.room as Room);
        return;
      case 'over-continue':
        sfx.click();
        this.finishBattle();
        return;
      case 'perk': {
        const rw = r!.rewards!;
        if (rw.perkDone) return;
        addPerk(r!, d.id!);
        rw.perkDone = true;
        sfx.item();
        saveRun(r!);
        this.render();
        return;
      }
      case 'draft':
        this.modal = { kind: 'swap', id: d.id!, cost: 0, shopIndex: -1 };
        this.render();
        return;
      case 'reward-up':
        this.modal = { kind: 'upgrade', from: 'reward' };
        this.render();
        return;
      case 'skip':
        r!.rewards!.cardDone = true;
        saveRun(r!);
        this.render();
        return;
      case 'swap': {
        const m = this.modal;
        if (!m || m.kind !== 'swap') return;
        const i = Number(d.i);
        const old = r!.deck[i];
        if (m.shopIndex >= 0) {
          const it = r!.shop![m.shopIndex];
          if (r!.gold < it.cost || it.sold) return;
          r!.gold -= it.cost;
          it.sold = true;
        } else r!.rewards!.cardDone = true;
        addCard(r!, m.id, i);
        this.modal = null;
        sfx.item();
        this.toast(`${CARDS[m.id].icon} ${CARDS[m.id].name} replaces ${CARDS[old.id].icon} ${CARDS[old.id].name}.`);
        saveRun(r!);
        this.render();
        return;
      }
      case 'upgrade': {
        const m = this.modal;
        if (!m || m.kind !== 'upgrade') return;
        const i = Number(d.i);
        const c = r!.deck[i];
        if (m.from === 'shop') {
          const cost = upgradeCost(c.lvl);
          if (r!.gold < cost) return;
          r!.gold -= cost;
          const it = r!.shop!.find((x) => x.kind === 'upgrade');
          if (it) it.sold = true;
        }
        if (!upgradeCard(r!, i)) return;
        this.modal = null;
        sfx.item();
        this.toast(`${CARDS[c.id].icon} ${CARDS[c.id].name} is now level ${c.lvl}.`);
        if (m.from === 'reward') r!.rewards!.cardDone = true;
        saveRun(r!);
        if (m.from === 'rest') return this.next();
        this.render();
        return;
      }
      case 'buy': {
        const it = r!.shop![Number(d.i)];
        if (it.sold) return;
        if (it.kind === 'card') {
          this.modal = { kind: 'swap', id: it.id, cost: it.cost, shopIndex: Number(d.i) };
        } else if (it.kind === 'upgrade') {
          this.modal = { kind: 'upgrade', from: 'shop' };
        } else if (it.kind === 'repair') {
          if (r!.gold < it.cost) return;
          r!.gold -= it.cost;
          r!.camp = Math.min(r!.campMax, r!.camp + 15);
          it.sold = true;
          sfx.heal();
        } else {
          if (r!.gold < it.cost) return;
          r!.gold -= it.cost;
          addPerk(r!, it.id);
          it.sold = true;
          sfx.item();
        }
        saveRun(r!);
        this.render();
        return;
      }
      case 'rest-heal':
        r!.camp = Math.min(r!.campMax, r!.camp + Math.round(r!.campMax * REST_HEAL));
        sfx.heal();
        this.next();
        return;
      case 'rest-up':
        this.modal = { kind: 'upgrade', from: 'rest' };
        this.render();
        return;
      case 'advance':
        sfx.click();
        this.next();
        return;
      case 'pause':
        this.paused = !this.paused;
        return;
    }
  }

  private refreshTop(): void {
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top && this.run) top.outerHTML = this.topBar();
  }

  private fieldPoint(cx: number, cy: number): { x: number; y: number } | null {
    const cv = this.canvas;
    if (!cv) return null;
    const rc = cv.getBoundingClientRect();
    if (cx < rc.left || cx > rc.right || cy < rc.top || cy > rc.bottom) return null;
    return { x: ((cx - rc.left) / rc.width) * W, y: ((cy - rc.top) / rc.height) * H };
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'battle' || !this.b || this.modal) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('.hcard');
    if (card) {
      e.preventDefault();
      this.drag = { id: card.dataset.id!, x0: e.clientX, y0: e.clientY, moved: false };
      return;
    }
    if (e.target === this.canvas && e.pointerType !== 'mouse') {
      this.aim = this.fieldPoint(e.clientX, e.clientY);
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'battle') return;
    if (this.drag) {
      if (!this.drag.moved && Math.hypot(e.clientX - this.drag.x0, e.clientY - this.drag.y0) > 10) {
        this.drag.moved = true;
        this.sel = this.drag.id;
        const g = this.root.querySelector<HTMLElement>('#ghost');
        if (g) {
          g.textContent = CARDS[this.drag.id].icon;
          g.classList.add('on');
        }
        this.updateHand(true);
      }
      if (this.drag.moved) {
        const g = this.root.querySelector<HTMLElement>('#ghost');
        if (g) g.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 56}px)`;
        this.aim = this.fieldPoint(e.clientX, e.clientY);
      }
      return;
    }
    if (this.sel) this.aim = this.fieldPoint(e.clientX, e.clientY);
  }

  private cancelDrag(): void {
    this.drag = null;
    const g = this.root.querySelector<HTMLElement>('#ghost');
    if (g) g.classList.remove('on');
  }

  private onUp(e: PointerEvent): void {
    if (this.screen !== 'battle' || !this.b) return;
    const d = this.drag;
    if (d) {
      this.cancelDrag();
      if (d.moved) {
        const p = this.fieldPoint(e.clientX, e.clientY);
        if (p) this.play(d.id, p.x, p.y);
        else {
          this.sel = null;
          this.aim = null;
        }
      } else {
        this.sel = this.sel === d.id ? null : d.id;
        if (this.sel) sfx.select();
      }
      this.updateHand(true);
      this.updateSide();
      return;
    }
    if (e.target === this.canvas && this.sel && !this.modal) {
      const p = this.fieldPoint(e.clientX, e.clientY);
      if (p) this.play(this.sel, p.x, p.y);
      if (e.pointerType !== 'mouse') this.aim = null;
    }
  }

  private play(id: string, x: number, y: number): void {
    const b = this.b!;
    if (b.over || this.paused) return;
    const c = CARDS[id];
    if (!b.sides[0].hand.includes(id)) return;
    if (b.sides[0].energy < c.cost) {
      sfx.deny();
      this.toast(`Need ${c.cost} energy for ${c.name}.`);
      return;
    }
    if (c.type === 'unit' && y < P_MIN_Y - 30) {
      // Dropped on the enemy half: snap to the river edge of your half.
      y = P_MIN_Y;
    }
    if (deploy(b, 0, id, x, y)) {
      if (c.type === 'spell') {
        if (c.spell!.freeze) sfx.freeze();
        else if (c.spell!.heal) sfx.heal();
        else sfx.spell();
      } else sfx.deploy();
      this.sel = null;
      this.aim = null;
      this.updateHand(true);
      this.updateSide();
    }
  }

  private keyLanePlay(lane: number): void {
    const b = this.b!;
    const id = this.sel;
    if (!id) return this.toast('Pick a card first (1–4).');
    const c = CARDS[id];
    if (c.type === 'unit') return this.play(id, LANE_X[lane], P_MAX_Y - 20);
    // Spells: the biggest group of enemies in that lane, else the lane tower.
    const foes = c.spell!.heal || c.spell!.rage ? 0 : 1;
    const cl = cluster(b, foes as 0 | 1, c.spell!.radius * 0.9, (e) => e.lane === lane);
    if (cl) return this.play(id, cl.x, cl.y);
    const tw = laneTower(b, lane) ?? keep(b);
    if (tw) this.play(id, tw.x, tw.y);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'battle' || !this.b) {
      if (e.key === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.sel) {
        this.sel = null;
        this.updateHand(true);
      } else {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    } else if (['1', '2', '3', '4'].includes(k)) {
      const id = this.b.sides[0].hand[Number(k) - 1];
      this.sel = this.sel === id ? null : id;
      if (this.sel) sfx.select();
      this.updateHand(true);
      this.updateSide();
    } else if (k === 'q' || k === 'w' || k === 'e') {
      this.keyLanePlay({ q: 0, w: 1, e: 2 }[k]);
    } else if (k === ' ') {
      e.preventDefault();
      if (this.b.over && this.overShown) this.finishBattle();
      else this.paused = !this.paused;
    } else if (k === 'enter' && this.b.over && this.overShown) this.finishBattle();
  }

  // ---------- Battle HUD (DOM) ----------

  private updateHand(force = false): void {
    const b = this.b;
    if (!b) return;
    const s = b.sides[0];
    const key = `${s.hand.join(',')}|${s.queue[0]}|${this.sel}|${s.hand.map((id) => (s.energy >= CARDS[id].cost ? 1 : 0)).join('')}`;
    if (force || key !== this.handKey) {
      this.handKey = key;
      const hand = this.root.querySelector<HTMLElement>('#hand');
      if (hand) {
        hand.innerHTML = s.hand
          .map((id, i) => {
            const c = CARDS[id];
            const ok = s.energy >= c.cost;
            return `<button class="hcard ${c.type} ${ok ? '' : 'poor'} ${this.sel === id ? 'sel' : ''}" data-id="${id}" title="${esc(c.name)}: ${esc(cardStats(id, cardLevel(s, id)))}">
              <span class="cost">${c.cost}</span><span class="ico">${c.icon}</span><span class="nm">${c.name}</span><span class="stars">${stars(cardLevel(s, id))}</span><span class="key">${i + 1}</span></button>`;
          })
          .join('');
      }
      const next = this.root.querySelector<HTMLElement>('#next');
      if (next) next.innerHTML = `<small>Next</small><span>${CARDS[s.queue[0]].icon}</span>`;
    }
    const fill = this.root.querySelector<HTMLElement>('#efill');
    if (fill) fill.style.width = `${(s.energy / s.max) * 100}%`;
    const txt = this.root.querySelector<HTMLElement>('#etext');
    if (txt) txt.textContent = `⚡ ${Math.floor(s.energy)} / ${s.max}${b.time <= DOUBLE_AT ? '  ×2' : ''}`;
    // Fill the hand cards with the progress toward their cost.
    this.root.querySelectorAll<HTMLElement>('.hcard').forEach((el) => {
      const c = CARDS[el.dataset.id!];
      el.style.setProperty('--p', `${Math.min(1, s.energy / c.cost) * 100}%`);
    });
  }

  private updateSide(): void {
    const side = this.root.querySelector<HTMLElement>('#side');
    if (side) side.innerHTML = this.sideView();
  }

  private showOver(): void {
    const b = this.b!;
    const el = this.root.querySelector<HTMLElement>('#over');
    if (!el) return;
    const win = b.over === 'win';
    el.innerHTML = `<div class="over-box"><h2 class="${win ? 'good' : 'bad'}">${win ? '🏆 Victory!' : '💀 Defeat'}</h2><p>${b.reason}</p>
      <p class="dim">Towers broken: ${b.towersDown} · Camp ${Math.round(b.camp)}/${b.campMax}</p>
      <button class="primary" data-act="over-continue">Continue ▶</button></div>`;
    el.classList.add('on');
  }

  // ---------- Canvas loop ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const top = this.root.querySelector<HTMLElement>('header.top')?.offsetHeight ?? 44;
    const maxW = wrap.clientWidth;
    const maxH = window.innerHeight - top - 128;
    const w = Math.max(200, Math.min(maxW, (maxH * W) / H, 520));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * H) / W}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * H) / W) * dpr);
    this.scale = (w / W) * dpr;
  }

  private startLoop(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (t: number) => {
      if (this.screen !== 'battle' || !this.ctx) {
        this.raf = 0;
        return;
      }
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private simStep(bot?: (b: Battle) => void): void {
    const b = this.b!;
    for (const e of b.ents) this.prev.set(e.id, [e.x, e.y]);
    stepBattle(b, this.ai, bot);
  }

  private update(dt: number): void {
    const b = this.b;
    if (!b) return;
    const running = !this.paused && !this.modal && !b.over;
    if (running) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 8) {
        this.simStep();
        this.acc -= DT;
        n++;
      }
      if (n === 8) this.acc = 0;
    }
    this.consumeEvents();
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 0.9);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const s of this.shots) s.t += dt;
    this.shots = this.shots.filter((s) => s.t < 0.2);
    for (const p of this.puffs) p.t += dt;
    this.puffs = this.puffs.filter((p) => p.t < (p.big ? 1.2 : 0.5));
    this.shake = Math.max(0, this.shake - dt);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 2) this.banner = null;
    }
    if (!this.doubled && b.time <= DOUBLE_AT) {
      this.doubled = true;
      this.banner = { text: '⚡ Double energy!', t: 0 };
      sfx.double();
    }
    if (b.over && !this.overShown) {
      if (this.overT === 0) {
        if (b.over === 'win') sfx.win();
        else sfx.lose();
      }
      this.overT += dt;
      if (this.overT > (FAST ? 0 : 0.9)) {
        this.overShown = true;
        this.showOver();
      }
    }
    this.updateHand();
    this.sideT += dt;
    if (this.sideT > 0.5 && this.run?.perks.includes('spy')) {
      this.sideT = 0;
      this.updateSide();
    }
    const camp = this.root.querySelector<HTMLElement>('#camp');
    if (camp && this.run) camp.textContent = `🏕️ ${Math.max(0, Math.round(b.camp))}/${this.run.campMax}`;
  }

  private consumeEvents(): void {
    const b = this.b!;
    if (!b.events.length) return;
    for (const ev of b.events) {
      switch (ev.k) {
        case 'shot':
          if (this.shots.length < 80) this.shots.push({ x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, t: 0, color: ev.team === 0 ? '#9fd0ff' : '#ffb3c1', big: ev.big });
          if (ev.team === 1) sfx.shoot();
          break;
        case 'hit':
          if (ev.tower) sfx.hitTower();
          if ((ev.tower || ev.n >= 100) && this.floats.length < 50) this.floats.push({ x: ev.x + (Math.random() - 0.5) * 16, y: ev.y - 12, text: `-${ev.n}`, color: ev.team === 0 ? '#ffd166' : '#ff8fa3', t: 0, size: ev.tower ? 13 : 10 });
          break;
        case 'boom':
          this.rings.push({ x: ev.x, y: ev.y, r: ev.r, color: ev.color, t: 0, dur: 0.45 });
          break;
        case 'death':
          this.puffs.push({ x: ev.x, y: ev.y, icon: ev.tower ? '💥' : '💨', t: 0, big: ev.tower });
          if (ev.tower) {
            this.shake = 0.45;
            sfx.tower();
            this.floats.push({ x: ev.x, y: ev.y - 20, text: 'Tower down!', color: '#ffd166', t: 0, size: 16 });
          } else sfx.death();
          break;
        case 'deploy':
          this.rings.push({ x: ev.x, y: ev.y, r: 16, color: ev.team === 0 ? BLUE : RED, t: 0, dur: 0.35 });
          if (ev.team === 1) {
            sfx.enemyDeploy();
            if (CARDS[ev.card].type === 'spell') {
              sfx.spell();
              this.floats.push({ x: ev.x, y: ev.y - 26, text: `${CARDS[ev.card].icon} ${CARDS[ev.card].name}`, color: '#ff8fa3', t: 0, size: 12 });
            }
          }
          break;
        case 'breach':
          this.shake = 0.3;
          sfx.breach();
          this.floats.push({ x: ev.x, y: CAMP_Y - 18, text: `🏕️ -${ev.n}`, color: RED, t: 0, size: 15 });
          break;
        case 'heal':
          if (this.floats.length < 50) this.floats.push({ x: ev.x, y: ev.y - 12, text: `+${ev.n}`, color: '#7ee08a', t: 0, size: 10 });
          break;
        case 'boss':
          this.banner = { text: ev.text, t: 0 };
          sfx.boss();
          break;
      }
    }
    b.events.length = 0;
  }

  private draw(): void {
    const ctx = this.ctx;
    const b = this.b;
    if (!ctx || !b) return;
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 12, (Math.random() - 0.5) * this.shake * 12);
    this.drawField(ctx, b);
    const alpha = Math.min(1, this.acc / DT);
    const pos = (e: Ent): [number, number] => {
      const p = this.prev.get(e.id);
      if (!p || b.over || this.paused) return [e.x, e.y];
      return [p[0] + (e.x - p[0]) * alpha, p[1] + (e.y - p[1]) * alpha];
    };
    // Towers, then ground units, then air units.
    for (const e of b.ents) if (e.kind === 'tower') this.drawTower(ctx, b, e);
    // Dead tower rubble.
    b.layout.lanes.forEach((t, lane) => {
      if (t && !laneTower(b, lane)) {
        ctx.globalAlpha = 0.5;
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🪨', LANE_X[lane], TOWER_Y);
        ctx.globalAlpha = 1;
      }
    });
    const units = b.ents.filter((e) => e.kind === 'unit').sort((a, z) => Number(a.air) - Number(z.air) || a.y - z.y);
    for (const e of units) this.drawUnit(ctx, e, pos(e));
    // Shots
    for (const sh of this.shots) {
      const k = sh.t / 0.2;
      const x = sh.x1 + (sh.x2 - sh.x1) * k;
      const y = sh.y1 + (sh.y2 - sh.y1) * k;
      ctx.fillStyle = sh.color;
      ctx.beginPath();
      ctx.arc(x, y, sh.big ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      const k = r.t / r.dur;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = r.color;
      ctx.globalAlpha = (1 - k) * 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const p of this.puffs) {
      const dur = p.big ? 1.2 : 0.5;
      ctx.globalAlpha = 1 - p.t / dur;
      ctx.font = `${p.big ? 40 : 16}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.icon, p.x, p.y - p.t * 20);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      ctx.globalAlpha = 1 - f.t / 0.9;
      ctx.font = `bold ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(f.text, f.x, f.y - f.t * 28);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.t * 28);
      ctx.globalAlpha = 1;
    }
    this.drawPreview(ctx, b);
    this.drawHud(ctx, b);
  }

  private drawField(ctx: CanvasRenderingContext2D, b: Battle): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1830');
    g.addColorStop(0.48, '#1b2236');
    g.addColorStop(0.52, '#16243a');
    g.addColorStop(1, '#10203a');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // Lanes
    for (const x of LANE_X) {
      ctx.fillStyle = 'rgba(210, 180, 140, 0.10)';
      ctx.fillRect(x - 26, 70, 52, H - 70);
      ctx.strokeStyle = 'rgba(210, 180, 140, 0.16)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(x, 80);
      ctx.lineTo(x, H - 14);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Roads to the keep
    ctx.strokeStyle = 'rgba(210, 180, 140, 0.12)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(LANE_X[0], TOWER_Y);
    ctx.lineTo(180, 44);
    ctx.lineTo(LANE_X[2], TOWER_Y);
    ctx.stroke();
    ctx.lineWidth = 1;
    // River with bridges
    ctx.fillStyle = '#1d4e89';
    ctx.fillRect(0, RIVER_Y - 12, W, 24);
    ctx.fillStyle = 'rgba(155, 231, 255, 0.25)';
    for (let x = (b.t * 12) % 30; x < W; x += 30) ctx.fillRect(x, RIVER_Y - 2 + Math.sin(x + b.t) * 3, 10, 2);
    for (const x of LANE_X) {
      ctx.fillStyle = '#6b4f3a';
      ctx.fillRect(x - 24, RIVER_Y - 15, 48, 30);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = -20; k <= 20; k += 8) ctx.fillRect(x + k, RIVER_Y - 15, 2, 30);
    }
    // Camp wall
    ctx.fillStyle = '#5c3d2e';
    ctx.fillRect(0, CAMP_Y, W, H - CAMP_Y);
    ctx.fillStyle = '#7a5440';
    for (let x = 0; x < W; x += 12) ctx.fillRect(x + 1, CAMP_Y - 5, 9, 7);
    const pct = Math.max(0, b.camp / b.campMax);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W / 2 - 60, CAMP_Y - 1, 120, 8);
    ctx.fillStyle = pct > 0.35 ? '#7ee08a' : RED;
    ctx.fillRect(W / 2 - 60, CAMP_Y - 1, 120 * pct, 8);
  }

  private drawTower(ctx: CanvasRenderingContext2D, b: Battle, e: Ent): void {
    const isKeep = e.tower === 'keep';
    const r = e.r;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : isKeep ? '#4a3a5c' : '#3d3550';
    ctx.strokeStyle = e.freeze > 0 ? '#9be7ff' : RED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(e.x - r, e.y - r, r * 2, r * 2, 6);
    ctx.fill();
    ctx.stroke();
    // Range ring while units are near
    if (e.awake) {
      ctx.strokeStyle = 'rgba(239, 71, 111, 0.08)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.range + e.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = `${isKeep ? 28 : 22}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = isKeep && b.boss ? BOSSES.find((x) => x.id === b.boss)!.icon : e.icon;
    ctx.fillText(icon, e.x, e.y + 1);
    if (isKeep && !e.awake) {
      ctx.font = '12px serif';
      ctx.fillText('💤', e.x + r - 2, e.y - r + 2);
    }
    if (e.freeze > 0) {
      ctx.fillStyle = 'rgba(155, 231, 255, 0.35)';
      ctx.fillRect(e.x - r, e.y - r, r * 2, r * 2);
    }
    // HP bar
    const w = r * 2 + 8;
    const pct = Math.max(0, e.hp / e.maxHp);
    const y = e.y + r + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - w / 2, y, w, 9);
    ctx.fillStyle = RED;
    ctx.fillRect(e.x - w / 2, y, w * pct, 9);
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(Math.ceil(e.hp)), e.x, y + 5);
  }

  private drawUnit(ctx: CanvasRenderingContext2D, e: Ent, [x, y0]: [number, number]): void {
    const y = e.air ? y0 - 10 : y0;
    const col = e.team === 0 ? BLUE : RED;
    if (e.air) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y0 + 4, e.r * 0.9, e.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.rage > 0) {
      ctx.fillStyle = 'rgba(255, 77, 109, 0.35)';
      ctx.beginPath();
      ctx.arc(x, y, e.r + 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : col;
    ctx.globalAlpha = e.flash > 0 ? 0.9 : 0.55;
    ctx.beginPath();
    ctx.arc(x, y, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = `${Math.max(13, e.r * 1.9)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.icon, x, y + 1);
    if (e.freeze > 0) {
      ctx.fillStyle = 'rgba(155, 231, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(x, y, e.r + 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.stun > 0) {
      ctx.font = '9px serif';
      ctx.fillText('💫', x, y - e.r - 4);
    }
    if (e.hp < e.maxHp) {
      const w = Math.max(14, e.r * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y - e.r - 5, w, 3);
      ctx.fillStyle = e.team === 0 ? '#7ec8ff' : '#ff8fa3';
      ctx.fillRect(x - w / 2, y - e.r - 5, w * Math.max(0, e.hp / e.maxHp), 3);
    }
  }

  private drawPreview(ctx: CanvasRenderingContext2D, b: Battle): void {
    const id = this.sel;
    if (!id || b.over) return;
    const c = CARDS[id];
    if (c.type === 'unit') {
      ctx.fillStyle = 'rgba(58, 134, 255, 0.10)';
      ctx.fillRect(0, P_MIN_Y - 10, W, P_MAX_Y - P_MIN_Y + 20);
      ctx.strokeStyle = 'rgba(58, 134, 255, 0.5)';
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(1, P_MIN_Y - 10, W - 2, P_MAX_Y - P_MIN_Y + 20);
      ctx.setLineDash([]);
    }
    if (!this.aim) return;
    let { x, y } = this.aim;
    if (c.type === 'unit' && y < P_MIN_Y - 30) y = P_MIN_Y;
    const p = dropPoint(0, c, x, y);
    const ok = b.sides[0].energy >= c.cost;
    ctx.globalAlpha = 0.75;
    if (c.type === 'spell') {
      ctx.strokeStyle = ok ? '#ffd166' : '#888';
      ctx.fillStyle = ok ? 'rgba(255, 209, 102, 0.15)' : 'rgba(128,128,128,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, c.spell!.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = ok ? 'rgba(58, 134, 255, 0.25)' : 'rgba(128,128,128,0.25)';
      ctx.fillRect(LANE_X[p.lane] - 26, P_MIN_Y - 10, 52, P_MAX_Y - P_MIN_Y + 20);
      const st = c.unit!;
      if (st.range > 40) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, st.range + st.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.icon, p.x, p.y);
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D, b: Battle): void {
    const t = Math.max(0, Math.ceil(b.time));
    const txt = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(4, 4, 64, 20);
    ctx.fillStyle = b.time <= 30 ? RED : b.time <= DOUBLE_AT ? '#ffd166' : '#fff';
    ctx.fillText(txt, 9, 8);
    if (b.time <= DOUBLE_AT) {
      ctx.fillStyle = '#ffd166';
      ctx.fillText('⚡×2', 9, 28);
    }
    if (this.paused && !b.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H / 2 - 30, W, 60);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Paused (Space)', W / 2, H / 2);
    }
    if (this.banner) {
      const k = this.banner.t;
      ctx.globalAlpha = k < 1.5 ? 1 : 1 - (k - 1.5) / 0.5;
      ctx.fillStyle = 'rgba(10, 18, 40, 0.75)';
      ctx.fillRect(0, RIVER_Y - 22, W, 44);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.banner.text, W / 2, RIVER_Y);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Debug API ----------

  private installDebug(): void {
    const chunk = FAST ? 450 : 150;
    const api = {
      state: () => {
        const r = this.run;
        const b = this.b;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          act: r?.act ?? null,
          step: r?.step ?? null,
          camp: r?.camp ?? null,
          gold: r?.gold ?? null,
          deck: r?.deck.map((c) => `${c.id}${c.lvl}`) ?? [],
          perks: r?.perks ?? [],
          battle: b
            ? {
                room: this.room,
                time: Math.round(b.time),
                over: b.over,
                camp: b.camp,
                energy: +b.sides[0].energy.toFixed(1),
                enemyEnergy: +b.sides[1].energy.toFixed(1),
                hand: b.sides[0].hand.slice(),
                towers: b.ents.filter((e) => e.kind === 'tower').map((e) => `${e.tower}:${e.hp}`),
                units: b.ents.filter((e) => e.kind === 'unit').length,
              }
            : null,
          end: this.end,
          meta: this.meta,
        };
      },
      step: (): string => {
        const r = this.run;
        if (this.modal) {
          const m = this.modal;
          if (m.kind === 'swap' && r) {
            const p = botDraft(r, [m.id]);
            this.action('swap', { i: String(p && p.kind === 'card' ? p.replace : 0) });
          } else if (m.kind === 'upgrade' && r) {
            const up = upgradable(r).sort((a, z) => r.deck[a].lvl - r.deck[z].lvl);
            if (up.length && (m.from !== 'shop' || r.gold >= upgradeCost(r.deck[up[0]].lvl))) this.action('upgrade', { i: String(up[0]) });
            else this.action('modal-close', {});
          } else this.action('modal-close', {});
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            if (this.run) this.continueRun();
            else this.startRun();
            return 'start';
          case 'map': {
            const opts = roomAt(r!);
            let room = opts[0];
            if (opts.includes('elite') && r!.camp > r!.campMax * 0.5) room = 'elite';
            if (opts.includes('rest') && (r!.camp < r!.campMax * 0.7 || r!.gold < 50)) room = 'rest';
            else if (opts.includes('shop')) room = 'shop';
            this.enterRoom(room);
            return `room ${room}`;
          }
          case 'battle': {
            const b = this.b!;
            if (b.over) {
              this.finishBattle();
              return 'battle over';
            }
            for (let i = 0; i < chunk && !b.over; i++) this.simStep((bb) => goodBot(bb, this.botMem));
            this.consumeEvents();
            return b.over ? `battle ${b.over}` : 'fight';
          }
          case 'reward': {
            const rw = r!.rewards!;
            if (!rw.perkDone) {
              this.action('perk', { id: rw.perks[0] });
              return 'perk';
            }
            if (!rw.cardDone) {
              const p = botDraft(r!, rw.draft);
              if (p?.kind === 'card') {
                this.modal = { kind: 'swap', id: p.id, cost: 0, shopIndex: -1 };
                this.action('swap', { i: String(p.replace) });
              } else if (p) {
                this.modal = { kind: 'upgrade', from: 'reward' };
                this.action('upgrade', { i: String(p.i) });
              } else this.action('skip', {});
              return 'draft';
            }
            this.next();
            return 'next';
          }
          case 'shop': {
            const perk = r!.shop!.findIndex((it) => it.kind === 'perk' && !it.sold && r!.gold >= it.cost);
            if (perk >= 0) {
              this.action('buy', { i: String(perk) });
              return 'buy perk';
            }
            const up = r!.shop!.findIndex((it) => it.kind === 'upgrade' && !it.sold);
            const ups = upgradable(r!);
            if (up >= 0 && ups.length && r!.gold >= Math.min(...ups.map((k) => upgradeCost(r!.deck[k].lvl)))) {
              this.action('buy', { i: String(up) });
              return 'buy upgrade';
            }
            this.next();
            return 'leave';
          }
          case 'rest':
            if (r!.camp < r!.campMax * 0.7 || !upgradable(r!).length) this.action('rest-heal', {});
            else {
              this.modal = { kind: 'upgrade', from: 'rest' };
              this.action('upgrade', { i: String(upgradable(r!)[0]) });
            }
            return 'rest';
          case 'end':
            return 'end';
        }
        return 'idle';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
