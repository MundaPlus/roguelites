/** Screens, the SVG board, input, animation and the debug API. */
import { botAction, botPickOffer, botShop } from './bot';
import {
  AGENTS,
  AGENT_IDS,
  ALARM_MAX,
  ALARM_RULES,
  ALARM_STEP,
  DAYS,
  GADGETS,
  GUARDS,
  IMPLANTS,
  IMPLANT_SLOTS,
  LOADOUTS,
  MAX_TEAM,
  MISSIONS,
  type AgentId,
  type GadgetId,
  type ImplantId,
  type Skill,
} from './data';
import {
  CAM_RANGE,
  active,
  agentAt,
  agentOptions,
  agentPaths,
  agentVision,
  apply,
  awake,
  camCone,
  check,
  guardCone,
  guardIntent,
  guardShown,
  guardSpeed,
  idx,
  knownDanger,
  level,
  objAt,
  pathTo,
  plannedCone,
  slots,
  terminalPower,
  type Action,
  type Fx,
  type Guard,
  type Mission,
} from './engine';
import { COVER, DOOR, DX, DY, EXIT, LOCK, OPEN, WALL, isDoor } from './grid';
import { randomSeedText } from './rng';
import {
  buy,
  canBuy,
  defaultMeta,
  finishMission,
  installPending,
  intelFor,
  isFinal,
  loadMeta,
  loadRun,
  newRun,
  nextDay,
  offerReward,
  saveMeta,
  saveRun,
  score,
  sellGadget,
  startMission,
  toShop,
  train,
  trainCost,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'crew' | 'map' | 'mission' | 'report' | 'shop' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'escape' };

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FAST = PARAMS.has('fast');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, FAST ? 0 : ms));
const T = 32;

const KEYDIR: Record<string, number> = { ArrowRight: 0, KeyD: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowUp: 3, KeyW: 3 };
const ACT_KEYS = ['Z', 'X', 'C', 'V', 'B', 'M'];
const GAD_KEYS = ['G', 'H', 'J'];
const SKILL_NAME: Record<Skill, string> = { hack: 'Hacking', stealth: 'Stealth', combat: 'Combat' };
const SKILL_ICON: Record<Skill, string> = { hack: '💻', stealth: '👣', combat: '👊' };
const SKILL_TEXT: Record<Skill, string> = {
  hack: 'Terminals give 2 + hacking power.',
  stealth: 'AP = 5 + stealth. At 3, cameras and drones cannot see the agent.',
  combat: 'Knockouts last 2 + combat turns. At 3, takedowns work on armor.',
};

interface EndInfo {
  won: boolean;
  score: number;
  day: number;
  intel: number;
  stats: RunState['stats'];
}

