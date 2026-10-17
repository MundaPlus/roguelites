import { draftPick, matchup, pickBuy, pickNode, pickReward, restChoice } from './bot';
import {
  CLAUSES,
  ENEMIES,
  FIGHTERS,
  INTENT_ICON,
  PERKS,
  SPECIALS,
  UNLOCKS,
  UPGRADES,
  fighterUnlocked,
  type ClauseId,
  type Intent,
  type Side,
} from './data';
import { SIMS, applyPick, draftDone, evalDraft, foePick, styleName, turnSide, type DraftEval, type PickAct, type SimStat } from './draft';
import {
  botIntent,
  firstActor,
  guardValue,
  intentText,
  legalIntents,
  overtimeStart,
  playRound,
  spcBlock,
  spcCooldown,
  type Clause,
  type Ev,
  type FS,
  type Fight,
} from './engine';
import { Rng, hash, randomSeedText } from './rng';
import {
  ACTS,
  NODE_INFO,
  ROWS,
  advance,
  buy,
  chooseNode,
  clearRun,
  fighterDef,
  inkFor,
  loadMeta,
  loadRun,
  newRun,
  restHeal,
  restTrain,
  rollIntent,
  saveMeta,
  saveRun,
  score,
  startFight,
  takeReward,
  winFight,
  type Reward,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'draft' | 'fight' | 'reward' | 'shop' | 'rest' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const Q = new URLSearchParams(location.search);
const FAST = Q.has('fast');
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, FAST ? 0 : ms));

const SIDE_CLASS = ['you', 'foe'];
const INTENT_KEYS: Record<string, Intent> = { a: 'atk', '1': 'atk', g: 'grd', '2': 'grd', s: 'spc', '3': 'spc' };

