import type { BEvent } from './battle';
import { botAction, botTurn } from './bot';
import {
  BUY_COST,
  CRITTERS,
  FOOD,
  FOOD_COST,
  PACKS,
  PERKS,
  REROLL_COST,
  TEAM_SIZE,
  TRIGGERS,
  WIN_TROPHIES,
  levelOf,
  lifeLoss,
  tierFor,
  type Unit,
} from './data';
import { Rng, hash, randomSeedText } from './rng';
import {
  apply,
  canMerge,
  clearRun,
  endTurnEffects,
  fightRound,
  isChampionRound,
  loadMeta,
  loadRun,
  newRun,
  rngFor,
  runOver,
  saveMeta,
  saveRun,
  score,
  starsFor,
  type Act,
  type ActResult,
  type Note,
  type RoundReport,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'shop' | 'battle' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };
type SelKind = 'shop' | 'food' | 'team';
interface Sel {
  kind: SelKind;
  i: number;
}

interface Drag {
  kind: SelKind;
  i: number;
  x0: number;
  y0: number;
  ghost: HTMLElement | null;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips battle animations, for bot tests. */
const FAST = PARAMS.has('fast');

const opponentBot = (o: RunState): void => botTurn(o, rngFor(o, 'bot', o.round), 'opp');

/** Replay time per event kind, in ms at speed 1. */
const DUR: Record<BEvent['k'], number> = {
  start: 500,
  ability: 380,
  attack: 520,
  hit: 260,
  buff: 240,
  perk: 280,
  faint: 380,
  summon: 380,
  end: 400,
};

function xpPips(xp: number): string {
  const lvl = levelOf(xp);
  if (lvl === 3) return '★★★';
  const have = lvl === 1 ? xp : xp - 2;
  const need = lvl === 1 ? 2 : 3;
  return '●'.repeat(have) + '○'.repeat(need - have);
}

function unitCard(u: Unit, extra = '', attrs = ''): string {
  const d = CRITTERS[u.id];
  const lvl = levelOf(u.xp);
  const perk = u.perk ? `<span class="perk" title="${PERKS[u.perk].text}">${PERKS[u.perk].icon}</span>` : '';
  return `<div class="card ${extra}" data-uid="${u.uid}" ${attrs} title="${d.name}">
    <span class="lvl">L${lvl}<i>${xpPips(u.xp)}</i></span>${perk}
    <span class="emo">${d.icon}</span>
    <span class="stats"><b class="a">${Math.max(0, u.atk)}</b><b class="h">${Math.max(0, u.hp)}</b></span>
  </div>`;
}

function abilityLine(id: string, xp: number): string {
  const d = CRITTERS[id];
  if (!d.trigger) return `<span class="dim">${d.text(1)}</span>`;
  const t = TRIGGERS[d.trigger];
  return `<span class="trig">${t.icon} ${t.label}:</span> ${d.text(levelOf(xp))}`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private sel: Sel | null = null;
  private drag: Drag | null = null;
  private dragEndAt = 0;
  private pendingNotes: Note[] = [];

  // Battle replay
  private report: RoundReport | null = null;
  private ei = 0;
  private timer = 0;
  private speed = 1;
  private replayDone = false;

  private end: { victory: boolean; score: number; stars: number; round: number; trophies: number; team: Unit[] } | null = null;
  private dbgN = 0;
  private pre: { trophies: number; lives: number; gold: number; round: number } | null = null;

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
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'battle':
        body = this.battleView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = (this.run && this.screen === 'shop') || (this.screen === 'battle' && this.pre) ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.showNotes();
  }

