import { botAct, botClaim, botRelic, botReward } from './bot';
import { ACTIONS, DUELS_PER_HALL, ENEMIES, HALLS, MOVES, READERS, RELICS, actName, counterOf, preyOf } from './data';
import {
  announce,
  currentView,
  edef,
  enemyDmg,
  enemyEV,
  enemyHonesty,
  readerName,
  readerOf,
  repTrust,
  resolve,
  softmax,
  tellAcc,
  TUNE,
  useBall,
  useLethe,
  type Duel,
  type RoundLog,
  type View,
} from './duel';
import { Rng, randomSeedText } from './rng';
import {
  LOCKED,
  advance,
  applyOffer,
  clearRun,
  foeAt,
  isChampion,
  loadMeta,
  loadRun,
  newRun,
  nextFoe,
  noteRound,
  saveMeta,
  saveRun,
  score,
  shardsFor,
  startDuel,
  unlockCost,
  winDuel,
  type Offer,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'duel' | 'reward' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface EndInfo {
  victory: boolean;
  score: number;
  shards: number;
  hall: number;
  foe: string | null;
  rounds: number;
  bluffWins: number;
  truthWins: number;
  honesty: number;
}

const params = new URLSearchParams(location.search);
/** `?debug&fast` skips the reveal waits, for bot tests. */
const FAST = params.has('fast');
const REVEAL_MS = 950;

const pct = (x: number): string => `${Math.round(x * 100)}%`;

function bar(hp: number, max: number, cls = ''): string {
  const w = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<div class="hp ${cls}"><div class="hp-fill" style="width:${w}%"></div><span>${Math.max(0, hp)} / ${max}</span></div>`;
}

const cycleHtml = (): string =>
  `<span class="cycle">${[0, 1, 2, 3, 0].map((a) => `<span title="${ACTIONS[a].name}">${ACTIONS[a].icon}</span>`).join('<i>›</i>')}</span>`;

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private busy = false;
  private reveal: RoundLog | null = null;
  private end: EndInfo | null = null;
  private botRng = new Rng(Date.now() & 0xffff);

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (params.has('debug')) this.installDebug();
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
      case 'duel':
        body = this.duelView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private float(where: 'foe' | 'you', text: string, cls: string): void {
    const layer = this.root.querySelector<HTMLElement>(`#fl-${where}`);
    if (!layer) return;
    const el = document.createElement('span');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${35 + Math.random() * 30}%`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  private shake(sel: string): void {
    const el = this.root.querySelector<HTMLElement>(sel);
    if (!el) return;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  private topBar(): string {
    const r = this.run!;
    const p = r.player;
    const relics = p.relics.map((id) => `<span class="relic" title="${RELICS[id].name}: ${RELICS[id].text}">${RELICS[id].icon}</span>`).join('');
    const hall = HALLS[Math.min(r.hall, HALLS.length - 1)];
    const step = isChampion(r) ? '👑' : `${r.idx + 1}/${DUELS_PER_HALL}`;
    return `<header class="top">
      <span class="hpchip">❤️ ${p.hp}/${p.maxHp}</span>
      <span>${hall.icon} Hall ${r.hall + 1} · ${step}</span>
      <span class="relics">${relics}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play" aria-label="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const unlocks = LOCKED.map((id) => {
      const mv = MOVES[id];
      const rl = RELICS[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      const icon = mv ? ACTIONS[mv.slot].icon : rl.icon;
      const kind = mv ? `${ACTIONS[mv.slot].name} move` : 'Relic';
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${icon}</span><span><b>${mv ? mv.name : rl.name}</b><small>${kind}: ${mv ? `${mv.win} dmg. ${mv.text}` : rl.text}</small></span>
        ${own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${id}" ${m.shards >= cost ? '' : 'disabled'}>💎 ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🎭</div>
      <h1>Poker Face</h1>
      <p class="sub">Announce your move. Lie if you dare. The enemy remembers.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (hall ${r.hall + 1}, ❤️ ${r.player.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best hall ${m.bestHall} · Best score ${m.best} · Bluffs landed ${m.bluffWins}</p>
      <h2>Unlocks <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock moves and relics for later runs.</p>
      <div class="armory">${unlocks}</div>
    </div>`;
  }

  private foeCard(id: string, hall: number, idx: number): string {
    const e = ENEMIES[id];
    const rs = e.readers.map((r) => readerName(r)).join(' → ');
    return `<div class="foe-prev">
      <span class="big">${e.icon}</span>
      <div><b>${e.name}</b> ${e.champion ? '<span class="tag champ">Champion</span>' : ''}<br><span class="tag reader">${rs}</span>
      <small>${e.text}</small>
      <small>${e.readers.map((r) => `${READERS[r].icon} ${READERS[r].tip}`).join('<br>')}</small>
      <small>HP ${e.hp} · tell: ${e.lie.face} ${e.lie.text} · ${hall + 1}-${idx + 1}</small></div>
    </div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const p = r.player;
    const hall = HALLS[r.hall];
    const ladder = HALLS.map((h, hi) => {
      const nodes = Array.from({ length: DUELS_PER_HALL + 1 }, (_, i) => {
        const id = foeAt(r, hi, i);
        const done = hi < r.hall || (hi === r.hall && i < r.idx);
        const now = hi === r.hall && i === r.idx;
        const known = hi <= r.hall;
        return `<span class="node ${done ? 'done' : ''} ${now ? 'now' : ''}" title="${known ? ENEMIES[id].name : '?'}">${known ? ENEMIES[id].icon : '❔'}</span>`;
      }).join('<span class="link"></span>');
      return `<div class="hall-row ${hi === r.hall ? 'cur' : ''}"><span class="hname">${h.icon} ${h.name}</span><div class="track">${nodes}</div></div>`;
    }).join('');
    const n = p.rec.h + p.rec.l;
    const rep = n
      ? `Your record: <b>${p.rec.h}</b> true claims, <b>${p.rec.l}</b> lies (${pct(p.rec.h / n)} true). ${p.relics.includes('mask') ? '🎭 Your mask hides it from new foes.' : n >= 3 ? `New foes start at about ${pct(repTrust(p))} trust from your record, mixed with their own nature.` : ''}`
      : 'You have no record yet. Every claim you make spreads to the next foes.';
    return `<div class="map">
      <h2>${hall.icon} Hall ${r.hall + 1}: ${hall.name}</h2>
      <div class="ladder">${ladder}</div>
      <h3>Next duel</h3>
      ${this.foeCard(nextFoe(r), r.hall, r.idx)}
      <p class="rep">${rep}</p>
      <button class="primary big-btn" data-act="duel">⚔️ Start the duel</button>
      <h3>Your moves</h3>${this.movesHtml()}
      ${p.relics.length ? `<h3>Relics</h3><div class="chips">${p.relics.map((id) => `<span class="chip" title="${RELICS[id].text}">${RELICS[id].icon} ${RELICS[id].name}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  private movesHtml(): string {
    const p = this.run!.player;
    return `<div class="moves">${p.moves
      .map((id, s) => {
        const m = MOVES[id];
        return `<div class="move a${s}"><span class="big">${ACTIONS[s].icon}</span><span><b>${ACTIONS[s].name}: ${m.name}</b><small>${m.win} dmg · beats ${actName(preyOf(s))}. ${m.text}</small></span></div>`;
      })
      .join('')}</div>`;
  }

  // ---------- Duel ----------

  private duelView(): string {
    const r = this.run!;
    const d = r.duel!;
    const v = currentView(d, r.player, d.phase === 'act' ? d.claim : null);
    return `<div class="duel">
      <div class="col-a">
        ${this.foeView(d)}
        ${this.youView()}
        ${this.lastView()}
      </div>
      <div class="col-b">
        ${this.readView(d, v)}
        ${this.historyView(d)}
      </div>
      ${this.controlsView(d)}
    </div>`;
  }

  private foeView(d: Duel): string {
    const def = edef(d);
    const plan = d.phase === 'act' ? d.plan : null;
    const face = plan ? (plan.tell === 'calm' ? def.calm.face : def.lie.face) : def.icon;
    let speech = '<span class="dim">Waiting for your claim…</span>';
    if (plan) {
      speech = `Claims <b class="claim a${plan.claim}">${actName(plan.claim)}</b><span class="tell ${plan.tell}">${plan.tell === 'calm' ? def.calm.face : def.lie.face} ${plan.tell === 'calm' ? def.calm.text : def.lie.text}</span>`;
      if (d.peek) speech += `<span class="peek">🔮 It will really play <b>${actName(plan.act)}</b></span>`;
    }
    const dmg = enemyDmg(d);
    const style = def.smart >= 0.5 ? 'When it bluffs, it often claims the opposite of its real pick.' : 'When it bluffs, it claims a random other action.';
    return `<section class="card foe">
      <div class="portrait ${plan ? `t-${plan.tell}` : ''}" id="foe-port"><span class="face">${face}</span><div class="fl" id="fl-foe"></div></div>
      <div class="foe-main">
        <div class="name"><b>${def.name}</b> ${def.champion ? '<span class="tag champ">Champion</span>' : ''} <span class="tag reader">${readerName(readerOf(d))}</span></div>
        ${bar(d.hp, d.maxHp, 'foe-hp')}
        <div class="speech">${speech}</div>
        <details class="foe-info"><summary>Tells and habits</summary>
          <p>Calm tell: ${def.calm.face} ${def.calm.text}. Nervous tell: ${def.lie.face} ${def.lie.text}.</p>
          <p>Its tell shows the truth about ${pct(tellAcc(d, this.run!.player))} of the time. Its claims are true about ${pct(enemyHonesty(d))} of the time now (less when you keep countering its claims). ${style}</p>
          <p>It hits for ${[0, 1, 2, 3].map((a) => `${ACTIONS[a].icon}${dmg[a]}`).join(' ')}.${d.bleed ? ` 🩸 Bleeding ${d.bleed}.` : ''}</p>
        </details>
      </div>
    </section>`;
  }

  private youView(): string {
    const p = this.run!.player;
    const d = this.run!.duel!;
    const claim = d.phase === 'act' && d.claim !== null ? `You claim <b class="claim a${d.claim}">${actName(d.claim)}</b>` : '<span class="dim">Make your claim.</span>';
    return `<section class="card you" id="you-card">
      <div class="fl" id="fl-you"></div>
      <div class="you-row"><span class="big">🎭</span><div class="grow">${bar(p.hp, p.maxHp, 'you-hp')}</div><div class="speech">${claim}</div></div>
    </section>`;
  }

  private readView(d: Duel, v: View): string {
    const r = this.run!;
    const rd = READERS[v.reader];
    const after = d.phase === 'act' && d.claim !== null;
    const rows = [0, 1, 2, 3]
      .map((a) => {
        const x = v.expect[a];
        return `<div class="brow ${after && a === d.claim ? 'claimed' : ''}"><span>${ACTIONS[a].icon} ${ACTIONS[a].name}</span><div class="bar"><i class="a${a}" style="width:${x * 100}%"></i></div><b>${pct(x)}</b></div>`;
      })
      .join('');
    let answer = '';
    if (after) {
      const l1 = softmax(enemyEV(v.expect, r.player, enemyDmg(d)), edef(d).temp * TUNE.temp);
      const best = l1.indexOf(Math.max(...l1));
      answer = `<p class="answer">Its best answer to that: <b>${actName(best)}</b> (${pct(l1[best])}). If it second-guesses you, it plays against your counter.</p>`;
    }
    const remembered = d.mem.length;
    return `<section class="card read">
      <h3>👁️ How it sees you</h3>
      <p class="rtype"><b>${rd.icon} ${rd.name}:</b> ${rd.text}</p>
      <div class="meter"><span>Trusts your claims</span><div class="bar"><i class="trust" style="width:${v.trust * 100}%"></i></div><b>${pct(v.trust)}</b></div>
      <div class="meter"><span>Second-guesses</span><div class="bar"><i class="wary" style="width:${d.wary * 100}%"></i></div><b>${pct(d.wary)}</b></div>
      <h4>${after ? 'It expects you to play' : 'Actions it thinks you favor'}</h4>
      <div class="bars">${rows}</div>
      ${answer}
      <p class="dim small mem">It remembers ${remembered} round${remembered === 1 ? '' : 's'} of yours. Tip: ${rd.tip}</p>
    </section>`;
  }

  private lastView(): string {
    const d = this.run!.duel!;
    const l = this.reveal ?? d.log[d.log.length - 1];
    if (!l) return `<section class="card last"><p class="dim">Each round: 1. claim an action (true or a lie). 2. See its claim and tell. 3. Pick your real action. ${cycleHtml()} each beats the next.</p></section>`;
    const tag = (c: number, a: number): string => (c === a ? '<span class="true">true</span>' : '<span class="lie">bluff</span>');
    const res =
      l.kind === 'win' ? 'good' : l.kind === 'lose' ? 'bad' : '';
    return `<section class="card last ${this.reveal ? 'revealing' : ''}">
      <div class="lr-head">Round ${l.n}</div>
      <div class="lr-grid">
        <span class="who">You</span><span>said ${ACTIONS[l.pc].icon}</span><span class="flip">played <b>${actName(l.pa)}</b></span><span>${tag(l.pc, l.pa)}</span>
        <span class="who">Foe</span><span>said ${ACTIONS[l.ec].icon}</span><span class="flip">played <b>${actName(l.ea)}</b></span><span>${tag(l.ec, l.ea)}</span>
      </div>
      <p class="lr-res ${res}">${l.text} ${l.toE ? `Foe −${l.toE}.` : ''} ${l.toP ? `You −${l.toP}.` : ''} ${l.heal ? `You +${l.heal}.` : ''}${l.forgot ? ' It will not remember this round.' : ''}</p>
    </section>`;
  }

  private historyView(d: Duel): string {
    if (!d.log.length) return '';
    const rows = d.log
      .slice(-8)
      .reverse()
      .map((l) => {
        const res = l.kind === 'win' ? 'good' : l.kind === 'lose' ? 'bad' : 'dim';
        return `<li><span class="rn">${l.n}</span><span>${ACTIONS[l.pc].icon}→${ACTIONS[l.pa].icon}${l.pc === l.pa ? '' : '<sup class="lie">b</sup>'}</span><span class="vs">vs</span><span>${ACTIONS[l.ec].icon}→${ACTIONS[l.ea].icon}${l.ec === l.ea ? '' : '<sup class="lie">b</sup>'}</span><span class="${res}">${l.kind === 'win' ? `−${l.toE}` : l.kind === 'lose' ? `you −${l.toP}` : l.kind}</span></li>`;
      })
      .join('');
    return `<section class="card hist"><h3>Rounds <small>said → played, b = bluff</small></h3><ul>${rows}</ul></section>`;
  }

  private controlsView(d: Duel): string {
    const p = this.run!.player;
    const act = d.phase === 'act';
    const btns = [0, 1, 2, 3]
      .map((a) => {
        const m = MOVES[p.moves[a]];
        let tag = '';
        if (act) tag = a === d.claim ? '<em class="true">true</em>' : '<em class="lie">bluff</em>';
        return `<button class="act a${a}" data-act="pick" data-a="${a}" ${this.busy || d.phase === 'over' ? 'disabled' : ''}>
          <span class="ai">${ACTIONS[a].icon}</span><b>${ACTIONS[a].name}</b><small>${m.name} ${m.win} · beats ${ACTIONS[preyOf(a)].icon}</small>${tag}<kbd>${a + 1}</kbd></button>`;
      })
      .join('');
    const relics: string[] = [];
    if (p.relics.includes('lethe')) relics.push(`<button class="mini" data-act="lethe" ${d.phase !== 'claim' || d.used.includes('lethe') || this.busy ? 'disabled' : ''}>💧 Lethe: wipe its memory <kbd>L</kbd></button>`);
    if (p.relics.includes('ball')) relics.push(`<button class="mini" data-act="ball" ${!act || d.used.includes('ball') || this.busy ? 'disabled' : ''}>🔮 See its real pick <kbd>B</kbd></button>`);
    const step = act
      ? `<b>2 · Pick your real action.</b> It claims ${ACTIONS[d.plan!.claim].icon}. The counter to that is ${ACTIONS[counterOf(d.plan!.claim)].icon}.`
      : '<b>1 · Announce your intent.</b> True or a lie: it reads your claim.';
    return `<section class="controls">
      <div class="step">${step}</div>
      <div class="acts">${btns}</div>
      ${relics.length ? `<div class="relic-acts">${relics.join('')}</div>` : ''}
    </section>`;
  }

  // ---------- Other screens ----------

  private offerHtml(o: Offer, i: number, picked: boolean): string {
    const p = this.run!.player;
    let body = '';
    if (o.kind === 'move') {
      const m = MOVES[o.id];
      const cur = MOVES[p.moves[m.slot]];
      body = `<span class="big">${ACTIONS[m.slot].icon}</span><b>New ${ACTIONS[m.slot].name}: ${m.name}</b><small>${m.win} dmg. ${m.text}</small><small>Replaces ${cur.name} (${cur.win} dmg).</small>`;
    } else if (o.kind === 'relic') {
      const rl = RELICS[o.id];
      body = `<span class="big">${rl.icon}</span><b>${rl.name}</b><small>${rl.text}</small>`;
    } else {
      body = `<span class="big">🍖</span><b>Heal ${o.n} HP</b><small>Now ${p.hp}/${p.maxHp}.</small>`;
    }
    return `<button class="pick" data-act="offer" data-i="${i}" ${picked ? 'disabled' : ''}>${body}</button>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const rw = r.reward!;
    const d = r.duel;
    const def = d ? edef(d) : null;
    const picks = rw.picked ? '<p class="dim">Reward taken.</p>' : `<div class="picks">${rw.offers.map((o, i) => this.offerHtml(o, i, rw.picked)).join('')}</div>`;
    return `<div class="reward">
      <h2 class="good">${def ? `${def.icon} ${def.name} folds!` : 'Victory!'}</h2>
      <p class="sub">You catch your breath and heal a little. ❤️ ${r.player.hp}/${r.player.maxHp}</p>
      <h3>${rw.champion ? 'Choose a relic' : 'Choose one'}</h3>
      ${picks}
      <div class="row">${rw.picked ? '' : '<button data-act="skip">Skip</button>'}<button class="primary" data-act="next" ${rw.picked ? '' : 'disabled'}>Continue ▶</button></div>
      <h3>Your moves</h3>${this.movesHtml()}
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const foe = e.foe ? ENEMIES[e.foe] : null;
    return `<div class="end">
      <div class="logo">${e.victory ? '👑' : '🃏'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Victory!' : 'Defeat'}</h1>
      <p>${e.victory ? 'The Faceless King folds. Nobody can read you.' : foe ? `${foe.icon} ${foe.name} read you in hall ${e.hall + 1}.` : `The run ends in hall ${e.hall + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>Rounds ${e.rounds} · Bluffs that won ${e.bluffWins} · True claims that won ${e.truthWins} · Your claims were ${pct(e.honesty)} true</p>
      <p>💎 +${e.shards} shards for unlocks</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const readers = (Object.keys(READERS) as (keyof typeof READERS)[])
        .map((k) => `<li><b>${READERS[k].icon} ${READERS[k].name}.</b> ${READERS[k].text} <i>${READERS[k].tip}</i></li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <p>${cycleHtml()} <b>Strike</b> beats Feint, <b>Feint</b> beats Guard, <b>Guard</b> beats Charge, <b>Charge</b> beats Strike. The winner deals its damage. Opposite actions (Strike–Guard, Feint–Charge) only graze for 1. Same actions clash (Strike, Charge) or do nothing.</p>
        <ol>
          <li><b>Claim.</b> Announce the action you will play. You may lie.</li>
          <li><b>Read.</b> The foe reads your claim and announces its own. Watch its face: a tell often (not always) shows a lie.</li>
          <li><b>Act.</b> Pick your real action. Both picks are revealed.</li>
        </ol>
        <p><b>How it sees you</b> shows its model of you: how much it believes your claims and what it expects you to play. It plays its best answer to that. If you always tell the truth, it trusts you and counters your claim. If you always lie, it ignores your claim and guesses your favorites. Its <b>second-guess</b> rate grows when you win rounds: then it plays against your counter.</p>
        <p>Foes also notice when you keep countering their claims, and then they bluff more.</p>
        <h3>Foe types</h3><ul>${readers}</ul>
        <p>Your record of true claims and lies follows you. New foes start with a trust that mixes their nature and your record.</p>
        <p>Run: 3 halls, 2 duels and a champion each. After a duel, take a new move, a relic or healing. Keys: <kbd>1</kbd>–<kbd>4</kbd> or <kbd>S</kbd> <kbd>F</kbd> <kbd>G</kbd> <kbd>C</kbd> pick an action, <kbd>L</kbd>/<kbd>B</kbd> use relics, <kbd>Esc</kbd> closes this.</p>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Game flow ----------

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private pick(a: number): void {
    const r = this.run;
    const d = r?.duel;
    if (!r || !d || this.busy || this.screen !== 'duel') return;
    if (d.phase === 'claim') {
      announce(d, r.player, a);
      sfx.claim();
      this.save();
      this.render();
      return;
    }
    if (d.phase !== 'act') return;
    const log = resolve(d, r.player, a);
    if (!log) return;
    noteRound(r, log);
    this.save();
    this.reveal = log;
    this.busy = true;
    sfx.reveal();
    this.render();
    const show = (): void => {
      if (log.toE) this.float('foe', `−${log.toE}`, 'dmg');
      if (log.toP) this.float('you', `−${log.toP}`, 'hurt');
      if (log.heal) this.float('you', `+${log.heal}`, 'heal');
      if (log.kind === 'win') {
        this.shake('#foe-port');
        if (log.pc !== log.pa) {
          sfx.bluff();
          this.float('foe', 'Bluff!', 'bluff');
        } else sfx.hit();
      } else if (log.kind === 'lose') {
        this.shake('#you-card');
        sfx.hurt();
      } else if (log.kind === 'clash') sfx.clash();
      else sfx.stare();
      if (log.switched) this.toast(`${edef(d).name} changes how it reads you: now ${readerName(log.switched)}.`);
    };
    if (FAST) {
      show();
      this.afterReveal();
    } else {
      setTimeout(show, 280);
      setTimeout(() => this.afterReveal(), REVEAL_MS);
    }
  }

  private afterReveal(): void {
    this.busy = false;
    this.reveal = null;
    const r = this.run;
    const d = r?.duel;
    if (!r || !d) return;
    if (d.phase === 'over') {
      if (d.won) {
        winDuel(r);
        this.save();
        sfx.win();
        this.screen = 'reward';
        this.render();
      } else {
        sfx.lose();
        this.endRun(false);
      }
      return;
    }
    // Keep the floats alive: only update the parts that change.
    const duel = this.root.querySelector('.duel');
    if (!duel) return this.render();
    const keepFoe = this.root.querySelector('#fl-foe');
    const keepYou = this.root.querySelector('#fl-you');
    this.render();
    if (keepFoe) this.root.querySelector('#fl-foe')?.replaceWith(keepFoe);
    if (keepYou) this.root.querySelector('#fl-you')?.replaceWith(keepYou);
  }

  private startDuel(): void {
    const r = this.run!;
    startDuel(r);
    this.save();
    this.screen = 'duel';
    this.render();
    const def = edef(r.duel!);
    this.toast(def.champion ? `👑 ${def.name}, champion of ${HALLS[r.hall].name}, takes a seat.` : `${def.icon} ${def.name} sits down across from you.`);
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const sc = score(r, victory);
    const shards = shardsFor(sc);
    const n = r.player.rec.h + r.player.rec.l;
    this.end = {
      victory,
      score: sc,
      shards,
      hall: r.hall,
      foe: victory ? null : nextFoe(r),
      rounds: r.stats.rounds,
      bluffWins: r.stats.bluffWins,
      truthWins: r.stats.truthWins,
      honesty: n ? r.player.rec.h / n : 0,
    };
    const m = this.meta;
    m.shards += shards;
    if (victory) m.wins++;
    m.bestHall = Math.max(m.bestHall, victory ? HALLS.length : r.hall + 1);
    m.best = Math.max(m.best, sc);
    m.bluffWins += r.stats.bluffWins;
    saveMeta(m);
    clearRun();
    this.run = null;
    this.modal = null;
    this.screen = 'end';
    this.render();
  }

  private continueRun(): void {
    const r = this.run!;
    if (r.reward) this.screen = 'reward';
    else if (r.duel && r.duel.phase !== 'over') this.screen = 'duel';
    else if (r.duel && r.duel.phase === 'over' && r.duel.won === false) return this.endRun(false);
    else this.screen = 'map';
    this.render();
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    initAudio();
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (e.key === 'Escape' && this.run && this.screen !== 'title') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen === 'duel') {
      const k = e.key.toLowerCase();
      const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3, s: 0, f: 1, g: 2, c: 3 };
      if (k in map) {
        e.preventDefault();
        this.pick(map[k]);
      } else if (k === 'l') this.action('lethe', {});
      else if (k === 'b') this.action('ball', {});
      return;
    }
    if (e.key === 'Enter') {
      if (this.screen === 'map') this.action('duel', {});
      else if (this.screen === 'reward' && this.run?.reward?.picked) this.action('next', {});
    }
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
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
        this.modal = null;
        if (r) this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta.unlocked);
        this.meta.runs++;
        saveMeta(this.meta);
        this.save();
        this.screen = 'map';
        sfx.click();
        this.render();
        return;
      case 'continue':
        this.continueRun();
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.shards < cost || this.meta.unlocked.includes(id)) return sfx.deny();
        this.meta.shards -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'duel':
        if (r && this.screen === 'map') this.startDuel();
        return;
      case 'pick':
        this.pick(+d.a!);
        return;
      case 'lethe':
        if (r?.duel && r.player.relics.includes('lethe') && !this.busy && useLethe(r.duel)) {
          sfx.magic();
          this.save();
          this.render();
          this.toast('💧 It forgets everything it knew about you.');
        }
        return;
      case 'ball':
        if (r?.duel && r.player.relics.includes('ball') && !this.busy && useBall(r.duel)) {
          sfx.magic();
          this.save();
          this.render();
        }
        return;
      case 'offer': {
        const rw = r?.reward;
        if (!r || !rw || rw.picked) return;
        applyOffer(r, rw.offers[+d.i!]);
        rw.picked = true;
        sfx.item();
        this.save();
        this.render();
        return;
      }
      case 'skip':
        if (r?.reward) {
          r.reward.picked = true;
          this.save();
          this.render();
        }
        return;
      case 'next':
        if (!r || !r.reward?.picked) return;
        if (advance(r)) {
          this.endRun(true);
          return;
        }
        this.save();
        this.screen = 'map';
        this.render();
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.run;
        const d = r?.duel;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          busy: this.busy,
          hall: r?.hall ?? null,
          idx: r?.idx ?? null,
          hp: r?.player.hp ?? null,
          maxHp: r?.player.maxHp ?? null,
          moves: r?.player.moves ?? null,
          relics: r?.player.relics ?? null,
          record: r?.player.rec ?? null,
          duel: d
            ? {
                foe: d.enemy,
                reader: readerOf(d),
                hp: d.hp,
                maxHp: d.maxHp,
                phase: d.phase,
                round: d.round,
                trust: currentView(d, r!.player, null).trust,
                wary: d.wary,
                plan: d.phase === 'act' ? { claim: d.plan!.claim, tell: d.plan!.tell } : null,
              }
            : null,
          end: this.end,
        };
      },
      /** One bot action (the adaptive bot from the sim). */
      step: (): string => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.action('modal-close', {});
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            this.action(r ? 'continue' : 'new', {});
            return 'start';
          case 'map':
            this.action('duel', {});
            return 'duel';
          case 'duel': {
            const d = r!.duel!;
            const use = botRelic(d, r!.player);
            if (use) {
              this.action(use, {});
              return use;
            }
            if (d.phase === 'claim') {
              this.pick(botClaim(d, r!.player, 'adaptive', this.botRng));
              return 'claim';
            }
            if (d.phase === 'act') {
              this.pick(botAct(d, r!.player, 'adaptive', this.botRng));
              return 'act';
            }
            return 'busy';
          }
          case 'reward': {
            const rw = r!.reward!;
            if (!rw.picked) {
              this.action('offer', { i: String(botReward(rw, r!.player)) });
              return 'offer';
            }
            this.action('next', {});
            return 'next';
          }
          case 'end':
            return 'end';
        }
      },
      hp: (n: number) => {
        if (this.run) this.run.player.hp = n;
        this.render();
      },
      win: () => {
        const d = this.run?.duel;
        if (d) d.hp = 1;
      },
      shards: (n: number) => {
        this.meta.shards += n;
        saveMeta(this.meta);
        this.render();
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
