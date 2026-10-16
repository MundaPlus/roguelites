import { botCare, botChoice, botLink, botTown } from './bot';
import { CHAINS, GROUPS, NODE_INFO, ROWS, SKILLS, SKILL_INFO, TERRAIN, TRAITS, WEATHER, type Res } from './data';
import { Rng, randomSeedText } from './rng';
import {
  PACE_NAMES,
  RATION_NAMES,
  SHOP,
  applyScene,
  bookRun,
  buy,
  canRepair,
  canTreat,
  chooseLink,
  choose,
  choiceViews,
  closeReport,
  curTerrain,
  doJob,
  eventDef,
  fill,
  finishEvent,
  foodPerDay,
  here,
  isUnlocked,
  jobOk,
  jobPay,
  leaveTown,
  loadMeta,
  loadRun,
  milesPerDay,
  newRun,
  node,
  price,
  recruit,
  recruitOk,
  relOf,
  repair,
  saveMeta,
  saveRun,
  sceneSetup,
  shopOk,
  shopPrice,
  skillOf,
  treat,
  travelDay,
  unlockCost,
  waterPerDay,
  type Chip,
  type RunState,
  type ShopKey,
} from './run';
import {
  ANIMALS,
  BANDITS,
  DT,
  SH,
  SW,
  WAGON,
  botInput,
  createScene,
  outcome,
  update,
  type AmbushScene,
  type HuntScene,
  type Input,
  type RiverScene,
  type Scene,
} from './scenes';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'setup' | 'run' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` shortens waits for bot runs. */
const FAST = PARAMS.has('fast');
const DAY_MS = FAST ? 20 : 650;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function hpBar(hp: number, max: number): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const cls = pct <= 34 ? 'low' : pct <= 60 ? 'mid' : '';
  return `<div class="hp ${cls}"><div class="hp-fill" style="width:${pct}%"></div><span>${hp}/${max}</span></div>`;
}

const chipsHtml = (chips: Chip[]): string => (chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip ${c.good ? 'good' : 'bad'}">${esc(c.text)}</span>`).join('')}</div>` : '');

const WAGON_SVG = `<svg class="wagon-svg" viewBox="0 0 120 70" aria-hidden="true">
  <path d="M30 34 Q30 6 62 6 Q94 6 94 34 Z" fill="#f4ecd8" stroke="#8a6a46" stroke-width="3"/>
  <path d="M45 34 Q45 10 62 8 M79 34 Q79 10 62 8" fill="none" stroke="#c9b48e" stroke-width="2"/>
  <rect x="24" y="33" width="76" height="14" rx="2" fill="#8b5a2b" stroke="#5c3a1a" stroke-width="2"/>
  <circle cx="38" cy="54" r="12" fill="none" stroke="#3b2614" stroke-width="4"/><circle cx="38" cy="54" r="2.5" fill="#3b2614"/>
  <circle cx="88" cy="54" r="12" fill="none" stroke="#3b2614" stroke-width="4"/><circle cx="88" cy="54" r="2.5" fill="#3b2614"/>
  <path d="M38 42 V66 M26 54 H50 M88 42 V66 M76 54 H100" stroke="#3b2614" stroke-width="2"/>
  <path d="M100 40 L114 44" stroke="#5c3a1a" stroke-width="3"/>