  private toast(msg: string): void {
    if (!msg) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private showNotes(): void {
    const notes = this.pendingNotes;
    this.pendingNotes = [];
    const seen = new Map<number, number>();
    for (const n of notes) {
      const el = this.root.querySelector<HTMLElement>(`.card[data-uid="${n.uid}"]`);
      if (!el) continue;
      const k = seen.get(n.uid) ?? 0;
      seen.set(n.uid, k + 1);
      const f = document.createElement('span');
      f.className = 'float';
      f.textContent = n.text;
      f.style.color = n.color ?? '#fff';
      f.style.animationDelay = `${k * 0.18}s`;
      el.appendChild(f);
      el.classList.add('pop');
    }
  }

  private topBar(): string {
    // During a replay the bar shows the values from before the battle.
    const r = this.screen === 'battle' && this.pre && (!this.replayDone || !this.run) ? this.pre : this.run!;
    return `<header class="top">
      <span title="Trophies">🏆 ${r.trophies}/${WIN_TROPHIES}</span>
      <span title="Lives">❤️ ${r.lives}</span>
      <span title="Gold" class="gold">💰 ${r.gold}</span>
      <span title="Round">Round ${r.round}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound (M)">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const packs = PACKS.map((p) => {
      const own = m.packs.includes(p.id);
      const icons = Object.values(CRITTERS)
        .filter((c) => c.pack === p.id && c.tier > 0)
        .map((c) => c.icon)
        .join('');
      return `<div class="pack ${own ? 'own' : ''}"><span class="big">${p.icon}</span><span><b>${p.name}</b><small>${p.text}</small><small class="icons">${icons}</small></span>
        ${own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${p.id}" ${m.stars >= p.cost ? '' : 'disabled'}>⭐ ${p.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🦊🐢🐝</div>
      <h1>Critter Clash</h1>
      <p class="sub">Buy critters, line them up, and watch them fight. Win ${WIN_TROPHIES} battles before your lives run out.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (round ${r.round}, 🏆 ${r.trophies}, ❤️ ${r.lives})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best 🏆 ${m.bestTrophies} · Best score ${m.best}</p>
      <h2>Critter packs <small>⭐ ${m.stars} stars</small></h2>
      <p class="sub">Each run gives stars: 1 per trophy, +5 for a win. Unlocked packs join the shop and the opponents.</p>
      <div class="packs">${packs}</div>
    </div>`;
  }

  private isSel(kind: SelKind, i: number): boolean {
    return !!this.sel && this.sel.kind === kind && this.sel.i === i;
  }

  private shopView(): string {
    const r = this.run!;
    const selU = this.sel?.kind === 'shop' ? r.shop[this.sel.i]?.u : undefined;
    const team: string[] = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const u = r.team[i];
      const front = i === 0 ? '<span class="front">FRONT</span>' : '';
      if (!u) {
        team.push(`<div class="slot empty" data-act="slot" data-drop="team" data-i="${i}">${front}<span class="plus">+</span></div>`);
        continue;
      }
      const hint = selU && canMerge(u, selU) ? 'merge' : '';
      team.push(
        `<div class="slot" data-drop="team" data-i="${i}">${front}${unitCard(u, `${this.isSel('team', i) ? 'sel' : ''} ${hint}`, `data-act="slot" data-drag="team" data-i="${i}"`)}</div>`,
      );
    }
    const shop = r.shop
      .map((s, i) => {
        if (!s) return `<div class="slot gone"></div>`;
        const d = CRITTERS[s.u.id];
        const can = r.gold >= BUY_COST;
        return `<div class="slot">${unitCard(s.u, `shopc ${this.isSel('shop', i) ? 'sel' : ''} ${s.frozen ? 'frozen' : ''} ${can ? '' : 'poor'} ${s.bonus ? 'bonus' : ''}`, `data-act="pick" data-kind="shop" data-drag="shop" data-i="${i}"`)}
          <span class="tier">T${d.tier}${i < 5 ? `<kbd>${i + 1}</kbd>` : ''}</span></div>`;
      })
      .join('');
    const foods = r.foods
      .map((s, i) => {
        if (!s) return `<div class="slot gone"></div>`;
        const f = FOOD[s.id];
        return `<div class="slot"><div class="card food ${this.isSel('food', i) ? 'sel' : ''} ${s.frozen ? 'frozen' : ''}" data-act="pick" data-kind="food" data-drag="food" data-i="${i}" title="${f.name}">
          <span class="emo">${f.icon}</span></div><span class="tier">💰${FOOD_COST}<kbd>${i + 6}</kbd></span></div>`;
      })
      .join('');
    const champ = isChampionRound(r);
    const warn = champ
      ? `<p class="warn">👑 Champion battle! Win it for the last trophy. The champion team had +1 gold each round.</p>`
      : `<p class="dim">A loss this round costs ❤️ ${lifeLoss(r.round)}. Shop tier ${tierFor(r.round)}.</p>`;
    return `<div class="shopv">
      <section class="teamsec">
        <h3>Your team <small>drag to reorder · the front fights first</small></h3>
        <div class="line team">${team.join('')}</div>
      </section>
      <section class="info">${this.infoView()}</section>
      <section class="actions">${this.actionsView()}</section>
      <section class="shopsec">
        <h3>Shop <small>critters 💰${BUY_COST} · food 💰${FOOD_COST}</small></h3>
        <div class="shoprow"><div class="line shop">${shop}</div><div class="line foods">${foods}</div></div>
      </section>
      <section class="bottom">
        <button data-act="reroll" ${r.gold >= REROLL_COST ? '' : 'disabled'} title="R">🎲 Reroll 💰${REROLL_COST}</button>
        <button class="primary" data-act="end-turn" title="Space">⚔️ End turn</button>
      </section>
      ${warn}
    </div>`;
  }

  private infoView(): string {
    const r = this.run!;
    const s = this.sel;
    if (!s) return '<p class="hint">Tap a shop critter, then a team slot to buy it. Buy a copy of a critter you own to merge it. Drag to move or sell.</p>';
    if (s.kind === 'food') {
      const f = FOOD[r.foods[s.i]!.id];
      return `<div class="det"><span class="big">${f.icon}</span><div><b>${f.name}</b> <small class="dim">tier ${f.tier}</small><p>${f.text}</p>
        <p class="hint">${f.target ? 'Tap a team critter to feed it.' : 'Press Feed to use it.'}</p></div></div>`;
    }
    const u = s.kind === 'shop' ? r.shop[s.i]!.u : r.team[s.i];
    const d = CRITTERS[u.id];
    const perk = u.perk ? `<p>${PERKS[u.perk].icon} ${PERKS[u.perk].text}</p>` : '';
    const lvl = levelOf(u.xp);
    const next = lvl === 3 ? 'max level' : lvl === 1 ? `${2 - u.xp} more cop${2 - u.xp === 1 ? 'y' : 'ies'} to level 2` : `${5 - u.xp} more to level 3`;
    const hint = s.kind === 'shop' ? 'Tap a team slot to buy it there, or a matching critter to merge.' : 'Tap another slot to move it there.';
    return `<div class="det"><span class="big">${d.icon}</span><div><b>${d.name}</b> <small class="dim">tier ${d.tier} · level ${lvl} (${next})</small>
      <p>⚔️ ${u.atk} attack · ❤️ ${u.hp} HP</p><p>${abilityLine(u.id, u.xp)}</p>${perk}<p class="hint">${hint}</p></div></div>`;
  }

  private actionsView(): string {
    const r = this.run!;
    const s = this.sel;
    if (!s) return `<button class="sellzone" data-drop="sell" disabled>💰 Sell (drop here)</button>`;
    if (s.kind === 'team') {
      const u = r.team[s.i];
      return `<button data-act="move" data-d="1" ${s.i < r.team.length - 1 ? '' : 'disabled'} title="←">◀ Back</button>
        <button data-act="move" data-d="-1" ${s.i > 0 ? '' : 'disabled'} title="→">Front ▶</button>
        <button class="sellzone" data-act="sell" data-drop="sell" title="S">💰 Sell +${levelOf(u.xp)}</button>`;
    }
    if (s.kind === 'food') {
      const f = FOOD[r.foods[s.i]!.id];
      const fr = r.foods[s.i]!.frozen;
      return `${f.target ? '' : `<button class="primary" data-act="feed" ${r.gold >= FOOD_COST ? '' : 'disabled'} title="B">Feed 💰${FOOD_COST}</button>`}
        <button data-act="freeze" title="F">${fr ? '🔥 Unfreeze' : '❄️ Freeze'}</button>`;
    }
    const sl = r.shop[s.i]!;
    return `<button class="primary" data-act="buy" ${r.gold >= BUY_COST ? '' : 'disabled'} title="B">Buy 💰${BUY_COST}</button>
      <button data-act="freeze" title="F">${sl.frozen ? '🔥 Unfreeze' : '❄️ Freeze'}</button>
      <button class="sellzone" data-drop="sell" disabled>💰 Sell</button>`;
  }

  private battleView(): string {
    const rep = this.report!;
    const ev = rep.result.events[Math.min(this.ei, rep.result.events.length - 1)];
    const done = this.replayDone;
    const out = rep.result.outcome;
    const res = done
      ? `<div class="result ${out}">
          <h2>${out === 'win' ? '🏆 Victory!' : out === 'loss' ? `💔 Defeat (−${rep.lost} ❤️)` : '🤝 Draw'}</h2>
          <p>${out === 'win' ? `Trophies ${this.run ? this.run.trophies : WIN_TROPHIES}/${WIN_TROPHIES}.` : out === 'draw' ? 'Nobody loses a life.' : `Lives left: ${this.run ? this.run.lives : 0}.`}</p>
          <button class="primary" data-act="continue-battle" title="Enter">Continue ▶</button></div>`
      : `<div class="bctl"><button data-act="speed" title="Space">⏩ Speed ×${this.speed}</button><button data-act="skip" title="Enter">⏭ Skip</button></div>`;
    return `<div class="battlev">
      <h2>Round ${rep.round} ${rep.champion ? '<span class="warn">👑 Champion</span>' : ''}</h2>
      <div class="arena" id="arena">${this.arenaHtml(ev)}</div>
      <p class="blog" id="blog">${this.eventText(ev)}</p>
      <div id="bres">${res}</div>
    </div>`;
  }

  private arenaHtml(ev: BEvent): string {
    const cls = (u: Unit, side: 0 | 1): string => {
      const c: string[] = [];
      if (ev.uid === u.uid) {
        if (ev.k === 'attack') c.push(side === 0 ? 'lunge-p' : 'lunge-e');
        if (ev.k === 'hit') c.push('shake');
        if (ev.k === 'faint') c.push('faint');
        if (ev.k === 'summon') c.push('spawn');
        if (ev.k === 'ability') c.push('glow');
        if (ev.k === 'buff' || ev.k === 'perk') c.push('pop');
      }
      if (ev.k === 'attack' && ev.to === u.uid) c.push(side === 0 ? 'lunge-p' : 'lunge-e');
      return c.join(' ');
    };
    const float = (u: Unit): string => {
      if (ev.uid !== u.uid) return '';
      if (ev.k === 'hit') return `<span class="float dmg">−${ev.n}</span>`;
      if (ev.k === 'buff') return `<span class="float buf">${ev.n! >= 0 ? '+' : ''}${ev.n}/${ev.h! >= 0 ? '+' : ''}${ev.h}</span>`;
      if (ev.k === 'ability') {
        const t = CRITTERS[u.id].trigger;
        return `<span class="float abl">${t && ev.text === t ? TRIGGERS[t].icon : (ev.text ?? '').split(' ')[0]}</span>`;
      }
      if (ev.k === 'perk' && ev.text && PERKS[ev.text as keyof typeof PERKS]) return `<span class="float buf">${PERKS[ev.text as keyof typeof PERKS].icon}</span>`;
      return '';
    };
    const line = (us: Unit[], side: 0 | 1): string => {
      const cells = us.map((u) => `<div class="slot">${unitCard(u, cls(u, side)).replace('</div>', `${float(u)}</div>`)}</div>`);
      return `<div class="line bl ${side === 0 ? 'p' : 'e'}">${cells.join('')}</div>`;
    };
    return `${line(ev.snap[0], 0)}<span class="vs">⚔️</span>${line(ev.snap[1], 1)}`;
  }

  private eventText(ev: BEvent): string {
    const find = (uid?: number): Unit | undefined => [...ev.snap[0], ...ev.snap[1]].find((u) => u.uid === uid);
    const name = (uid?: number): string => {
      const u = find(uid);
      if (!u) return '';
      const mine = ev.snap[0].includes(u);
      return `${CRITTERS[u.id].icon} ${mine ? 'Your' : 'Enemy'} ${CRITTERS[u.id].name}`;
    };
    switch (ev.k) {
      case 'start':
        return 'The battle begins.';
      case 'ability': {
        const u = find(ev.uid);
        if (!u) return '';
        const t = CRITTERS[u.id].trigger;
        if (t && ev.text === t) return `${name(ev.uid)}: ${TRIGGERS[t].icon} ${CRITTERS[u.id].text(levelOf(u.xp))}`;
        return `${name(ev.uid)}: ${ev.text}`;
      }
      case 'attack':
        return `${name(ev.uid)} and ${name(ev.to)} clash.`;
      case 'hit':
        return `${name(ev.uid)} takes ${ev.n} damage.`;
      case 'buff':
        return `${name(ev.uid)} ${ev.n! >= 0 ? '+' : ''}${ev.n}/${ev.h! >= 0 ? '+' : ''}${ev.h}.`;
      case 'perk':
        return ev.text === '🍉 blocked' ? `${name(ev.uid)}: the Melon blocks damage.` : `${name(ev.uid)} gets ${PERKS[ev.text as keyof typeof PERKS]?.icon ?? ''}.`;
      case 'faint':
        return `${name(ev.uid)} faints.`;
      case 'summon':
        return `${name(ev.uid)} joins the fight.`;
      case 'end':
        return ev.text === 'win' ? 'Your team wins!' : ev.text === 'loss' ? 'Your team is out.' : 'Both teams are out. Draw.';
    }
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Champions!' : '💀 Out of lives'}</h1>
      <p>${e.victory ? `Your critters won ${WIN_TROPHIES} trophies in ${e.round} rounds.` : `Your run ended in round ${e.round} with ${e.trophies} trophies.`}</p>
      <div class="line team endteam">${e.team.map((u) => unitCard(u)).join('')}</div>
      <p class="score">Score <b>${e.score}</b></p>
      <p>⭐ +${e.stars} stars for critter packs</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const trig = Object.values(TRIGGERS)
        .map((t) => `<li>${t.icon} <b>${t.label}</b></li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Shop.</b> Each round you get 💰 10 gold. A critter costs 3, food costs 3, a reroll costs 1. Gold does not carry over.</li>
          <li><b>Buy.</b> Tap a shop critter, then a team slot. Or drag it there. You have 5 slots. The slot on the right is the front.</li>
          <li><b>Merge.</b> Buy or drag a copy onto a critter with the same name. It gets +1/+1. 3 copies make level 2, 6 copies make level 3. A level up adds a higher-tier critter to the shop.</li>
          <li><b>Sell</b> a critter for 1 gold per level. <b>Freeze</b> ❄️ a shop slot to keep it for the next round.</li>
          <li><b>Battle.</b> End the turn to fight a team that had the same gold. The two front critters hit each other at the same time until one team is out.</li>
          <li><b>Win</b> a battle: +1 🏆. <b>Lose</b>: −1 ❤️ in rounds 1–4, −2 in rounds 5–8, −3 after. A draw costs nothing. Win ${WIN_TROPHIES} trophies to win the run. The last one is against a champion team.</li>
          <li><b>Tiers.</b> Higher tiers join the shop every 2 rounds (tier 6 from round 11).</li>
        </ul>
        <h3>Ability triggers</h3>
        <ul class="trigs">${trig}</ul>
        <p class="dim">Triggers in a battle run one at a time: the highest attack first, then your team, then the front first.</p>
        <h3>Keys</h3>
        <p class="dim">1–5 shop critters · 6–7 food · Shift+1–5 team slots · B buy/feed · S sell · F freeze · R reroll · ← → move · Space end turn / speed · Enter skip / continue · M mute · Esc menu</p>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop>
      <h2>Menu</h2>
      <button class="primary" data-act="modal-close">▶ Resume</button>
      <button data-act="help">How to play</button>
      <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
      ${m.confirm ? `<p class="warn">Abandon this run? It counts as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>` : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen</button>
    </div></div>`;
  }

  // ---------- Game flow ----------

  private startRun(): void {
    if (this.run) this.recordEnd(false, true);
    this.run = newRun(randomSeedText(), this.meta.packs);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.sel = null;
    this.screen = 'shop';
    this.render();
  }

  /** Update meta for a finished or abandoned run. */
  private recordEnd(victory: boolean, abandoned = false): void {
    const r = this.run!;
    const sc = score(r, victory);
    const stars = abandoned ? 0 : starsFor(r, victory);
    this.meta.stars += stars;
    if (victory) this.meta.wins++;
    this.meta.bestTrophies = Math.max(this.meta.bestTrophies, r.trophies);
    this.meta.best = Math.max(this.meta.best, sc);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory, score: sc, stars, round: r.round - 1, trophies: r.trophies, team: r.team.map((u) => ({ ...u })) };
    this.run = null;
  }

  private doAct(a: Act): ActResult {
    const r = this.run!;
    const res = apply(r, a);
    if (!res.ok) {
      if (res.msg) {
        this.toast(res.msg);
        sfx.deny();
      }
      return res;
    }
    if (a.k === 'buy') sfx.buy();
    else if (a.k === 'food') sfx.eat();
    else if (a.k === 'sell') sfx.sell();
    else if (a.k === 'reroll') sfx.roll();
    else if (a.k === 'freeze') sfx.freeze();
    else sfx.move();
    if (res.levelUp) {
      sfx.level();
      this.toast('Level up! A higher-tier critter joins the shop.');
    } else if (res.notes.some((n) => n.text.endsWith('!'))) sfx.ability();
    this.pendingNotes.push(...res.notes);
    if (a.k !== 'freeze') this.sel = null;
    if (a.k === 'move' && r.team[a.to] && !res.notes.length) this.sel = { kind: 'team', i: Math.min(a.to, r.team.length - 1) };
    saveRun(r);
    this.render();
    return res;
  }

  private endTurn(): void {
    const r = this.run!;
    if (r.team.length === 0) {
      this.toast('Buy at least one critter first.');
      sfx.deny();
      return;
    }
    endTurnEffects(r);
    this.pre = { trophies: r.trophies, lives: r.lives, gold: r.gold, round: r.round };
    this.report = fightRound(r, opponentBot);
    const over = runOver(r);
    if (over) this.recordEnd(over === 'win');
    else saveRun(r);
    this.sel = null;
    this.screen = 'battle';
    this.ei = 0;
    this.replayDone = false;
    window.clearTimeout(this.timer);
    if (FAST) this.finishReplay(false);
    else {
      this.render();
      this.timer = window.setTimeout(() => this.tick(), DUR.start);
    }
  }

  private tick(): void {
    const evs = this.report!.result.events;
    this.ei++;
    if (this.ei >= evs.length - 1) return this.finishReplay(true);
    const ev = evs[this.ei];
    this.playSound(ev);
    const arena = this.root.querySelector<HTMLElement>('#arena');
    const blog = this.root.querySelector<HTMLElement>('#blog');
    if (arena) arena.innerHTML = this.arenaHtml(ev);
    if (blog) blog.innerHTML = this.eventText(ev);
    this.timer = window.setTimeout(() => this.tick(), DUR[ev.k] / this.speed);
  }

  private playSound(ev: BEvent): void {
    if (ev.k === 'attack') sfx.attack();
    else if (ev.k === 'hit') sfx.hit();
    else if (ev.k === 'faint') sfx.faint();
    else if (ev.k === 'summon') sfx.summon();
    else if (ev.k === 'ability') sfx.ability();
    else if (ev.k === 'buff' || ev.k === 'perk') sfx.buff();
  }

  private finishReplay(sound: boolean): void {
    window.clearTimeout(this.timer);
    const evs = this.report!.result.events;
    this.ei = evs.length - 1;
    this.replayDone = true;
    if (sound) {
      const o = this.report!.result.outcome;
      if (o === 'win') sfx.win();
      else if (o === 'loss') sfx.lose();
      else sfx.draw();
    }
    this.render();
  }

  private afterBattle(): void {
    window.clearTimeout(this.timer);
    this.report = null;
    this.screen = this.run ? 'shop' : 'end';
    this.render();
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    if (Date.now() - this.dragEndAt < 250) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  /** Click on a team slot `i` with the current selection. */
  private slotTap(i: number): void {
    const r = this.run!;
    const s = this.sel;
    if (s?.kind === 'shop') {
      this.doAct({ k: 'buy', i: s.i, to: i });
      return;
    }
    if (s?.kind === 'food') {
      if (r.team[i]) this.doAct({ k: 'food', i: s.i, to: i });
      return;
    }
    if (s?.kind === 'team') {
      if (s.i === i) this.sel = null;
      else if (r.team[i] || i >= r.team.length) {
        this.doAct({ k: 'move', from: s.i, to: Math.min(i, r.team.length - 1) });
        return;
      }
      this.render();
      return;
    }
    if (r.team[i]) {
      this.sel = { kind: 'team', i };
      sfx.pick();
    }
    this.render();
  }

  private pick(kind: SelKind, i: number): void {
    if (this.isSel(kind, i)) this.sel = null;
    else {
      this.sel = { kind, i };
      sfx.pick();
    }
    this.render();
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'mute':
        toggleMute();
        this.render();
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
        if (r) this.recordEnd(false, true);
        this.modal = null;
        window.clearTimeout(this.timer);
        this.screen = 'title';
        this.render();
        return;
      case 'title':
        this.modal = null;
        window.clearTimeout(this.timer);
        if (this.screen === 'battle' && this.report) this.report = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.startRun();
        return;
      case 'continue':
        if (!r) return;
        this.screen = 'shop';
        this.render();
        return;
      case 'unlock': {
        const p = PACKS.find((x) => x.id === d.id);
        if (!p || this.meta.stars < p.cost || this.meta.packs.includes(p.id)) return;
        this.meta.stars -= p.cost;
        this.meta.packs.push(p.id);
        saveMeta(this.meta);
        sfx.level();
        this.toast(`${p.icon} ${p.name} unlocked! It joins your next run.`);
        this.render();
        return;
      }
    }
    if (this.screen === 'battle') {
      if (act === 'speed') {
        this.speed = this.speed >= 4 ? 1 : this.speed * 2;
        const b = this.root.querySelector<HTMLElement>('[data-act="speed"]');
        if (b) b.textContent = `⏩ Speed ×${this.speed}`;
      } else if (act === 'skip') this.finishReplay(true);
      else if (act === 'continue-battle') this.afterBattle();
      return;
    }
    if (this.screen !== 'shop' || !r) return;
    const s = this.sel;
    switch (act) {
      case 'pick':
        this.pick(d.kind as SelKind, Number(d.i));
        return;
      case 'slot':
        this.slotTap(Number(d.i));
        return;
      case 'buy':
        if (s?.kind === 'shop') this.doAct({ k: 'buy', i: s.i });
        return;
      case 'feed':
        if (s?.kind === 'food') this.doAct({ k: 'food', i: s.i });
        return;
      case 'freeze':
        if (s && s.kind !== 'team') this.doAct({ k: 'freeze', food: s.kind === 'food', i: s.i });
        return;
      case 'sell':
        if (s?.kind === 'team') this.doAct({ k: 'sell', i: s.i });
        return;
      case 'move': {
        if (s?.kind !== 'team') return;
        const to = s.i + Number(d.d);
        if (to < 0 || to >= r.team.length) return;
        // Moving onto a neighbor swaps them (or merges a copy).
        const res = this.doAct({ k: 'move', from: s.i, to });
        if (res.ok && r.team[to]?.uid !== undefined && !res.levelUp) this.sel = { kind: 'team', i: to };
        this.render();
        return;
      }
      case 'reroll':
        this.doAct({ k: 'reroll' });
        return;
      case 'end-turn':
        this.endTurn();
        return;
    }
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'shop' || this.modal) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!el) return;
    this.drag = { kind: el.dataset.drag as SelKind, i: Number(el.dataset.i), x0: e.clientX, y0: e.clientY, ghost: null };
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      const src = this.root.querySelector<HTMLElement>(`[data-drag="${d.kind}"][data-i="${d.i}"]`);
      if (!src) return;
      d.ghost = src.cloneNode(true) as HTMLElement;
      d.ghost.classList.add('ghost');
      document.body.appendChild(d.ghost);
      document.body.classList.add('dragging');
      this.sel = { kind: d.kind, i: d.i };
      src.classList.add('lifted');
      // Show where a drop would go without a full render (it would drop the pointer capture).
      const sellBtn = this.root.querySelector<HTMLButtonElement>('.sellzone');
      if (sellBtn && d.kind === 'team') sellBtn.disabled = false;
    }
    d.ghost.style.left = `${e.clientX}px`;
    d.ghost.style.top = `${e.clientY}px`;
    for (const el of this.root.querySelectorAll('.drop-hover')) el.classList.remove('drop-hover');
    const over = this.dropAt(e.clientX, e.clientY);
    over?.classList.add('drop-hover');
  }

  private dropAt(x: number, y: number): HTMLElement | null {
    const d = this.drag;
    if (d?.ghost) d.ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (d?.ghost) d.ghost.style.display = '';
    return el?.closest<HTMLElement>('[data-drop]') ?? null;
  }

  private cancelDrag(): void {
    if (this.drag?.ghost) this.drag.ghost.remove();
    document.body.classList.remove('dragging');
    this.drag = null;
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      this.drag = null;
      return;
    }
    const target = this.dropAt(e.clientX, e.clientY);
    this.cancelDrag();
    this.dragEndAt = Date.now();
    const r = this.run!;
    if (!target) {
      this.render();
      return;
    }
    const kind = target.dataset.drop;
    const i = Number(target.dataset.i);
    if (kind === 'sell' && d.kind === 'team') this.doAct({ k: 'sell', i: d.i });
    else if (kind === 'team') {
      if (d.kind === 'shop') this.doAct({ k: 'buy', i: d.i, to: i });
      else if (d.kind === 'food') {
        const f = FOOD[r.foods[d.i]!.id];
        if (f.target && !r.team[i]) this.render();
        else this.doAct({ k: 'food', i: d.i, to: f.target ? i : undefined });
      } else if (d.kind === 'team') this.doAct({ k: 'move', from: d.i, to: Math.min(i, r.team.length - 1) });
    } else this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    initAudio();
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.modal) this.modal = null;
      else if (this.sel) this.sel = null;
      else if (this.run && (this.screen === 'shop' || this.screen === 'battle')) this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (k === 'm') return this.action('mute', {});
    if (k === 'h' || k === '?') return this.action(this.modal?.kind === 'help' ? 'modal-close' : 'help', {});
    if (this.modal) return;
    if (this.screen === 'title' && k === 'enter') return this.action(this.run ? 'continue' : 'new', {});
    if (this.screen === 'battle') {
      if (k === ' ') {
        e.preventDefault();
        if (this.replayDone) this.afterBattle();
        else this.action('speed', {});
      } else if (k === 'enter') this.action(this.replayDone ? 'continue-battle' : 'skip', {});
      return;
    }
    if (this.screen === 'end' && k === 'enter') return this.action('title', {});
    if (this.screen !== 'shop' || !this.run) return;
    const r = this.run;
    const digit = /^Digit([1-7])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]) - 1;
      if (e.shiftKey) {
        if (n < TEAM_SIZE) this.slotTap(n);
      } else if (n < 5 && r.shop[n]) this.pick('shop', n);
      else if (n >= 5 && r.foods[n - 5]) this.pick('food', n - 5);
      return;
    }
    if (k === 'b' || k === 'enter') return this.action(this.sel?.kind === 'food' ? 'feed' : 'buy', {});
    if (k === 's') return this.action('sell', {});
    if (k === 'f') return this.action('freeze', {});
    if (k === 'r') return this.action('reroll', {});
    if (k === 'arrowleft') return this.action('move', { d: '1' });
    if (k === 'arrowright') return this.action('move', { d: '-1' });
    if (k === ' ') {
      e.preventDefault();
      this.endTurn();
    }
  }

  // ---------- Debug API ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        round: this.run?.round ?? this.end?.round,
        gold: this.run?.gold,
        lives: this.run?.lives,
        trophies: this.run?.trophies ?? this.end?.trophies,
        team: this.run?.team.map((u) => `${u.id} ${u.atk}/${u.hp} L${levelOf(u.xp)}${u.perk ? ' ' + u.perk : ''}`) ?? null,
        shop: this.run?.shop.map((s) => (s ? s.u.id : null)) ?? null,
        battle: this.report ? { outcome: this.report.result.outcome, events: this.report.result.events.length, done: this.replayDone } : null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      stars: (n: number) => {
        this.meta.stars += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action for automatic tests. */
      step: (): string => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            this.startRun();
            return 'new';
          case 'shop': {
            const r = this.run!;
            const a = botAction(r, new Rng(hash(r.seed, 'dbg', r.round, this.dbgN++)), 'good');
            if (!a) {
              this.endTurn();
              return 'end-turn';
            }
            const res = this.doAct(a);
            if (!res.ok) {
              this.endTurn();
              return 'end-turn';
            }
            return a.k;
          }
          case 'battle':
            if (!this.replayDone) return 'busy';
            this.afterBattle();
            return 'continue';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
