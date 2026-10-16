import { type Card, ED_INFO, ENH_INFO, HAND_TYPES, SEAL_INFO, SUITS, SUIT_NAMES, handValue, isRed, rankLabel } from './cards';
import { BLIND_NAMES, BLIND_REWARD, BOSS, DECK, DECKS, PLANET, TAROT, WIN_ANTE } from './data';
import { type Action, botAction } from './bot';
import { BLINDS_PER_UNLOCK, JOKERS, JOKER_IDS, LOCKED_JOKERS, RARITY_NAME, type JokerInst, jokerText, sellValue } from './jokers';
import { randomSeedText } from './rng';
import {
  PACK_INFO,
  type Meta,
  type PackOpt,
  type RunState,
  beginPlay,
  buyItem,
  buyPack,
  clearRun,
  collect,
  consError,
  continueEndless,
  curBoss,
  deckUnlocked,
  discard,
  endRound,
  finishPlay,
  loadMeta,
  loadRun,
  moveJoker,
  newRun,
  nextBlind,
  packError,
  pickPack,
  playError,
  preview,
  recordRun,
  reroll,
  runScore,
  saveMeta,
  saveRun,
  scorePlayed,
  sellCons,
  sellJoker,
  setSort,
  skipPack,
  startRound,
  targetFor,
  unlockedJokers,
  useCons,
} from './run';
import { type ScoreResult, type Step, isDebuffed } from './score';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'blind' | 'round' | 'cashout' | 'shop' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'levels' } | { kind: 'deck' };

interface EndInfo {
  won: boolean;
  score: number;
  ante: number;
  blinds: number;
  best: number;
  bestType: string;
  unlocked: string[];
  endless: boolean;
}

const params = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits, for bot tests. */
const FAST = params.has('fast');

const wait = (ms: number): Promise<void> => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (Math.abs(n) >= 1e11) return n.toExponential(3).replace('+', '');
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 1 });
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function cardTip(c: Card): string {
  const parts = [`${rankLabel(c.rank)} of ${SUIT_NAMES[c.suit]}`];
  if (c.enh) parts.push(`${ENH_INFO[c.enh].name}: ${ENH_INFO[c.enh].text}`);
  if (c.seal) parts.push(`${SEAL_INFO[c.seal].name}: ${SEAL_INFO[c.seal].text}`);
  if (c.ed) parts.push(`${ED_INFO[c.ed].name}: ${ED_INFO[c.ed].text}`);
  return parts.join('\n');
}

const ENH_BADGE: Record<string, string> = { bonus: '+30', mult: '+4', glass: '×2', steel: '×1.5', gold: '$3', lucky: '🍀' };

