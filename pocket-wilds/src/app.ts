import { isWild, type Battle, type LogEntry, type Snap } from './battle';
import { botAction } from './bot';
import {
  ITEMS,
  ITEM_IDS,
  LEADERS,
  MOVES,
  NATURES,
  REGIONS,
  SPECIES,
  STATUS_INFO,
  TYPE_INFO,
  effectiveness,
  moveText,
  type ItemId,
  type Status,
  type Type,
} from './data';
import { MAX_FUSED, maxHp, stat, xpNeed, type Mon } from './mon';
import { randomSeedText } from './rng';
import {
  NODE_INFO,
  PLAN,
  TEAM_MAX,
  TOTAL_SPECIES,
  TUTOR_COST,
  UNLOCKS,
  act,
  canLearn,
  clearRun,
  count,
  loadMeta,
  loadRun,
  newRun,
  recordEnd,
  saveMeta,
  saveRun,
  score,
  type Action,
  type RunState,
  type Scene,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'mon'; uid: number }
  | { kind: 'team' }
  | { kind: 'bag' }
  | { kind: 'tutor'; move: string; uid: number | null }
  | { kind: 'fuse'; a: number | null };

const params = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits, for bot tests. */
const FAST = params.has('fast');
const STEP_MS = 650;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function typeChip(t: Type): string {
  const i = TYPE_INFO[t];
  return `<span class="type" style="--tc:${i.color}">${i.icon} ${i.name}</span>`;
}

function statusChip(st: Status | null): string {
  if (!st) return '';
  const s = STATUS_INFO[st];
  return `<span class="status" style="--tc:${s.color}" title="${s.name}: ${s.text}">${s.short}</span>`;
}

function hpBar(hp: number, max: number, small = false): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const cls = pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low';
  return `<div class="hp ${cls} ${small ? 'small' : ''}"><div class="hp-fill" style="width:${pct}%"></div><span>${Math.max(0, hp)} / ${max}</span></div>`;
}

function sprite(sp: string, size: 'sm' | 'md' | 'lg' = 'md', extra = ''): string {
  const s = SPECIES[sp];
  const c1 = TYPE_INFO[s.types[0]].color;
  const c2 = TYPE_INFO[s.types[1] ?? s.types[0]].color;
  return `<span class="mon-sprite ${size} st${s.stage} ${extra}" style="--c1:${c1};--c2:${c2}"><span>${s.icon}</span></span>`;
}

const monName = (m: Mon): string => `${SPECIES[m.sp].name}${m.fused ? ' ' + '★'.repeat(m.fused) : ''}`;

