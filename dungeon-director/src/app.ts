import { chooseCard, chooseShop, cardValue } from './bot';
import { BOSSES, CARDS, DUNGEONS, HEROES, HERO_IDS, ROOMS, SERVICES, TARGET, ZONE, ZONE_OUT, allCard, type Card, type ServiceId } from './data';
import { face, type Outcome } from './hero';
import { Rng, hash, randomSeedText } from './rng';
import {
  MIN_DECK,
  PASS,
  STAR_PCT,
  TRUST,
  buyCard,
  buyService,
  clearRun,
  dungeonPct,
  loadMeta,
  loadRun,
  newRun,
  nextDungeon,
  playCard,
  preview,
  recordEnd,
  saveRun,
  servicePrice,
  targetAt,
  unlockedHeroes,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'intro' | 'play' | 'review' | 'shop' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'deck' } | { kind: 'cut' };

const Q = new URLSearchParams(location.search);
/** `?debug&fast` skips animation waits, for bot tests. */
const FAST = Q.has('fast');
const WALK = FAST ? 0 : 650;

const KIND_LABEL: Record<string, string> = {
  empty: 'Empty',
  fight: 'Fight',
  loot: 'Loot',
  rest: 'Rest',
  trap: 'Trap',
  mystery: 'Mystery',
  boss: 'Boss',
};