</svg>`;

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private group = 'settlers';
  private paused = false;
  private travelTimer = 0;
  private lastChips: Chip[] = [];
  private prev: Record<string, number> = {};
  private ended: RunState | null = null;
  private viewKey = '';

  // Scene
  private scene: Scene | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private doneT = 0;
  private aim = { x: SW / 2, y: SH / 2 };
  private fireReq = false;
  private keys = new Set<string>();
  private pointerSteer: number | null = null;
  private botRng = new Rng(Date.now() & 0xffff);
  private deco: { x: number; y: number; s: string }[] = [];

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => (this.pointerSteer = null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('resize', () => this.resize());
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.travelTimer);
    let body = '';
    const r = this.run;
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'setup') body = this.setupView();
    else if (this.screen === 'end') body = this.endView();
    else if (r) body = this.runView(r);
    const top = this.screen === 'run' && r ? this.topBar(r) : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen === 'run' ? r?.phase : this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'run' && r?.phase === 'scene') this.startScene();
    else {
      this.scene = null;
      this.canvas = null;
    }
    if (this.screen === 'run' && r?.phase === 'travel' && !this.paused && !this.modal) this.travelTimer = window.setTimeout(() => this.nextDay(), DAY_MS);
    const wrap = this.root.querySelector<HTMLElement>('.mapwrap');
    const cur = this.root.querySelector<SVGGElement>('.mapnode.now');
    if (wrap && cur) wrap.scrollTop = Math.max(0, cur.getBoundingClientRect().top - wrap.getBoundingClientRect().top - wrap.clientHeight / 3);
    const key = `${this.screen}:${r?.phase ?? ''}`;
    if (key !== this.viewKey) {
      this.viewKey = key;
      window.scrollTo?.({ top: 0 });
    }
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private floatChips(chips: Chip[]): void {
    chips.slice(0, 6).forEach((c, i) => {
      const el = document.createElement('div');
      el.className = `floaty ${c.good ? 'good' : 'bad'}`;
      el.textContent = c.text;
      el.style.left = `${50 + (i % 2 ? 1 : -1) * (8 + i * 6)}%`;
      el.style.animationDelay = `${i * 0.12}s`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1900 + i * 120);
    });
  }

  private topBar(r: RunState): string {
    const val = (k: string, v: number): string => {
      const p = this.prev[k];
      this.prev[k] = v;
      return p === undefined || p === v ? '' : p < v ? 'up' : 'down';
    };
    const item = (k: string, icon: string, v: number, text: string, title: string, warn = false): string =>
      `<span class="res ${val(k, v)} ${warn ? 'warn' : ''}" title="${title}">${icon}<b>${text}</b></span>`;
    const fd = foodPerDay(r);
    const wd = waterPerDay(r);
    return `<header class="top">
      <span class="day">📅 Day ${r.day}</span>
      <div class="resbar">
        ${item('food', '🍖', r.res.food, `${r.res.food}`, `Food. About ${fd} per day.`, r.res.food < fd * 4)}
        ${item('water', '💧', r.res.water, `${r.res.water}/${r.waterCap}`, `Water. About ${wd} per day here.`, r.res.water < wd * 3)}
        ${item('parts', '⚙️', r.res.parts, `${r.res.parts}`, 'Wagon parts')}
        ${item('med', '💊', r.res.med, `${r.res.med}`, 'Medicine')}
        ${item('money', '💲', r.res.money, `${r.res.money}`, 'Money')}
        ${item('ammo', '🧨', r.res.ammo, `${r.res.ammo}`, 'Ammo')}
        ${item('morale', r.morale >= 60 ? '😊' : r.morale >= 30 ? '😐' : '😟', r.morale, `${r.morale}`, 'Morale. Below 25, travelers may leave.', r.morale < 30)}
        ${item('wagon', '🛞', r.wagon, `${r.wagon}%`, 'Wagon condition. At 0 a part is used, else you crawl at half speed.', r.wagon < 30)}
      </div>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const unlocks = [...GROUPS.filter((g) => g.cost > 0), ...CHAINS.filter((c) => c.cost > 0)]
      .map((u) => {
        const kind = GROUPS.some((g) => g.id === u.id) ? 'Group' : 'Event chain';
        const owned = isUnlocked(m, u.id);
        return `<div class="unlock ${owned ? 'owned' : ''}">
          <span class="big">${u.icon}</span>
          <div class="grow"><b>${u.name}</b> <small class="dim">${kind}</small><br><small>${u.text}</small></div>
          ${owned ? '<span class="good">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.marks < u.cost ? 'disabled' : ''}>✦ ${u.cost}</button>`}
        </div>`;
      })
      .join('');
    const cont = this.run ? `<button class="primary" data-act="continue">Continue · Day ${this.run.day}</button>` : '';
    return `<div class="title">
      <div class="hero-wagon">${WAGON_SVG}</div>
      <h1>Dust Trail</h1>
      <p class="sub">Lead a wagon of four travelers across the frontier to Green Valley. Ration food and water, fix the wagon, survive bandits, rivers and fever.</p>
      <div class="row">${cont}<button class="${this.run ? '' : 'primary'}" data-act="new">New journey</button><button data-act="help">How to play</button></div>
      <p class="stats">Journeys ${m.runs} · Arrived ${m.wins} · Best score ${m.best} · Miles ${m.miles} · Graves ${m.deaths}</p>
      <h3>Unlocks <span class="gold">✦ ${m.marks}</span></h3>
      <p class="dim small">Every journey earns trail marks ✦ from its score.</p>
      <div class="unlocks">${unlocks}</div>
    </div>`;
  }

  private setupView(): string {
    const cards = GROUPS.map((g) => {
      const ok = isUnlocked(this.meta, g.id);
      const members = g.members
        .map((p) => {
          const sk = Object.entries(p.skills)
            .map(([s, v]) => `${SKILL_INFO[s as keyof typeof SKILL_INFO].icon}${v}`)
            .join(' ');
          const tr = p.traits.map((t) => TRAITS[t].icon).join('');
          return `<span class="mini">${sk} ${tr}</span>`;
        })
        .join('');
      return `<button class="group ${this.group === g.id ? 'sel' : ''}" data-act="group" data-id="${g.id}" ${ok ? '' : 'disabled'}>
        <span class="big">${g.icon}</span><b>${g.name}</b><small>${ok ? g.text : `Locked · ✦ ${g.cost}`}</small>
        <span class="members">${members}</span>
      </button>`;
    }).join('');
    return `<div class="setup">
      <h2>Choose your group</h2>
      <div class="groups">${cards}</div>
      <div class="row"><button data-act="title">Back</button><button class="primary" data-act="start">Set out ▶</button></div>
    </div>`;
  }

  private runView(r: RunState): string {
    let main = '';
    switch (r.phase) {
      case 'map':
        main = this.mapView(r);
        break;
      case 'travel':
        main = this.travelView(r);
        break;
      case 'event':
        main = this.eventView(r);
        break;
      case 'town':
        main = this.townView(r);
        break;
      case 'scene':
        return this.sceneShell(r);
      case 'report':
        main = this.reportView(r);
        break;
      default:
        main = '';
    }
    return `<div class="layout"><section class="main">${main}</section><aside class="party">${this.partyView(r)}</aside></div>`;
  }

  // ---------- Party ----------

  private partyView(r: RunState): string {
    const cards = r.party
      .map((t) => {
        const skills = SKILLS.filter((s) => skillOf(t, s) > 0)
          .map((s) => `<span title="${SKILL_INFO[s].name}: ${SKILL_INFO[s].text}">${SKILL_INFO[s].icon}${skillOf(t, s)}</span>`)
          .join(' ');
        const traits = t.traits.map((x) => `<span class="trait" title="${TRAITS[x].name}: ${TRAITS[x].text}">${TRAITS[x].icon} ${TRAITS[x].name}</span>`).join('');
        const rels = r.party
          .filter((o) => o !== t && Math.abs(relOf(r, t.uid, o.uid)) >= 2)
          .map((o) => {
            const v = relOf(r, t.uid, o.uid);
            return `<span class="${v > 0 ? 'good' : 'bad'}" title="${v > 0 ? 'Friend' : 'Rival'}">${v > 0 ? '💛' : '⚡'}${o.name}</span>`;
          })
          .join(' ');
        const canT = canTreat(r, t) && (r.phase === 'map' || r.phase === 'travel' || r.phase === 'town');
        return `<div class="card ${t.sick ? 'sick' : ''} ${t.hp <= 3 ? 'dying' : ''}">
          <div class="who"><span class="face">${t.icon}</span><b>${t.name}</b>${t.sick ? `<span class="badge" title="Sick: loses HP until cured">🤒 ${t.sick}</span>` : ''}</div>
          ${hpBar(t.hp, t.maxHp)}
          <div class="skills">${skills || '<span class="dim">no skills</span>'}</div>
          <div class="traits">${traits}</div>
          ${rels ? `<div class="rels">${rels}</div>` : ''}
          ${canT ? `<button class="small-btn" data-act="treat" data-uid="${t.uid}" title="Use 1 medicine: cure sickness and heal">💊 Treat</button>` : ''}
        </div>`;
      })
      .join('');
    const lost = r.lost.length ? `<div class="lost">${r.lost.map((x) => `<span title="${x.how === 'left' ? 'Left' : `Died of ${x.how}`} on day ${x.day}">${x.how === 'left' ? '🚶' : '🪦'} ${x.name}</span>`).join(' ')}</div>` : '';
    return `<h3>Travelers <small class="dim">${r.party.length}/5</small></h3><div class="cards">${cards}</div>${lost}`;
  }

  private controls(r: RunState): string {
    const seg = (act: string, names: string[], cur: number, title: string): string =>
      `<div class="seg" title="${title}">${names.map((n, i) => `<button data-act="${act}" data-v="${i}" class="${cur === i ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    return `<div class="ctl"><div class="controls">
      <label>Rations ${seg('rations', RATION_NAMES, r.rations, 'Lean: less food, no healing, lower morale. Full: more food, faster healing.')}</label>
      <label>Pace ${seg('pace', PACE_NAMES, r.pace, 'Hard: 50% faster, but more wagon wear, hurt and sickness.')}</label>
      <button data-act="repair" ${canRepair(r) ? '' : 'disabled'} title="Use 1 part to repair the wagon">⚙️ Repair wagon</button>
    </div>
    <p class="dim small">Per day: 🍖 ${foodPerDay(r)} · 💧 ${waterPerDay(r)} · 🛞 ${milesPerDay(r, 'clear')} miles</p></div>`;
  }

  // ---------- Map ----------

  private mapSvg(r: RunState, next: number[]): string {
    const W = 340;
    const rowH = 56;
    const H = ROWS * rowH + 10;
    const px = (n: { lane: number }): number => 60 + n.lane * 110;
    const py = (n: { row: number }): number => 30 + n.row * rowH;
    let lines = '';
    for (const n of r.nodes)
      for (const l of n.links) {
        const m = r.nodes[l.to];
        const walked = r.visited.includes(n.id) && r.visited.includes(m.id) && r.visited.indexOf(m.id) === r.visited.indexOf(n.id) + 1;
        const open = n.id === r.at && r.phase === 'map';
        const going = r.trip && n.id === r.at && l.to === r.trip.to;
        lines += `<line x1="${px(n)}" y1="${py(n)}" x2="${px(m)}" y2="${py(m)}" class="edge ${walked ? 'walked' : ''} ${open ? 'open' : ''} ${going ? 'going' : ''}"/>`;
      }
    let dots = '';
    for (const n of r.nodes) {
      const info = NODE_INFO[n.kind];
      const cls = [n.id === r.at ? 'now' : '', r.visited.includes(n.id) ? 'seen' : '', next.includes(n.id) ? 'next' : '', r.trip?.to === n.id ? 'dest' : ''].join(' ');
      const i = here(r).links.findIndex((l) => l.to === n.id);
      const act = next.includes(n.id) ? `data-act="link" data-i="${i}"` : '';
      dots += `<g class="mapnode ${cls}" ${act} transform="translate(${px(n)},${py(n)})">
        <title>${esc(n.name)} · ${info.name} · ${TERRAIN[n.terrain].name}</title>
        <circle r="18" style="--ground:${TERRAIN[n.terrain].ground}"/>
        <text y="6" text-anchor="middle">${info.icon}</text>
      </g>`;
    }
    return `<div class="mapwrap"><svg class="map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${lines}${dots}</svg></div>`;
  }

  private mapView(r: RunState): string {
    const n = here(r);
    const stops = n.links
      .map((l, i) => {
        const m = node(r, l.to);
        const info = NODE_INFO[m.kind];
        const T = TERRAIN[m.terrain];
        const days = Math.ceil(l.miles / milesPerDay(r, 'clear'));
        const water = Math.ceil(r.party.length * T.water) * days;
        const danger = l.danger ? '💀'.repeat(l.danger) : '<span class="good">safe</span>';
        return `<button class="stop" data-act="link" data-i="${i}">
          <span class="key">${i + 1}</span>
          <span class="big">${info.icon}</span>
          <span class="grow"><b>${esc(m.name)}</b><br><small>${info.text}</small><br>
          <small>${T.icon} ${T.name} · ${l.miles} mi (~${days} d) · ${danger} · <span class="${water > r.res.water ? 'bad' : ''}">💧~${water}</span></small></span>
        </button>`;
      })
      .join('');
    return `<div class="mapview">
      <div class="where"><h2>${NODE_INFO[n.kind].icon} ${esc(n.name)}</h2><p class="dim">Choose the next stop. Short roads are often more dangerous.</p></div>
      <div class="stops">${stops}</div>
      ${this.controls(r)}
      ${this.mapSvg(r, n.links.map((l) => l.to))}
    </div>`;
  }

  // ---------- Travel ----------

  private travelView(r: RunState): string {
    const trip = r.trip!;
    const dest = node(r, trip.to);
    const pct = Math.round(((trip.total - trip.miles) / trip.total) * 100);
    const T = TERRAIN[curTerrain(r)];
    const W = WEATHER[r.weather];
    const logs = r.log
      .slice(-7)
      .reverse()
      .map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`)
      .join('');
    return `<div class="travel">
      <div class="trail w-${r.weather}" style="--ground:${T.ground}">
        <div class="sky"><span class="weather">${W.icon}</span><span class="dim">${W.name} · ${T.icon} ${T.name}</span></div>
        <div class="road">
          <div class="destflag" title="${esc(dest.name)}">${NODE_INFO[dest.kind].icon}</div>
          <div class="wagon ${this.paused ? '' : 'rolling'}" style="left:calc(${pct}% * 0.82)">${WAGON_SVG}</div>
        </div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div><span>${trip.total - trip.miles} / ${trip.total} miles to ${esc(dest.name)}</span></div>
      <div class="row">
        <button data-act="pause" class="${this.paused ? 'primary' : ''}">${this.paused ? '▶ Go on' : '⏸ Stop'}</button>
        ${this.paused ? '<button data-act="nextday">Next day ⏭</button>' : ''}
      </div>
      ${this.controls(r)}
      <ul class="log">${logs}</ul>
    </div>`;
  }

  // ---------- Event ----------

  private eventView(r: RunState): string {
    const inst = r.event!;
    const ev = eventDef(r);
    const text = fill(r, ev.text, inst.actors);
    let body: string;
    if (!inst.result) {
      const views = choiceViews(r);
      body = `<div class="opts">${views
        .map(
          (v, i) => `<button class="opt" data-act="choice" data-i="${i}" ${v.ok ? '' : 'disabled'}>
          <span class="key">${i + 1}</span><span class="grow">${esc(fill(r, v.label, inst.actors))}${v.tag ? ` <small class="tag">${v.tag}</small>` : ''}${v.ok ? '' : ` <small class="bad">${esc(v.why)}</small>`}</span></button>`,
        )
        .join('')}</div>`;
    } else {
      body = `<p class="result">${esc(inst.result.text)}</p>${chipsHtml(inst.result.chips)}
        <button class="primary" data-act="event-done">Continue ▶</button>`;
    }
    const chain = ev.chain ? CHAINS.find((c) => c.id === ev.chain) : null;
    return `<div class="event">
      <div class="ev-icon">${ev.icon}</div>
      <h2>${ev.title}${chain ? ` <small class="gold">${chain.icon} ${chain.name}</small>` : ''}</h2>
      <p class="ev-text">${esc(text)}</p>
      ${body}
    </div>`;
  }

  // ---------- Town ----------

  private townView(r: RunState): string {
    const t = r.town!;
    const shop = SHOP.map((s) => {
      const why = shopOk(r, s.key);
      return `<button class="buy" data-act="buy" data-key="${s.key}" ${why ? 'disabled' : ''} title="${s.text}">
        <span class="big">${s.icon}</span><span class="grow"><b>${s.name}</b><br><small>${why || s.text}</small></span><span class="cost">$${shopPrice(r, s.key)}</span>
      </button>`;
    }).join('');
    const jobs = t.jobs
      .map((j, i) => {
        const why = jobOk(r, i);
        return `<button class="buy" data-act="job" data-i="${i}" ${why ? 'disabled' : ''}>
          <span class="big">${j.icon}</span><span class="grow"><b>${j.name}</b><br><small>${why || `${j.days} day${j.days > 1 ? 's' : ''}${j.skill ? ` · ${SKILL_INFO[j.skill].icon} ${SKILL_INFO[j.skill].name}` : ''}${j.risk ? ' · risky' : ''}`}</small></span><span class="cost good">+$${jobPay(r, j)}</span>
        </button>`;
      })
      .join('');
    const recs = t.recruits
      .map((x, i) => {
        const why = recruitOk(r, i);
        const sk = SKILLS.filter((s) => skillOf(x.t, s) > 0)
          .map((s) => `${SKILL_INFO[s].icon}${SKILL_INFO[s].name} ${skillOf(x.t, s)}`)
          .join(', ');
        const tr = x.t.traits.map((k) => `${TRAITS[k].icon} ${TRAITS[k].name}`).join(', ');
        return `<button class="buy" data-act="recruit" data-i="${i}" ${why ? 'disabled' : ''}>
          <span class="big">${x.t.icon}</span><span class="grow"><b>${x.t.name}</b><br><small>${sk}${tr ? ` · ${tr}` : ''}${why ? ` · ${why}` : ''}</small></span><span class="cost">$${price(r, x.price)}</span>
        </button>`;
      })
      .join('');
    return `<div class="town">
      <h2>🏘️ ${esc(t.name)}</h2>
      <p class="dim">${r.at === 0 ? 'Stock up before you leave. The trail is long.' : 'A real town. Rest, trade and hire help.'}</p>
      ${chipsHtml(this.lastChips)}
      <div class="town-cols">
        <div><h3>Store</h3>${shop}</div>
        <div><h3>Jobs</h3>${jobs}<h3>Recruits</h3>${recs || '<p class="dim">Nobody wants to join.</p>'}
          <h3>Wagon</h3><p class="dim small">Food per day ${foodPerDay(r)} · Water space ${r.waterCap}</p>${this.controls(r)}</div>
      </div>
      <button class="primary wide" data-act="leave">Hit the trail ▶</button>
    </div>`;
  }

  // ---------- Report ----------

  private reportView(r: RunState): string {
    const rep = r.report!;
    return `<div class="event">
      <div class="ev-icon">${rep.icon}</div>
      <h2>${rep.title}</h2>
      <p class="result">${esc(rep.text)}</p>
      ${chipsHtml(rep.chips)}
      <button class="primary" data-act="report-done">Continue ▶</button>
    </div>`;
  }

  // ---------- End ----------

  private endView(): string {
    const r = this.ended!;
    const res = r.result!;
    const surv = r.party.map((t) => `<span class="chip good">${t.icon} ${t.name} ${t.hp}❤️</span>`).join('');
    const lost = r.lost.map((x) => `<span class="chip bad">${x.how === 'left' ? '🚶' : '🪦'} ${x.name} · ${x.how === 'left' ? 'left' : x.how} · day ${x.day}</span>`).join('');
    return `<div class="end">
      <div class="huge">${res.victory ? '🌄' : '🪦'}</div>
      <h1>${res.victory ? 'You reached Green Valley!' : 'The trail ends here'}</h1>
      <p class="sub">${esc(res.cause)}</p>
      <p class="score">Score <b>${res.score}</b> · ✦ +${res.marks} trail marks</p>
      <p class="dim">Day ${r.day} · ${r.stats.miles} miles · ${r.stats.events} events · ${r.stats.meat} pounds of meat · ${r.stats.bandits} bandits shot</p>
      ${surv ? `<h3>Survivors</h3><div class="chips">${surv}</div>` : ''}
      ${lost ? `<h3>Lost on the way</h3><div class="chips">${lost}</div>` : ''}
      <div class="row"><button class="primary" data-act="new">New journey</button><button data-act="title">Title</button></div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help')
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal:</b> reach Green Valley at the bottom of the map with at least one traveler alive. Raiders guard the last gate.</li>
          <li><b>Map:</b> pick the next stop. Each road shows miles, danger 💀 and the water you need. Towns 🏘️ sell supplies.</li>
          <li><b>Each day</b> costs food 🍖 per traveler and water 💧 by terrain and weather. Without food or water, travelers lose HP.</li>
          <li><b>Wagon 🛞</b> wears down. At 0 it uses a part ⚙️, or crawls at half speed.</li>
          <li><b>Sickness 🤒</b> drains HP. Use 💊 Treat on a traveler card to cure it.</li>
          <li><b>Morale</b> below 25 makes travelers walk away.</li>
          <li><b>Events:</b> choices with a skill tag use your best traveler at that skill. The % shows the success chance.</li>
          <li><b>Hunt 🦌:</b> click or tap animals to shoot. Big game gives more meat.</li>
          <li><b>River 🌊:</b> steer with ← → / A D, or hold the mouse or finger where the wagon should go. Dodge rocks and logs.</li>
          <li><b>Ambush 🏴:</b> click or tap bandits before they reach the wagon and steal supplies. Gunhands 🔫 shoot on their own.</li>
          <li><b>Keys:</b> 1–4 choose, Enter continues, Space stops the wagon, arrows + Space aim and shoot, Esc for the menu.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      ${
        m.confirm
          ? `<p>Abandon this journey? It counts as a loss.</p><div class="row"><button class="danger" data-act="abandon-yes">Abandon</button><button data-act="modal-close">Cancel</button></div>`
          : `<div class="opts"><button class="primary" data-act="modal-close">Resume</button><button data-act="help">How to play</button><button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button><button data-act="title">Save and quit to title</button><button class="danger" data-act="abandon">Abandon journey</button></div>`
      }
    </div></div>`;
  }

  // ---------- Game flow ----------

  /** Save and handle the end of the run after every rule change. */
  private after(chips: Chip[] = []): void {
    const r = this.run;
    if (!r) return;
    if (chips.length) this.floatChips(chips);
    if (r.phase === 'end') {
      this.meta.runs++;
      bookRun(this.meta, r);
      saveMeta(this.meta);
      saveRun(null);
      this.ended = r;
      this.run = null;
      this.screen = 'end';
      if (r.result?.victory) sfx.win();
      else sfx.lose();
    } else saveRun(r);
    this.render();
  }

  private lostCount(): number {
    return this.run?.lost.length ?? 0;
  }

  private nextDay(): void {
    const r = this.run;
    if (!r || r.phase !== 'travel') return;
    const lost = this.lostCount();
    travelDay(r);
    const ph = r.phase as string;
    if (this.lostCount() > lost) sfx.death();
    if (ph === 'event') sfx.event();
    else if (ph === 'travel') sfx.day();
    else if (ph === 'town') sfx.good();
    this.after();
  }

  private startRun(): void {
    this.run = newRun(randomSeedText(), this.group, this.meta);
    this.screen = 'run';
    this.paused = false;
    this.prev = {};
    this.lastChips = [];
    sfx.good();
    this.after();
  }

  private doChoice(i: number): void {
    const r = this.run!;
    const lost = this.lostCount();
    choose(r, i);
    const res = r.event?.result;
    if (res) {
      if (this.lostCount() > lost) sfx.death();
      else if (res.chips.some((c) => !c.good) && !res.chips.some((c) => c.good)) sfx.bad();
      else sfx.good();
      this.after(res.chips);
    }
  }

  private doTown(kind: string, d: DOMStringMap): void {
    const r = this.run!;
    let chips: Chip[] = [];
    if (kind === 'buy') chips = buy(r, d.key as ShopKey);
    else if (kind === 'job') chips = doJob(r, Number(d.i));
    else if (kind === 'recruit') chips = recruit(r, Number(d.i));
    if (chips.length) {
      sfx.coin();
      this.lastChips = chips;
    } else sfx.deny();
    this.after(chips);
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if (el instanceof HTMLButtonElement && el.disabled) return;
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
        if (r) {
          r.phase = 'end';
          r.result = { victory: false, score: 0, marks: 0, cause: 'You gave up the journey.' };
          this.after();
        }
        return;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.screen = 'setup';
        sfx.click();
        this.render();
        return;
      case 'continue':
        this.screen = 'run';
        this.prev = {};
        this.render();
        return;
      case 'group':
        this.group = d.id!;
        sfx.click();
        this.render();
        return;
      case 'start':
        this.startRun();
        return;
      case 'unlock': {
        const cost = unlockCost(d.id!);
        if (this.meta.marks >= cost && !this.meta.unlocked.includes(d.id!)) {
          this.meta.marks -= cost;
          this.meta.unlocked.push(d.id!);
          saveMeta(this.meta);
          sfx.good();
          this.toast('Unlocked!');
        }
        this.render();
        return;
      }
    }
    if (!r) return;
    switch (act) {
      case 'link':
        if (r.phase !== 'map') return;
        chooseLink(r, Number(d.i));
        this.paused = false;
        sfx.click();
        this.after();
        return;
      case 'rations':
        r.rations = Number(d.v);
        sfx.click();
        this.after();
        return;
      case 'pace':
        r.pace = Number(d.v);
        sfx.click();
        this.after();
        return;
      case 'repair': {
        const chips = repair(r);
        if (chips.length) sfx.heal();
        this.after(chips);
        return;
      }
      case 'treat': {
        const chips = treat(r, Number(d.uid));
        if (chips.length) sfx.heal();
        this.after(chips);
        return;
      }
      case 'pause':
        this.paused = !this.paused;
        sfx.click();
        this.render();
        return;
      case 'nextday':
        this.nextDay();
        return;
      case 'choice':
        this.doChoice(Number(d.i));
        return;
      case 'event-done':
        finishEvent(r);
        sfx.click();
        this.after();
        return;
      case 'buy':
      case 'job':
      case 'recruit':
        this.doTown(act, d);
        return;
      case 'leave':
        this.lastChips = [];
        leaveTown(r);
        this.paused = false;
        sfx.click();
        this.after();
        return;
      case 'report-done':
        closeReport(r);
        sfx.click();
        this.after();
        return;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.screen === 'run') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.modal || this.screen !== 'run' || !this.run) return;
    const r = this.run;
    initAudio();
    if (r.phase === 'scene') {
      this.keys.add(e.key);
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.fireReq = true;
      }
      if (e.key.startsWith('Arrow')) e.preventDefault();
      return;
    }
    const num = Number(e.key);
    const click = (sel: string): void => this.root.querySelector<HTMLElement>(sel)?.click();
    if (num >= 1 && num <= 5) {
      if (r.phase === 'map') click(`.stop[data-i="${num - 1}"]`);
      else if (r.phase === 'event') click(`.opt[data-i="${num - 1}"]:not([disabled])`);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (r.phase === 'event' && r.event?.result) click('[data-act="event-done"]');
      else if (r.phase === 'report') click('[data-act="report-done"]');
      else if (r.phase === 'travel') click('[data-act="pause"]');
      else if (r.phase === 'town' && e.key === 'Enter') click('[data-act="leave"]');
    }
  }

  private toCanvas(e: PointerEvent): { x: number; y: number } | null {
    if (!this.canvas) return null;
    const b = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * SW, y: ((e.clientY - b.top) / b.height) * SH };
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (!this.scene || e.target !== this.canvas) return;
    e.preventDefault();
    const p = this.toCanvas(e)!;
    this.aim = p;
    if (this.scene.kind === 'river') this.pointerSteer = p.x;
    else this.fireReq = true;
  }

  private onMove(e: PointerEvent): void {
    if (!this.scene) return;
    const p = this.toCanvas(e);
    if (!p) return;
    const inside = p.x >= 0 && p.x <= SW && p.y >= 0 && p.y <= SH;
    if (this.scene.kind === 'river') {
      if (this.pointerSteer !== null || (e.pointerType === 'mouse' && inside)) this.pointerSteer = inside ? p.x : this.pointerSteer;
    } else if (inside) this.aim = p;
  }

  // ---------- Scene ----------

  private sceneShell(r: RunState): string {
    const k = r.scene!.kind;
    const tip =
      k === 'hunt'
        ? 'Click or tap animals to shoot. Bison take 3 hits. Every shot costs 1 ammo.'
        : k === 'river'
          ? 'Steer with ← → or A D, or hold the mouse or finger where the wagon should go.'
          : r.scene!.boss
            ? 'The raiders of the last gate! Shoot them before they reach the wagon.'
            : 'Click or tap bandits before they reach the wagon. Gunhands 🔫 shoot on their own.';
    const title = k === 'hunt' ? '🦌 Hunt' : k === 'river' ? '🌊 River crossing' : r.scene!.boss ? '🦹 The Last Gate' : '🏴 Ambush';
    return `<div class="scene"><h2>${title}</h2><p class="dim small">${tip}</p><div class="cv-wrap"><canvas id="cv"></canvas></div></div>`;
  }

  private startScene(): void {
    const r = this.run!;
    if (!this.scene) {
      this.scene = createScene(sceneSetup(r));
      saveRun(r);
      const rng = new Rng(this.scene.setup.seed);
      this.deco = Array.from({ length: 18 }, () => ({ x: rng.next() * SW, y: rng.next() * SH, s: rng.pick(['🌵', '🪨', '🌿', '🌾', '🪵']) }));
      this.doneT = 0;
      this.fireReq = false;
    }
    this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
    this.ctx = this.canvas!.getContext('2d');
    this.resize();
    this.last = performance.now();
    this.acc = 0;
    const loop = (now: number): void => {
      this.tick(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      if (this.scene) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private resize(): void {
    if (!this.canvas) return;
    const wrap = this.canvas.parentElement!;
    const w = Math.min(wrap.clientWidth, 760, (window.innerHeight - 150) * (SW / SH));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${(w * SH) / SW}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(((w * SH) / SW) * dpr);
    this.ctx?.setTransform((w * dpr) / SW, 0, 0, (w * dpr) / SW, 0, 0);
    if (this.scene) this.draw();
  }

  private input(): Input {
    const s = this.scene!;
    const k = this.keys;
    const inp: Input = { x: this.aim.x, y: this.aim.y, fire: this.fireReq, steer: 0 };
    this.fireReq = false;
    if (s.kind === 'river') {
      if (k.has('ArrowLeft') || k.has('a') || k.has('A')) inp.steer = -1;
      else if (k.has('ArrowRight') || k.has('d') || k.has('D')) inp.steer = 1;
      else if (this.pointerSteer !== null) inp.steer = Math.max(-1, Math.min(1, (this.pointerSteer - s.wx) / 50 - s.wvx / 300));
    }
    return inp;
  }

  private tick(dt: number): void {
    const s = this.scene;
    if (!s) return;
    if (this.modal) {
      this.draw();
      return;
    }
    if (s.kind !== 'river') {
      const sp = 320 * dt;
      if (this.keys.has('ArrowLeft')) this.aim.x = Math.max(0, this.aim.x - sp);
      if (this.keys.has('ArrowRight')) this.aim.x = Math.min(SW, this.aim.x + sp);
      if (this.keys.has('ArrowUp')) this.aim.y = Math.max(0, this.aim.y - sp);
      if (this.keys.has('ArrowDown')) this.aim.y = Math.min(SH, this.aim.y + sp);
    }
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      update(s, DT, this.input());
    }
    this.playSounds();
    this.draw();
    if (s.done) {
      this.doneT += dt;
      if (this.doneT > (FAST ? 0 : 1)) this.endScene();
    }
  }

  private playSounds(): void {
    const s = this.scene!;
    for (const n of s.sounds.splice(0)) (sfx as Record<string, () => void>)[n]?.();
  }

  private endScene(): void {
    const s = this.scene;
    const r = this.run;
    if (!s || !r) return;
    this.scene = null;
    cancelAnimationFrame(this.raf);
    const lost = this.lostCount();
    applyScene(r, outcome(s));
    if (this.lostCount() > lost) sfx.death();
    this.after(r.report?.chips ?? []);
  }

  // ---------- Canvas drawing ----------

  private draw(): void {
    const s = this.scene;
    const c = this.ctx;
    if (!s || !c) return;
    c.save();
    if (s.shake > 0) c.translate((Math.random() - 0.5) * 8 * s.shake, (Math.random() - 0.5) * 8 * s.shake);
    if (s.kind === 'hunt') this.drawHunt(c, s);
    else if (s.kind === 'river') this.drawRiver(c, s);
    else this.drawAmbush(c, s);
    for (const p of s.puffs) {
      c.globalAlpha = 1 - p.t / 0.5;
      c.strokeStyle = p.color;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(p.x, p.y, p.r * (0.4 + p.t * 2), 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    c.font = 'bold 15px system-ui, sans-serif';
    for (const f of s.floats) {
      c.globalAlpha = Math.max(0, 1 - f.t / 1.1);
      c.fillStyle = '#000';
      c.fillText(f.text, f.x + 1, f.y + 1);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;
    c.restore();
    // Time bar.
    c.fillStyle = 'rgba(0,0,0,0.45)';
    c.fillRect(0, 0, SW, 6);
    c.fillStyle = '#d4a373';
    c.fillRect(0, 0, SW * Math.min(1, s.t / s.dur), 6);
  }

  private hud(c: CanvasRenderingContext2D, parts: string[]): void {
    c.font = 'bold 14px system-ui, sans-serif';
    c.textAlign = 'left';
    const text = parts.join('   ');
    const w = c.measureText(text).width + 16;
    c.fillStyle = 'rgba(20,14,8,0.7)';
    c.fillRect(6, 12, w, 24);
    c.fillStyle = '#fff3e0';
    c.fillText(text, 14, 29);
  }

  private crosshair(c: CanvasRenderingContext2D, ready: boolean): void {
    const { x, y } = this.aim;
    c.strokeStyle = ready ? '#fff' : 'rgba(255,255,255,0.4)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, 12, 0, Math.PI * 2);
    c.moveTo(x - 18, y);
    c.lineTo(x - 6, y);
    c.moveTo(x + 6, y);
    c.lineTo(x + 18, y);
    c.moveTo(x, y - 18);
    c.lineTo(x, y - 6);
    c.moveTo(x, y + 6);
    c.lineTo(x, y + 18);
    c.stroke();
  }

  private emoji(c: CanvasRenderingContext2D, e: string, x: number, y: number, size: number, flip = false): void {
    c.save();
    c.translate(x, y);
    if (flip) c.scale(-1, 1);
    c.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
    c.fillStyle = '#000';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(e, 0, 0);
    c.restore();
  }

  private drawHunt(c: CanvasRenderingContext2D, s: HuntScene): void {
    const sky = c.createLinearGradient(0, 0, 0, 110);
    sky.addColorStop(0, '#f6bd60');
    sky.addColorStop(1, '#f7e1b5');
    c.fillStyle = sky;
    c.fillRect(0, 0, SW, 110);
    c.fillStyle = '#9c7b4c';
    c.beginPath();
    c.moveTo(0, 110);
    for (let x = 0; x <= SW; x += 40) c.lineTo(x, 96 + Math.sin(x * 0.03) * 10);
    c.lineTo(SW, 110);
    c.fill();
    const g = c.createLinearGradient(0, 105, 0, SH);
    g.addColorStop(0, '#a8a24e');
    g.addColorStop(1, '#6b7a2e');
    c.fillStyle = g;
    c.fillRect(0, 105, SW, SH - 105);
    c.strokeStyle = 'rgba(60,70,20,0.35)';
    c.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % SW;
      const y = 120 + ((i * 53) % (SH - 130));
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 3, y - 8);
      c.moveTo(x + 4, y);
      c.lineTo(x + 6, y - 9);
      c.stroke();
    }
    const list = [...s.animals].sort((a, b) => a.y - b.y);
    for (const a of list) {
      const d = ANIMALS[a.type];
      const scale = d.sky ? 1 : 0.75 + (a.y - 130) / 420;
      const size = d.r * 2.1 * scale;
      if (a.dead) {
        c.globalAlpha = Math.max(0, 1 - a.dead / 0.8);
        c.save();
        c.translate(a.x, a.y);
        c.rotate(Math.PI / 2);
        this.emoji(c, d.icon, 0, 0, size);
        c.restore();
        c.globalAlpha = 1;
        continue;
      }
      if (!d.sky) {
        c.fillStyle = 'rgba(0,0,0,0.2)';
        c.beginPath();
        c.ellipse(a.x, a.y + size * 0.45, size * 0.45, size * 0.12, 0, 0, Math.PI * 2);
        c.fill();
      }
      this.emoji(c, d.icon, a.x, a.y + Math.sin(a.bob) * 2, size, a.vx > 0);
      if (d.hp > 1 && a.hp < d.hp) this.pips(c, a.x, a.y - size * 0.6, a.hp, d.hp);
    }
    this.crosshair(c, s.cool <= 0 && s.ammo > 0);
    this.hud(c, [`🧨 ${s.ammo}`, `🍖 ${s.meat}/${s.cap}`, `⏱ ${Math.max(0, Math.ceil(s.dur - s.t))}s`]);
  }

  private pips(c: CanvasRenderingContext2D, x: number, y: number, hp: number, max: number): void {
    for (let i = 0; i < max; i++) {
      c.fillStyle = i < hp ? '#ef476f' : 'rgba(0,0,0,0.4)';
      c.fillRect(x - max * 4 + i * 8, y, 6, 4);
    }
  }

  private drawWagonTop(c: CanvasRenderingContext2D, x: number, y: number, blink: boolean): void {
    c.save();
    c.translate(x, y);
    if (blink) c.globalAlpha = 0.5;
    this.emoji(c, '🐂', -10, -46, 20);
    this.emoji(c, '🐂', 10, -46, 20);
    c.strokeStyle = '#5c3a1a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -36);
    c.lineTo(0, -26);
    c.stroke();
    c.fillStyle = '#3b2614';
    c.fillRect(-24, -18, 6, 14);
    c.fillRect(18, -18, 6, 14);
    c.fillRect(-24, 10, 6, 14);
    c.fillRect(18, 10, 6, 14);
    c.fillStyle = '#f4ecd8';
    c.strokeStyle = '#8a6a46';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(-19, -26, 38, 54, 10);
    c.fill();
    c.stroke();
    c.strokeStyle = '#c9b48e';
    c.lineWidth = 2;
    for (const yy of [-12, 2, 16]) {
      c.beginPath();
      c.moveTo(-17, yy);
      c.lineTo(17, yy);
      c.stroke();
    }
    c.restore();
  }

  private drawRiver(c: CanvasRenderingContext2D, s: RiverScene): void {
    c.fillStyle = '#2a6f97';
    c.fillRect(0, 0, SW, SH);
    c.strokeStyle = 'rgba(200,230,255,0.25)';
    c.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const x = (i * 71) % (SW - 80) + 40;
      const y = ((i * 37 + s.scroll) % (SH + 40)) - 20;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 10, y - 5, x + 20, y);
      c.stroke();
    }
    // Banks.
    c.fillStyle = '#7a5c3a';
    c.fillRect(0, 0, 36, SH);
    c.fillRect(SW - 36, 0, 36, SH);
    c.fillStyle = '#5f7a3a';
    c.fillRect(0, 0, 22, SH);
    c.fillRect(SW - 22, 0, 22, SH);
    // Far bank arrives at the end.
    const left = s.dur - s.t;
    if (left < 2.5) {
      const h = (2.5 - left) * 60;
      c.fillStyle = '#7a5c3a';
      c.fillRect(0, 0, SW, h);
      c.fillStyle = '#5f7a3a';
      c.fillRect(0, 0, SW, h - 12);
    }
    for (const o of s.obstacles) {
      if (o.type === 'rock') {
        c.fillStyle = o.hit ? '#555' : '#8d8d8d';
        c.beginPath();
        c.ellipse(o.x, o.y, o.r, o.r * 0.8, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)';
        c.beginPath();
        c.ellipse(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.35, o.r * 0.25, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.5)';
        c.beginPath();
        c.arc(o.x, o.y + 4, o.r + 4, 0.2, Math.PI - 0.2);
        c.stroke();
      } else if (o.type === 'log') {
        c.fillStyle = '#6b4423';
        c.beginPath();
        c.roundRect(o.x - 34, o.y - 8, 68, 16, 8);
        c.fill();
        c.fillStyle = '#c49a6c';
        c.beginPath();
        c.ellipse(o.x + 32, o.y, 4, 7, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        c.strokeStyle = '#3d2b1f';
        c.lineWidth = 3;
        c.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = k * 1.6 + o.x * 0.01;
          c.moveTo(o.x, o.y);
          c.lineTo(o.x + Math.cos(a) * o.r, o.y + Math.sin(a) * o.r);
        }
        c.stroke();
      }
    }
    this.drawWagonTop(c, s.wx, SH - 80, s.inv > 0 && Math.floor(s.t * 12) % 2 === 0);
    // Current indicator.
    const cur = s.current;
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.font = 'bold 13px system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillText(`current ${cur > 0 ? '→'.repeat(Math.min(3, Math.ceil(cur / 30))) : '←'.repeat(Math.min(3, Math.ceil(-cur / 30)))}`, SW - 44, SH - 12);
    this.hud(c, [`🛞 ${s.wagonDmg ? `-${s.wagonDmg}` : 'OK'}`, `💥 ${s.hits}`, `⏱ ${Math.max(0, Math.ceil(s.dur - s.t))}s`]);
  }

  private drawAmbush(c: CanvasRenderingContext2D, s: AmbushScene): void {
    const r = this.run;
    c.fillStyle = r ? TERRAIN[curTerrain(r)].ground : '#8a7a3c';
    c.fillRect(0, 0, SW, SH);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 30; i++) c.fillRect((i * 83) % SW, (i * 47) % SH, 3, 3);
    c.globalAlpha = 0.85;
    for (const d of this.deco) if (Math.hypot(d.x - WAGON.x, d.y - WAGON.y) > 60) this.emoji(c, d.s, d.x, d.y, 18);
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.setLineDash([4, 6]);
    c.beginPath();
    c.arc(WAGON.x, WAGON.y, 110, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    this.drawWagonTop(c, WAGON.x, WAGON.y + 8, false);
    for (const t of s.tracers) {
      c.strokeStyle = t.foe ? 'rgba(255,90,90,0.9)' : 'rgba(255,240,180,0.9)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(t.x1, t.y1);
      c.lineTo(t.x2, t.y2);
      c.stroke();
    }
    for (const b of s.bandits) {
      const d = BANDITS[b.type];
      if (b.state === 'dead') {
        c.globalAlpha = Math.max(0, 1 - b.dead / 0.8);
        this.emoji(c, '💀', b.x, b.y, d.r * 1.6);
        c.globalAlpha = 1;
        continue;
      }
      if (b.state === 'loot' || b.state === 'flee') {
        c.fillStyle = 'rgba(255,159,67,0.35)';
        c.beginPath();
        c.arc(b.x, b.y, d.r + 6, 0, Math.PI * 2);
        c.fill();
      }
      this.emoji(c, d.icon, b.x, b.y, d.r * 2, b.x < WAGON.x !== (b.state === 'flee'));
      if (d.hp > 1) this.pips(c, b.x, b.y - d.r - 8, b.hp, d.hp);
      if (b.state === 'flee' && Object.keys(b.carry).length) this.emoji(c, '💰', b.x + 12, b.y + 10, 14);
    }
    this.crosshair(c, s.cool <= 0);
    const left = s.bandits.filter((b) => b.state !== 'dead').length + s.queue.length;
    this.hud(c, [`🧨 ${s.ammo}${s.ammo <= 0 ? ' (rocks!)' : ''}`, `💀 ${s.kills}`, `🏴 ${left} left`]);
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.run;
        return {
          screen: this.screen === 'run' ? (r?.phase ?? 'title') : this.screen,
          modal: this.modal?.kind ?? null,
          day: r?.day,
          row: r ? here(r).row : null,
          party: r?.party.map((t) => `${t.name} ${t.hp}/${t.maxHp}${t.sick ? ' sick' : ''}`),
          res: r ? ({ ...r.res, morale: r.morale, wagon: r.wagon } as Res & { morale: number; wagon: number }) : null,
          event: r?.event?.id ?? null,
          scene: this.scene ? { kind: this.scene.kind, t: +this.scene.t.toFixed(1), done: this.scene.done } : null,
          result: this.ended?.result ?? null,
        };
      },
      /** One bot action. Scenes run 2 seconds of game time with bot input. */
      step: (): string => {
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const r = this.run;
        if (this.screen === 'title') {
          this.action(r ? 'continue' : 'new', {});
          return 'title';
        }
        if (this.screen === 'setup') {
          this.startRun();
          return 'start';
        }
        if (this.screen === 'end' || !r) return 'end';
        const rng = this.botRng;
        switch (r.phase) {
          case 'map':
          case 'travel': {
            const c = botCare(r, true);
            if (c) {
              if (c.kind === 'treat') this.action('treat', { uid: String(c.uid) });
              else if (c.kind === 'repair') this.action('repair', {});
              else this.action('rations', { v: String(c.v) });
              return c.kind;
            }
            if (r.phase === 'map') this.action('link', { i: String(botLink(r, true, rng)) });
            else this.nextDay();
            return r.phase === 'map' ? 'link' : 'day';
          }
          case 'event':
            if (!r.event!.result) this.doChoice(botChoice(r, true, rng));
            else this.action('event-done', {});
            return 'event';
          case 'town': {
            const a = botTown(r, true, rng);
            if (a.kind === 'leave') this.action('leave', {});
            else if (a.kind === 'buy') this.doTown('buy', { key: a.key });
            else this.doTown(a.kind, { i: String(a.i) });
            return `town:${a.kind}`;
          }
          case 'scene': {
            const s = this.scene;
            if (!s) return 'busy';
            for (let i = 0; i < 120 && !s.done; i++) update(s, DT, botInput(s, true, rng));
            s.sounds.length = 0;
            if (s.done) this.endScene();
            return 'scene';
          }
          case 'report':
            this.action('report-done', {});
            return 'report';
        }
        return 'busy';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