function moveBtnInner(id: string, effLine = ''): string {
  const mv = MOVES[id];
  const t = TYPE_INFO[mv.type];
  return `<b>${mv.name}</b><small>${t.icon} ${mv.power ? `Pow ${mv.power}` : 'Status'} · Acc ${mv.acc}%${effLine}</small>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: 'title' | 'run' = 'title';
  private modal: Modal | null = null;
  /** Battle log playback. */
  private anim: { log: LogEntry[]; i: number; timer: number } | null = null;
  private snap: Snap | null = null;
  private line = '';
  private fx: LogEntry | null = null;

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
    let top = '';
    if (this.screen === 'title' || !this.run) body = this.titleView();
    else {
      const sc = this.run.scene;
      if (sc.k !== 'end') top = this.topBar();
      body = this.sceneView(sc);
    }
    const kind = this.screen === 'title' || !this.run ? 'title' : this.run.scene.k;
    this.root.innerHTML = `${top}<main class="screen s-${kind}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const reg = REGIONS[Math.min(r.region, REGIONS.length - 1)];
    const badges = [0, 1, 2, 3].map((i) => `<span class="badge ${i < r.badges ? 'on' : ''}" title="Badge ${i + 1}">🏅</span>`).join('');
    return `<header class="top">
      <span class="reg">${reg.icon} <b>${reg.name}</b> <small>${Math.min(r.step + 1, PLAN.length)}/${PLAN.length}</small></span>
      <span class="badges">${badges}</span>
      <span>💰 ${r.gold}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run && this.run.scene.k !== 'end' ? this.run : null;
    const unlocks = UNLOCKS.map((u) => {
      const s = SPECIES[u.id];
      const own = m.unlocked.includes(u.id);
      return `<div class="unlock ${own ? 'own' : ''}">${sprite(u.id, 'sm')}<span><b>${s.name}</b><small>${u.kind === 'starter' ? 'New starter choice' : 'Can appear in rare dens'} · ${s.types.map((t) => TYPE_INFO[t].icon).join('')}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.shards >= u.cost ? '' : 'disabled'}>💎 ${u.cost}</button>`}</div>`;
    }).join('');
    const parade = ['emberkit', 'finnip', 'sproutle', 'zappip', 'wispet', 'pebblet'].map((id) => sprite(id, 'md', 'bob')).join('');
    return `<div class="title">
      <div class="parade">${parade}</div>
      <h1>Pocket Wilds</h1>
      <p class="sub">Tame wild creatures, build a team of six, and beat 4 gym leaders and the Champion. A fainted creature is gone for the run.</p>
      <div class="title-btns">
        ${r ? `<button class="primary" data-act="continue">▶ Continue (${REGIONS[Math.min(r.region, 4)].name}, ${r.badges} badges)</button>` : ''}
        <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
        <button data-act="help">How to play</button>
        <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      </div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best badges ${m.bestBadges} · Best score ${m.best} · Tamed species ${m.dex.length}/${TOTAL_SPECIES}</p>
      <h2>Sanctuary <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock new starters and rare creatures for later runs.</p>
      <div class="unlocks">${unlocks}</div>
    </div>`;
  }

  private sceneView(sc: Scene): string {
    switch (sc.k) {
      case 'starter':
        return this.starterView(sc);
      case 'map':
        return this.mapView();
      case 'battle':
        return this.battleView(sc.b);
      case 'notice':
        return `<div class="panel notice pop"><div class="huge">${sc.icon}</div><h2>${esc(sc.title)}</h2>${sc.lines.map((l) => `<p>${esc(l)}</p>`).join('')}<button class="primary" data-act="next">Continue ⏎</button></div>`;
      case 'learn':
        return this.learnView(sc);
      case 'evolve':
        return `<div class="panel notice"><h2>What? ${SPECIES[sc.from].name} is evolving!</h2>
          <div class="evo">${sprite(sc.from, 'lg', 'evo-from')}${sprite(sc.to, 'lg', 'evo-to')}</div>
          <p>It became <b>${SPECIES[sc.to].name}</b>! ${SPECIES[sc.to].types.map(typeChip).join(' ')}</p>
          <button class="primary" data-act="next">Continue ⏎</button></div>`;
      case 'full':
        return this.fullView(sc.mon);
      case 'town':
        return this.townView(sc);
      case 'end':
        return this.endView(sc);
    }
  }

  private monCard(m: Mon, extra = ''): string {
    return `<div class="mon-card">${sprite(m.sp, 'md')}<div class="mc-body"><b>${monName(m)}</b> <small>Lv ${m.lvl}</small> ${statusChip(m.st)}<div>${SPECIES[m.sp].types.map(typeChip).join(' ')}</div>${hpBar(m.hp, maxHp(m), true)}</div>${extra}</div>`;
  }

  private starterView(sc: Extract<Scene, { k: 'starter' }>): string {
    const cards = sc.opts
      .map((id, i) => {
        const s = SPECIES[id];
        return `<button class="starter" data-act="starter" data-i="${i}">${sprite(id, 'lg', 'bob')}<b>${s.name}</b><span>${s.types.map(typeChip).join(' ')}</span>
          <small>HP ${s.base[0]} · ATK ${s.base[1]} · DEF ${s.base[2]} · SPD ${s.base[3]}</small>
          <small class="dim">Evolves at Lv ${s.evo?.lvl ?? '-'}</small></button>`;
      })
      .join('');
    return `<div class="center"><h2>Choose your partner</h2><p class="sub">A wild ${SPECIES[sc.buddy].icon} ${SPECIES[sc.buddy].name} will follow you too.</p><div class="starters">${cards}</div></div>`;
  }

  private teamList(): string {
    const r = this.run!;
    return `<div class="team">${r.team
      .map(
        (m, i) => `<button class="team-mon ${m.hp <= 0 ? 'down' : ''}" data-act="mon" data-uid="${m.uid}">${i === 0 ? '<span class="lead">Lead</span>' : ''}${sprite(m.sp, 'sm')}<span class="tm-body"><b>${monName(m)}</b> <small>Lv ${m.lvl}</small> ${statusChip(m.st)}${hpBar(m.hp, maxHp(m), true)}</span></button>`,
      )
      .join('')}${Array.from({ length: TEAM_MAX - r.team.length }, () => '<span class="team-mon empty">·</span>').join('')}</div>`;
  }

  private bagLine(): string {
    const r = this.run!;
    const items = ITEM_IDS.filter((id) => count(r, id) > 0)
      .map((id) => `<span class="chip" title="${ITEMS[id].name}: ${ITEMS[id].text}">${ITEMS[id].icon} ${count(r, id)}</span>`)
      .join('');
    return `<div class="bag">${items || '<span class="dim">Empty bag</span>'}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const reg = REGIONS[r.region];
    const track = PLAN.map((p, i) => {
      const st = i < r.step ? 'done' : i === r.step ? 'now' : '';
      const icon = p === 'town' ? '🏘️' : p === 'boss' ? (r.region >= 4 ? '👑' : '🏟️') : '🌿';
      return `<span class="node ${st}">${icon}</span>`;
    }).join('<span class="link"></span>');
    const opts = r.options
      .map((o, i) => {
        const info = NODE_INFO[o.kind];
        let extra = '';
        if (o.kind === 'gym') {
          const l = LEADERS[r.leaders[r.region]];
          extra = `<small class="foe">${typeChip(l.type)} type</small>`;
        }
        if (o.kind === 'wild') extra = `<small class="foe">Lv ${reg.lvl[0]}–${reg.lvl[1]}</small>`;
        if (o.kind === 'trainer') extra = `<small class="foe">Lv ${reg.lvl[0] + 1}–${reg.lvl[1]}</small>`;
        if (o.kind === 'rare') extra = `<small class="foe">Lv ${reg.lvl[1] + (r.region === 0 ? 0 : 1)}</small>`;
        return `<button class="node-opt n-${o.kind}" data-act="node" data-i="${i}"><span class="big">${o.icon}</span><b>${esc(o.label)}</b><small>${info.text}</small>${extra}<kbd>${i + 1}</kbd></button>`;
      })
      .join('');
    return `<div class="map">
      <div class="region-head" style="--rb:${reg.bg}"><span class="huge">${reg.icon}</span><div><h2>Region ${r.region + 1}: ${reg.name}</h2><p class="sub">${reg.text}</p></div></div>
      <div class="track">${track}</div>
      <h3>Choose a path</h3>
      <div class="opts">${opts}</div>
      <h3>Team <small class="dim">tap a creature for details and items</small></h3>
      ${this.teamList()}
      ${this.bagLine()}
    </div>`;
  }

  private battleView(b: Battle): string {
    const s = this.snap && this.anim ? this.snap : null;
    const pi = s ? s.pi : b.pi;
    const fi = s ? s.fi : b.fi;
    const p = b.p[pi];
    const f = b.f[fi];
    const pHp = s ? s.pHp : p.hp;
    const fHp = s ? s.fHp : f.hp;
    const pSt = s ? s.pSt : p.st;
    const fSt = s ? s.fSt : f.st;
    const fGone = s ? s.fGone : b.over === 'caught';
    const fx = this.fx;
    const hitP = fx && fx.side === 'p' && (fx.fx === 'hit' || fx.fx === 'faint') ? (fx.fx === 'faint' ? 'faint' : 'shake') : '';
    const hitF = fx && fx.side === 'f' && (fx.fx === 'hit' || fx.fx === 'faint') ? (fx.fx === 'faint' ? 'faint' : 'shake') : '';
    const fShake = fx && fx.fx === 'shake' ? 'charm-shake' : '';
    const float = (side: 'p' | 'f'): string => {
      if (!fx || fx.side !== side || !fx.dmg) return '';
      const heal = fx.fx === 'heal';
      const cls = heal ? 'heal' : fx.crit ? 'crit' : (fx.eff ?? 1) > 1 ? 'super' : (fx.eff ?? 1) < 1 ? 'weak' : '';
      return `<span class="float ${cls}">${heal ? '+' : '-'}${fx.dmg}${fx.crit ? '!' : ''}</span>`;
    };
    const party = (list: Mon[]): string => list.map((m) => `<span class="pip ${m.hp > 0 ? '' : 'out'}"></span>`).join('');
    const animating = !!this.anim;
    const busy = animating || !!b.over;
    let panel = '';
    if (b.over && !animating) {
      const txt = { win: '🏆 You won!', lose: '💀 Your team is gone…', caught: `🔮 ${SPECIES[f.sp].name} was tamed!`, fled: '💨 Got away safely.' }[b.over];
      panel = `<div class="over"><b>${txt}</b><button class="primary" data-act="next">Continue ⏎</button></div>`;
    } else if (b.mustSwitch && !animating) {
      panel = `<div class="over"><b>Choose your next creature.</b>${this.switchList(b, true)}</div>`;
    } else {
      const moves = p.moves
        .map((id, i) => {
          const mv = MOVES[id];
          const eff = mv.power > 0 ? effectiveness(mv.type, SPECIES[f.sp].types) : 1;
          const effTxt = mv.power > 0 && eff !== 1 ? (eff > 1 ? ' · <em class="good">Super</em>' : ' · <em class="bad">Weak</em>') : '';
          return `<button class="move" style="--tc:${TYPE_INFO[mv.type].color}" data-act="move" data-i="${i}" ${busy ? 'disabled' : ''} title="${moveText(mv)}">${moveBtnInner(id, effTxt)}<kbd>${i + 1}</kbd></button>`;
        })
        .join('');
      panel = `<div class="moves">${moves}</div>
        <div class="acts">
          <button data-act="team" ${busy ? 'disabled' : ''}>🔁 Team <kbd>S</kbd></button>
          <button data-act="bag" ${busy ? 'disabled' : ''}>🎒 Bag <kbd>B</kbd></button>
          <button data-act="run" ${busy || !isWild(b) ? 'disabled' : ''}>💨 Run <kbd>R</kbd></button>
        </div>`;
    }
    const title = isWild(b) ? (b.kind === 'rare' ? '✨ A rare creature appears!' : '🌿 A wild creature appears!') : `${b.icon} ${esc(b.name)}${b.kind === 'gym' ? ' — Gym Leader' : b.kind === 'champion' ? '' : ''}`;
    const reg = REGIONS[Math.min(this.run!.region, 4)];
    return `<div class="battle">
      <div class="arena" style="--rb:${reg.bg}">
        <div class="b-title">${title}</div>
        <div class="foe-side">
          <div class="b-card"><b>${monName(f)}</b> <small>Lv ${f.lvl}</small> ${statusChip(fSt)}<div>${SPECIES[f.sp].types.map(typeChip).join(' ')}</div>${hpBar(fHp, maxHp(f))}${isWild(b) ? '' : `<div class="party">${party(b.f)}</div>`}</div>
          <div class="b-spot">${fGone ? '<span class="charm-big">🔮</span>' : sprite(f.sp, 'lg', `${hitF} ${fShake}`)}${float('f')}</div>
        </div>
        <div class="me-side">
          <div class="b-spot">${sprite(p.sp, 'lg', `back ${hitP}`)}${float('p')}</div>
          <div class="b-card"><b>${monName(p)}</b> <small>Lv ${p.lvl}</small> ${statusChip(pSt)}<div>${SPECIES[p.sp].types.map(typeChip).join(' ')}</div>${hpBar(pHp, maxHp(p))}<div class="party">${party(b.p)}</div></div>
        </div>
      </div>
      <div class="logline">${esc(this.line || (b.mustSwitch ? 'Your creature fainted.' : `What will ${SPECIES[p.sp].name} do?`))}</div>
      <div class="b-panel">${panel}</div>
    </div>`;
  }

  private switchList(b: Battle, forced: boolean): string {
    return `<div class="switch-list">${b.p
      .map((m, i) => {
        const can = m.hp > 0 && i !== b.pi;
        return `<button class="team-mon" data-act="switch" data-i="${i}" ${can ? '' : 'disabled'}>${sprite(m.sp, 'sm')}<span class="tm-body"><b>${monName(m)}</b> <small>Lv ${m.lvl}</small> ${statusChip(m.st)}${hpBar(m.hp, maxHp(m), true)}</span>${i === b.pi && !forced ? '<span class="dim">active</span>' : ''}</button>`;
      })
      .join('')}</div>`;
  }

  private learnView(sc: Extract<Scene, { k: 'learn' }>): string {
    const m = this.run!.team.find((x) => x.uid === sc.uid);
    if (!m) return `<div class="panel notice"><button class="primary" data-act="learn" data-slot="-1">Continue</button></div>`;
    const mv = MOVES[sc.move];
    const cur = m.moves
      .map((id, i) => `<button class="move" style="--tc:${TYPE_INFO[MOVES[id].type].color}" data-act="learn" data-slot="${i}" title="${moveText(MOVES[id])}">${moveBtnInner(id)}<small class="bad">Forget</small></button>`)
      .join('');
    return `<div class="panel notice">
      ${sprite(m.sp, 'lg')}
      <h2>${SPECIES[m.sp].name} wants to learn ${mv.name}</h2>
      <div class="new-move" style="--tc:${TYPE_INFO[mv.type].color}">${moveBtnInner(sc.move)}<p>${moveText(mv)}</p></div>
      <p class="sub">It already knows 4 moves. Pick one to forget.</p>
      <div class="moves">${cur}</div>
      <button data-act="learn" data-slot="-1">Don't learn ${mv.name}</button>
    </div>`;
  }

  private fullView(n: Mon): string {
    const r = this.run!;
    const list = r.team.map((m, i) => `<button class="team-mon" data-act="keep" data-slot="${i}">${sprite(m.sp, 'sm')}<span class="tm-body"><b>${monName(m)}</b> <small>Lv ${m.lvl}</small>${hpBar(m.hp, maxHp(m), true)}</span><small class="bad">Release</small></button>`).join('');
    return `<div class="panel notice"><h2>Your team is full</h2>
      ${this.monCard(n)}
      <p class="sub">Release one creature to make room for ${SPECIES[n.sp].name}, or let it go.</p>
      <div class="switch-list">${list}</div>
      <button data-act="keep" data-slot="-1">Let ${SPECIES[n.sp].name} go</button></div>`;
  }

  private townView(sc: Extract<Scene, { k: 'town' }>): string {
    const r = this.run!;
    const t = sc.town;
    const shop = t.shop
      .map((id) => {
        const it = ITEMS[id];
        return `<button class="shop-item" data-act="buy" data-id="${id}" ${r.gold >= it.price ? '' : 'disabled'}><span class="big">${it.icon}</span><b>${it.name}</b><small>${it.text}</small><span class="price">💰 ${it.price}</span><span class="own">Have ${count(r, id)}</span></button>`;
      })
      .join('');
    const cost = TUTOR_COST(r.region);
    const tutor = t.tutor
      .map((id) => {
        const mv = MOVES[id];
        const who = r.team.filter((m) => canLearn(m, id)).length;
        return `<button class="move tutor" style="--tc:${TYPE_INFO[mv.type].color}" data-act="tutor" data-move="${id}" ${r.gold >= cost && who ? '' : 'disabled'} title="${moveText(mv)}">${moveBtnInner(id)}<small>${moveText(mv)}</small><small class="dim">${who ? `${who} can learn` : 'Nobody can learn'}</small></button>`;
      })
      .join('');
    return `<div class="town">
      <h2>🏘️ ${REGIONS[r.region].name} Town</h2>
      <div class="town-grid">
        <section class="panel"><h3>💗 Healer</h3><p class="sub">Free. Heals every creature and cures status.</p><button class="primary" data-act="heal">Heal team</button></section>
        <section class="panel"><h3>⛩️ Fusion shrine</h3><p class="sub">Merge 2 creatures into 1. The base gets ★ (+10% stats, max ${MAX_FUSED}), a level above both, and the donor's strongest attack. Once per town.</p>
          <button data-act="fuse" ${t.fused || r.team.length < 2 ? 'disabled' : ''}>${t.fused ? 'Used' : 'Fuse creatures'}</button></section>
      </div>
      <h3>🛒 Shop</h3><div class="shop">${shop}</div>
      <h3>📜 Move tutor <small class="dim">💰 ${cost} per move</small></h3><div class="tutors">${tutor}</div>
      <h3>Team</h3>${this.teamList()}
      <button class="primary leave" data-act="leave">Leave town ➜</button>
    </div>`;
  }

  private endView(sc: Extract<Scene, { k: 'end' }>): string {
    const r = this.run!;
    const team = r.team.map((m) => `<span class="end-mon">${sprite(m.sp, 'sm')}<small>${SPECIES[m.sp].name} ${m.lvl}</small></span>`).join('');
    const lost = r.lost.map((m) => `<span class="end-mon lost">${sprite(m.sp, 'sm')}<small>${SPECIES[m.sp].name} ${m.lvl}</small></span>`).join('');
    return `<div class="panel notice end pop">
      <div class="huge">${sc.victory ? '👑' : '🪦'}</div>
      <h1>${sc.victory ? 'Champion!' : 'Run over'}</h1>
      <p>${sc.victory ? 'You beat the Champion with your team.' : `Your last creature fainted in ${REGIONS[Math.min(r.region, 4)].name}.`}</p>
      <p class="score">Score <b>${sc.score}</b> · 💎 +${sc.shards} shards</p>
      <p class="dim">Badges ${r.badges} · Battles ${r.battles} · Species tamed ${r.dex.length}</p>
      ${team ? `<h3>Team</h3><div class="end-team">${team}</div>` : ''}
      ${lost ? `<h3>Lost on the way</h3><div class="end-team">${lost}</div>` : ''}
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    const r = this.run;
    const wrap = (inner: string): string => `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>${inner}</div></div>`;
    if (m.kind === 'help') {
      const chart = (Object.keys(TYPE_INFO) as Type[])
        .map((t) => {
          const strong = (Object.keys(TYPE_INFO) as Type[]).filter((d) => effectiveness(t, [d]) > 1).map((d) => TYPE_INFO[d].icon).join('');
          const weak = (Object.keys(TYPE_INFO) as Type[]).filter((d) => effectiveness(t, [d]) < 1).map((d) => TYPE_INFO[d].icon).join('');
          return `<tr><td>${typeChip(t)}</td><td>${strong || '–'}</td><td>${weak || '–'}</td></tr>`;
        })
        .join('');
      return wrap(`<h2>How to play</h2>
        <ul>
          <li><b>Goal:</b> cross 5 regions. Beat the 4 gym leaders, then the Champion.</li>
          <li><b>Map:</b> each step offers 2–3 paths: 🌿 wild creatures, ✨ rare dens, 🧢 trainers, 🎁 supplies, 🏕️ rest spots. Every region has a 🏘️ town and ends with a gym.</li>
          <li><b>Battle:</b> pick a move (keys 1–4). The faster creature acts first. Moves can miss, crit (×1.5) and cause status: burn, poison, sleep, paralysis. Same-type moves deal ×1.5.</li>
          <li><b>Taming:</b> weaken a wild creature, then throw a charm from the 🎒 bag. Low HP and status make it easier. Your team holds 6.</li>
          <li><b>Permadeath:</b> a creature that faints is gone for the rest of the run. If all faint, the run ends.</li>
          <li><b>Growth:</b> creatures gain XP, learn moves (you pick which to forget) and evolve. Benched creatures get 60% XP.</li>
          <li><b>Town:</b> free healer, shop, move tutor and the fusion shrine.</li>
          <li><b>Keys:</b> 1–4 moves or paths, S team, B bag, R run, Enter continue, Esc close.</li>
        </ul>
        <h3>Type chart</h3>
        <table class="chart"><tr><th>Attack</th><th>Strong vs ×2</th><th>Weak vs ×½</th></tr>${chart}</table>
        <button class="primary" data-act="modal-close">Got it</button>`);
    }
    if (m.kind === 'menu') {
      return wrap(`<h2>Menu</h2>
        <button data-act="modal-close">Resume</button>
        ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
        <button data-act="title">Title screen (keeps the run)</button>`);
    }
    if (!r) return '';
    if (m.kind === 'mon') {
      const mon = r.team.find((x) => x.uid === m.uid);
      if (!mon) return '';
      const s = SPECIES[mon.sp];
      const nat = NATURES[mon.nat];
      const field = r.scene.k === 'map' || r.scene.k === 'town';
      const items = field
        ? (['potion', 'tonic', 'cure', 'candy'] as ItemId[])
            .map((id) => `<button data-act="use" data-id="${id}" data-uid="${mon.uid}" ${count(r, id) > 0 ? '' : 'disabled'}>${ITEMS[id].icon} ${ITEMS[id].name} (${count(r, id)})</button>`)
            .join('')
        : '';
      const moves = mon.moves.map((id) => `<div class="move static" style="--tc:${TYPE_INFO[MOVES[id].type].color}">${moveBtnInner(id)}<small>${moveText(MOVES[id])}</small></div>`).join('');
      const next = s.evo ? `Evolves into ${SPECIES[s.evo.to].name} at Lv ${s.evo.lvl}.` : 'Final form.';
      return wrap(`<div class="mon-head">${sprite(mon.sp, 'lg')}<div><h2>${monName(mon)} <small>Lv ${mon.lvl}</small></h2>${s.types.map(typeChip).join(' ')} ${statusChip(mon.st)}
          <p class="dim">${nat.name} nature${nat.up ? ` (+${nat.up.toUpperCase()} −${nat.down!.toUpperCase()})` : ''} · ${next}</p></div></div>
        ${hpBar(mon.hp, maxHp(mon))}
        <div class="xp"><div style="width:${(100 * mon.xp) / xpNeed(mon.lvl)}%"></div></div>
        <p class="statline">ATK ${stat(mon, 'atk')} · DEF ${stat(mon, 'def')} · SPD ${stat(mon, 'spd')} · XP ${mon.xp}/${xpNeed(mon.lvl)}</p>
        <div class="moves">${moves}</div>
        ${field ? `<div class="use-row">${items}</div>${r.team[0] !== mon ? `<button data-act="lead" data-uid="${mon.uid}">⬆ Make lead</button>` : ''}` : ''}
        <button class="primary" data-act="modal-close">Close</button>`);
    }
    if (m.kind === 'team' && r.scene.k === 'battle') {
      return wrap(`<h2>Switch creature</h2><p class="sub">Switching takes your turn.</p>${this.switchList(r.scene.b, false)}<button data-act="modal-close">Cancel</button>`);
    }
    if (m.kind === 'bag' && r.scene.k === 'battle') {
      const b = r.scene.b;
      const items = ITEM_IDS.filter((id) => ITEMS[id].battle && count(r, id) > 0)
        .map((id) => {
          const it = ITEMS[id];
          const ok = !it.charm || isWild(b);
          return `<button class="shop-item" data-act="item" data-id="${id}" ${ok ? '' : 'disabled'}><span class="big">${it.icon}</span><b>${it.name} ×${count(r, id)}</b><small>${ok ? it.text : 'Only on wild creatures.'}</small></button>`;
        })
        .join('');
      return wrap(`<h2>Bag</h2><div class="shop">${items || '<p class="dim">No usable items.</p>'}</div><button data-act="modal-close">Cancel</button>`);
    }
    if (m.kind === 'tutor') {
      const mv = MOVES[m.move];
      if (m.uid === null) {
        const list = r.team
          .map((x) => `<button class="team-mon" data-act="tutor-mon" data-uid="${x.uid}" ${canLearn(x, m.move) ? '' : 'disabled'}>${sprite(x.sp, 'sm')}<span class="tm-body"><b>${monName(x)}</b> <small>Lv ${x.lvl}</small><small class="dim">${x.moves.map((id) => MOVES[id].name).join(', ')}</small></span></button>`)
          .join('');
        return wrap(`<h2>Teach ${mv.name}</h2><p class="sub">Creatures learn moves of their own types, their second pool, and Beast moves.</p><div class="switch-list">${list}</div><button data-act="modal-close">Cancel</button>`);
      }
      const x = r.team.find((q) => q.uid === m.uid)!;
      const slots = x.moves.map((id, i) => `<button class="move" style="--tc:${TYPE_INFO[MOVES[id].type].color}" data-act="tutor-slot" data-slot="${i}">${moveBtnInner(id)}<small class="bad">Forget</small></button>`).join('');
      return wrap(`<h2>${SPECIES[x.sp].name}: forget which move?</h2><div class="moves">${slots}</div><button data-act="modal-close">Cancel</button>`);
    }
    if (m.kind === 'fuse') {
      const list = r.team
        .map((x) => {
          const dis = m.a === null ? x.fused >= MAX_FUSED : x.uid === m.a;
          return `<button class="team-mon ${m.a === x.uid ? 'sel' : ''}" data-act="fuse-pick" data-uid="${x.uid}" ${dis ? 'disabled' : ''}>${sprite(x.sp, 'sm')}<span class="tm-body"><b>${monName(x)}</b> <small>Lv ${x.lvl}</small></span></button>`;
        })
        .join('');
      return wrap(`<h2>Fusion shrine</h2><p class="sub">${m.a === null ? 'Step 1: pick the base creature. It stays.' : 'Step 2: pick the donor. It is gone after the fusion.'}</p><div class="switch-list">${list}</div><button data-act="modal-close">Cancel</button>`);
    }
    return '';
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.modal) {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.modal || this.screen !== 'run' || !this.run) return;
    const sc = this.run.scene;
    const k = e.key.toLowerCase();
    const n = Number(e.key);
    if (k === 'enter' || k === ' ') {
      const btn = this.root.querySelector<HTMLElement>('[data-act="next"]');
      if (btn) {
        e.preventDefault();
        btn.click();
      }
      return;
    }
    if (sc.k === 'battle' && !this.anim && !sc.b.over && !sc.b.mustSwitch) {
      if (n >= 1 && n <= 4) this.root.querySelector<HTMLElement>(`[data-act="move"][data-i="${n - 1}"]`)?.click();
      else if (k === 's') this.root.querySelector<HTMLElement>('[data-act="team"]')?.click();
      else if (k === 'b') this.root.querySelector<HTMLElement>('[data-act="bag"]')?.click();
      else if (k === 'r') this.root.querySelector<HTMLElement>('[data-act="run"]:not([disabled])')?.click();
    } else if (sc.k === 'map' && n >= 1 && n <= 3) this.root.querySelector<HTMLElement>(`[data-act="node"][data-i="${n - 1}"]`)?.click();
    else if (sc.k === 'starter' && n >= 1 && n <= 3) this.root.querySelector<HTMLElement>(`[data-act="starter"][data-i="${n - 1}"]`)?.click();
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if ((el as HTMLButtonElement).disabled) return;
    this.action(el.dataset.act, el.dataset);
  }

  /** Apply a run action, play its log, save. */
  private dispatch(a: Action): boolean {
    const r = this.run;
    if (!r || this.anim) return false;
    const before = r.scene.k;
    const levelsBefore = r.team.map((m) => m.lvl).join();
    const res = act(r, a);
    if (!res.ok) {
      if (res.msg) this.toast(res.msg);
      sfx.deny();
      return false;
    }
    if (res.msg) this.toast(res.msg);
    if (r.scene.k === 'end') {
      if (!r.recorded) {
        recordEnd(r, this.meta);
        saveMeta(this.meta);
        clearRun();
        if (r.scene.victory) sfx.win();
        else sfx.lose();
      }
    } else saveRun(r);
    if (r.scene.k === 'evolve' && before !== 'evolve') sfx.evolve();
    else if (r.team.map((m) => m.lvl).join() !== levelsBefore) sfx.level();
    if (res.log?.length) this.play(res.log);
    else this.render();
    return true;
  }

  private play(log: LogEntry[]): void {
    const show = (e: LogEntry): void => {
      this.snap = e.snap;
      this.line = e.text;
      this.fx = e;
      if (e.fx === 'hit') {
        if (e.crit) sfx.crit();
        if ((e.eff ?? 1) > 1) sfx.super();
        else if ((e.eff ?? 1) < 1) sfx.weak();
        else sfx.hit();
      } else if (e.fx === 'miss') sfx.miss();
      else if (e.fx === 'faint') sfx.faint();
      else if (e.fx === 'status') sfx.status();
      else if (e.fx === 'boost') sfx.boost();
      else if (e.fx === 'heal') sfx.heal();
      else if (e.fx === 'switch') sfx.swap();
      else if (e.fx === 'shake') sfx.shake();
      else if (e.fx === 'catch') sfx.caught();
      else if (e.fx === 'escape') sfx.escape();
      else if (e.text.startsWith('You threw')) sfx.throw();
    };
    if (FAST) {
      const last = log[log.length - 1];
      this.line = last.text;
      this.fx = null;
      this.snap = null;
      this.render();
      return;
    }
    this.anim = { log, i: 0, timer: 0 };
    const tick = (): void => {
      const an = this.anim;
      if (!an) return;
      if (an.i >= an.log.length) {
        this.anim = null;
        this.snap = null;
        this.fx = null;
        this.render();
        return;
      }
      show(an.log[an.i]);
      an.i++;
      this.render();
      an.timer = window.setTimeout(tick, an.log[an.i - 1].fx === 'info' ? STEP_MS * 0.7 : STEP_MS);
    };
    tick();
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
        if (r && r.scene.k !== 'end') {
          r.queue = [];
          const s = score(r, false);
          r.scene = { k: 'end', victory: false, score: s, shards: Math.floor(s / 150) };
          recordEnd(r, this.meta);
          saveMeta(this.meta);
          clearRun();
          sfx.lose();
        }
        this.modal = null;
        this.stopAnim();
        this.render();
        return;
      case 'title':
        this.modal = null;
        this.stopAnim();
        if (r && r.scene.k === 'end') this.run = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta.unlocked);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.screen = 'run';
        this.line = '';
        sfx.click();
        this.render();
        return;
      case 'continue':
        this.screen = 'run';
        this.render();
        return;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === d.id);
        if (!u || this.meta.shards < u.cost || this.meta.unlocked.includes(u.id)) return sfx.deny();
        this.meta.shards -= u.cost;
        this.meta.unlocked.push(u.id);
        saveMeta(this.meta);
        sfx.caught();
        this.toast(`${SPECIES[u.id].name} unlocked!`);
        this.render();
        return;
      }
      case 'mon':
        this.modal = { kind: 'mon', uid: +d.uid! };
        sfx.click();
        this.render();
        return;
      case 'team':
        this.modal = { kind: 'team' };
        this.render();
        return;
      case 'bag':
        this.modal = { kind: 'bag' };
        this.render();
        return;
    }
    if (!r) return;
    switch (act) {
      case 'starter':
        sfx.caught();
        this.dispatch({ t: 'starter', i: +d.i! });
        return;
      case 'node':
        sfx.click();
        this.line = '';
        this.dispatch({ t: 'node', i: +d.i! });
        return;
      case 'move':
        this.dispatch({ t: 'move', i: +d.i! });
        return;
      case 'switch':
        this.modal = null;
        this.dispatch({ t: 'switch', i: +d.i! });
        return;
      case 'item':
        this.modal = null;
        this.dispatch({ t: 'item', id: d.id as ItemId });
        return;
      case 'run':
        this.dispatch({ t: 'run' });
        return;
      case 'next':
        this.line = '';
        sfx.click();
        this.dispatch({ t: 'next' });
        return;
      case 'learn':
        this.dispatch({ t: 'learn', slot: +d.slot! });
        return;
      case 'keep':
        this.dispatch({ t: 'keep', slot: +d.slot! });
        return;
      case 'heal':
        if (this.dispatch({ t: 'heal' })) sfx.heal();
        return;
      case 'buy':
        if (this.dispatch({ t: 'buy', id: d.id as ItemId })) sfx.coin();
        return;
      case 'leave':
        this.dispatch({ t: 'leave' });
        return;
      case 'use':
        if (this.dispatch({ t: 'use', id: d.id as ItemId, uid: +d.uid! })) sfx.heal();
        return;
      case 'lead':
        this.modal = null;
        this.dispatch({ t: 'lead', uid: +d.uid! });
        return;
      case 'tutor':
        this.modal = { kind: 'tutor', move: d.move!, uid: null };
        this.render();
        return;
      case 'tutor-mon': {
        const m = this.modal;
        if (m?.kind !== 'tutor') return;
        const mon = r.team.find((x) => x.uid === +d.uid!)!;
        if (mon.moves.length < 4) {
          this.modal = null;
          if (this.dispatch({ t: 'tutor', move: m.move, uid: mon.uid, slot: -1 })) sfx.level();
        } else {
          this.modal = { ...m, uid: mon.uid };
          this.render();
        }
        return;
      }
      case 'tutor-slot': {
        const m = this.modal;
        if (m?.kind !== 'tutor' || m.uid === null) return;
        this.modal = null;
        if (this.dispatch({ t: 'tutor', move: m.move, uid: m.uid, slot: +d.slot! })) sfx.level();
        return;
      }
      case 'fuse':
        this.modal = { kind: 'fuse', a: null };
        this.render();
        return;
      case 'fuse-pick': {
        const m = this.modal;
        if (m?.kind !== 'fuse') return;
        if (m.a === null) {
          this.modal = { kind: 'fuse', a: +d.uid! };
          sfx.click();
          this.render();
        } else {
          this.modal = null;
          if (this.dispatch({ t: 'fuse', a: m.a, b: +d.uid! })) sfx.evolve();
        }
        return;
      }
    }
  }

  private stopAnim(): void {
    if (this.anim) window.clearTimeout(this.anim.timer);
    this.anim = null;
    this.snap = null;
    this.fx = null;
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.run;
        const sc = r?.scene;
        const screen = this.screen === 'title' || !r ? 'title' : sc!.k;
        return {
          screen,
          modal: this.modal?.kind ?? null,
          busy: !!this.anim,
          region: r?.region,
          step: r?.step,
          badges: r?.badges,
          gold: r?.gold,
          team: r?.team.map((m) => `${m.sp} ${m.lvl} ${m.hp}/${maxHp(m)}`),
          battle: sc?.k === 'battle' ? { kind: sc.b.kind, turn: sc.b.turn, over: sc.b.over, foe: `${sc.b.f[sc.b.fi].sp} ${sc.b.f[sc.b.fi].hp}` } : null,
          end: sc?.k === 'end' ? sc : null,
        };
      },
      gold: (n: number) => {
        if (this.run) this.run.gold += n;
        this.render();
      },
      shards: (n: number) => {
        this.meta.shards += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action for automatic tests. */
      step: () => {
        if (this.anim) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.screen === 'title' || !this.run) {
          this.action('new', {});
          return 'new';
        }
        const a = botAction(this.run, 'smart');
        if (!a) return 'end';
        if (!this.dispatch(a)) {
          // Fallback so the bot never gets stuck.
          const sc = this.run.scene.k;
          this.dispatch(sc === 'battle' ? { t: 'move', i: 0 } : sc === 'town' ? { t: 'leave' } : sc === 'map' ? { t: 'node', i: 0 } : { t: 'next' });
        }
        return a.t;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