function hpBar(hp: number, max: number, cls = ''): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<span class="hp ${cls}"><span class="hp-fill" style="width:${pct}%"></span><span class="hp-t">❤️ ${Math.max(0, hp)}/${max}</span></span>`;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

function clauseChip(c: Clause, extra = ''): string {
  const d = CLAUSES[c.id];
  const who = d.kind === 'law' ? 'law' : SIDE_CLASS[c.owner];
  const tag = d.kind === 'law' ? 'Law' : c.owner === 0 ? 'You' : 'Foe';
  return `<button class="chip cl-${who} ${c.sealed ? 'sealed' : ''} ${extra}" data-act="clause-info" data-id="${c.id}" title="${d.name}: ${d.text}">${c.sealed ? '🔒' : ''}${d.icon} ${d.name} <small>${tag}</small></button>`;
}

function rewardLabel(r: Reward): { icon: string; name: string; text: string; tag: string } {
  switch (r.k) {
    case 'card': {
      const c = CLAUSES[r.id];
      return { icon: c.icon, name: c.name, text: c.text, tag: `Clause card · ${c.kind === 'law' ? 'Law' : 'Holder'}` };
    }
    case 'up':
      return { ...UPGRADES[r.id], tag: 'Upgrade' };
    case 'perk':
      return { ...PERKS[r.id], tag: 'Perk' };
    case 'heal':
      return { icon: '🧪', name: 'Tonic', text: `Heal ${r.n} HP.`, tag: 'Heal' };
  }
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private busy = false;
  private ev: DraftEval | null = null;
  private evKey = '';
  private sel = -1;
  private info: ClauseId | null = null;
  private log: string[] = [];
  private flash: ClauseId | null = null;
  private end: { victory: boolean; score: number; ink: number; act: number; by: string; won: number; picks: number; burns: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (Q.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private toast(msg: string): void {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private get r(): RunState {
    return this.run!;
  }

  /** Sim previews for the current draft state, cached per state. */
  private draftEval(): DraftEval {
    const d = this.r.draft!;
    const key = `${this.r.act}|${this.r.row}|${d.idx}|${d.offer.join(',')}|${d.active.map((c) => c.id + c.owner).join(',')}`;
    if (!this.ev || this.evKey !== key) {
      this.ev = evalDraft(matchup(this.r), d);
      this.evKey = key;
    }
    return this.ev;
  }

  // ---------- Render ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'draft':
        body = this.draftView();
        break;
      case 'fight':
        body = this.fightView();
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
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? `<header class="top">${this.topBar()}</header>` : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main><div id="modal-root">${this.modal ? this.modalView() : ''}</div>`;
  }

  private renderModal(): void {
    const m = this.root.querySelector<HTMLElement>('#modal-root');
    if (m) m.innerHTML = this.modal ? this.modalView() : '';
  }

  private topBar(): string {
    const r = this.r;
    const hp = this.screen === 'fight' && r.fight ? r.fight.f[0].hp : r.hp;
    return `<span class="top-info">${hpBar(hp, r.max)}<span>💰 ${r.gold}</span><span class="dim">Act ${r.act}/${ACTS}</span></span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound (M)">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>`;
  }

  private titleView(): string {
    const m = this.meta;
    const fighters = FIGHTERS.filter((f) => fighterUnlocked(f.id, m.unlocked))
      .map(
        (f) => `<button class="fighter ${m.fighter === f.id ? 'on' : ''}" data-act="fighter" data-id="${f.id}">
          <span class="big">${f.icon}</span><b>${f.name}</b>
          <small>❤️${f.hp} ⚔️${f.atk} 🛡️${f.grd}</small><small>${SPECIALS[f.spc].icon} ${SPECIALS[f.spc].name}</small></button>`,
      )
      .join('');
    const archive = UNLOCKS.map((u) => {
      const ok = m.unlocked.includes(u.id);
      return `<div class="arm ${ok ? 'own' : ''}"><span class="big">${u.icon}</span><span class="arm-t"><b>${u.name}</b><small>${u.text}</small></span>
        ${ok ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.ink >= u.cost ? '' : 'disabled'}>🖋️ ${u.cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">📝</div>
      <h1>Clause Duel</h1>
      <p class="sub">Before each fight, you and the foe take turns to pick clauses from one offer. Both of you must obey every clause. Win the fight in the draft.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue (Act ${r.act}, ❤️ ${r.hp}/${r.max})</button>` : ''}
      <div class="fighters">${fighters}</div>
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best}</p>
      <h2>Archive <small>🖋️ ${m.ink} ink</small></h2>
      <div class="archive">${archive}</div>
    </div>`;
  }

  private youCard(): string {
    const r = this.r;
    const f = fighterDef(r.fighter);
    const sp = SPECIALS[f.spc];
    const pool = r.pool.map((id) => `<span class="mini" title="${CLAUSES[id].name}: ${CLAUSES[id].text}">${CLAUSES[id].icon} ${CLAUSES[id].name}</span>`).join('');
    const perks = r.perks.map((p) => `<span class="mini perk" title="${PERKS[p].text}">${PERKS[p].icon} ${PERKS[p].name}</span>`).join('');
    return `<div class="panel you-card">
      <div class="row"><span class="big">${f.icon}</span><b>${f.name}</b><span class="dim">❤️ ${r.hp}/${r.max} · ⚔️ ${r.atk} · 🛡️ ${r.grd}</span></div>
      <div class="dim">${sp.icon} ${sp.name}: ${sp.text(r.pow)} Recharge ${r.cd}.</div>
      <div class="minis"><span class="dim">Pool:</span> ${pool || '<span class="dim">empty</span>'}</div>
      ${perks ? `<div class="minis"><span class="dim">Perks:</span> ${perks}</div>` : ''}
    </div>`;
  }

  private mapView(): string {
    const r = this.r;
    const boss = ENEMIES[r.act - 1].boss;
    const rows = r.map
      .map((row, i) => {
        const cur = i === r.row;
        const nodes = row
          .map((k, j) => {
            const info = NODE_INFO[k];
            const chosen = r.path[i] === j;
            const name = k === 'boss' ? `${boss.icon} ${boss.name}` : `${info.icon} ${info.name}`;
            const sub = k === 'boss' && boss.sealed ? `Sealed: 🔒${CLAUSES[boss.sealed].icon} ${CLAUSES[boss.sealed].name}` : info.text;
            return cur
              ? `<button class="node n-${k}" data-act="node" data-i="${j}"><b>${name}</b><small>${sub}</small><kbd>${j + 1}</kbd></button>`
              : `<div class="node n-${k} ${chosen ? 'chosen' : ''} ${i < r.row ? 'past' : 'future'}"><b>${name}</b>${i > r.row ? `<small>${sub}</small>` : ''}</div>`;
          })
          .join('');
        return `<div class="map-row ${cur ? 'cur' : ''}"><span class="rn">${i === ROWS - 1 ? '👑' : i + 1}</span>${nodes}</div>`;
      })
      .join('');
    return `<h2 class="h">Act ${r.act}: choose your path</h2>
      <div class="map-wrap"><div class="map">${rows}</div>${this.youCard()}</div>`;
  }

  /** One preview chip: the expected HP you lose, and the change from now. */
  private deltaChip(label: string, s: SimStat, base: SimStat): string {
    const dl = s.lost - base.lost;
    const dw = s.win - base.win;
    const good = s.cost < base.cost - 0.5;
    const bad = s.cost > base.cost + 0.5;
    const arrow = Math.abs(dl) < 0.5 ? '±0' : dl < 0 ? `▼${(-dl).toFixed(0)}` : `▲${dl.toFixed(0)}`;
    const w = Math.abs(dw) >= 0.03 ? ` · win ${dw > 0 ? '+' : '−'}${Math.round(Math.abs(dw) * 100)}%` : '';
    return `<span class="pv ${good ? 'good' : bad ? 'bad' : 'even'}"><em>${label}</em> 💔 ${s.lost.toFixed(0)} <b>${arrow}</b>${w}</span>`;
  }

  private sideStats(s: Side): string {
    const r = this.r;
    const st = s === 0 ? matchup(r).me : r.enc!.foe;
    const sp = SPECIALS[st.spc];
    const extra = s === 1 ? ` · ${styleName[r.enc!.def.style]}` : '';
    return `<div class="side side-${SIDE_CLASS[s]}">
      <div class="row"><span class="big">${st.icon}</span><span><b>${st.name}</b><small class="dim">${s === 0 ? 'You' : r.enc!.kind === 'fight' ? 'Foe' : r.enc!.kind === 'elite' ? 'Elite' : 'Boss'}${extra}</small></span></div>
      <div class="nums">❤️ ${st.hp} · ⚔️ ${st.atk} · 🛡️ ${st.grd}</div>
      <div class="dim sp" title="${sp.text(st.pow)}">${sp.icon} ${sp.name}: ${sp.text(st.pow)} Every ${st.cd} rounds.</div>
    </div>`;
  }

  private draftView(): string {
    const r = this.r;
    const d = r.draft!;
    const done = draftDone(d);
    const ev = this.draftEval();
    const myTurn = !done && turnSide(d) === 0 && !this.busy;
    const canVeto = myTurn && r.perks.includes('veto') && !d.vetoUsed;
    const nWish = r.perks.includes('mind') ? 99 : 2;
    const wishes = ev.wishes.filter((w) => w.val > 0.3 || w === ev.wishes[0]).slice(0, nWish);
    const rank = new Map<ClauseId, number>(wishes.map((w, i) => [w.id, i + 1]));
    const myPicks = d.order.filter((s) => s === 0).length;
    const myDone = d.order.slice(0, d.idx).filter((s) => s === 0).length;
    const status = done
      ? 'The draft is done. These are the rules of the fight.'
      : this.busy || turnSide(d) === 1
        ? '🤔 The foe picks…'
        : `<b>Your pick</b> (${myDone + 1} of ${myPicks}). Take a clause, or burn it so no one gets it.`;
    const active = d.active.length ? d.active.map((c) => clauseChip(c, this.flash === c.id ? 'flash' : '')).join('') : '<span class="dim">No clauses yet. The base rules apply.</span>';
    const wishList = done
      ? ''
      : `<div class="panel wishes"><div class="ph">🗯️ The foe wants <small class="dim">${r.perks.includes('mind') ? 'its whole list' : 'its top 2'} · it picks its ① wish</small></div>
        ${wishes
          .map(
            (w, i) =>
              `<div class="wish"><span class="rk">${'①②③④⑤⑥⑦'[i] ?? i + 1}</span><span>${w.act === 'take' ? 'Take' : '<b class="burnw">Burn</b>'} ${CLAUSES[w.id].icon} <b>${CLAUSES[w.id].name}</b> <q>${w.why}</q></span></div>`,
          )
          .join('')}</div>`;
    const cards = d.offer
      .map((id, i) => {
        const c = CLAUSES[id];
        const o = ev.opts.find((x) => x.id === id)!;
        const rk = rank.get(id);
        const wish = rk ? ev.wishes.find((w) => w.id === id)! : null;
        const pv = o.law
          ? this.deltaChip('If active', o.you, ev.base)
          : `${this.deltaChip('You take', o.you, ev.base)}${this.deltaChip('Foe takes', o.foe, ev.base)}`;
        return `<div class="card ${this.sel === i ? 'sel' : ''} k-${c.kind}" data-act="sel" data-i="${i}">
          <div class="ch"><span class="ci">${c.icon}</span><b>${c.name}</b><span class="kind">${c.kind === 'law' ? 'Law · both' : 'Holder only'}</span>
            ${wish ? `<span class="want">Foe ${'①②③④⑤⑥⑦'[rk! - 1] ?? rk} ${wish.act}</span>` : ''}
            ${id === r.enc!.def.sig ? '<span class="sig" title="The foe brought this card">foe card</span>' : r.pool.includes(id) ? '<span class="sig mine" title="From your pool">your card</span>' : ''}<kbd>${i + 1}</kbd></div>
          <div class="ct">${c.text}</div>
          <div class="pvs">${pv}</div>
          <div class="cb">
            <button class="primary sm" data-act="pick" data-pick="take" data-i="${i}" ${myTurn ? '' : 'disabled'}>Take</button>
            <button class="sm burn" data-act="pick" data-pick="burn" data-i="${i}" ${myTurn ? '' : 'disabled'}>🔥 Burn</button>
            ${canVeto ? `<button class="sm" data-act="pick" data-pick="veto" data-i="${i}" title="Burn for free, then pick again">✂️ Veto</button>` : ''}
          </div>
        </div>`;
      })
      .join('');
    const logs = d.log
      .map((l) => {
        const c = CLAUSES[l.id];
        const verb = l.act === 'take' ? 'took' : l.act === 'veto' ? 'vetoed' : 'burned';
        return `<li class="lg-${SIDE_CLASS[l.s]}">${l.s === 0 ? 'You' : 'Foe'} ${verb} ${c.icon} ${c.name}${l.why ? ` <q>${l.why}</q>` : ''}</li>`;
      })
      .join('');
    const fightBtn = done ? `<button class="primary big-btn" data-act="start-fight">⚔️ Start the fight <kbd>Enter</kbd></button>` : '';
    const info = this.info ? `<div class="info">${CLAUSES[this.info].icon} <b>${CLAUSES[this.info].name}:</b> ${CLAUSES[this.info].text}</div>` : '';
    return `<div class="draft">
      <div class="dcol">
        <div class="matchup">${this.sideStats(0)}<span class="vs">VS</span>${this.sideStats(1)}</div>
        <div class="panel"><div class="ph">📜 Active clauses</div><div class="chips">${active}</div>${info}
          <div class="base">Fight now: you lose about <b>${ev.base.lost.toFixed(0)} HP</b>${ev.base.win < 0.995 ? ` · win chance <b>${pct(ev.base.win)}</b>` : ''} <small class="dim">(sim of ${SIMS} fights)</small></div>
        </div>
        ${wishList}
        ${logs ? `<ul class="dlog">${logs}</ul>` : ''}
      </div>
      <div class="dcol">
        <div class="status">${status}</div>
        ${fightBtn}
        ${done ? '' : `<p class="legend dim">💔 = HP you lose in this fight (sim). ▼ is good for you, ▲ is bad.</p><div class="offer">${cards}</div>`}
      </div>
    </div>`;
  }

  private fighterBox(F: Fight, s: Side): string {
    const f: FS = F.f[s];
    const sp = SPECIALS[f.spc];
    const blk = spcBlock(F, s);
    const st: string[] = [];
    if (f.block > 0) st.push(`<span class="st blk">🛡️ ${f.block}</span>`);
    if (f.poisonT > 0) st.push(`<span class="st psn">🧪 ${f.poison}×${f.poisonT}</span>`);
    if (f.weakT > 0) st.push(`<span class="st weak">🌀 −${f.weak}</span>`);
    st.push(`<span class="st spc ${blk ? '' : 'ready'}" title="${sp.text(f.pow)}">${sp.icon} ${blk ? blk : 'ready'}</span>`);
    let intent = '';
    if (s === 1 && this.r.fintent && !F.over) {
      const real = this.r.fintent;
      intent = `<div class="intent">Next: ${INTENT_ICON[real]} ${intentText(F, 1, real)}</div>`;
    }
    return `<div class="fbox side-${SIDE_CLASS[s]}" id="fb${s}">
      ${intent}
      <div class="fi">${f.icon}</div>
      <b>${s === 0 ? 'You' : f.name}</b>
      ${hpBar(f.hp, f.max, 'big')}
      <div class="sts">${st.join('')}</div>
      <div class="dim small">⚔️ ${f.atk} · 🛡️ ${guardValue(F, s)}</div>
    </div>`;
  }

  /** Exact result of an intent against the shown foe intent. */
  private outcome(F: Fight, it: Intent): string {
    const res = playRound(F, it, this.r.fintent!).F;
    const dealt = F.f[1].hp - res.f[1].hp;
    const taken = F.f[0].hp - res.f[0].hp;
    const parts: string[] = [];
    parts.push(`deal ${Math.max(0, dealt)}`);
    parts.push(taken >= 0 ? `take ${taken}` : `heal ${-taken}`);
    if (res.over === 1) parts.push('<b>wins</b>');
    if (res.over === 2) parts.push('<b>you die</b>');
    return parts.join(' · ');
  }

  private fightView(): string {
    const r = this.r;
    const F = r.fight!;
    const order = firstActor(F);
    const ot = overtimeStart(F);
    const otText = F.round >= ot ? `<b class="ot">Overtime: hits +${3 * (F.round - ot + 1)}</b>` : `Overtime from round ${ot}`;
    const chips = F.cl.length ? F.cl.map((c) => clauseChip(c)).join('') : '<span class="dim">No clauses.</span>';
    const info = this.info ? `<div class="info">${CLAUSES[this.info].icon} <b>${CLAUSES[this.info].name}:</b> ${CLAUSES[this.info].text}</div>` : '';
    const legal = legalIntents(F, 0);
    const sp = SPECIALS[F.f[0].spc];
    const btn = (it: Intent, key: string): string => {
      const ok = legal.includes(it) && !this.busy && !F.over;
      const label = it === 'spc' ? `${sp.icon} ${sp.name}` : it === 'atk' ? '⚔️ Attack' : '🛡️ Guard';
      const sub = legal.includes(it) ? this.outcome(F, it) : `Special: ${spcBlock(F, 0)}`;
      return `<button class="intent-btn i-${it}" data-act="intent" data-it="${it}" ${ok ? '' : 'disabled'}><b>${label} <kbd>${key}</kbd></b><small>${intentText(F, 0, it)}</small><small class="oc">${sub}</small></button>`;
    };
    const logs = this.log
      .slice(-5)
      .map((l) => `<li>${l}</li>`)
      .join('');
    return `<div class="fight">
      <div class="round">Round ${F.round} · ${otText} · Order: <b>${order.side === 0 ? 'You → Foe' : 'Foe → You'}</b> <small class="dim">(${order.why})</small></div>
      <div class="arena">${this.fighterBox(F, 0)}<div class="vs">VS</div>${this.fighterBox(F, 1)}</div>
      <div class="chips fchips">${chips}</div>${info}
      <ul class="flog">${logs || '<li class="dim">Pick an intent. The foe’s next intent is shown above it.</li>'}</ul>
      <div class="intents">${btn('atk', 'A')}${btn('grd', 'G')}${btn('spc', 'S')}</div>
      <p class="dim small hint">Guards land before hits. Special recharge: ${spcCooldown(F, 0)} rounds.</p>
    </div>`;
  }

  private rewardCard(r: Reward, i: number, act: string, extra = ''): string {
    const l = rewardLabel(r);
    return `<button class="reward" data-act="${act}" data-i="${i}" ${extra}><span class="big">${l.icon}</span><span><b>${l.name}</b><small class="tag">${l.tag}</small><small>${l.text}</small></span><kbd>${i + 1}</kbd></button>`;
  }

  private rewardView(): string {
    const r = this.r;
    return `<div class="center">
      <h2 class="h">Victory! Choose one</h2>
      <p class="dim">A clause card goes into your pool. Up to 2 of your cards join each offer.</p>
      <div class="rewards">${r.rewards.map((x, i) => this.rewardCard(x, i, 'reward')).join('')}</div>
      <button data-act="reward-skip">Skip (+6 💰)</button>
      ${this.youCard()}
    </div>`;
  }

  private shopView(): string {
    const r = this.r;
    const items = r.shop
      .map((it, i) => {
        const l = rewardLabel(it.r);
        const no = it.sold || r.gold < it.cost || (it.r.k === 'heal' && r.hp >= r.max);
        return `<button class="reward ${it.sold ? 'sold' : ''}" data-act="buy" data-i="${i}" ${no ? 'disabled' : ''}><span class="big">${l.icon}</span><span><b>${l.name}</b><small class="tag">${l.tag}</small><small>${l.text}</small></span><span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="center"><h2 class="h">🪶 The Scribe</h2><p class="dim">Buy clause cards, perks and upgrades.</p>
      <div class="rewards">${items}</div><button class="primary" data-act="leave">Leave</button>${this.youCard()}</div>`;
  }

  private restView(): string {
    const r = this.r;
    const heal = Math.min(r.max - r.hp, Math.ceil(r.max * 0.4));
    return `<div class="center"><h2 class="h">🔥 Rest</h2><p class="dim">Heal, or train one stat.</p>
      <div class="rewards"><button class="reward" data-act="rest-heal"><span class="big">💤</span><span><b>Sleep</b><small>Heal ${heal} HP (40%).</small></span></button>
      ${r.rewards.map((x, i) => this.rewardCard(x, i, 'rest-train')).join('')}</div>${this.youCard()}</div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="center end">
      <div class="logo">${e.victory ? '🏆' : '🪦'}</div>
      <h1>${e.victory ? 'You win the duel circuit!' : 'Defeated'}</h1>
      <p>${e.victory ? 'All three judges fell to your clauses.' : `Act ${e.act}. Beaten by ${e.by}.`}</p>
      <p class="big-score">Score <b>${e.score}</b></p>
      <p class="dim">Fights won ${e.won} · Clauses picked ${e.picks} (${e.burns} burned)</p>
      <p>+🖋️ ${e.ink} ink for the Archive</p>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const cl = Object.values(CLAUSES)
        .map((c) => `<li>${c.icon} <b>${c.name}</b> <small class="dim">${c.kind === 'law' ? 'law' : 'holder'}</small> — ${c.text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ol>
          <li><b>Draft.</b> Before each fight, an offer of 6 clauses appears. You and the foe pick in turns, 2 picks each. On a pick you <b>Take</b> a clause or <b>Burn</b> it, so no one gets it.</li>
          <li>A <b>law</b> is the same rule for both sides. A <b>holder</b> clause helps only the side that takes it. Take a clause the foe wants, and it can’t have it.</li>
          <li>Each card shows a sim preview: 💔 is the HP you lose in this fight. ▼ is good for you. The foe panel shows what it wants and why. It always picks its ① wish.</li>
          <li><b>Fight.</b> Each round you pick Attack, Guard or your Special. The foe’s next intent is shown. Each button shows the exact result of this round.</li>
          <li>Guards land before hits. The order line says who acts first. Block fades at round end. From round 6 (Overtime), hits deal +3 more each round.</li>
          <li>Your HP carries over between fights. Rest and the Scribe heal you.</li>
          <li><b>Map.</b> 3 acts, each ends with a boss. Elites and bosses pick first. A boss has one 🔒 sealed clause.</li>
          <li>After a fight, take a clause card for your pool, an upgrade, or (elite, boss) a perk. Up to 2 pool cards join each offer.</li>
        </ol>
        <p class="dim">Keys: <kbd>1</kbd>–<kbd>7</kbd> select a card, <kbd>T</kbd> take, <kbd>B</kbd> burn, <kbd>V</kbd> veto, <kbd>Enter</kbd> fight. In a fight <kbd>A</kbd> <kbd>G</kbd> <kbd>S</kbd>. <kbd>M</kbd> mute, <kbd>Esc</kbd> menu.</p>
        <h3>Clauses</h3><ul class="cl-list">${cl}</ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet small-sheet" data-stop>
      <h2>Menu</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<button class="danger" data-act="abandon-yes">Yes, abandon the run</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="to-title">Title (the run is saved)</button>
    </div></div>`;
  }

  // ---------- Actions ----------

  private go(screen: Screen): void {
    this.screen = screen;
    this.sel = -1;
    this.info = null;
    this.render();
  }

  private stageScreen(): Screen {
    return this.run ? this.run.stage : 'title';
  }

  private startRun(): void {
    if (this.run) this.recordEnd(false, true);
    this.run = newRun(Q.get('seed') ?? randomSeedText(), this.meta, this.meta.fighter);
    this.end = null;
    this.save();
    this.go('map');
  }

  private recordEnd(victory: boolean, abandoned = false): void {
    const r = this.r;
    const s = score(r, victory);
    const ink = abandoned ? 0 : inkFor(s);
    this.meta.runs++;
    if (victory) this.meta.wins++;
    this.meta.ink += ink;
    this.meta.best = Math.max(this.meta.best, s);
    this.meta.bestAct = Math.max(this.meta.bestAct, victory ? 4 : r.act);
    saveMeta(this.meta);
    this.end = { victory, score: s, ink, act: r.act, by: r.enc ? `${r.enc.def.icon} ${r.enc.def.name}` : '?', won: r.won, picks: r.picks, burns: r.burns };
    clearRun();
    this.run = null;
  }

  private chooseNode(i: number): void {
    const r = this.r;
    const kind = r.map[r.row]?.[i];
    if (!kind) return;
    sfx.click();
    chooseNode(r, i);
    this.save();
    if (r.stage === 'draft') {
      this.log = [];
      this.ev = null;
      if (r.enc!.def.sealed) this.toast(`🔒 ${r.enc!.def.name} seals <b>${CLAUSES[r.enc!.def.sealed].name}</b>`);
      this.go('draft');
      this.maybeFoePick();
    } else this.go(r.stage);
  }

  private async pick(i: number, act: PickAct | 'veto'): Promise<void> {
    const r = this.r;
    const d = r.draft;
    if (!d || this.busy || draftDone(d) || turnSide(d) !== 0) return;
    const id = d.offer[i];
    if (!id) return;
    if (act === 'veto' && (!r.perks.includes('veto') || d.vetoUsed)) return;
    applyPick(d, 0, act, id);
    r.picks++;
    if (act !== 'take') r.burns++;
    if (act === 'take') sfx.take();
    else sfx.burn();
    this.flash = act === 'take' ? id : null;
    this.sel = -1;
    this.save();
    this.render();
    await this.maybeFoePick();
  }

  private async maybeFoePick(): Promise<void> {
    const r = this.r;
    const d = r.draft;
    if (!d || draftDone(d) || turnSide(d) !== 1) return;
    this.busy = true;
    this.render();
    await wait(650);
    if (this.run !== r || r.draft !== d) {
      this.busy = false;
      return;
    }
    const w = foePick(d, this.draftEval());
    sfx.foe();
    this.flash = w.act === 'take' ? w.id : null;
    this.busy = false;
    this.save();
    this.render();
    await this.maybeFoePick();
  }

  private startFight(): void {
    const r = this.r;
    if (!r.draft || !draftDone(r.draft)) return;
    startFight(r);
    this.log = [];
    this.save();
    sfx.seal();
    this.go('fight');
  }

  private async intent(it: Intent): Promise<void> {
    const r = this.r;
    const F = r.fight;
    if (!F || F.over || this.busy || !legalIntents(F, 0).includes(it)) return;
    this.busy = true;
    const { F: nf, ev } = playRound(F, it, r.fintent!);
    r.fight = nf;
    for (const e of ev) this.log.push(this.logLine(e));
    if (!nf.over) r.fintent = rollIntent(r);
    this.save();
    this.render();
    await this.playEvents(ev);
    this.busy = false;
    if (this.run !== r) return;
    if (nf.over === 2) {
      sfx.lose();
      await wait(500);
      this.recordEnd(false);
      this.go('end');
      return;
    }
    if (nf.over === 1) {
      sfx.win();
      const victory = winFight(r);
      this.toast(`🏆 ${r.enc!.def.name} falls`);
      await wait(700);
      if (victory) {
        this.recordEnd(true);
        this.go('end');
        return;
      }
      this.save();
      this.go('reward');
      return;
    }
    this.render();
  }

  private logLine(e: Ev): string {
    const cl = e.cl ? ` <span class="lc">${CLAUSES[e.cl].icon}</span>` : '';
    return `<span class="lg-${e.k}">${e.txt}</span>${cl}`;
  }

  private async playEvents(ev: Ev[]): Promise<void> {
    for (const e of ev) {
      const box = this.root.querySelector<HTMLElement>(`#fb${e.s}`);
      if (e.cl) {
        const chip = this.root.querySelector<HTMLElement>(`.fchips [data-id="${e.cl}"]`);
        chip?.classList.remove('flash');
        void chip?.offsetWidth;
        chip?.classList.add('flash');
        sfx.clause();
      }
      if (box && e.k !== 'note') {
        const fl = document.createElement('span');
        fl.className = `float f-${e.k}`;
        fl.textContent = e.k === 'dmg' ? `−${e.n}` : e.k === 'heal' ? `+${e.n}` : `🛡️+${e.n}`;
        fl.style.left = `${35 + Math.random() * 30}%`;
        box.appendChild(fl);
        setTimeout(() => fl.remove(), 1100);
        if (e.k === 'dmg' && e.n > 0) {
          box.classList.remove('shake');
          void box.offsetWidth;
          box.classList.add('shake');
          if (e.s === 0) sfx.hurt();
          else sfx.hit();
        } else if (e.k === 'heal') sfx.heal();
        else if (e.k === 'block') sfx.shield();
      }
      await wait(e.k === 'note' && !e.cl ? 120 : 300);
    }
  }

  private takeReward(i: number): void {
    const r = this.r;
    sfx.take();
    takeReward(r, i);
    this.save();
    this.go('map');
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && t.closest('[data-stop]') && el.classList.contains('modal')) return;
    const act = el.dataset.act!;
    const i = Number(el.dataset.i ?? -1);
    switch (act) {
      case 'help':
        this.modal = { kind: 'help' };
        this.renderModal();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.renderModal();
        break;
      case 'modal-close':
        this.modal = null;
        this.renderModal();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.renderModal();
        break;
      case 'abandon-yes':
        this.modal = null;
        if (this.run) this.recordEnd(false, true);
        this.go('title');
        break;
      case 'to-title':
        this.modal = null;
        this.go('title');
        break;
      case 'mute':
        toggleMute();
        this.render();
        break;
      case 'new':
        this.startRun();
        break;
      case 'continue':
        this.go(this.stageScreen());
        if (this.screen === 'draft') void this.maybeFoePick();
        break;
      case 'title':
        this.go('title');
        break;
      case 'fighter':
        this.meta.fighter = el.dataset.id!;
        saveMeta(this.meta);
        sfx.click();
        this.render();
        break;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === el.dataset.id);
        if (u && this.meta.ink >= u.cost && !this.meta.unlocked.includes(u.id)) {
          this.meta.ink -= u.cost;
          this.meta.unlocked.push(u.id);
          saveMeta(this.meta);
          sfx.coin();
          this.render();
        }
        break;
      }
      case 'node':
        this.chooseNode(i);
        break;
      case 'sel':
        if (t.closest('button')) break;
        this.sel = this.sel === i ? -1 : i;
        this.render();
        break;
      case 'pick':
        void this.pick(i, el.dataset.pick as PickAct | 'veto');
        break;
      case 'clause-info': {
        const id = el.dataset.id as ClauseId;
        this.info = this.info === id ? null : id;
        this.render();
        break;
      }
      case 'start-fight':
        this.startFight();
        break;
      case 'intent':
        void this.intent(el.dataset.it as Intent);
        break;
      case 'reward':
        this.takeReward(i);
        break;
      case 'reward-skip':
        this.takeReward(-1);
        break;
      case 'buy':
        if (buy(this.r, i)) {
          sfx.coin();
          this.save();
          this.render();
        } else sfx.deny();
        break;
      case 'leave':
        advance(this.r);
        this.save();
        this.go('map');
        break;
      case 'rest-heal':
        sfx.heal();
        restHeal(this.r);
        this.save();
        this.go('map');
        break;
      case 'rest-train':
        sfx.take();
        restTrain(this.r, i);
        this.save();
        this.go('map');
        break;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    initAudio();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.renderModal();
      return;
    }
    if (this.modal) return;
    if (k === 'h' || k === '?') {
      this.modal = { kind: 'help' };
      this.renderModal();
      return;
    }
    if (k === 'm') {
      toggleMute();
      this.render();
      return;
    }
    const n = Number(k);
    switch (this.screen) {
      case 'map':
        if (n >= 1 && n <= 3) this.chooseNode(n - 1);
        break;
      case 'draft': {
        const d = this.r.draft!;
        if (n >= 1 && n <= d.offer.length) {
          this.sel = n - 1;
          this.render();
        } else if (k === 't' && this.sel >= 0) void this.pick(this.sel, 'take');
        else if (k === 'b' && this.sel >= 0) void this.pick(this.sel, 'burn');
        else if (k === 'v' && this.sel >= 0) void this.pick(this.sel, 'veto');
        else if (k === 'Enter' && draftDone(d)) this.startFight();
        break;
      }
      case 'fight':
        if (INTENT_KEYS[k]) void this.intent(INTENT_KEYS[k]);
        break;
      case 'reward':
        if (n >= 1 && n <= this.r.rewards.length) this.takeReward(n - 1);
        break;
    }
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const rng = new Rng(hash('debug', Date.now()));
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        busy: this.busy,
        act: this.run?.act ?? null,
        row: this.run?.row ?? null,
        hp: this.run?.fight?.f[0].hp ?? this.run?.hp ?? null,
        max: this.run?.max ?? null,
        gold: this.run?.gold ?? null,
        pool: this.run?.pool ?? [],
        perks: this.run?.perks ?? [],
        foe: this.run?.enc?.def.id ?? null,
        offer: this.run?.draft?.offer ?? null,
        active: this.run?.draft?.active ?? null,
        round: this.run?.fight?.round ?? null,
        foeHp: this.run?.fight?.f[1].hp ?? null,
        fintent: this.run?.fintent ?? null,
        end: this.end,
      }),
      /** One bot action. The bot drafts with the sim previews. */
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.renderModal();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            this.startRun();
            return 'new';
          case 'map':
            this.chooseNode(pickNode(r!));
            return 'node';
          case 'draft': {
            const d = r!.draft!;
            if (draftDone(d)) {
              this.startFight();
              return 'fight';
            }
            if (turnSide(d) !== 0) {
              await this.maybeFoePick();
              return 'foe';
            }
            const p = draftPick(r!, 'good', rng);
            await this.pick(d.offer.indexOf(p.id), p.act);
            return `${p.act} ${p.id}`;
          }
          case 'fight': {
            const it = botIntent(r!.fight!, r!.fintent!);
            await this.intent(it);
            return it;
          }
          case 'reward':
            this.takeReward(pickReward(r!, r!.rewards));
            return 'reward';
          case 'shop': {
            const i = pickBuy(r!);
            if (i >= 0) {
              buy(r!, i);
              this.save();
              this.render();
              return 'buy';
            }
            advance(r!);
            this.save();
            this.go('map');
            return 'leave';
          }
          case 'rest': {
            const c = restChoice(r!);
            if (c < 0) restHeal(r!);
            else restTrain(r!, c);
            this.save();
            this.go('map');
            return 'rest';
          }
          case 'end':
            return 'end';
        }
        return 'none';
      },
      hp: (n: number) => {
        if (this.run?.fight) this.run.fight.f[0].hp = n;
        else if (this.run) this.run.hp = n;
        this.render();
      },
      ink: (n: number) => {
        this.meta.ink += n;
        saveMeta(this.meta);
        this.render();
      },
      eval: () => (this.run?.draft ? this.draftEval() : null),
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