interface HistItem {
  m: Mission;
  free: boolean;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private crew: AgentId[] = [];
  private sel = 0;
  private hover = -1;
  private pending = -1;
  private targeting: number | null = null;
  private inspect = -1;
  private history: HistItem[] = [];
  private busy = false;
  private touch = false;
  private showNext = true;
  private end: EndInfo | null = null;
  private fxKey = 0;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem('silent.mute') === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => (this.touch = e.pointerType !== 'mouse'));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerleave', () => this.setHover(-1));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (DEBUG) this.installDebug();
    this.render();
  }

  private get m(): Mission | null {
    return this.run?.mission ?? null;
  }

  private set m(v: Mission | null) {
    if (this.run) this.run.mission = v;
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'crew':
        body = this.crewView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'mission':
        body = this.missionView();
        break;
      case 'report':
        body = this.reportView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && !['title', 'end', 'crew'].includes(this.screen) ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private renderBoard(): void {
    const holder = this.root.querySelector<HTMLElement>('#board-holder');
    const info = this.root.querySelector<HTMLElement>('#info');
    if (!holder || !this.m) return;
    holder.innerHTML = this.boardSvg();
    if (info) info.innerHTML = this.infoView();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const where = this.screen === 'mission' && r.offer ? `${MISSIONS[r.offer.kind].icon} ${r.offer.corp} ${MISSIONS[r.offer.kind].name}` : `Day ${r.day}/${DAYS}`;
    return `<header class="top">
      <span class="logo">🕵️</span>
      <span title="Credits">💳 ${r.credits}</span>
      <span class="where">${where}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const mt = this.meta;
    const unlockAgents = AGENT_IDS.filter((id) => AGENTS[id].unlock > 0)
      .map((id) => {
        const d = AGENTS[id];
        const have = mt.unlocked.includes(id);
        return `<button class="unlock ${have ? 'have' : ''}" data-act="unlock-agent" data-id="${id}" ${have || mt.intel < d.unlock ? 'disabled' : ''} title="${d.text}">
          <span class="big">${d.icon}</span><b>${d.name}</b><small>${have ? 'Unlocked' : `🧩 ${d.unlock}`}</small></button>`;
      })
      .join('');
    const unlockKits = LOADOUTS.map((l) => {
      const have = mt.loadouts.includes(l.id);
      return `<button class="unlock ${have ? 'have' : ''}" data-act="unlock-kit" data-id="${l.id}" ${have || mt.intel < l.cost ? 'disabled' : ''} title="${l.text}">
        <span class="big">${l.icon}</span><b>${l.name}</b><small>${have ? 'Unlocked' : `🧩 ${l.cost}`}</small></button>`;
    }).join('');
    return `<div class="title-card">
      <div class="logo-big">🕵️</div>
      <h1>Silent Contract</h1>
      <p class="sub">Turn-based stealth heists. Get in, take the target, get out before the alarm peaks.</p>
      <div class="row">
        ${this.run && !this.run.over ? '<button class="primary" data-act="continue">Continue run</button>' : ''}
        <button class="${this.run && !this.run.over ? '' : 'primary'}" data-act="new">New run</button>
        <button data-act="help">How to play</button>
      </div>
      <div class="meta">
        <span>Runs <b>${mt.runs}</b></span><span>Wins <b>${mt.wins}</b></span><span>Best <b>${mt.best}</b></span><span>Missions <b>${mt.missions}</b></span><span title="Spend intel on unlocks">🧩 Intel <b>${mt.intel}</b></span>
      </div>
      <h3>Agents</h3>
      <div class="unlocks">${unlockAgents}</div>
      <h3>Starting loadouts</h3>
      <div class="unlocks">${unlockKits}</div>
    </div>`;
  }

  private crewView(): string {
    const cards = this.meta.unlocked
      .map((id) => {
        const d = AGENTS[id];
        const on = this.crew.includes(id);
        return `<button class="agent-card pick ${on ? 'on' : ''}" data-act="crew" data-id="${id}" style="--c:${d.color}">
          <span class="big">${d.icon}</span><b>${d.name}</b>
          <small>❤️ ${d.hp} · 👟 ${5 + d.stealth} AP</small>
          <small>💻${d.hack} 👣${d.stealth} 👊${d.combat}</small>
          <small>${d.gadgets.map((g) => GADGETS[g].icon + ' ' + GADGETS[g].name).join(', ')}</small>
          <small class="dim">${d.text}</small>
        </button>`;
      })
      .join('');
    return `<div class="crew">
      <h2>Choose your crew</h2>
      <p class="sub">Pick 3 agents. You can hire one more later.</p>
      <div class="cards">${cards}</div>
      <div class="row">
        <button data-act="title">Back</button>
        <button class="primary" data-act="start" ${this.crew.length === Math.min(3, this.meta.unlocked.length) ? '' : 'disabled'}>Start the contract</button>
      </div>
    </div>`;
  }

  private rosterStrip(): string {
    return `<div class="roster">${this.run!.roster.map((a) => `<span class="chip" style="--c:${AGENTS[a.id].color}">${AGENTS[a.id].icon} ${AGENTS[a.id].name}</span>`).join('')}</div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const cards = r.offers
      .map((o, i) => {
        const d = MISSIONS[o.kind];
        return `<button class="mission-card ${o.kind === 'vault' ? 'final' : ''}" data-act="offer" data-i="${i}">
          <span class="big">${d.icon}</span>
          <b>${o.corp} ${d.name}</b>
          <span class="stars">${'★'.repeat(o.stars)}${'☆'.repeat(3 - o.stars)} · Security ${o.sec}</span>
          <small>Target: ${d.targetIcon} ${d.target}</small>
          <small>Reward: ${d.reward} · 💳 ${offerReward(o)}</small>
        </button>`;
      })
      .join('');
    const days = Array.from({ length: DAYS }, (_, i) => `<i class="${i + 1 < r.day ? 'done' : i + 1 === r.day ? 'now' : ''}">${i + 1 === DAYS ? '🏛️' : i + 1}</i>`).join('');
    return `<div class="map">
      <div class="days">${days}</div>
      <h2>${isFinal(r) ? 'The final job' : `Day ${r.day}: choose a job`}</h2>
      <p class="sub">${isFinal(r) ? 'The Vault holds the contract. Win it and the run is yours.' : `${DAYS - r.day} more day(s) until the Vault.`}</p>
      <div class="cards">${cards}</div>
      ${this.rosterStrip()}
    </div>`;
  }

  private reportView(): string {
    const rep = this.run!.report!;
    const d = MISSIONS[rep.kind];
    return `<div class="report">
      <div class="big">${rep.success ? '✅' : '❌'}</div>
      <h2>${rep.success ? 'Mission complete' : 'Mission failed'}</h2>
      <p class="sub">${d.icon} ${d.name} · ${rep.turns} turns · ${rep.kos} knockouts · spotted ${rep.spots}×</p>
      <ul>
        <li>💳 Credits: <b>+${rep.credits}</b> ${rep.loot ? `(safes ${rep.loot})` : ''}</li>
        ${rep.bonus.map((b) => `<li>${b}</li>`).join('')}
        ${rep.lost.map((id) => `<li class="bad">${AGENTS[id].icon} ${AGENTS[id].name} was captured.</li>`).join('')}
      </ul>
      <button class="primary" data-act="report-next">${this.run!.over ? 'See the result' : 'To the safehouse'}</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const agents = r.roster
      .map((a, k) => {
        const d = AGENTS[a.id];
        const skills = (['hack', 'stealth', 'combat'] as Skill[])
          .map((s) => {
            const c = trainCost(a, s);
            return `<button class="skill" data-act="train" data-k="${k}" data-s="${s}" ${!c || r.credits < c ? 'disabled' : ''} title="${SKILL_NAME[s]}: ${SKILL_TEXT[s]}">${SKILL_ICON[s]} ${a[s]}${c ? ` <small>+1 💳${c}</small>` : ' <small>max</small>'}</button>`;
          })
          .join('');
        const gads = a.gadgets.map((g, s) => `<button class="gad" data-act="sell" data-k="${k}" data-s="${s}" title="${GADGETS[g].name}: ${GADGETS[g].text} Click to sell for ${Math.floor(GADGETS[g].price / 2)}.">${GADGETS[g].icon}</button>`).join('');
        const imps = a.implants.map((i) => `<span class="gad" title="${IMPLANTS[i].name}: ${IMPLANTS[i].text}">${IMPLANTS[i].icon}</span>`).join('');
        const pend = r.pending ? `<button class="small" data-act="install" data-k="${k}" ${a.implants.length >= IMPLANT_SLOTS || a.implants.includes(r.pending) ? 'disabled' : ''}>Install ${IMPLANTS[r.pending].icon}</button>` : '';
        return `<div class="agent-card" style="--c:${d.color}">
          <div class="ah"><span class="big">${d.icon}</span><b>${d.name}</b><small>❤️ ${a.hp + (a.implants.includes('plate') ? 1 : 0)} · 👟 ${5 + a.stealth + (a.implants.includes('servo') ? 1 : 0)} AP</small></div>
          <div class="skills">${skills}</div>
          <div class="slots"><span class="dim">Gadgets ${a.gadgets.length}/${slots(a)}</span>${gads}</div>
          <div class="slots"><span class="dim">Implants ${a.implants.length}/${IMPLANT_SLOTS}</span>${imps}</div>
          ${pend}
        </div>`;
      })
      .join('');
    const items = r.shop
      .map((it, i) => {
        let icon = '';
        let name = '';
        let text = '';
        if (it.kind === 'gadget') ({ icon, name, text } = GADGETS[it.id as GadgetId]);
        else if (it.kind === 'implant') ({ icon, name, text } = IMPLANTS[it.id as ImplantId]);
        else {
          const d = AGENTS[it.id as AgentId];
          icon = d.icon;
          name = `Hire ${d.name}`;
          text = d.text;
        }
        const buyers =
          it.kind === 'agent'
            ? `<button class="small" data-act="buy" data-i="${i}" data-k="0" ${canBuy(r, it, 0) ? 'disabled' : ''}>Hire</button>`
            : r.roster.map((a, k) => `<button class="small" data-act="buy" data-i="${i}" data-k="${k}" ${canBuy(r, it, k) ? 'disabled' : ''} title="Give to ${AGENTS[a.id].name}">${AGENTS[a.id].icon}</button>`).join('');
        return `<div class="item ${it.sold ? 'sold' : ''}">
          <span class="big">${icon}</span>
          <div><b>${name}</b> <span class="price">💳 ${it.price}</span><br><small class="dim">${it.kind === 'gadget' ? `${GADGETS[it.id as GadgetId].ap} AP · ${GADGETS[it.id as GadgetId].charges} per mission. ` : ''}${text}</small></div>
          <div class="buyers">${it.sold ? '<span class="dim">Sold</span>' : buyers}</div>
        </div>`;
      })
      .join('');
    return `<div class="shop">
      <h2>Safehouse</h2>
      <p class="sub">Agents heal fully between jobs. Gadgets recharge for each mission. Team ${r.roster.length}/${MAX_TEAM}.</p>
      ${r.pending ? `<p class="warn">Free implant: ${IMPLANTS[r.pending].icon} ${IMPLANTS[r.pending].name}. ${IMPLANTS[r.pending].text} Pick an agent below.</p>` : ''}
      <h3>Market</h3>
      <div class="items">${items}</div>
      <h3>Team</h3>
      <div class="agents">${agents}</div>
      <button class="primary" data-act="next-day">${isFinal({ ...r, day: r.day + 1 }) ? 'On to the Vault' : `Day ${r.day + 1}`} →</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="report end">
      <div class="big">${e.won ? '🏆' : '🚔'}</div>
      <h2>${e.won ? 'Contract fulfilled' : 'The crew is gone'}</h2>
      <p class="sub">${e.won ? 'You walked out of the Vault with the contract.' : `The run ended on day ${e.day}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <ul>
        <li>Missions: ${e.stats.success}/${e.stats.missions} complete</li>
        <li>Credits earned: ${e.stats.earned}</li>
        <li>Knockouts: ${e.stats.kos} · Agents lost: ${e.stats.lost}</li>
        <li>🧩 Intel earned: +${e.intel}</li>
      </ul>
      <button class="primary" data-act="to-title">Title screen</button>
    </div>`;
  }

  // ---------- Mission view ----------

  private missionView(): string {
    const m = this.m!;
    return `<div class="mission">
      <div class="board-col">
        <div id="board-holder">${this.boardSvg()}</div>
        <div id="info" class="info">${this.infoView()}</div>
      </div>
      <aside class="panel">${this.panelView()}</aside>
    </div>${m.over ? '' : ''}`;
  }

  private alarmView(m: Mission): string {
    const lv = level(m);
    const ticks = m.alarm - lv * ALARM_STEP;
    const segs = Array.from({ length: ALARM_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}">${i + 1}</i>`).join('');
    const tick = lv >= ALARM_MAX ? '' : Array.from({ length: ALARM_STEP }, (_, i) => `<b class="${i < ticks ? 'on' : ''}"></b>`).join('');
    const next = lv < ALARM_MAX ? `Next: ${ALARM_RULES[lv + 1]}` : ALARM_RULES[ALARM_MAX];
    return `<div class="alarm lv${lv}" title="${ALARM_RULES.map((r, i) => `${i}: ${r}`).join('\n')}">
      <div class="alarm-head"><span>🚨 Alarm <b>${lv}</b></span><span class="segs">${segs}</span></div>
      <div class="ticks">${tick}</div>
      <small>${next}</small>
    </div>`;
  }

  private panelView(): string {
    const m = this.m!;
    const sel = m.agents[this.sel];
    const target = m.objs.find((o) => o.kind === 'target')!;
    const agents = m.agents
      .map((a, k) => {
        const d = AGENTS[a.id];
        const st = a.out ? 'out' : a.down ? 'down' : '';
        const hp = Array.from({ length: a.maxHp }, (_, i) => `<i class="${i < a.hp ? 'on' : ''}"></i>`).join('');
        return `<button class="acard ${k === this.sel ? 'sel' : ''} ${st}" data-act="sel" data-k="${k}" style="--c:${d.color}">
          <span class="ai">${d.icon}</span>
          <span class="an"><b>${d.name}</b><span class="hp">${hp}</span></span>
          <span class="ap">${a.down ? '✖' : `${a.ap}<small>/${a.maxAp}</small>`}</span>
          <kbd>${k + 1}</kbd>
        </button>`;
      })
      .join('');
    let actions = '';
    if (sel && active(sel) && !m.over) {
      const opts = agentOptions(m, this.sel);
      actions = opts.map((o, i) => `<button class="act" data-act="opt" data-i="${i}">${o.icon} ${o.label}${i < ACT_KEYS.length ? ` <kbd>${ACT_KEYS[i]}</kbd>` : ''}</button>`).join('');
      const gads = sel.gadgets
        .map((g, s) => {
          const d = GADGETS[g.id];
          const on = this.targeting === s;
          return `<button class="act gadget ${on ? 'on' : ''}" data-act="gadget" data-s="${s}" ${g.n <= 0 || sel.ap < d.ap ? 'disabled' : ''} title="${d.text}">${d.icon} ${d.name} <small>${d.ap} AP · ×${g.n}</small>${s < GAD_KEYS.length ? ` <kbd>${GAD_KEYS[s]}</kbd>` : ''}</button>`;
        })
        .join('');
      actions += gads;
    }
    const canEscape = !check(m, { t: 'escape' });
    const free = this.history.length ? this.history[this.history.length - 1].free : true;
    return `${this.alarmView(m)}
      <div class="res">
        <span title="Power for safes, the target and hacking cameras">⚡ <b>${m.pwr}</b> power</span>
        <span>🔁 Turn <b>${m.turn}</b></span>
        <span title="Credits found in this mission">💳 +${m.credits}</span>
      </div>
      <div class="goal ${m.goal ? 'ok' : ''}">${m.goal ? `✔ ${MISSIONS[m.kind].target} secured. Reach the exit pad 🟩 and escape.` : `🎯 Take the ${MISSIONS[m.kind].targetIcon} ${MISSIONS[m.kind].target} (needs ${target.lock} ⚡). Hack 💻 terminals for power.`}</div>
      <div class="agents">${agents}</div>
      <div class="actions">${actions || '<span class="dim">Tap a tile to move. Tap things next to the agent to use them.</span>'}</div>
      ${this.targeting !== null ? `<p class="warn">Pick a target for ${GADGETS[sel.gadgets[this.targeting].id].name}. <button class="small" data-act="cancel">Cancel</button></p>` : ''}
      <div class="row turnrow">
        <button data-act="undo" ${this.history.length && (free || m.rewinds > 0) ? '' : 'disabled'} title="Undo the last action. Undo is free unless the action showed you something new.">↶ Undo ${free ? '' : `(⏪${m.rewinds})`} <kbd>U</kbd></button>
        ${canEscape ? `<button class="good-btn" data-act="escape">🚪 Escape <kbd>L</kbd></button>` : ''}
        <button class="primary" data-act="end-turn">End turn <kbd>⏎</kbd></button>
      </div>
      <label class="toggle"><input type="checkbox" data-act="toggle-next" ${this.showNext ? 'checked' : ''}> Show guard plans <kbd>N</kbd></label>
      <div class="log">${m.log.slice(-5).reverse().map((l) => `<div>${l}</div>`).join('')}</div>`;
  }

  private infoView(): string {
    const m = this.m;
    if (!m) return '';
    const i = this.inspect >= 0 ? this.inspect : this.hover;
    if (i < 0) return `<span class="dim">${this.touch ? 'Tap a tile to see the path, tap again to move.' : 'Point at a tile, guard or object for details.'}</span>`;
    const vis = agentVision(m);
    const g = m.guards.find((q) => idx(m, q.x, q.y) === i && guardShown(m, q, vis));
    if (g) {
      const d = GUARDS[g.kind];
      const it = guardIntent(m, g);
      const st = g.state === 'ko' ? `knocked out, wakes in ${g.ko}` : g.state === 'off' ? `switched off for ${g.ko}` : g.state === 'chase' ? 'hunting you' : g.state === 'investigate' ? 'searching' : 'on patrol';
      const plan = !awake(g) ? '' : it.shoot >= 0 ? ` <b class="bad">Will shoot ${AGENTS[m.agents[it.shoot].id].name}!</b>` : it.path.length ? ` Next: moves ${it.path.length} (speed ${guardSpeed(m, g)}).` : ' Next: turns.';
      return `${d.icon} <b>${d.name}</b> · ${st}.${plan} <span class="dim">${d.text}</span>`;
    }
    const o = objAt(m, i) ?? m.objs.find((q) => q.kind === 'camera' && idx(m, q.x, q.y) === i && m.seen[i]);
    if (o && m.seen[i]) {
      if (o.kind === 'terminal') return `💻 <b>Terminal</b> ${o.used ? '(used)' : `· +${terminalPower(m.agents[this.sel] ?? m.agents[0])} power for this agent. 1 AP.`}`;
      if (o.kind === 'safe') return `🔒 <b>Safe</b> ${o.used ? '(empty)' : `· needs ${o.lock} ⚡. Holds credits.`}`;
      if (o.kind === 'target') return `${MISSIONS[m.kind].targetIcon} <b>${MISSIONS[m.kind].target}</b> ${o.used ? '(taken)' : `· needs ${o.lock} ⚡ and 2 AP.`}`;
      return `📷 <b>Camera</b> · ${o.off > 0 ? 'off' : `range ${CAM_RANGE}. Seen = alarm +2. Hack it for 1 ⚡ while in sight.`}`;
    }
    const k = agentAt(m, i);
    if (k >= 0) {
      const a = m.agents[k];
      return `${AGENTS[a.id].icon} <b>${AGENTS[a.id].name}</b> · ❤️ ${a.hp}/${a.maxHp} · ${a.ap} AP · 💻${a.hack} 👣${a.stealth} 👊${a.combat}${a.cloak ? ' · cloaked' : ''}${a.down ? ' · <b class="bad">down</b> (revive: 2 AP next to them)' : ''}`;
    }
    const c = m.t[i];
    if (!m.seen[i]) return '<span class="dim">Unknown.</span>';
    const sel = m.agents[this.sel];
    if (sel && active(sel) && !m.over) {
      const { key, prev } = agentPaths(m, this.sel, knownDanger(m, vis));
      if (key[i] >= 0) {
        const cost = Math.floor(key[i] / 1000);
        const risky = key[i] % 1000 > 0;
        void prev;
        return `Move: <b>${cost} AP</b>${cost > sel.ap ? ' <span class="bad">(too far)</span>' : ''}${risky ? ' · <span class="bad">crosses a view cone</span>' : ''}${c === EXIT ? ' · exit pad' : ''}`;
      }
    }
    if (c === COVER) return 'Cover. Blocks movement. Hides an agent right behind it.';
    if (c === EXIT) return '🟩 Exit pad. Escape when your agents stand here.';
    if (isDoor(c)) return c === LOCK ? 'Locked door. 3 AP to force.' : c === DOOR ? 'Closed door. Blocks sight. Peek through it for 1 AP.' : 'Open door.';
    return c === WALL ? 'Wall.' : 'Floor.';
  }

  private boardSvg(): string {
    const m = this.m!;
    const vis = agentVision(m);
    const W = m.W;
    const parts: string[] = [];
    const sel = m.agents[this.sel];
    // Tiles.
    for (let i = 0; i < m.t.length; i++) {
      const x = (i % W) * T;
      const y = Math.floor(i / W) * T;
      if (!m.seen[i]) {
        parts.push(`<rect x="${x}" y="${y}" width="${T}" height="${T}" class="fog"/>`);
        continue;
      }
      const c = m.t[i];
      const lit = vis[i] ? ' lit' : '';
      if (c === WALL) parts.push(`<rect x="${x}" y="${y}" width="${T}" height="${T}" class="wall${lit}"/>`);
      else {
        parts.push(`<rect x="${x}" y="${y}" width="${T}" height="${T}" class="floor${lit}${c === EXIT ? ' exit' : ''}"/>`);
        if (c === COVER) parts.push(`<rect x="${x + 4}" y="${y + 4}" width="${T - 8}" height="${T - 8}" rx="4" class="cover"/>`);
        if (c === DOOR || c === LOCK) {
          const horiz = m.t[i - 1] === WALL || m.t[i + 1] === WALL;
          parts.push(
            horiz
              ? `<rect x="${x}" y="${y + 10}" width="${T}" height="${T - 20}" class="door${c === LOCK ? ' locked' : ''}"/>`
              : `<rect x="${x + 10}" y="${y}" width="${T - 20}" height="${T}" class="door${c === LOCK ? ' locked' : ''}"/>`,
          );
          if (c === LOCK) parts.push(`<text x="${x + T / 2}" y="${y + T / 2 + 5}" class="emo s">🔒</text>`);
        }
        if (c === OPEN) parts.push(`<rect x="${x + 3}" y="${y + 3}" width="${T - 6}" height="${T - 6}" class="opendoor"/>`);
        if (m.smoke[i] > 0) parts.push(`<circle cx="${x + T / 2}" cy="${y + T / 2}" r="${T * 0.62}" class="smoke"/>`);
      }
    }
    // Next-turn cones.
    if (this.showNext) {
      const next = new Uint8Array(m.W * m.H);
      for (const g of m.guards) if (awake(g) && guardShown(m, g, vis)) for (const i of plannedCone(m, g, guardIntent(m, g))) next[i] = 1;
      for (let i = 0; i < next.length; i++) if (next[i] && m.seen[i]) parts.push(`<rect x="${(i % W) * T}" y="${Math.floor(i / W) * T}" width="${T}" height="${T}" class="next"/>`);
    }
    // Current cones.
    const cone = new Uint8Array(m.W * m.H);
    for (const g of m.guards) if (guardShown(m, g, vis)) for (const i of guardCone(m, g)) cone[i] = GUARDS[g.kind].mech ? 2 : 1;
    for (const o of m.objs) if (o.kind === 'camera' && m.seen[idx(m, o.x, o.y)]) for (const i of camCone(m, o)) cone[i] = cone[i] || 2;
    for (let i = 0; i < cone.length; i++) if (cone[i] && m.seen[i]) parts.push(`<rect x="${(i % W) * T}" y="${Math.floor(i / W) * T}" width="${T}" height="${T}" class="cone c${cone[i]}"/>`);
    // Reachable tiles and path preview.
    if (sel && active(sel) && !m.over && this.targeting === null && !this.busy) {
      const dz = knownDanger(m, vis);
      const { key, prev } = agentPaths(m, this.sel, dz);
      for (let i = 0; i < key.length; i++) {
        if (key[i] <= 0 || Math.floor(key[i] / 1000) > sel.ap || agentAt(m, i) >= 0) continue;
        parts.push(`<circle cx="${(i % W) * T + T / 2}" cy="${Math.floor(i / W) * T + T / 2}" r="2.6" class="reach"/>`);
      }
      const h = this.pending >= 0 ? this.pending : this.hover;
      if (h >= 0 && key[h] > 0) {
        const path = pathTo(prev, idx(m, sel.x, sel.y), h);
        const cost = Math.floor(key[h] / 1000);
        const pts = [idx(m, sel.x, sel.y), ...path].map((p) => `${(p % W) * T + T / 2},${Math.floor(p / W) * T + T / 2}`).join(' ');
        const bad = cost > sel.ap ? ' far' : key[h] % 1000 > 0 ? ' risky' : '';
        parts.push(`<polyline points="${pts}" class="path${bad}"/>`);
        parts.push(`<text x="${(h % W) * T + T / 2}" y="${Math.floor(h / W) * T - 3}" class="cost${bad}">${cost}</text>`);
      }
    }
    // Guard plans.
    for (const g of m.guards) {
      if (!awake(g) || !guardShown(m, g, vis)) continue;
      const it = guardIntent(m, g);
      if (it.shoot >= 0) {
        const a = m.agents[it.shoot];
        parts.push(`<line x1="${g.x * T + T / 2}" y1="${g.y * T + T / 2}" x2="${a.x * T + T / 2}" y2="${a.y * T + T / 2}" class="aim"/>`);
        continue;
      }
      if (!it.path.length) continue;
      const pts = [idx(m, g.x, g.y), ...it.path].map((p) => `${(p % W) * T + T / 2},${Math.floor(p / W) * T + T / 2}`).join(' ');
      parts.push(`<polyline points="${pts}" class="gpath"/>`);
      const last = it.path[it.path.length - 1];
      const lx = (last % W) * T + T / 2;
      const ly = Math.floor(last / W) * T + T / 2;
      parts.push(`<g transform="translate(${lx} ${ly}) rotate(${it.face * 90})"><path d="M6,-5 L12,0 L6,5" class="garrow"/></g><circle cx="${lx}" cy="${ly}" r="4" class="gend"/>`);
    }
    // Objects.
    for (const o of m.objs) {
      const i = idx(m, o.x, o.y);
      if (!m.seen[i]) continue;
      const cx = o.x * T + T / 2;
      const cy = o.y * T + T / 2;
      if (o.kind === 'camera') {
        parts.push(`<g transform="translate(${cx} ${cy}) rotate(${o.dir * 90})"><path d="M4,-6 L13,0 L4,6 Z" class="camdir${o.off > 0 ? ' off' : ''}"/></g>`);
        parts.push(`<text x="${cx}" y="${cy + 6}" class="emo${o.off > 0 ? ' off' : ''}">📷</text>`);
        continue;
      }
      const icon = o.kind === 'terminal' ? '💻' : o.kind === 'safe' ? (o.used ? '📭' : '🔒') : MISSIONS[m.kind].targetIcon;
      parts.push(`<rect x="${o.x * T + 2}" y="${o.y * T + 2}" width="${T - 4}" height="${T - 4}" rx="6" class="obj ${o.kind}${o.used ? ' used' : ''}"/>`);
      parts.push(`<text x="${cx}" y="${cy + 7}" class="emo${o.used ? ' off' : ''}">${icon}</text>`);
      if (!o.used && o.kind !== 'terminal') parts.push(`<text x="${o.x * T + T - 3}" y="${o.y * T + 11}" class="badge">${o.lock}⚡</text>`);
    }
    // Guards.
    for (const g of m.guards) {
      if (!guardShown(m, g, vis)) continue;
      const d = GUARDS[g.kind];
      const cx = g.x * T + T / 2;
      const cy = g.y * T + T / 2;
      const st = g.state;
      parts.push(`<g class="unit guard ${st}${vis[idx(m, g.x, g.y)] ? '' : ' ghost'}">`);
      if (awake(g)) parts.push(`<g transform="translate(${cx} ${cy}) rotate(${g.dir * 90})"><path d="M9,-8 L17,0 L9,8 Z" class="facing"/></g>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="12" class="gbody"/>`);
      parts.push(`<text x="${cx}" y="${cy + 6}" class="emo">${d.icon}</text>`);
      const badge = st === 'ko' ? `💤${g.ko}` : st === 'off' ? `⚡${g.ko}` : st === 'chase' ? '❗' : st === 'investigate' ? '❓' : '';
      if (badge) parts.push(`<text x="${cx + 9}" y="${cy - 8}" class="badge2">${badge}</text>`);
      if (g.tagged) parts.push(`<text x="${cx - 11}" y="${cy - 8}" class="badge2">🔭</text>`);
      parts.push('</g>');
    }
    // Agents.
    m.agents.forEach((a, k) => {
      if (a.out) return;
      const d = AGENTS[a.id];
      const cx = a.x * T + T / 2;
      const cy = a.y * T + T / 2;
      parts.push(`<g class="unit agent${k === this.sel ? ' sel' : ''}${a.down ? ' down' : ''}${a.cloak ? ' cloak' : ''}" style="--c:${d.color}">`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="13" class="abody"/>`);
      parts.push(`<text x="${cx}" y="${cy + 6}" class="emo">${a.down ? '✖' : d.icon}</text>`);
      if (!a.down) parts.push(`<text x="${cx + 11}" y="${cy + 14}" class="apb">${a.ap}</text>`);
      parts.push('</g>');
    });
    // Gadget targets.
    if (this.targeting !== null && sel) {
      for (let i = 0; i < m.t.length; i++) {
        if (check(m, { t: 'gadget', a: this.sel, slot: this.targeting, at: i })) continue;
        parts.push(`<rect x="${(i % W) * T + 2}" y="${Math.floor(i / W) * T + 2}" width="${T - 4}" height="${T - 4}" rx="5" class="tgt"/>`);
      }
    }
    // Effects.
    for (const f of m.fx) parts.push(this.fxSvg(f));
    return `<svg id="board" viewBox="0 0 ${m.W * T} ${m.H * T}" class="${this.busy ? 'busy' : ''}" role="img" aria-label="Facility map">
      ${parts.join('')}
    </svg>`;
  }

  private fxSvg(f: Fx): string {
    const k = this.fxKey++;
    const cx = f.x * T + T / 2;
    const cy = f.y * T + T / 2;
    if (f.k === 'shot') return `<line x1="${cx}" y1="${cy}" x2="${f.x2! * T + T / 2}" y2="${f.y2! * T + T / 2}" class="fx-shot" style="stroke:${f.color ?? '#ff5d73'}" data-k="${k}"/>`;
    if (f.k === 'ring') return `<circle cx="${cx}" cy="${cy}" r="${(f.r ?? 3) * T}" class="fx-ring" style="stroke:${f.color ?? '#fff'}"/>`;
    return `<text x="${cx}" y="${cy - 10}" class="fx-text" style="fill:${f.color ?? '#fff'}">${f.text}</text>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal:</b> hack 💻 terminals for power ⚡, take the target with power, then bring your agents to the 🟩 exit pad and press <b>Escape</b>.</li>
          <li><b>Turns:</b> each agent has action points (AP). Moving costs 1 AP per tile. Walking through a closed door costs 1 more.</li>
          <li><b>Guards</b> see in a cone (red). If you enter a cone, the guard spots you, the alarm rises and the guard hunts you. A hunting guard that still sees you on its turn shoots.</li>
          <li><b>Plans:</b> the dotted line and arrow show where each guard moves next. Faint tiles show where guards will look during their next move.</li>
          <li><b>Cover</b> blocks movement. A guard cannot see an agent right behind cover, unless the guard stands next to it.</li>
          <li><b>Takedown:</b> stand next to a guard and knock it out (2 AP). It wakes up after 2 + combat turns. Stand on the body to keep it down.</li>
          <li><b>Doors</b> block sight. Peek through a closed door for 1 AP to see the room behind it.</li>
          <li><b>Cameras</b> 📷 are on the building plan. If one sees you, alarm +2 and a guard comes to look. Spend 1 ⚡ to hack a camera in sight.</li>
          <li><b>Alarm:</b> it rises 1 tick each turn. Every ${ALARM_STEP} ticks it goes up a level with a new rule: faster patrols, reinforcements, reboots, lockdown, enforcers, full alert.</li>
          <li><b>Down:</b> at 0 HP an agent is down. A teammate next to them can revive them (2 AP). Agents not on the pad when you escape are captured.</li>
          <li><b>Undo</b> is free when the action showed nothing new. Otherwise it costs a rewind ⏪.</li>
          <li><b>Campaign:</b> ${DAYS - 1} days of jobs, then the Vault. Spend credits in the safehouse on gadgets, implants, training and new agents.</li>
          <li><b>Keys:</b> <kbd>1</kbd>–<kbd>4</kbd> agent, <kbd>Tab</kbd> next agent, arrows/<kbd>WASD</kbd> step, <kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd><kbd>V</kbd> actions, <kbd>G</kbd><kbd>H</kbd><kbd>J</kbd> gadgets, <kbd>U</kbd> undo, <kbd>⏎</kbd> end turn, <kbd>L</kbd> escape, <kbd>N</kbd> plans, <kbd>Esc</kbd> cancel or menu.</li>
          <li><b>Touch:</b> tap a tile to see the path, tap again to move.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'escape') {
      const mm = this.m!;
      const left = mm.agents.filter((a) => !a.out && mm.t[idx(mm, a.x, a.y)] !== EXIT);
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Escape now?</h2>
        ${mm.goal ? '' : '<p class="warn">You do not have the target. The mission fails.</p>'}
        ${left.length ? `<p class="bad">Left behind and captured: ${left.map((a) => AGENTS[a.id].name).join(', ')}.</p>` : ''}
        <button class="primary" data-act="escape-yes">Escape</button>
        <button data-act="modal-close">Stay</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It counts as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="to-title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Input ----------

  private boardTile(e: { clientX: number; clientY: number }): number {
    const svg = this.root.querySelector<SVGSVGElement>('#board');
    const m = this.m;
    if (!svg || !m) return -1;
    const ctm = svg.getScreenCTM();
    if (!ctm) return -1;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x = Math.floor(pt.x / T);
    const y = Math.floor(pt.y / T);
    if (x < 0 || y < 0 || x >= m.W || y >= m.H) return -1;
    return idx(m, x, y);
  }

  private setHover(i: number): void {
    if (this.screen !== 'mission' || this.busy || i === this.hover) return;
    this.hover = i;
    this.renderBoard();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || this.screen !== 'mission') return;
    const inBoard = (e.target as Element).closest?.('#board');
    this.setHover(inBoard ? this.boardTile(e) : -1);
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop], #board');
    if (!el) return;
    if (el.id === 'board') {
      const i = this.boardTile(e);
      if (i >= 0) this.clickTile(i);
      return;
    }
    if (el.hasAttribute('data-stop') && !el.dataset.act) return;
    if (el.tagName === 'INPUT') {
      this.action(el.dataset.act!, el.dataset);
      return;
    }
    this.action(el.dataset.act!, el.dataset);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (e.key === '?') {
      this.modal = { kind: 'help' };
      this.render();
      return;
    }
    if (this.screen === 'title' && e.key === 'Enter') {
      this.action(this.run && !this.run.over ? 'continue' : 'new', {});
      return;
    }
    if (this.screen !== 'mission' || this.busy || !this.m || this.m.over) return;
    const m = this.m;
    const key = e.key.toUpperCase();
    if (e.key === 'Escape') {
      if (this.targeting !== null || this.pending >= 0 || this.inspect >= 0) {
        this.targeting = null;
        this.pending = -1;
        this.inspect = -1;
      } else this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.cycle();
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      this.select(Number(e.key) - 1);
      return;
    }
    if (e.key === 'Enter') {
      void this.endTurn();
      return;
    }
    if (key === 'U') {
      this.undo();
      return;
    }
    if (key === 'L') {
      this.action('escape', {});
      return;
    }
    if (key === 'N') {
      this.showNext = !this.showNext;
      this.render();
      return;
    }
    const ai = ACT_KEYS.indexOf(key);
    if (ai >= 0) {
      this.action('opt', { i: String(ai) });
      return;
    }
    const gi = GAD_KEYS.indexOf(key);
    if (gi >= 0) {
      this.action('gadget', { s: String(gi) });
      return;
    }
    if (e.code in KEYDIR) {
      e.preventDefault();
      const a = m.agents[this.sel];
      if (!a || !active(a)) return;
      const d = KEYDIR[e.code];
      const x = a.x + DX[d];
      const y = a.y + DY[d];
      if (x < 0 || y < 0 || x >= m.W || y >= m.H) return;
      this.clickTile(idx(m, x, y), true);
    }
  }

  private cycle(): void {
    const m = this.m;
    if (!m) return;
    for (let k = 1; k <= m.agents.length; k++) {
      const j = (this.sel + k) % m.agents.length;
      if (active(m.agents[j])) {
        this.select(j);
        return;
      }
    }
  }

  private select(k: number): void {
    const m = this.m;
    if (!m || !m.agents[k] || m.agents[k].out) return;
    this.sel = k;
    this.targeting = null;
    this.pending = -1;
    this.inspect = -1;
    sfx.select();
    this.render();
  }

  /** Board click: gadget target, select, takedown, use, hack, door, or move. */
  private clickTile(i: number, direct = false): void {
    const m = this.m;
    if (!m || this.busy || m.over) return;
    const sel = m.agents[this.sel];
    if (this.targeting !== null) {
      const act: Action = { t: 'gadget', a: this.sel, slot: this.targeting, at: i };
      const err = check(m, act);
      if (err) {
        sfx.deny();
        this.toast(err);
        return;
      }
      this.targeting = null;
      this.doAction(act);
      return;
    }
    const k = agentAt(m, i);
    if (k >= 0 && k !== this.sel && !m.agents[k].down) {
      this.select(k);
      return;
    }
    const vis = agentVision(m);
    const g: Guard | undefined = m.guards.find((q) => idx(m, q.x, q.y) === i && guardShown(m, q, vis) && awake(q));
    const confirm = direct || !this.touch || this.inspect === i;
    if (g && sel && active(sel)) {
      const td: Action = { t: 'takedown', a: this.sel, g: g.id };
      const hk: Action = { t: 'hack', g: g.id };
      const act = !check(m, td) ? td : !check(m, hk) ? hk : null;
      if (act && confirm) {
        this.inspect = -1;
        this.doAction(act);
        return;
      }
      this.inspect = i;
      this.pending = -1;
      this.render();
      return;
    }
    if (sel && active(sel)) {
      const o = m.objs.find((q) => idx(m, q.x, q.y) === i && m.seen[i]);
      if (o) {
        const act: Action = o.kind === 'camera' ? { t: 'hack', obj: o.id } : { t: 'use', a: this.sel, obj: o.id };
        const err = check(m, act);
        if (!err && confirm) {
          this.inspect = -1;
          this.doAction(act);
          return;
        }
        if (err && confirm) {
          sfx.deny();
          this.toast(err);
        }
        this.inspect = i;
        this.render();
        return;
      }
      const mv: Action = { t: 'move', a: this.sel, to: i };
      const err = check(m, mv);
      if (err) {
        if (i !== idx(m, sel.x, sel.y)) {
          sfx.deny();
          this.toast(err);
        }
        this.pending = -1;
        this.inspect = i;
        this.render();
        return;
      }
      if (this.touch && !direct && this.pending !== i) {
        this.pending = i;
        this.inspect = i;
        this.render();
        return;
      }
      this.pending = -1;
      this.inspect = -1;
      this.doAction(mv);
      return;
    }
    this.inspect = i;
    this.render();
  }

  private playEvents(m: Mission): void {
    const ev = new Set(m.ev);
    if (ev.has('shot')) {
      sfx.shot();
      setTimeout(() => sfx.hurt(), 90);
    }
    if (ev.has('spotted')) sfx.spotted();
    if (ev.has('alarm')) sfx.alarm();
    if (ev.has('ko')) sfx.ko();
    if (ev.has('hack')) sfx.hack();
    if (ev.has('coin')) sfx.coin();
    if (ev.has('smoke')) sfx.smoke();
    else if (ev.has('gadget')) sfx.gadget();
    if (ev.has('door')) sfx.door();
    if (ev.has('step')) sfx.step();
    if (ev.has('escape')) sfx.escape();
  }

  private doAction(act: Action): void {
    const m = this.m!;
    const err = check(m, act);
    if (err) {
      sfx.deny();
      this.toast(err);
      return;
    }
    const next = apply(m, act);
    const seen = (x: Mission) => x.seen.reduce((s, v) => s + v, 0);
    const free = seen(next) === seen(m) && next.alarm === m.alarm && next.spots === m.spots && next.guards.length === m.guards.length && JSON.stringify(next.guards.map((g) => g.state)) === JSON.stringify(m.guards.map((g) => g.state));
    this.history.push({ m, free });
    this.m = next;
    this.playEvents(next);
    if (!active(next.agents[this.sel]) && !next.over) this.cycle();
    saveRun(this.run);
    if (next.over) void this.missionOver();
    else this.render();
  }

  private undo(): void {
    const m = this.m;
    if (!m || this.busy || !this.history.length) return;
    const h = this.history[this.history.length - 1];
    if (!h.free && m.rewinds <= 0) {
      sfx.deny();
      this.toast('No rewinds left.');
      return;
    }
    this.history.pop();
    const prev = structuredClone(h.m);
    prev.rewinds = h.free ? m.rewinds : m.rewinds - 1;
    prev.fx = [];
    this.m = prev;
    if (!h.free) this.toast(`Rewind used. ${prev.rewinds} left.`);
    sfx.turn();
    saveRun(this.run);
    this.render();
  }

  private async endTurn(): Promise<void> {
    const m = this.m;
    if (!m || this.busy || m.over) return;
    this.busy = true;
    this.targeting = null;
    this.pending = -1;
    this.inspect = -1;
    this.history = [];
    const frames: Mission[] = [];
    const next = apply(m, { t: 'end' }, frames);
    for (const f of frames) {
      if (!f.fx.length && !f.ev.length && FAST) continue;
      this.m = f;
      this.playEvents(f);
      if (f.ev.length === 0) sfx.guardStep();
      this.render();
      await sleep(f.fx.length ? 380 : 140);
    }
    this.m = next;
    this.busy = false;
    this.playEvents(next);
    sfx.turn();
    const a = next.agents[this.sel];
    if (!a || !active(a)) this.cycle();
    saveRun(this.run);
    if (next.over) await this.missionOver();
    else this.render();
  }

  private async missionOver(): Promise<void> {
    const m = this.m!;
    this.render();
    await sleep(m.over === 'wiped' ? 900 : 500);
    const rep = finishMission(this.run!, this.meta);
    saveMeta(this.meta);
    if (rep.success) sfx.win();
    else sfx.lose();
    this.history = [];
    this.screen = 'report';
    saveRun(this.run);
    this.render();
  }

  private finishRun(): void {
    const r = this.run!;
    const won = r.over === 'won';
    const sc = score(r);
    const intel = intelFor(r);
    this.meta.runs++;
    if (won) this.meta.wins++;
    this.meta.best = Math.max(this.meta.best, sc);
    this.meta.intel += intel;
    saveMeta(this.meta);
    this.end = { won, score: sc, day: r.day, intel, stats: { ...r.stats } };
    this.run = null;
    saveRun(null);
    this.screen = 'end';
    if (won) sfx.win();
    else sfx.lose();
    this.render();
  }

  private startRun(team: AgentId[]): void {
    this.run = newRun(randomSeedText(), team, this.meta);
    this.screen = 'map';
    saveRun(this.run);
    this.render();
  }

  private enterMission(i: number): void {
    const r = this.run!;
    startMission(r, i);
    this.sel = 0;
    this.history = [];
    this.screen = 'mission';
    saveRun(r);
    sfx.turn();
    this.render();
  }

  private resume(): void {
    const r = this.run;
    if (!r) return;
    this.screen = r.phase === 'mission' && r.mission ? 'mission' : r.phase === 'report' && r.report ? 'report' : r.phase === 'shop' ? 'shop' : 'map';
    if (r.over && this.screen !== 'report') {
      this.finishRun();
      return;
    }
    this.sel = 0;
    this.render();
  }

  private action(act: string, ds: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'help':
        this.modal = { kind: 'help' };
        break;
      case 'mute':
        toggleMute();
        try {
          localStorage.setItem('silent.mute', isMuted() ? '1' : '0');
        } catch {
          /* ignore */
        }
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        break;
      case 'modal-close':
        this.modal = null;
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        break;
      case 'abandon-yes':
        this.modal = null;
        if (r) {
          r.over = 'lost';
          this.finishRun();
          return;
        }
        break;
      case 'to-title':
        this.modal = null;
        this.screen = 'title';
        break;
      case 'continue':
        this.resume();
        return;
      case 'new':
        this.crew = this.meta.unlocked.slice(0, 3);
        this.screen = 'crew';
        break;
      case 'title':
        this.screen = 'title';
        break;
      case 'crew': {
        const id = ds.id as AgentId;
        if (this.crew.includes(id)) this.crew = this.crew.filter((c) => c !== id);
        else if (this.crew.length < 3) this.crew.push(id);
        else this.crew = [...this.crew.slice(1), id];
        sfx.select();
        break;
      }
      case 'start':
        this.startRun(this.crew);
        return;
      case 'unlock-agent': {
        const id = ds.id as AgentId;
        const c = AGENTS[id].unlock;
        if (this.meta.intel >= c && !this.meta.unlocked.includes(id)) {
          this.meta.intel -= c;
          this.meta.unlocked.push(id);
          saveMeta(this.meta);
          sfx.buy();
        }
        break;
      }
      case 'unlock-kit': {
        const l = LOADOUTS.find((x) => x.id === ds.id)!;
        if (this.meta.intel >= l.cost && !this.meta.loadouts.includes(l.id)) {
          this.meta.intel -= l.cost;
          this.meta.loadouts.push(l.id);
          saveMeta(this.meta);
          sfx.buy();
        }
        break;
      }
      case 'offer':
        this.enterMission(Number(ds.i));
        return;
      case 'report-next':
        if (!r) break;
        if (r.over) {
          this.finishRun();
          return;
        }
        toShop(r, this.meta);
        this.screen = 'shop';
        saveRun(r);
        break;
      case 'buy':
        if (r && buy(r, Number(ds.i), Number(ds.k))) {
          sfx.buy();
          saveRun(r);
        } else sfx.deny();
        break;
      case 'train':
        if (r && train(r, Number(ds.k), ds.s as Skill)) {
          sfx.buy();
          saveRun(r);
        }
        break;
      case 'sell':
        if (r) {
          sellGadget(r, Number(ds.k), Number(ds.s));
          sfx.coin();
          saveRun(r);
        }
        break;
      case 'install':
        if (r && installPending(r, Number(ds.k))) {
          sfx.buy();
          saveRun(r);
        }
        break;
      case 'next-day':
        if (!r) break;
        nextDay(r);
        this.screen = 'map';
        saveRun(r);
        break;
      case 'sel':
        this.select(Number(ds.k));
        return;
      case 'opt': {
        const m = this.m;
        if (!m || this.busy) return;
        const o = agentOptions(m, this.sel)[Number(ds.i)];
        if (o) this.doAction(o.act);
        return;
      }
      case 'gadget': {
        const m = this.m;
        if (!m || this.busy) return;
        const s = Number(ds.s);
        const a = m.agents[this.sel];
        const g = a?.gadgets[s];
        if (!g) return;
        const def = GADGETS[g.id];
        if (def.target === 'self') {
          this.doAction({ t: 'gadget', a: this.sel, slot: s, at: idx(m, a.x, a.y) });
          return;
        }
        this.targeting = this.targeting === s ? null : s;
        break;
      }
      case 'cancel':
        this.targeting = null;
        break;
      case 'undo':
        this.undo();
        return;
      case 'end-turn':
        void this.endTurn();
        return;
      case 'escape': {
        const m = this.m;
        if (!m || this.busy) return;
        const err = check(m, { t: 'escape' });
        if (err) {
          this.toast(err);
          return;
        }
        this.modal = { kind: 'escape' };
        break;
      }
      case 'escape-yes':
        this.modal = null;
        this.doAction({ t: 'escape' });
        return;
      case 'toggle-next':
        this.showNext = !this.showNext;
        break;
    }
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        busy: this.busy,
        day: this.run?.day,
        credits: this.run?.credits,
        roster: this.run?.roster.map((a) => a.id),
        turn: this.m?.turn,
        alarm: this.m ? level(this.m) : null,
        pwr: this.m?.pwr,
        goal: this.m?.goal,
        agents: this.m?.agents.map((a) => `${a.id} ${a.hp}/${a.maxHp} ap${a.ap}${a.down ? ' down' : ''}${a.out ? ' out' : ''}`),
        guards: this.m?.guards.length,
        end: this.end,
        modal: this.modal?.kind ?? null,
      }),
      credits: (n: number) => {
        if (this.run) this.run.credits += n;
        this.render();
      },
      intel: (n: number) => {
        this.meta.intel += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        const m = this.m;
        if (!m) return;
        m.goal = true;
        for (const a of m.agents) a.out = true;
        m.over = 'escaped';
        void this.missionOver();
      },
      reset: () => {
        this.meta = defaultMeta();
        saveMeta(this.meta);
        this.run = null;
        saveRun(null);
        this.screen = 'title';
        this.render();
      },
      /** One bot action for automatic tests. In a mission it plays a whole turn. */
      step: async (smart = true) => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            this.action(r && !r.over ? 'continue' : 'new', {});
            return 'title';
          case 'crew':
            this.startRun(this.meta.unlocked.slice(0, 3));
            return 'crew';
          case 'map':
            this.enterMission(botPickOffer(r!, smart));
            return 'map';
          case 'mission': {
            let m = this.m!;
            for (let n = 0; n < 60 && !m.over; n++) {
              const act = botAction(m, smart);
              if (act.t === 'end') break;
              if (check(m, act)) break;
              m = apply(m, act);
            }
            this.m = m;
            this.history = [];
            if (m.over) {
              await this.missionOver();
              return 'mission-over';
            }
            if (m.turn > 80) {
              // Safety net for endless bot games.
              m.over = 'wiped';
              await this.missionOver();
              return 'timeout';
            }
            this.render();
            await this.endTurn();
            return 'turn';
          }
          case 'report':
            this.action('report-next', {});
            return 'report';
          case 'shop':
            botShop(r!, smart);
            this.action('next-day', {});
            return 'shop';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