const END_TEXT: Record<string, [string, string]> = {
  won: ['🏆 Five-star director!', 'Five dungeons, one happy hero. The guild gives you a statue.'],
  dead: ['💀 The hero died', 'Your dungeon was too deadly. Heroes are hard to replace.'],
  quit: ['😱 The hero quit', 'Too much stress. The hero ran out screaming.'],
  bored: ['🥱 The hero left', 'Too dull. The hero went home to take a nap.'],
  fired: ['📉 You are fired', 'Too many weak dungeons. The guild found a new director.'],
  abandon: ['🚪 Run abandoned', 'You closed the dungeon early.'],
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const sign = (v: number): string => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`);

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private busyUntil = 0;
  private last: Outcome | null = null;
  private walkFrom = 0;
  private bubbleKey = 0;
  private endInfo: { stars: number; newHero: string | null } | null = null;
  private hover = -1;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerover', (e) => this.onHover(e));
    root.addEventListener('focusin', (e) => this.onHover(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (Q.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Render ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'intro':
        body = this.introView();
        break;
      case 'play':
        body = this.playView();
        break;
      case 'review':
        body = this.reviewView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') this.afterPlayRender();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const h = r.hero;
    const t = HEROES[h.type];
    return `<header class="top">
      <span class="who" title="${esc(t.title)}">${t.icon} <b class="hide-sm">${esc(t.name)}</b></span>
      <span title="Hero HP">❤️ ${Math.max(0, h.hp)}/${h.maxHp}</span>
      <span title="Gear: lowers damage">🗡️ ${Math.round(h.gear)}</span>
      <span title="Renown: spend it in the shop">🏆 ${r.renown}</span>
      <span title="Guild trust. A dungeon under ${PASS}★ costs 1. At 0 you are fired.">${'🤝'.repeat(Math.max(0, r.trust))}${'▫️'.repeat(Math.max(0, TRUST - r.trust))}</span>
      <span title="Dungeon">🏰 ${Math.min(r.level + 1, DUNGEONS)}/${DUNGEONS}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play (H)">?</button>
      <button class="icon-btn" data-act="mute" title="Sound (M)">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const heroes = HERO_IDS.map((id) => {
      const t = HEROES[id];
      const open = t.unlock <= m.stars;
      return `<div class="arm ${open ? '' : 'locked'}"><span class="big">${open ? t.icon : '🔒'}</span><span><b>${esc(t.title)}</b><small>${open ? esc(t.likes) : `Unlocks at ${t.unlock} ⭐`}</small></span></div>`;
    }).join('');
    const lockedCards = Object.values(CARDS).filter((c) => c.unlock > m.stars);
    const next = lockedCards.length
      ? `<p class="dim">Next card unlocks: ${lockedCards
          .sort((a, b) => a.unlock - b.unlock)
          .slice(0, 4)
          .map((c) => `${c.icon} ${esc(c.name)} (${c.unlock} ⭐)`)
          .join(' · ')}</p>`
      : '<p class="dim">All room cards unlocked.</p>';
    return `<div class="title">
      <div class="logo">🎬</div>
      <h1>Dungeon Director</h1>
      <p class="sub">You do not fight. A hero bot walks your dungeon, and you place the next room in front of it. Keep the hero's fun on the curve: rising tension, a short release, a peak at the boss.</p>
      <div class="row">
        ${this.run ? `<button class="primary" data-act="continue">Continue run (dungeon ${this.run.level + 1})</button><button data-act="new">New run</button>` : '<button class="primary" data-act="new">New run</button>'}
        <button data-act="help">How to play</button>
      </div>
      <p class="stats">⭐ ${m.stars} stars · ${m.runs} runs · ${m.wins} wins · best score ${m.best}</p>
      <h3>Heroes</h3>
      <div class="armory">${heroes}</div>
      ${next}
      <button class="icon-btn" data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
    </div>`;
  }

  private introView(): string {
    const r = this.run!;
    const t = HEROES[r.hero.type];
    return `<div class="intro">
      <p class="dim">Your hero for this run</p>
      <div class="hero-card">
        <div class="portrait">${t.icon}</div>
        <h2>${esc(t.name)}</h2>
        <p class="tag">${esc(t.title)} · ❤️ ${t.hp} · 🗡️ ${t.gear}</p>
        <p>${esc(t.profile)}</p>
        <p class="good">👍 ${esc(t.likes)}</p>
        <p class="bad">👎 ${esc(t.dislikes)}</p>
        <div class="feel">${this.feelChips(r)}</div>
      </div>
      <p class="hint">Each room card shows what it will do to <b>this</b> hero. Read the numbers before you place a room.</p>
      <button class="primary" data-act="start">Open dungeon 1 ▶</button>
    </div>`;
  }

  /** Short summary of what moves this hero's fun. */
  private feelChips(r: RunState): string {
    const t = HEROES[r.hero.type];
    const f = t.feel;
    const bar = (v: number): string => '●'.repeat(Math.max(1, Math.round(v / 2)));
    return `<span title="Fun per danger point">⚔️ ${bar(f.danger)}</span>
      <span title="Fun per loot point">💰 ${bar(f.loot)}</span>
      <span title="Fun per surprise point">❓ ${bar(f.surprise)}</span>
      <span title="Fun lost per rest point">🛏️ −${bar(f.rest)}</span>
      <span title="Bored below this fun">💤 below ${t.boreLine}</span>
      <span title="Monster power above this adds stress">😰 above ${t.nerve} power</span>`;
  }

  // ---------- Play ----------

  private playView(): string {
    const r = this.run!;
    const h = r.hero;
    const t = HEROES[h.type];
    const pct = dungeonPct(r);
    return `<div class="play">
      <section class="panel hero-panel">
        <div class="hero-head">
          <div class="portrait sm" id="face">${face(h)}<span class="type">${t.icon}</span></div>
          <div class="bubble ${this.bubbleKey ? 'pop' : ''}" id="bubble">${esc(r.thought)}</div>
        </div>
        ${this.meters(r)}
        <details class="profile"><summary>${esc(t.title)}: likes ${esc(t.likes.toLowerCase())}</summary>
          <p>${esc(t.profile)}</p><p class="bad">👎 ${esc(t.dislikes)}</p><div class="feel">${this.feelChips(r)}</div></details>
        <div id="floats" class="floats"></div>
      </section>
      <section class="panel graph-panel">
        <div class="ghead"><b>Fun curve</b><span class="dim">Dungeon ${r.level + 1} · room ${Math.min(r.step + 1, ROOMS + 1)}/${ROOMS + 1} · on curve ${pct}%</span></div>
        ${this.graph(r, true)}
        ${this.pathView(r)}
      </section>
      <section class="hand-wrap">
        <div class="ghead"><b>${r.step >= ROOMS ? '👑 Pick the boss' : 'Place the next room'}</b><button class="link-btn" data-act="deck">Deck: ${r.pile.length} left</button></div>
        <div class="hand">${r.hand.map((id, i) => this.cardView(r, id, i)).join('')}</div>
      </section>
    </div>`;
  }

  private meters(r: RunState): string {
    const h = r.hero;
    const row = (icon: string, name: string, v: number, cls: string, note: string, d?: number): string => `
      <div class="meter ${cls}" title="${esc(note)}">
        <span class="ml">${icon} ${name}</span>
        <span class="mbar"><i style="width:${Math.round(v)}%"></i></span>
        <span class="mv">${Math.round(v)}${d !== undefined && Math.round(d) !== 0 ? `<small class="${(cls === 'delight') === d > 0 ? 'good' : 'bad'}">${sign(d)}</small>` : ''}</span>
      </div>`;
    const o = this.last;
    const hpPct = (Math.max(0, h.hp) / h.maxHp) * 100;
    return `<div class="meters">
      ${row('❤️', 'HP', hpPct, 'hp', `HP ${h.hp}/${h.maxHp}. At 0 the hero dies.`, o ? ((o.heal - o.dmg) / h.maxHp) * 100 : undefined)}
      ${row('💤', 'Boredom', h.bore, 'bore', 'At 100 the hero leaves.', o?.d.bore)}
      ${row('😰', 'Stress', h.stress, 'stress', 'At 100 the hero quits.', o?.d.stress)}
      ${row('✨', 'Delight', h.delight, 'delight', 'Delight adds score each room and calms the hero.', o?.d.delight)}
    </div>`;
  }

  private graph(r: RunState, live: boolean): string {
    const W = 320;
    const H = 130;
    const x = (i: number): number => 22 + i * ((W - 34) / (TARGET.length - 1));
    const y = (v: number): number => H - 12 - (v / 100) * (H - 22);
    const band = (d: number): string => {
      const up = TARGET.map((v, i) => `${x(i)},${y(Math.min(100, v + d))}`);
      const dn = TARGET.map((v, i) => `${x(i)},${y(Math.max(0, v - d))}`).reverse();
      return [...up, ...dn].join(' ');
    };
    const tline = TARGET.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const pts = r.path.map((p, i) => ({ x: x(i), y: y(p.fun), fit: p.fit }));
    const start = { x: x(0) - 12, y: y(15) };
    const line = [start, ...pts].map((p) => `${p.x},${p.y}`).join(' ');
    const dots = pts.map((p, i) => `<circle class="dot ${p.fit >= 1 ? 'in' : p.fit > 0 ? 'near' : 'out'} ${live && i === pts.length - 1 && this.last ? 'new' : ''}" cx="${p.x}" cy="${p.y}" r="4"/>`).join('');
    const grid = [25, 50, 75].map((v) => `<line class="grid" x1="16" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="2" y="${y(v) + 3}">${v}</text>`).join('');
    const labels = `<text class="lbl" x="${x(2)}" y="${H - 1}">build-up</text><text class="lbl" x="${x(5) - 8}" y="${H - 1}">release</text><text class="lbl" x="${x(8) - 14}" y="${H - 1}">boss</text>`;
    const cur = live && r.phase === 'play' ? `<line class="now" x1="${x(r.step)}" x2="${x(r.step)}" y1="6" y2="${H - 12}"/>` : '';
    const lastPt = pts.length ? pts[pts.length - 1] : start;
    return `<svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fun graph">
      ${grid}
      <polygon class="outer" points="${band(ZONE_OUT)}"/>
      <polygon class="zone" points="${band(ZONE)}"/>
      <polyline class="target" points="${tline}"/>
      ${cur}
      <polyline class="real" points="${line}"/>
      ${dots}
      <line id="ghost-l" class="ghost" x1="${lastPt.x}" y1="${lastPt.y}" x2="${lastPt.x}" y2="${lastPt.y}" visibility="hidden"/>
      <circle id="ghost" class="ghost" cx="0" cy="0" r="5" visibility="hidden"/>
      ${labels}
    </svg>`;
  }

  private pathView(r: RunState): string {
    const slots: string[] = [];
    for (let i = 0; i <= ROOMS; i++) {
      const p = r.path[i];
      const boss = i === ROOMS;
      let inner = boss ? '👑' : '';
      let cls = boss ? 'boss' : '';
      let title = boss ? `Boss room. One of: ${r.bosses.map((b) => BOSSES[b].name).join(', ')}` : `Room ${i + 1}`;
      if (p) {
        const c = allCard(p.card);
        inner = c.icon;
        cls += ` done ${p.fit >= 1 ? 'in' : p.fit > 0 ? 'near' : 'out'}`;
        title = `${c.name}: fun ${Math.round(p.fun)} (target ${p.target})${p.twist ? ` · ${p.twist}` : ''}`;
      } else if (i === r.step && r.phase === 'play') cls += ' next';
      slots.push(`<div class="slot ${cls}" title="${esc(title)}">${inner}</div>`);
    }
    const pos = Math.min(r.step, ROOMS + 1);
    return `<div class="path" id="path" style="--n:${ROOMS + 1}">
      ${slots.join('')}
      <div class="walker" id="walker" style="--i:${this.walkFrom}" data-to="${Math.max(0, pos - 1)}">${HEROES[r.hero.type].icon}</div>
    </div>`;
  }

  private statChips(c: { danger: number; loot: number; surprise: number; rest: number }): string {
    const chip = (icon: string, v: number, name: string): string => (v > 0 ? `<span class="st" title="${name} ${v}">${icon}${Math.round(v)}</span>` : '');
    return chip('⚔️', c.danger, 'Danger') + chip('💰', c.loot, 'Loot') + chip('❓', c.surprise, 'Surprise') + chip('🛏️', c.rest, 'Rest');
  }

  private cardView(r: RunState, id: string, i: number): string {
    const c = allCard(id);
    const o = preview(r, id);
    const tgt = targetAt(r.step);
    const diff = Math.round(o.hero.fun - tgt);
    const fitCls = o.fit >= 1 ? 'in' : o.fit > 0 ? 'near' : 'out';
    const fitTxt = o.fit >= 1 ? '✔ on the curve' : diff > 0 ? `▲ ${diff} too high` : `▼ ${-diff} too low`;
    const d = o.d;
    const eff = (icon: string, v: number, goodUp: boolean, name: string): string => {
      const n = Math.round(v);
      if (!n) return `<span class="ef zero" title="${name}">${icon} 0</span>`;
      return `<span class="ef ${n > 0 === goodUp ? 'good' : 'bad'}" title="${name}">${icon} ${sign(n)}</span>`;
    };
    const hpD = o.heal - o.dmg;
    let warn = '';
    if (o.end === 'dead') warn = '<div class="warn-line">☠️ Likely deadly!</div>';
    else if (o.end === 'quit') warn = '<div class="warn-line">😱 The hero will quit!</div>';
    else if (o.end === 'bored') warn = '<div class="warn-line">🥱 The hero will leave!</div>';
    else if (o.hero.stress >= 80) warn = '<div class="warn-line soft">Stress gets close to 100</div>';
    else if (o.hero.bore >= 80) warn = '<div class="warn-line soft">Boredom gets close to 100</div>';
    const twist = c.alt ? `<div class="twist">${Math.round(c.alt.chance * 100)}%: ${esc(c.alt.text)}</div>` : '';
    return `<button class="card k-${c.kind}" data-act="play" data-i="${i}" data-fun="${Math.round(o.hero.fun)}">
      <span class="key">${i + 1}</span>
      <div class="ctop"><span class="cicon">${c.icon}</span><span><b>${esc(c.name)}</b><small>${KIND_LABEL[c.kind]}</small></span></div>
      <div class="stats-row">${this.statChips(c)}</div>
      <div class="ctext">${esc(c.text)}</div>${twist}
      <div class="for">For ${HEROES[r.hero.type].icon}:</div>
      <div class="fun ${fitCls}">Fun ${Math.round(o.hero.fun)} <small>/ ${tgt}</small> <em>${fitTxt}</em></div>
      <div class="effects">
        ${eff('💤', d.bore, false, 'Boredom')}${eff('😰', d.stress, false, 'Stress')}${eff('✨', d.delight, true, 'Delight')}${eff('❤️', hpD, true, 'HP')}
      </div>
      ${warn}
    </button>`;
  }

  /** Walk animation, floats and the ghost dot. */
  private afterPlayRender(): void {
    const w = this.root.querySelector<HTMLElement>('#walker');
    if (w) {
      const to = Number(w.dataset.to);
      requestAnimationFrame(() => requestAnimationFrame(() => w.style.setProperty('--i', String(to))));
      this.walkFrom = to;
    }
    const o = this.last;
    if (o && this.bubbleKey && performance.now() < this.busyUntil + 50) {
      const fl: [string, string][] = [];
      if (o.dmg) fl.push([`−${o.dmg} ❤️`, 'bad']);
      if (o.heal && o.hero.hp > 0) fl.push([`+${o.heal} ❤️`, 'good']);
      if (o.gold) fl.push([`+${o.gold} 🪙`, 'gold']);
      if (o.fit >= 1) fl.push(['On the curve!', 'good']);
      if (Math.round(o.d.delight) >= 8) fl.push([`+${Math.round(o.d.delight)} ✨`, 'good']);
      if (Math.round(o.d.stress) >= 10) fl.push([`+${Math.round(o.d.stress)} 😰`, 'bad']);
      if (Math.round(o.d.bore) >= 10) fl.push([`+${Math.round(o.d.bore)} 💤`, 'bad']);
      const box = this.root.querySelector<HTMLElement>('#floats');
      if (box)
        fl.slice(0, 4).forEach(([txt, cls], i) => {
          const el = document.createElement('div');
          el.className = `float ${cls}`;
          el.textContent = txt;
          el.style.animationDelay = `${i * 120}ms`;
          box.appendChild(el);
        });
    }
    if (this.hover >= 0) this.showGhost(this.hover);
  }

  private showGhost(i: number): void {
    const r = this.run;
    const g = this.root.querySelector<SVGCircleElement>('#ghost');
    const gl = this.root.querySelector<SVGLineElement>('#ghost-l');
    const card = this.root.querySelector<HTMLElement>(`.card[data-i="${i}"]`);
    if (!r || !g || !gl || !card) return;
    const fun = Number(card.dataset.fun);
    const W = 320;
    const H = 130;
    const x = 22 + r.step * ((W - 34) / (TARGET.length - 1));
    const y = H - 12 - (fun / 100) * (H - 22);
    g.setAttribute('cx', String(x));
    g.setAttribute('cy', String(y));
    gl.setAttribute('x2', String(x));
    gl.setAttribute('y2', String(y));
    g.setAttribute('visibility', 'visible');
    gl.setAttribute('visibility', 'visible');
  }

  private onHover(e: Event): void {
    if (this.screen !== 'play') return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (!card) return;
    const i = Number(card.dataset.i);
    if (i === this.hover) return;
    this.hover = i;
    this.showGhost(i);
  }

  // ---------- Review, shop, end ----------

  private starRow(n: number): string {
    return `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
  }

  private reviewView(): string {
    const r = this.run!;
    const res = r.results[r.results.length - 1];
    const pass = res.stars >= PASS;
    return `<div class="review">
      <h2>Dungeon ${r.level} review</h2>
      <div class="big-stars">${this.starRow(res.stars)}</div>
      <p>The fun stayed on the curve <b>${res.pct}%</b> of the time. ${pass ? '<span class="good">The guild is happy.</span>' : `<span class="bad">Under ${PASS}★: the guild loses trust (🤝 ${r.trust} left).</span>`}</p>
      <div class="panel">${this.graph(r, false)}${this.pathView(r)}</div>
      <p>🏆 +${res.points} renown · ${HEROES[r.hero.type].icon} “${esc(r.thought)}”</p>
      <p class="dim">The hero rests: +30% HP, stress and boredom drop.</p>
      <button class="primary" data-act="to-shop">To the shop ▶</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const t = HEROES[r.hero.type];
    const cards = r.shop
      .map((s, i) => {
        const c = CARDS[s.id];
        const v = cardValue(r, s.id, true);
        const fitTag = v > 3 ? `<span class="good">👍 ${t.icon} likes it</span>` : v < -2 ? `<span class="bad">👎 ${t.icon} dislikes it</span>` : `<span class="dim">${t.icon} is so-so</span>`;
        return `<button class="shop-card ${s.sold ? 'sold' : ''}" data-act="buy" data-i="${i}" ${s.sold || r.renown < s.price ? 'disabled' : ''}>
          <span class="cicon">${c.icon}</span><b>${esc(c.name)}</b><small>${KIND_LABEL[c.kind]}</small>
          <div class="stats-row">${this.statChips(c)}</div>
          <small>${esc(c.text)}</small>${fitTag}
          <span class="cost">${s.sold ? 'Sold' : `🏆 ${s.price}`}</span>
        </button>`;
      })
      .join('');
    const services = (Object.keys(SERVICES) as ServiceId[])
      .map((id) => {
        const s = SERVICES[id];
        const p = servicePrice(r, id);
        const off = r.renown < p || (id === 'heal' && r.hero.hp >= r.hero.maxHp) || (id === 'cut' && r.deck.length <= MIN_DECK);
        return `<button class="svc" data-act="svc" data-id="${id}" ${off ? 'disabled' : ''}><span class="big">${s.icon}</span><span><b>${s.name}</b><small>${s.text}</small></span><span class="cost">🏆 ${p}</span></button>`;
      })
      .join('');
    return `<div class="shopv">
      <h2>Between dungeons <small>🏆 ${r.renown} renown</small></h2>
      <p class="dim">New rooms go into your deck. ${t.icon} ❤️ ${r.hero.hp}/${r.hero.maxHp} · 😰 ${Math.round(r.hero.stress)} · 💤 ${Math.round(r.hero.bore)}</p>
      <h3>Room cards</h3>
      <div class="shop-row">${cards}</div>
      <h3>Services</h3>
      <div class="svc-row">${services}</div>
      <p class="dim">Deck (${r.deck.length}): ${r.deck.map((id) => CARDS[id].icon).join(' ')}</p>
      <button class="primary" data-act="next">Open dungeon ${r.level + 1} ▶</button>
    </div>`;
  }

  private endView(): string {
    const r = this.run!;
    const [h1, txt] = END_TEXT[r.end ?? 'abandon'];
    const won = r.end === 'won';
    const e = this.endInfo;
    const res = r.results.map((x, i) => `<span class="chip">🏰${i + 1} ${this.starRow(x.stars)}</span>`).join(' ');
    return `<div class="end">
      <h1 class="${won ? 'good' : 'bad'}">${h1}</h1>
      <p>${txt}</p>
      <p>${HEROES[r.hero.type].icon} “${esc(r.thought)}”</p>
      <p class="score">Score <b>${r.score}</b></p>
      <div class="bag">${res || '<span class="dim">No dungeon finished.</span>'}</div>
      ${r.path.length ? `<div class="panel">${this.graph(r, false)}</div>` : ''}
      <p class="dim">Rooms ${r.stats.rooms} · on the curve ${r.stats.inZone} · damage taken ${r.stats.dmg} · loot ${r.stats.loot} 🪙</p>
      ${e ? `<p>⭐ +${e.stars} stars (total ${this.meta.stars})</p>` : ''}
      ${e?.newHero ? `<p class="good">New hero unlocked: ${e.newHero}</p>` : ''}
      <div class="row"><button class="primary" data-act="new">New run</button><button data-act="title">Title screen</button></div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>You do not fight.</b> A hero bot walks your dungeon. Each turn you pick 1 of 3 room cards. The hero walks into it.</li>
          <li><b>Keep the fun on the curve.</b> The graph shows the target: a build-up, a short release, then a peak at the boss. The green band is the zone. The closer the fun dot is to the line, the more points.</li>
          <li><b>Fun</b> comes from danger ⚔️, loot 💰 and surprise ❓. Rest 🛏️ lowers it. Fun carries over a little from the last room, so plan a ramp.</li>
          <li><b>Mood meters.</b> 💤 Boredom at 100: the hero leaves. 😰 Stress at 100: the hero quits. ❤️ HP at 0: the hero dies. Each ends the run. ✨ Delight adds score and calms the hero.</li>
          <li><b>Every hero is different.</b> The knight loves rest and fears big monsters. The barbarian finds rest boring. The rogue wants loot. Each card shows its effect on <b>this</b> hero.</li>
          <li>Hover or focus a card to see its dot on the graph. The same room twice in a row is boring.</li>
          <li><b>Rating.</b> Each dungeon gets 1–5 ★ from the time on the curve (${STAR_PCT.map((p, i) => `${i + 1}★ ${p}%`).join(', ')}). Under ${PASS}★ costs 1 🤝 guild trust. With 0 trust you are fired.</li>
          <li>Room 9 is the boss: pick 1 of 3. Bosses count triple. Monsters get stronger each dungeon.</li>
          <li>Between dungeons, spend renown 🏆 on new room cards, healing, calming tea, gear or cutting a card. Each card is used at most once per dungeon.</li>
          <li>Finish 5 dungeons to win. Stars ⭐ from each run unlock heroes and room cards.</li>
          <li>Keys: <b>1–3</b> place a card, <b>Enter</b> continues, <b>D</b> shows the deck, <b>H</b> help, <b>M</b> mute, <b>Esc</b> menu.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'deck' || m.kind === 'cut') {
      const r = this.run!;
      const list = m.kind === 'cut' ? r.deck : r.pile;
      const items = list
        .map((id, i) => {
          const c = CARDS[id];
          return m.kind === 'cut'
            ? `<button class="deck-item" data-act="cut" data-i="${i}">${c.icon} ${esc(c.name)} <small>${this.statChips(c)}</small></button>`
            : `<div class="deck-item">${c.icon} ${esc(c.name)} <small>${this.statChips(c)}</small></div>`;
        })
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>${m.kind === 'cut' ? '✂️ Cut which card?' : `Cards left this dungeon (${r.pile.length})`}</h2>
        ${m.kind === 'deck' ? `<p class="dim">Each card comes once per dungeon. Boss: one of ${r.bosses.map((b) => BOSSES[b].icon + ' ' + BOSSES[b].name).join(', ')}.</p>` : ''}
        <div class="deck-list">${items || '<p class="dim">None.</p>'}</div>
        <button data-act="modal-close">Close</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends now.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private save(): void {
    saveRun(this.run);
  }

  private screenForRun(): Screen {
    const r = this.run!;
    return r.phase === 'play' ? 'play' : r.phase === 'review' ? 'review' : r.phase === 'shop' ? 'shop' : 'end';
  }

  private newGame(): void {
    const seed = randomSeedText();
    this.run = newRun(seed, this.meta);
    this.last = null;
    this.bubbleKey = 0;
    this.walkFrom = 0;
    this.endInfo = null;
    this.screen = 'intro';
    this.save();
    this.render();
  }

  private play(i: number): void {
    const r = this.run;
    if (!r || r.phase !== 'play' || i < 0 || i >= r.hand.length) return;
    if (performance.now() < this.busyUntil) return;
    const card: Card = allCard(r.hand[i]);
    const wasBoss = r.step >= ROOMS;
    this.walkFrom = Math.max(0, r.step - 1);
    const o = playCard(r, i);
    this.last = o;
    this.bubbleKey++;
    this.hover = -1;
    this.busyUntil = performance.now() + WALK;
    sfx.place();
    // Sound by what happened.
    setTimeout(
      () => {
        if (o.end === 'dead' || o.dmg > r.hero.maxHp * 0.2) sfx.hurt();
        else if (card.kind === 'boss') sfx.roar();
        else if (o.twist) sfx.magic();
        else if (o.dmg > 0) sfx.hit();
        else if (o.gold > 0) sfx.coin();
        else if (o.heal > 0) sfx.heal();
        else if (o.d.bore > 5) sfx.yawn();
        if (o.fit >= 1) setTimeout(() => sfx.zone(), FAST ? 0 : 180);
      },
      FAST ? 0 : 260,
    );
    if (o.end) {
      // Show the last room, then the end screen.
      this.render();
      this.finish(WALK + (FAST ? 0 : 900));
      return;
    }
    if (wasBoss) {
      this.render();
      const later = (): void => {
        if (r.phase === 'over') this.finish(0);
        else {
          this.screen = 'review';
          const st = r.results[r.results.length - 1]?.stars ?? 0;
          for (let k = 0; k < st; k++) sfx.star(k);
          this.render();
        }
      };
      if (FAST) later();
      else setTimeout(later, WALK + 700);
      this.save();
      return;
    }
    this.save();
    this.render();
  }

  private finish(delay: number): void {
    const r = this.run!;
    this.busyUntil = performance.now() + delay;
    const done = (): void => {
      const before = unlockedHeroes(this.meta);
      const stars = recordEnd(this.meta, r);
      const after = unlockedHeroes(this.meta);
      const fresh = after.filter((h) => !before.includes(h));
      this.endInfo = { stars, newHero: fresh.length ? fresh.map((h) => `${HEROES[h].icon} ${HEROES[h].title}`).join(', ') : null };
      clearRun();
      this.screen = 'end';
      this.modal = null;
      if (r.end === 'won') sfx.win();
      else sfx.lose();
      this.render();
    };
    if (delay <= 0) done();
    else setTimeout(done, delay);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    initAudio();
    const k = e.key.toLowerCase();
    if (k === 'h' || e.key === '?') return this.action('help', {});
    if (k === 'm') return this.action('mute', {});
    if (e.key === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') return this.action('menu', {});
    if (this.screen === 'play') {
      if (/^[1-3]$/.test(e.key)) this.play(Number(e.key) - 1);
      else if (k === 'd') this.action('deck', {});
      return;
    }
    if (e.key === 'Enter') {
      const btn = this.root.querySelector<HTMLButtonElement>('main button.primary');
      if (btn) {
        e.preventDefault();
        btn.click();
      }
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
      case 'deck':
        if (r) this.modal = { kind: 'deck' };
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
        if (r) {
          r.end = 'abandon';
          r.phase = 'over';
          this.finish(0);
        }
        return;
      case 'title':
        this.modal = null;
        this.save();
        if (this.screen === 'end') this.run = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.newGame();
        return;
      case 'continue':
        if (!r) return;
        this.last = null;
        this.bubbleKey = 0;
        this.walkFrom = Math.max(0, r.step - 1);
        this.screen = this.screenForRun();
        this.render();
        return;
      case 'start':
        this.screen = 'play';
        sfx.place();
        this.render();
        return;
      case 'play':
        this.play(Number(d.i));
        return;
      case 'to-shop':
        if (!r) return;
        r.phase = 'shop';
        this.screen = 'shop';
        this.save();
        this.render();
        return;
      case 'buy':
        if (r && buyCard(r, Number(d.i))) {
          sfx.buy();
          this.toast(`${CARDS[r.shop[Number(d.i)].id].icon} added to your deck`);
          this.save();
        } else sfx.deny();
        this.render();
        return;
      case 'svc': {
        if (!r) return;
        const id = d.id as ServiceId;
        if (id === 'cut') {
          this.modal = { kind: 'cut' };
          this.render();
          return;
        }
        if (buyService(r, id)) {
          sfx.buy();
          this.save();
        } else sfx.deny();
        this.render();
        return;
      }
      case 'cut':
        if (r && buyService(r, 'cut', Number(d.i))) {
          sfx.buy();
          this.save();
        } else sfx.deny();
        this.modal = null;
        this.render();
        return;
      case 'next':
        if (!r) return;
        nextDungeon(r);
        this.last = null;
        this.bubbleKey = 0;
        this.walkFrom = 0;
        this.screen = 'play';
        this.toast(`🏰 Dungeon ${r.level + 1} of ${DUNGEONS}`);
        this.save();
        this.render();
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const rng = new Rng(hash('debug', Date.now()));
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => {
        const r = this.run;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          hero: r?.hero.type ?? null,
          dungeon: r ? Math.min(DUNGEONS, r.level + 1) : null,
          step: r?.step ?? null,
          hp: r?.hero.hp ?? null,
          bore: r ? Math.round(r.hero.bore) : null,
          stress: r ? Math.round(r.hero.stress) : null,
          delight: r ? Math.round(r.hero.delight) : null,
          fun: r ? Math.round(r.hero.fun) : null,
          hand: r?.hand ?? [],
          renown: r?.renown ?? null,
          trust: r?.trust ?? null,
          results: r?.results ?? [],
          end: r?.end ?? null,
          score: r?.score ?? null,
        };
      },
      renown: (n: number) => {
        if (this.run) this.run.renown += n;
        this.render();
      },
      stars: (n: number) => {
        this.meta.stars += n;
        this.render();
      },
      /** One bot action with the planner bot. */
      step: (): string => {
        if (performance.now() < this.busyUntil) return 'busy';
        if (this.modal) {
          if (this.modal.kind === 'cut') {
            const a = this.run ? chooseShop(this.run, 'good', rng) : null;
            if (a?.act === 'service' && a.cut !== undefined) click(`[data-act="cut"][data-i="${a.cut}"]`);
            else click('.modal [data-act="modal-close"]');
            return 'cut';
          }
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'intro':
            click('[data-act="start"]');
            return 'start';
          case 'play': {
            if (!r || r.phase !== 'play') return 'busy';
            const i = chooseCard(r, 'good', rng);
            click(`.card[data-i="${i}"]`);
            return 'play';
          }
          case 'review':
            click('[data-act="to-shop"]');
            return 'review';
          case 'shop': {
            const a = chooseShop(r!, 'good', rng);
            if (a.act === 'card') click(`[data-act="buy"][data-i="${a.i}"]`);
            else if (a.act === 'service') {
              if (!click(`[data-act="svc"][data-id="${a.id}"]:not([disabled])`)) click('[data-act="next"]');
            } else click('[data-act="next"]');
            return 'shop';
          }
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