function cardHtml(c: Card, o: { cls?: string; attrs?: string; debuff?: boolean } = {}): string {
  const cls = ['card', isRed(c.suit) ? 'red' : 'black', c.enh ? `enh-${c.enh}` : '', c.ed ? `ed-${c.ed}` : '', o.debuff ? 'debuff' : '', o.cls ?? ''].filter(Boolean).join(' ');
  const r = rankLabel(c.rank);
  const s = SUITS[c.suit];
  return `<div class="${cls}" title="${esc(cardTip(c))}" ${o.attrs ?? ''}>
    <span class="corner"><b>${r}</b><i>${s}</i></span>
    <span class="pip">${c.rank >= 11 && c.rank <= 13 ? `<em>${r}</em>` : ''}${s}</span>
    ${c.enh ? `<span class="badge">${ENH_BADGE[c.enh]}</span>` : ''}
    ${c.seal ? `<span class="seal seal-${c.seal}"></span>` : ''}
  </div>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta: Meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private sel: number[] = [];
  private selJoker: number | null = null;
  private selCons: number | null = null;
  private busy = false;
  private end: EndInfo | null = null;
  private deckPick = 'red';
  private shownScore = 0;
  private shownChips: number | null = null;
  private shownMult: number | null = null;
  private resizeTimer = 0;
  /** Hand cards already shown, so only new cards play the deal animation. */
  private dealt = new Set<number>();

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => !this.busy && this.render(), 120);
    });
    if (params.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private stageScreen(): Screen {
    const st = this.run?.stage;
    if (!st) return 'title';
    if (st === 'pack') return 'shop';
    if (st === 'won') return 'end';
    return st;
  }

  private goStage(): void {
    this.screen = this.stageScreen();
    this.sel = [];
    this.selJoker = null;
    this.selCons = null;
    if (this.run) saveRun(this.run);
    this.render();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private deny(msg: string): void {
    sfx.deny();
    this.toast(msg);
  }

  private cx(): { planetsUsed: number; cardsAdded: number; steelCount: number } {
    const r = this.run!;
    return { planetsUsed: r.planetsUsed, cardsAdded: r.cardsAdded, steelCount: r.cards.filter((c) => c.enh === 'steel').length };
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'blind':
        body = this.blindView();
        break;
      case 'round':
        body = this.roundView();
        break;
      case 'cashout':
        body = this.cashoutView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    let modal = this.modal ? this.modalView() : '';
    if (!modal && this.run?.stage === 'pack' && this.screen === 'shop') modal = this.packView();
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${modal}`;
    this.run?.round?.hand.forEach((c) => this.dealt.add(c.id));
  }

  private topBar(): string {
    const r = this.run!;
    return `<header class="top">
      <div class="tb-info">
        <span class="pill ante" title="Ante">Ante <b>${r.ante}</b>/${WIN_ANTE}</span>
        <span class="pill money" title="Money">$<b>${r.money}</b></span>
        ${r.round ? `<span class="pill hd" title="Hands left">✋ <b>${r.round.handsLeft}</b></span><span class="pill hd" title="Discards left">🗑️ <b>${r.round.discardsLeft}</b></span>` : ''}
      </div>
      <div class="tb-btns">
        <button class="icon" data-act="levels" title="Hand levels (L)">📊</button>
        <button class="icon" data-act="deck" title="Your deck">🂠</button>
        <button class="icon" data-act="help" title="How to play (H)">?</button>
        <button class="icon" data-act="mute" title="Sound on/off">${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon" data-act="menu" title="Menu (Esc)">☰</button>
      </div>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const open = unlockedJokers(m).length;
    const nextAt = (Math.floor(m.blinds / BLINDS_PER_UNLOCK) + 1) * BLINDS_PER_UNLOCK;
    const fan = [
      { id: 0, rank: 14, suit: 0 },
      { id: 0, rank: 13, suit: 1 },
      { id: 0, rank: 12, suit: 3 },
      { id: 0, rank: 11, suit: 2 },
      { id: 0, rank: 10, suit: 1 },
    ] as Card[];
    const decks = DECKS.map((d) => {
      const ok = deckUnlocked(m, d.unlock);
      const need = d.unlock === 9 ? 'Win a run' : `Reach ante ${d.unlock}`;
      return `<button class="deck-btn ${this.deckPick === d.id ? 'on' : ''}" data-act="pick-deck" data-deck="${d.id}" ${ok ? '' : 'disabled'} title="${esc(ok ? d.text : need)}">
        <span class="big">${ok ? d.icon : '🔒'}</span><b>${d.name}</b><small>${ok ? d.text : need}</small></button>`;
    }).join('');
    return `<div class="title">
      <div class="fan">${fan.map((c, i) => cardHtml(c, { attrs: `style="--k:${i - 2}"` })).join('')}</div>
      <h1>High Card</h1>
      <p class="sub">Play poker hands. Stack jokers. Beat ante ${WIN_ANTE}.</p>
      <div class="title-btns">
        ${this.run ? `<button class="primary big-btn" data-act="continue">Continue run · ante ${this.run.ante}</button>` : ''}
        <button class="${this.run ? '' : 'primary'} big-btn" data-act="new">New run</button>
        <button data-act="help">How to play</button>
        <button class="icon" data-act="mute" title="Sound on/off">${isMuted() ? '🔇' : '🔊'}</button>
      </div>
      <h3>Deck</h3>
      <div class="decks">${decks}</div>
      <div class="meta">
        <span>Runs <b>${m.runs}</b></span><span>Wins <b>${m.wins}</b></span><span>Best ante <b>${Math.min(m.bestAnte, WIN_ANTE)}</b></span>
        <span>Best hand <b>${fmt(m.bestHand)}</b></span><span>Best score <b>${fmt(m.bestScore)}</b></span>
        <span>Jokers <b>${open}/${JOKER_IDS.length}</b>${open < JOKER_IDS.length ? ` · next at ${nextAt} blinds (${m.blinds} beaten)` : ''}</span>
      </div>
    </div>`;
  }

  private jokerRow(): string {
    const r = this.run!;
    const dis = r.round?.disabled ?? -1;
    const slots: string[] = [];
    for (let i = 0; i < r.slots; i++) {
      const j = r.jokers[i];
      if (!j) {
        slots.push('<div class="joker empty"></div>');
        continue;
      }
      const d = JOKERS[j.id];
      slots.push(`<button class="joker r${d.rarity} ${j.ed ? `ed-${j.ed}` : ''} ${this.selJoker === i ? 'on' : ''} ${dis === i ? 'disabled-j' : ''}" data-act="joker" data-i="${i}" data-ji="${i}" title="${esc(`${d.name}: ${jokerText(j, this.cx())}`)}">
        <span class="j-icon">${d.icon}</span><span class="j-name">${d.name}</span></button>`);
    }
    const cons: string[] = [];
    for (let i = 0; i < r.consSlots; i++) {
      const c = r.cons[i];
      if (!c) {
        cons.push('<div class="cons empty"></div>');
        continue;
      }
      const d = c.kind === 'planet' ? PLANET[c.id] : TAROT[c.id];
      cons.push(`<button class="cons ${c.kind} ${this.selCons === i ? 'on' : ''}" data-act="cons" data-i="${i}" title="${esc(this.consText(c.kind, c.id))}"><span class="j-icon">${d.icon}</span><span class="j-name">${d.name}</span></button>`);
    }
    return `<div class="tray">
      <div class="jokers"><div class="tray-label">Jokers ${r.jokers.length}/${r.slots}</div><div class="slots">${slots.join('')}</div></div>
      <div class="conss"><div class="tray-label">Cards ${r.cons.length}/${r.consSlots}</div><div class="slots">${cons.join('')}</div></div>
    </div>${this.detailView()}`;
  }

  private consText(kind: string, id: string): string {
    if (kind === 'planet') {
      const p = PLANET[id];
      const lv = this.run?.levels[p.hand] ?? 1;
      const a = handValue(p.hand, lv);
      const b = handValue(p.hand, lv + 1);
      return `${p.name}: levels up ${p.hand} (lvl ${lv} → ${lv + 1}, ${a.chips}×${a.mult} → ${b.chips}×${b.mult})`;
    }
    const t = TAROT[id];
    return `${t.name}: ${t.text}`;
  }

  private detailView(): string {
    const r = this.run!;
    if (this.selJoker !== null && r.jokers[this.selJoker]) {
      const i = this.selJoker;
      const j = r.jokers[i];
      const d = JOKERS[j.id];
      return `<div class="detail">
        <div><b>${d.icon} ${d.name}</b> <small class="rar r${d.rarity}">${RARITY_NAME[d.rarity]}</small>${j.ed ? ` <small class="edn">${ED_INFO[j.ed].name} (${ED_INFO[j.ed].text})</small>` : ''}<br>${jokerText(j, this.cx())}</div>
        <div class="detail-btns">
          <button data-act="jmove" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Move left">◀</button>
          <button data-act="jmove" data-d="1" ${i === r.jokers.length - 1 ? 'disabled' : ''} title="Move right">▶</button>
          <button class="danger" data-act="jsell" ${this.busy ? 'disabled' : ''}>Sell $${sellValue(j)}</button>
        </div></div>`;
    }
    if (this.selCons !== null && r.cons[this.selCons]) {
      const c = r.cons[this.selCons];
      const err = consError(r, this.selCons, this.sel);
      return `<div class="detail">
        <div>${this.consText(c.kind, c.id)}${err ? `<br><small class="muted">${err}</small>` : ''}</div>
        <div class="detail-btns">
          <button class="primary" data-act="cuse" ${err || this.busy ? 'disabled' : ''}>Use</button>
          <button class="danger" data-act="csell" ${this.busy ? 'disabled' : ''}>Sell $1</button>
        </div></div>`;
    }
    return '';
  }

  private blindInfo(): string {
    const r = this.run!;
    const rd = r.round!;
    const boss = curBoss(r);
    const b = boss ? BOSS[boss] : null;
    const name = b ? `${b.icon} ${b.name}` : BLIND_NAMES[rd.blind];
    return `<div class="blind-box" ${b ? `style="--bc:${b.color}"` : ''}>
      <div class="bl-name">${name}</div>
      ${b ? `<div class="bl-rule">${b.text}${boss === 'mouth' && rd.mouthType ? ` (${rd.mouthType})` : ''}</div>` : ''}
      <div class="bl-target">Score at least <b>${fmt(rd.target)}</b></div>
      <div class="bl-reward">Reward ${'$'.repeat(BLIND_REWARD[rd.blind])}</div>
    </div>`;
  }

  private roundView(): string {
    const r = this.run!;
    const rd = r.round!;
    const boss = curBoss(r);
    let typeLine = '&nbsp;';
    let chips = this.shownChips;
    let mult = this.shownMult;
    if (!this.busy && this.sel.length) {
      const p = preview(r, this.sel);
      const base = handValue(p.type, p.level);
      typeLine = `${p.type} <small>lvl ${p.level}</small>`;
      chips = base.chips;
      mult = base.mult;
    }
    const n = rd.hand.length;
    const w = window.innerWidth;
    const avail = w <= 760 ? w - 20 : Math.min(w - 300, 900) - 40;
    const cw = Math.max(34, Math.min(84, Math.floor(avail / Math.max(n, 5)) - 5));
    const err = playError(r, this.sel);
    const hand = rd.hand
      .map((c, i) => cardHtml(c, { cls: `${this.sel.includes(c.id) ? 'sel' : ''} ${this.dealt.has(c.id) ? '' : 'new'}`, debuff: isDebuffed(c, boss), attrs: `data-act="card" data-id="${c.id}" data-hi="${i}" style="--d:${i}"` }))
      .join('');
    const played = rd.played.map((c, i) => cardHtml(c, { debuff: isDebuffed(c, boss), attrs: `data-pi="${i}" style="--d:${i}"` })).join('');
    return `<div class="table">
      <aside class="side">
        ${this.blindInfo()}
        <div class="round-score"><span>Round score</span><b id="rscore">${fmt(this.busy ? this.shownScore : rd.score)}</b></div>
        <div class="hand-panel" id="hpanel">
          <div class="htype" id="htype">${typeLine}</div>
          <div class="cm"><span class="chips" id="chips">${chips === null ? 0 : fmt(chips)}</span><span class="x">×</span><span class="mult" id="mult">${mult === null ? 0 : fmt(mult)}</span></div>
        </div>
        <div class="counts"><span>Hands <b class="hands">${rd.handsLeft}</b></span><span>Discards <b class="discs">${rd.discardsLeft}</b></span></div>
      </aside>
      <section class="board">
        ${this.jokerRow()}
        <div class="play-area" id="play">${played || '<span class="hint">Select up to 5 cards, then play or discard them.</span>'}</div>
        <div class="hand" style="--cw:${cw}px">${hand}</div>
        <div class="actions">
          <button class="primary play-btn" data-act="play" ${err || this.busy ? 'disabled' : ''} title="Play (Enter)">Play hand</button>
          <div class="sorts"><span>Sort</span><button data-act="sort" data-by="rank" class="${r.sortBy === 'rank' ? 'on' : ''}">Rank</button><button data-act="sort" data-by="suit" class="${r.sortBy === 'suit' ? 'on' : ''}">Suit</button></div>
          <button class="danger disc-btn" data-act="discard" ${!this.sel.length || this.sel.length > 5 || !rd.discardsLeft || this.busy ? 'disabled' : ''} title="Discard (D)">Discard</button>
          <span class="pile" title="Cards left in the draw pile">🂠 ${rd.draw.length}/${r.cards.length}</span>
        </div>
      </section>
    </div>`;
  }

  private blindView(): string {
    const r = this.run!;
    const cards = [0, 1, 2].map((b) => {
      const boss = b === 2 ? BOSS[r.boss] : null;
      const state = b < r.blind ? 'done' : b === r.blind ? 'now' : 'later';
      return `<div class="blind-card ${state}" ${boss ? `style="--bc:${boss.color}"` : ''}>
        <div class="bc-icon">${boss ? boss.icon : b === 0 ? '🔹' : '🔷'}</div>
        <div class="bc-name">${boss ? boss.name : BLIND_NAMES[b]}</div>
        ${boss ? `<div class="bc-rule">${boss.text}</div>` : '<div class="bc-rule muted">No special rule</div>'}
        <div class="bc-target">Score <b>${fmt(targetFor(r, b))}</b></div>
        <div class="bc-reward">${'$'.repeat(BLIND_REWARD[b])}</div>
        ${state === 'now' ? '<button class="primary" data-act="start">Play (Enter)</button>' : state === 'done' ? '<div class="stamp">Defeated</div>' : '<div class="muted">Upcoming</div>'}
      </div>`;
    });
    return `<div class="wrap">${this.jokerRow()}
      <h2 class="center">Ante ${r.ante}${r.endless ? ' · endless' : ''}</h2>
      <div class="blinds">${cards.join('')}</div>
      <p class="center muted small">Deck: ${DECK[r.deckId].icon} ${DECK[r.deckId].name} · seed ${r.seed}</p>
    </div>`;
  }

  private cashoutView(): string {
    const r = this.run!;
    const c = r.cash!;
    const rows = c.lines.map((l, i) => `<div class="cash-line" style="--d:${i}"><span>${l.text}</span><b>${l.$ ? `+$${l.$}` : ''}</b></div>`).join('');
    return `<div class="wrap">${this.jokerRow()}
      <div class="cashout">
        <h2>Blind defeated!</h2>
        <p class="muted">Round score <b>${fmt(r.round?.score ?? 0)}</b> of ${fmt(r.round?.target ?? 0)}</p>
        ${rows}
        <button class="primary big-btn" data-act="collect">Cash out $${c.total} (Enter)</button>
      </div></div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const s = r.shop!;
    const items = s.items
      .map((it, i) => {
        if (it.sold) return '<div class="shop-item sold">Sold</div>';
        let icon = '';
        let name = '';
        let text = '';
        let tag = '';
        if (it.kind === 'joker') {
          const d = JOKERS[it.id];
          icon = d.icon;
          name = d.name;
          text = jokerText({ uid: 0, id: it.id, v: d.v0 ?? 0 }, this.cx());
          tag = `<small class="rar r${d.rarity}">${RARITY_NAME[d.rarity]}</small>${it.ed ? ` <small class="edn">${ED_INFO[it.ed].name}: ${ED_INFO[it.ed].text}</small>` : ''}`;
        } else {
          const d = it.kind === 'planet' ? PLANET[it.id] : TAROT[it.id];
          icon = d.icon;
          name = d.name;
          text = this.consText(it.kind, it.id).replace(/^[^:]+: /, '');
          tag = `<small class="kind-${it.kind}">${it.kind === 'planet' ? 'Planet' : 'Tarot'}</small>`;
        }
        return `<div class="shop-item si-${it.kind} ${it.ed ? `ed-${it.ed}` : ''}">
          <div class="si-icon">${icon}</div><b>${name}</b>${tag}<p>${text}</p>
          <button class="primary" data-act="buy" data-i="${i}" ${it.price > r.money ? 'disabled' : ''}>Buy $${it.price}</button></div>`;
      })
      .join('');
    const packs = s.packs
      .map((p, i) => {
        if (p.sold) return '<div class="shop-item sold">Opened</div>';
        const info = PACK_INFO[p.kind];
        return `<div class="shop-item pack pack-${p.kind}"><div class="si-icon">${info.icon}</div><b>${info.name}</b><p>${info.text}</p>
          <button class="primary" data-act="pack" data-i="${i}" ${info.price > r.money ? 'disabled' : ''}>Open $${info.price}</button></div>`;
      })
      .join('');
    return `<div class="wrap">${this.jokerRow()}
      <div class="shop">
        <div class="shop-head"><h2>🛒 Shop</h2>
          <div class="shop-btns"><button data-act="reroll" ${s.reroll > r.money ? 'disabled' : ''} title="R">Reroll $${s.reroll}</button>
          <button class="primary" data-act="next" title="Enter">Next round ▶</button></div></div>
        <div class="shop-items">${items}${packs}</div>
        <p class="muted small center">Click a joker above to move or sell it. Jokers score from left to right.</p>
      </div></div>`;
  }

  private packView(): string {
    const r = this.run!;
    const p = r.pack!;
    const info = PACK_INFO[p.kind];
    const opt = (o: PackOpt, i: number): string => {
      const err = packError(r, i);
      let inner = '';
      if (o.kind === 'card' && o.card) inner = `${cardHtml(o.card)}<small>${cardTip(o.card).split('\n').slice(1).join('<br>')}</small>`;
      else if (o.kind === 'joker') {
        const d = JOKERS[o.id];
        inner = `<div class="si-icon">${d.icon}</div><b>${d.name}</b><small class="rar r${d.rarity}">${RARITY_NAME[d.rarity]}</small>${o.ed ? `<small class="edn">${ED_INFO[o.ed].name}</small>` : ''}<p>${jokerText({ uid: 0, id: o.id, v: d.v0 ?? 0 }, this.cx())}</p>`;
      } else {
        const d = o.kind === 'planet' ? PLANET[o.id] : TAROT[o.id];
        inner = `<div class="si-icon">${d.icon}</div><b>${d.name}</b><p>${this.consText(o.kind, o.id).replace(/^[^:]+: /, '')}</p>`;
      }
      return `<button class="pack-opt ${o.ed ? `ed-${o.ed}` : ''}" data-act="pick" data-i="${i}" ${err ? `disabled title="${err}"` : ''}>${inner}${err ? `<small class="muted">${err}</small>` : ''}</button>`;
    };
    return `<div class="modal"><div class="sheet wide">
      <h2>${info.icon} ${info.name}</h2><p class="muted">${info.text}</p>
      <div class="pack-opts">${p.opts.map(opt).join('')}</div>
      <button data-act="skip">Skip</button></div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    const unlocked = e.unlocked.map((id) => `${JOKERS[id].icon} ${JOKERS[id].name}`).join(', ');
    return `<div class="end">
      <h1 class="${e.won ? 'good' : 'bad'}">${e.won ? (e.endless ? '🏁 Run over' : '🏆 Victory!') : '💀 Game over'}</h1>
      <p>${e.won && !e.endless ? `You beat ante ${WIN_ANTE}. The table is yours.` : `Your run ended in ante ${e.ante}.`}</p>
      <div class="end-stats">
        <span>Blinds beaten <b>${e.blinds}</b></span>
        <span>Best hand <b>${fmt(e.best)}</b>${e.bestType ? ` <small>(${e.bestType})</small>` : ''}</span>
        <span>Score <b>${fmt(e.score)}</b></span>
      </div>
      ${unlocked ? `<p class="unlock">🔓 New jokers unlocked: ${unlocked}</p>` : ''}
      <div class="title-btns">
        ${e.won && !e.endless && this.run ? '<button class="primary" data-act="endless">Continue in endless mode</button>' : ''}
        <button class="${e.won && !e.endless ? '' : 'primary'}" data-act="new-from-end">New run</button>
        <button data-act="title">Title screen</button>
      </div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal:</b> each blind has a score target. Reach it before you run out of hands. Beat the boss blind of ante ${WIN_ANTE} to win.</li>
          <li><b>Play:</b> select 1 to 5 cards and press <b>Play hand</b>. The best poker hand in them scores. Only the cards that make the hand count (one card for High Card).</li>
          <li><b>Score = Chips × Mult.</b> The hand type gives base chips and mult. Each scored card adds its rank in chips (A = 11, faces = 10).</li>
          <li><b>Discard</b> up to 5 cards to draw new ones. Hands and discards are limited each round.</li>
          <li><b>Jokers</b> (up to 5) add chips, add mult or multiply mult. They act from left to right, so put ×Mult jokers on the right. Click a joker to move or sell it.</li>
          <li><b>Planets</b> level up a hand type. <b>Tarots</b> change cards in your hand: select the cards, click the tarot, press Use.</li>
          <li><b>Boss blinds</b> add a rule, for example debuffed suits (those cards do not score) or one hand only.</li>
          <li><b>Money:</b> blinds pay $3–$5, plus $1 per hand left and $1 interest per $5 you hold (max $5).</li>
          <li><b>Keys:</b> 1–9 select cards, Enter plays, D discards, S sorts, L hand levels, Esc menu.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'levels') {
      const r = this.run!;
      const rows = HAND_TYPES.map((t) => {
        const lv = r.levels[t];
        const v = handValue(t, lv);
        return `<tr class="${lv > 1 ? 'up' : ''}"><td>${t}</td><td>lvl ${lv}</td><td><span class="chips sm">${v.chips}</span> × <span class="mult sm">${v.mult}</span></td><td>${r.handPlays[t]}×</td></tr>`;
      }).join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Hand levels</h2>
        <table class="levels"><tr><th>Hand</th><th>Level</th><th>Chips × Mult</th><th>Played</th></tr>${rows}</table>
        <button class="primary" data-act="modal-close">Close</button></div></div>`;
    }
    if (m.kind === 'deck') {
      const r = this.run!;
      const rows = [0, 1, 2, 3]
        .map((s) => {
          const cs = r.cards.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
          return cs.length ? `<div class="deck-row">${cs.map((c) => cardHtml(c)).join('')}</div>` : '';
        })
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet wide" data-stop>
        <h2>Your deck (${r.cards.length} cards)</h2><div class="deck-view">${rows}</div>
        <button class="primary" data-act="modal-close">Close</button></div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Scoring animation ----------

  private float(el: Element | null, text: string, kind: string): void {
    if (!el || FAST) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = `float f-${kind}`;
    f.textContent = text;
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  private pulse(el: Element | null): void {
    if (!el) return;
    el.classList.remove('pulse');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('pulse');
  }

  private setCM(chips: number, mult: number): void {
    const c = this.root.querySelector('#chips');
    const m = this.root.querySelector('#mult');
    if (c && c.textContent !== fmt(chips)) {
      c.textContent = fmt(chips);
      this.pulse(c);
    }
    if (m && m.textContent !== fmt(mult)) {
      m.textContent = fmt(mult);
      this.pulse(m);
    }
  }

  private stepEl(s: Step): Element | null {
    if (s.src === 'card') return this.root.querySelector(`#play .card[data-pi="${s.i}"]`);
    if (s.src === 'held') return this.root.querySelector(`.hand .card[data-hi="${s.i}"]`);
    if (s.src === 'joker') return this.root.querySelector(`.joker[data-ji="${s.i}"]`);
    return this.root.querySelector('#hpanel');
  }

  private async animateScore(res: ScoreResult): Promise<void> {
    const play = this.root.querySelector('#play');
    res.scoring.forEach((i) => play?.querySelector(`.card[data-pi="${i}"]`)?.classList.add('scoring'));
    const ht = this.root.querySelector('#htype');
    if (ht) ht.innerHTML = `${res.type} <small>lvl ${res.level}</small>`;
    await wait(300);
    let n = 0;
    for (const s of res.steps) {
      const el = this.stepEl(s);
      this.pulse(el);
      if (s.src !== 'hand') this.float(el, s.text, s.kind);
      this.setCM(s.chips, s.mult);
      if (s.kind === 'c') sfx.chips(n);
      else if (s.kind === 'm') sfx.mult(n);
      else if (s.kind === 'x') sfx.xmult();
      else if (s.kind === '$') sfx.coin();
      else if (s.kind === 'bad') sfx.bad();
      n++;
      await wait(Math.max(110, 380 - n * 18));
    }
    if (res.blocked) this.toast(res.blocked);
    // Total: count the round score up.
    const panel = this.root.querySelector('#hpanel');
    if (panel && !FAST) {
      const t = document.createElement('div');
      t.className = 'hand-total';
      t.textContent = fmt(res.total);
      panel.appendChild(t);
    }
    sfx.total();
    await wait(450);
    const rs = this.root.querySelector('#rscore');
    const from = this.shownScore;
    const to = this.run!.round!.score;
    const steps = FAST ? 1 : 12;
    for (let k = 1; k <= steps; k++) {
      this.shownScore = Math.floor(from + ((to - from) * k) / steps);
      if (rs) rs.textContent = fmt(this.shownScore);
      await wait(30);
    }
    this.pulse(rs);
    if (res.broken.length) {
      sfx.glass();
      this.toast(`${res.broken.length} glass card${res.broken.length > 1 ? 's' : ''} shattered!`);
    }
    await wait(500);
  }

  private async playSelected(): Promise<void> {
    const r = this.run!;
    if (this.busy) return;
    const err = playError(r, this.sel);
    if (err) return this.deny(err);
    initAudio();
    this.busy = true;
    sfx.play();
    this.shownScore = r.round!.score;
    this.shownChips = 0;
    this.shownMult = 0;
    beginPlay(r, this.sel);
    this.sel = [];
    this.selCons = null;
    this.render();
    await wait(250);
    const res = scorePlayed(r);
    await this.animateScore(res);
    const st = finishPlay(r);
    this.shownChips = null;
    this.shownMult = null;
    this.busy = false;
    if (st === 'won') {
      endRound(r);
      sfx.win();
      this.goStage();
    } else if (st === 'lost') {
      sfx.lose();
      this.finish(false);
    } else {
      sfx.deal();
      saveRun(r);
      this.render();
    }
  }

  private finish(won: boolean): void {
    const r = this.run!;
    const unlocked = recordRun(this.meta, r, won);
    saveMeta(this.meta);
    this.end = { won, score: runScore(r, won), ante: r.ante, blinds: r.stats.blinds, best: r.stats.best, bestType: r.stats.bestType, unlocked, endless: r.endless };
    if (won && !r.endless) saveRun(r);
    else {
      clearRun();
      this.run = null;
    }
    this.modal = null;
    this.screen = 'end';
    this.render();
  }

  // ---------- Actions ----------

  private startRun(): void {
    this.run = newRun(randomSeedText(), this.deckPick, unlockedJokers(this.meta));
    this.end = null;
    this.modal = null;
    sfx.blind();
    this.goStage();
  }

  private doDiscard(): void {
    const r = this.run!;
    if (this.busy) return;
    const err = discard(r, this.sel);
    if (err) return this.deny(err);
    this.sel = [];
    this.selCons = null;
    sfx.deal();
    saveRun(r);
    this.render();
  }

  private useConsumable(i: number): void {
    const r = this.run!;
    if (this.busy) return;
    const res = useCons(r, i, this.sel);
    if (res.err) return this.deny(res.err);
    sfx.use();
    if (res.msg) this.toast(res.msg);
    this.selCons = null;
    this.sel = this.sel.filter((id) => r.round?.hand.some((c) => c.id === id));
    saveRun(r);
    this.render();
  }

  private toggleCard(id: number): void {
    if (this.busy || !this.run?.round) return;
    const k = this.sel.indexOf(id);
    if (k >= 0) {
      this.sel.splice(k, 1);
      sfx.deselect();
    } else {
      if (this.sel.length >= 5) return this.deny('Select at most 5 cards');
      this.sel.push(id);
      sfx.select();
    }
    this.render();
  }

  private apply(a: Action): void {
    const r = this.run!;
    switch (a.type) {
      case 'start':
        startRound(r);
        this.dealt.clear();
        this.shownScore = 0;
        sfx.blind();
        sfx.deal();
        this.goStage();
        break;
      case 'collect': {
        sfx.coin();
        const won = collect(r);
        if (won) {
          sfx.win();
          this.finish(true);
        } else this.goStage();
        break;
      }
      case 'buy': {
        const err = buyItem(r, a.i);
        if (err) return this.deny(err);
        sfx.buy();
        saveRun(r);
        this.render();
        break;
      }
      case 'pack': {
        const err = buyPack(r, a.i);
        if (err) return this.deny(err);
        sfx.buy();
        saveRun(r);
        this.render();
        break;
      }
      case 'pick': {
        const o = r.pack?.opts[a.i];
        const err = pickPack(r, a.i);
        if (err) return this.deny(err);
        sfx.use();
        if (o?.kind === 'planet') this.toast(`${PLANET[o.id].hand} is now level ${r.levels[PLANET[o.id].hand]}`);
        saveRun(r);
        this.render();
        break;
      }
      case 'skip':
        skipPack(r);
        saveRun(r);
        this.render();
        break;
      case 'sell':
        sellJoker(r, a.i);
        sfx.sell();
        this.selJoker = null;
        saveRun(r);
        this.render();
        break;
      case 'move':
        moveJoker(r, a.i, a.d);
        this.selJoker = a.i + a.d;
        saveRun(r);
        this.render();
        break;
      case 'reroll': {
        const err = reroll(r);
        if (err) return this.deny(err);
        sfx.deal();
        saveRun(r);
        this.render();
        break;
      }
      case 'next':
        nextBlind(r);
        this.goStage();
        break;
      case 'use':
        this.sel = a.sel;
        this.useConsumable(a.i);
        break;
      case 'play':
        this.sel = a.ids;
        void this.playSelected();
        break;
      case 'discard':
        this.sel = a.ids;
        this.doDiscard();
        break;
      case 'end':
        break;
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset.act!;
    if (act === 'modal-close' && target.closest('[data-stop]') && el.classList.contains('modal')) return;
    const i = Number(el.dataset.i ?? 0);
    const r = this.run;
    switch (act) {
      case 'new':
        this.startRun();
        break;
      case 'new-from-end':
        clearRun();
        this.startRun();
        break;
      case 'continue':
        this.goStage();
        break;
      case 'pick-deck':
        this.deckPick = el.dataset.deck!;
        sfx.select();
        this.render();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        break;
      case 'levels':
        this.modal = { kind: 'levels' };
        this.render();
        break;
      case 'deck':
        this.modal = { kind: 'deck' };
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
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
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        if (this.busy) return;
        this.modal = null;
        if (r) this.finish(false);
        break;
      case 'title':
        if (this.busy) return;
        this.modal = null;
        if (this.end?.won && r?.stage === 'won') {
          // A won run can not be continued from the title.
          clearRun();
          this.run = null;
        }
        this.screen = 'title';
        this.render();
        break;
      case 'endless':
        if (!r) return;
        continueEndless(r);
        this.end = null;
        this.goStage();
        break;
      case 'card':
        this.toggleCard(Number(el.dataset.id));
        break;
      case 'play':
        void this.playSelected();
        break;
      case 'discard':
        this.doDiscard();
        break;
      case 'sort':
        if (!r) return;
        setSort(r, el.dataset.by as 'rank' | 'suit');
        this.render();
        break;
      case 'joker':
        this.selJoker = this.selJoker === i ? null : i;
        this.selCons = null;
        sfx.select();
        this.render();
        break;
      case 'jmove':
        if (this.selJoker !== null) this.apply({ type: 'move', i: this.selJoker, d: Number(el.dataset.d) });
        break;
      case 'jsell':
        if (this.selJoker !== null && !this.busy) this.apply({ type: 'sell', i: this.selJoker });
        break;
      case 'cons':
        this.selCons = this.selCons === i ? null : i;
        this.selJoker = null;
        sfx.select();
        this.render();
        break;
      case 'cuse':
        if (this.selCons !== null) this.useConsumable(this.selCons);
        break;
      case 'csell':
        if (this.selCons !== null && r && !this.busy) {
          sellCons(r, this.selCons);
          sfx.sell();
          this.selCons = null;
          saveRun(r);
          this.render();
        }
        break;
      case 'start':
      case 'collect':
      case 'reroll':
      case 'next':
      case 'skip':
        this.apply({ type: act } as Action);
        break;
      case 'buy':
      case 'pack':
      case 'pick':
        this.apply({ type: act, i } as Action);
        break;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      else return;
      this.render();
      return;
    }
    if (this.modal) {
      if (k === 'enter') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (k === 'h' || k === '?') {
      this.modal = { kind: 'help' };
      this.render();
      return;
    }
    if (k === 'l' && this.run && this.screen !== 'title') {
      this.modal = { kind: 'levels' };
      this.render();
      return;
    }
    const r = this.run;
    switch (this.screen) {
      case 'title':
        if (k === 'enter') this.run ? this.goStage() : this.startRun();
        break;
      case 'blind':
        if (k === 'enter') this.apply({ type: 'start' });
        break;
      case 'cashout':
        if (k === 'enter') this.apply({ type: 'collect' });
        break;
      case 'shop':
        if (r?.stage === 'pack') {
          if (k === 'escape' || k === 's') this.apply({ type: 'skip' });
          else if (/^[1-3]$/.test(k)) this.apply({ type: 'pick', i: Number(k) - 1 });
          break;
        }
        if (k === 'enter' || k === 'n') this.apply({ type: 'next' });
        else if (k === 'r') this.apply({ type: 'reroll' });
        break;
      case 'round': {
        if (!r?.round || this.busy) return;
        if (/^[1-9]$/.test(k)) {
          const c = r.round.hand[Number(k) - 1];
          if (c) this.toggleCard(c.id);
        } else if (k === 'enter' || k === 'p') {
          e.preventDefault();
          void this.playSelected();
        } else if (k === 'd' || k === 'backspace') this.doDiscard();
        else if (k === 's') {
          setSort(r, r.sortBy === 'rank' ? 'suit' : 'rank');
          this.render();
        } else if (k === 'c') {
          this.sel = [];
          this.render();
        }
        break;
      }
      case 'end':
        if (k === 'enter') {
          this.screen = 'title';
          if (this.run?.stage === 'won') {
            clearRun();
            this.run = null;
          }
          this.render();
        }
        break;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        stage: this.run?.stage ?? null,
        busy: this.busy,
        modal: this.modal?.kind ?? null,
        ante: this.run?.ante,
        blind: this.run?.blind,
        boss: this.run?.boss,
        money: this.run?.money,
        score: this.run?.round?.score,
        target: this.run?.round?.target,
        hands: this.run?.round?.handsLeft,
        discards: this.run?.round?.discardsLeft,
        jokers: this.run?.jokers.map((j) => j.id),
        end: this.end,
      }),
      money: (n: number) => {
        if (this.run) this.run.money += n;
        this.render();
      },
      joker: (id: string) => {
        if (this.run && JOKERS[id] && this.run.jokers.length < this.run.slots) this.run.jokers.push({ uid: this.run.nextUid++, id, v: JOKERS[id].v0 ?? 0 } as JokerInst);
        this.render();
      },
      unlockAll: () => {
        this.meta.bestAnte = 9;
        this.meta.wins = Math.max(1, this.meta.wins);
        this.meta.blinds = Math.max(this.meta.blinds, LOCKED_JOKERS.length * BLINDS_PER_UNLOCK);
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action for automatic tests. */
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.screen === 'title') {
          if (this.run) this.goStage();
          else this.startRun();
          return 'start';
        }
        if (this.screen === 'end') return 'end';
        const r = this.run!;
        if (this.screen !== this.stageScreen()) {
          this.goStage();
          return 'sync';
        }
        const a = botAction(r, 'smart');
        if (a.type === 'play') {
          this.sel = a.ids;
          await this.playSelected();
          return 'play';
        }
        this.apply(a);
        return a.type;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
