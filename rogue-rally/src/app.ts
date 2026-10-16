import { chooseNode, choosePick, partValue, pitChoice, shopPlan } from './bot';
import { CARS, CAR_BY_ID, DRIVER_BY_ID, PART_BY_ID, PERSONALITY_INFO, RARITY, RARITY_COLOR, SLOTS, SLOT_INFO, SURFACES, THEMES, type PartDef } from './data';
import { DT, NO_INPUT, playerIndex, respawn, stepRace, type Input, type Race } from './race';
import { RaceView, fmtTime, ordinal, trackSvg } from './render';
import { Rng, randomSeedText } from './rng';
import {
  MAX_TUNE,
  NODE_INFO,
  PLAN,
  RACES,
  RACE_NO,
  advance,
  applyRace,
  buy,
  clearRun,
  equip,
  fullRepairCost,
  isRaceKind,
  loadMeta,
  loadRun,
  makeRace,
  makeShop,
  newRun,
  nodesFor,
  pickEvent,
  pit,
  playerStats,
  raceNo,
  rngFor,
  saveMeta,
  saveRun,
  score,
  standingsTable,
  trackFor,
  trialPar,
  trophiesFor,
  type EventDef,
  type MapNode,
  type RaceResult,
  type RunState,
} from './run';
import { engineSet, engineStop, initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'race' | 'results' | 'shop' | 'pit' | 'event' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const QS = new URLSearchParams(location.search);
/** `?debug&fast` makes bot steps simulate longer chunks of race time. */
const FAST = QS.has('fast');

type Hold = 'left' | 'right' | 'gas' | 'brake' | 'drift' | 'nitro' | 'gadget';

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Race
  private race: Race | null = null;
  private node: MapNode | null = null;
  private par: number[] | null = null;
  private view: RaceView | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private finishWait = 0;
  private keys = new Set<string>();
  private holds = new Map<number, Hold>();
  private autoGas = false;
  private lastCount = -1;

  // Other screens
  private result: RaceResult | null = null;
  private picked = false;
  private event: { def: EventDef; result: string | null } | null = null;
  private pitDone: string | null = null;
  private end: { champion: boolean; score: number; trophies: number; stage: number; reason: string; races: number; wins: number; bosses: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.holds.clear();
    });
    window.addEventListener('resize', () => this.view?.resize());
    root.addEventListener('contextmenu', (e) => {
      if (this.screen === 'race') e.preventDefault();
    });
    if (QS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'race':
        body = this.raceView();
        break;
      case 'results':
        body = this.resultsView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'pit':
        body = this.pitView();
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
    if (this.screen === 'race') {
      const cv = this.root.querySelector<HTMLCanvasElement>('#cv')!;
      this.view = new RaceView(cv);
      if (this.race) this.view.reset(this.race);
    } else this.view = null;
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const st = playerStats(r);
    const pct = Math.max(0, Math.min(100, (r.hp / st.hp) * 100));
    const strikes = `🏳️ ${r.strikes}/2`;
    const rn = RACE_NO[r.stage] >= 0 ? RACE_NO[r.stage] + 1 : raceNo(r) + 1;
    return `<header class="top">
      <span class="tb-car" title="${CAR_BY_ID[r.car].name}">${CAR_BY_ID[r.car].icon}</span>
      <span class="tb-hp" title="Car HP"><i style="width:${pct}%"></i><b>${Math.ceil(r.hp)}/${st.hp}</b></span>
      <span title="Money">💰 ${r.money}</span>
      <span class="hide-s" title="Season race">🏁 ${Math.min(rn, RACES)}/${RACES}</span>
      <span title="Last places (2 end the run)">${strikes}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const cars = CARS.map((c) => {
      const own = c.unlock === 0 || m.unlocked.includes(c.id);
      const sel = m.car === c.id;
      return `<div class="carc ${sel ? 'sel' : ''} ${own ? '' : 'locked'}" style="--c:${c.color}">
        <span class="big">${c.icon}</span><b>${c.name}</b><small>${c.text}</small>
        ${own ? (sel ? '<span class="ok">✔ Selected</span>' : `<button data-act="car" data-id="${c.id}">Select</button>`) : `<button data-act="unlock" data-id="${c.id}" ${m.trophies >= c.unlock ? '' : 'disabled'}>🏆 ${c.unlock}</button>`}
      </div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🏎️💨</div>
      <h1>Rogue Rally</h1>
      <p class="sub">Top-down rally racing. Drift to fill your nitro, bolt on new parts, and survive a 10-race season. Finish last twice and you are out.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue season (race ${raceNo(r) + 1}/${RACES}, ${CAR_BY_ID[r.car].icon} ${Math.ceil(r.hp)} HP)</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New season (abandons the current one)' : '▶ New season'}</button>
      <div class="row"><button data-act="help">How to play</button><button class="icon-btn" data-act="mute">${isMuted() ? '🔇' : '🔊'}</button></div>
      <p class="stats">Seasons ${m.runs} · Titles ${m.wins} · Race wins ${m.firsts} · Best score ${m.best} · 🏆 ${m.trophies}</p>
      <h3>Garage</h3>
      <p class="sub small">Trophies 🏆 come from your score. Spend them to unlock new cars.</p>
      <div class="cars">${cars}</div>
    </div>`;
  }

  private partCard(p: PartDef, extra = '', act = '', disabled = false): string {
    const run = this.run!;
    const cur = run.parts[p.slot];
    const repl = cur ? `Replaces ${PART_BY_ID[cur].name} (${RARITY[PART_BY_ID[cur].rarity]})` : 'Empty slot';
    const better = partValue(run, p.id) > 0;
    return `<button class="pick part" ${act} ${disabled ? 'disabled' : ''} style="--r:${RARITY_COLOR[p.rarity]}">
      <span class="rar">${SLOT_INFO[p.slot].icon} ${SLOT_INFO[p.slot].name} · ${RARITY[p.rarity]}</span>
      <span class="big">${p.icon}</span><b>${p.name}</b><small>${p.text}</small>
      <small class="${better ? 'good' : 'dim'}">${repl}</small>${extra}</button>`;
  }

  private garage(): string {
    const r = this.run!;
    const st = playerStats(r);
    const car = CAR_BY_ID[r.car];
    const slots = SLOTS.map((s) => {
      const id = r.parts[s];
      const p = id ? PART_BY_ID[id] : null;
      return `<li title="${p ? p.text : 'Empty'}"><span>${SLOT_INFO[s].icon} ${SLOT_INFO[s].name}</span><b style="color:${p ? RARITY_COLOR[p.rarity] : 'var(--muted)'}">${p ? `${p.icon} ${p.name}` : '—'}</b></li>`;
    }).join('');
    const statBar = (name: string, v: number, lo: number, hi: number, text: string) => {
      const f = Math.max(0.05, Math.min(1, (v - lo) / (hi - lo)));
      return `<div class="stat"><span>${name}</span><i><em style="width:${f * 100}%"></em></i><b>${text}</b></div>`;
    };
    return `<section class="panel garage"><h3>${car.icon} ${car.name}${r.tune ? ` <small>+${r.tune} tune</small>` : ''}</h3>
      <ul class="slots">${slots}</ul>
      ${statBar('Speed', st.speed, 380, 560, String(Math.round(st.speed)))}
      ${statBar('Accel', st.accel, 0.8, 1.6, `${Math.round(st.accel * 100)}%`)}
      ${statBar('Grip', st.grip, 0.8, 1.4, `${Math.round(st.grip * 100)}%`)}
      ${statBar('Nitro', st.nitroCap * st.nitroPower, 80, 220, `${Math.round(st.nitroCap)}`)}
      ${statBar('Armor', st.hp / st.guard, 60, 300, `${st.hp} HP`)}
    </section>`;
  }

  private standingsView(): string {
    const r = this.run!;
    const rows = standingsTable(r)
      .map(([id, pts], i) => {
        const d = id === 'you' ? null : DRIVER_BY_ID[id];
        const name = d ? `${d.icon} ${d.name}` : `${CAR_BY_ID[r.car].icon} You`;
        return `<tr class="${id === 'you' ? 'me' : ''}" title="${d ? PERSONALITY_INFO[d.pers] : ''}"><td>${i + 1}</td><td>${name}</td><td class="dim">${d ? d.pers : ''}</td><td><b>${pts}</b></td></tr>`;
      })
      .join('');
    return `<section class="panel"><h3>🏆 Standings</h3><table class="tbl">${rows}</table></section>`;
  }

  private mapView(): string {
    const r = this.run!;
    const track = PLAN.map((opts, i) => {
      const state = i < r.stage ? 'done' : i === r.stage ? 'now' : '';
      const log = r.log.find((l) => l.stage === i);
      const label = log ? (log.place <= 2 ? ['🥇', '🥈', '🥉'][log.place] : log.place === 5 ? '🏳️' : `${log.place + 1}`) : opts.map((o) => NODE_INFO[o].icon).join('');
      return `<span class="node ${state}">${label}</span>`;
    }).join('<span class="link"></span>');
    const nodes = nodesFor(r);
    const rooms = nodes
      .map((n, i) => {
        const info = NODE_INFO[n.kind];
        let extra = '';
        if (isRaceKind(n.kind)) {
          const tr = trackFor(n);
          const th = THEMES[n.theme];
          const surf = (['asphalt', 'dirt', 'ice'] as const).map((s) => [s, tr.tiles.filter((t) => t.surface === s).length] as const).filter(([, c]) => c > 0);
          const total = tr.tiles.length;
          extra = `${trackSvg(tr)}<small>${th.icon} ${th.name} · ${total} tiles</small>
            <small class="surf">${surf.map(([s, c]) => `<i style="background:${SURFACES[s].color}"></i>${SURFACES[s].name} ${Math.round((c / total) * 100)}%`).join(' ')}</small>
            <small class="cost">Prize 💰 ${n.prize}</small>`;
          if (n.boss) extra += `<small class="foe">${DRIVER_BY_ID[n.boss].icon} ${DRIVER_BY_ID[n.boss].name}</small>`;
        }
        return `<button class="room r-${n.kind}" data-act="node" data-i="${i}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>Season — stage ${r.stage + 1}/${PLAN.length}</h2>
      <div class="track">${track}</div>
      <p class="sub small">Choose your next stop.</p>
      <div class="rooms">${rooms}</div>
      <div class="cols">${this.garage()}${this.standingsView()}</div>
    </div>`;
  }

  private raceView(): string {
    const g = this.race?.cars[playerIndex(this.race)].gadget;
    const gIcon = g ? { mine: '💣', oil: '🛢️', shield: '🔰', can: '🥫' }[g] : '—';
    return `<div class="racebox"><canvas id="cv"></canvas>
      <div class="pad pad-l">
        <button data-hold="left" aria-label="Steer left">◀</button>
        <button data-hold="right" aria-label="Steer right">▶</button>
      </div>
      <div class="pad pad-r">
        <button data-hold="drift" class="sm">DRIFT</button>
        <button data-hold="nitro" class="sm nit">🔥</button>
        <button data-hold="brake" class="sm">BRAKE</button>
        <button data-hold="gadget" class="sm" ${g ? '' : 'disabled'}>${gIcon}</button>
        <button data-hold="gas" class="gas">GAS</button>
      </div>
    </div>`;
  }

  private resultsView(): string {
    const res = this.result!;
    const node = this.node!;
    const trial = node.kind === 'trial';
    let head = '';
    if (trial) {
      const medal = res.medal >= 0 ? ['🥇 Gold', '🥈 Silver', '🥉 Bronze'][res.medal] : 'No medal';
      head = `<h2 class="${res.medal >= 0 ? 'good' : 'bad'}">${medal}</h2>
        <p>Your time <b>${fmtTime(res.time)}</b> · 🥇 ${fmtTime(res.par![0])} · 🥈 ${fmtTime(res.par![1])} · 🥉 ${fmtTime(res.par![2])}</p>`;
    } else {
      head = `<h2 class="${res.place <= 2 ? 'good' : res.place === 5 ? 'bad' : ''}">${ordinal(res.place)} place</h2>`;
    }
    const table = trial
      ? ''
      : `<table class="tbl res">${res.table
          .map((t, i) => `<tr class="${t.me ? 'me' : ''}"><td>${i + 1}</td><td>${t.icon} ${t.name}${t.boss ? ' 👑' : ''}</td><td>${t.time >= 0 ? fmtTime(t.time) : '—'}</td><td>+${t.points}</td></tr>`)
          .join('')}</table>`;
    const notes: string[] = [`💰 +${res.money}`, `🏆 +${res.points} points`];
    if (res.damage) notes.push(`💥 −${res.damage} HP`);
    if (res.repair) notes.push(`🔧 crew +${res.repair} HP`);
    const strike = res.strike ? `<p class="bad strike">🏳️ Last place! ${this.run!.strikes >= 2 ? 'That is your second. The season is over.' : 'One more and the season ends.'}</p>` : '';
    const boss = res.bossBeat ? '<p class="good">👑 You beat the boss rival!</p>' : node.kind === 'boss' ? '<p class="bad">The boss rival finished ahead of you.</p>' : '';
    const picks = res.picks.length
      ? this.picked
        ? '<p class="dim">Part taken.</p>'
        : `<h3>Choose a part</h3><div class="picks">${res.picks.map((id, i) => this.partCard(PART_BY_ID[id], '', `data-act="pick" data-i="${i}"`)).join('')}</div><button data-act="skip">Skip</button>`
      : '';
    return `<div class="results">${head}${table}<p class="notes">${notes.join(' · ')}</p>${strike}${boss}${picks}
      <button class="primary" data-act="advance" ${res.picks.length && !this.picked ? 'disabled' : ''}>Continue ▶</button></div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = makeShop(r)
      .map((it, i) => {
        if (it.kind === 'part') {
          const p = PART_BY_ID[it.id];
          return this.partCard(p, `<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span>`, `data-act="buy" data-i="${i}"`, it.sold || r.money < it.cost);
        }
        const max = playerStats(r).hp;
        const cost = it.kind === 'full' ? fullRepairCost(r) : it.cost;
        const off = r.hp >= max || r.money < cost;
        const body = it.kind === 'repair' ? `<span class="big">🔧</span><b>Patch ${it.n} HP</b>` : `<span class="big">🛠️</span><b>Full repair</b><small>${Math.ceil(r.hp)} → ${max} HP</small>`;
        return `<button class="pick" data-act="buy" data-i="${i}" ${off ? 'disabled' : ''}>${body}<span class="cost">💰 ${cost}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Parts Shop</h2><p>💰 ${r.money} · An old part sells for 25% of its price when you replace it.</p><div class="picks">${items}</div>
      <button class="primary" data-act="advance">Leave ▶</button></div>`;
  }

  private pitView(): string {
    const r = this.run!;
    const max = playerStats(r).hp;
    if (this.pitDone) return `<div class="shopv"><h2>🔧 Pit Stop</h2><p class="result">${this.pitDone}</p><button class="primary" data-act="advance">Continue ▶</button></div>`;
    return `<div class="shopv"><h2>🔧 Pit Stop</h2><p class="sub">The crew has time for one job.</p><div class="picks">
      <button class="pick" data-act="pit" data-c="repair" ${r.hp >= max ? 'disabled' : ''}><span class="big">🛠️</span><b>Full repair</b><small>${Math.ceil(r.hp)} → ${max} HP, free.</small></button>
      <button class="pick" data-act="pit" data-c="tune" ${r.tune >= MAX_TUNE ? 'disabled' : ''}><span class="big">⚙️</span><b>Tune-up</b><small>+3% speed and acceleration (${r.tune}/${MAX_TUNE}).</small></button>
      <button class="pick" data-act="pit" data-c="clean" ${r.strikes ? '' : 'disabled'}><span class="big">🧽</span><b>Clean record</b><small>Remove one last-place mark (${r.strikes}/2).</small></button>
    </div></div>`;
  }

  private eventView(): string {
    const ev = this.event!;
    const r = this.run!;
    const opts = ev.def.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${o.can && !o.can(r) ? 'disabled' : ''}>${o.label}</button>`).join('');
    return `<div class="eventv"><span class="huge">${ev.def.icon}</span><h2>${ev.def.title}</h2><p>${ev.def.text}</p>
      ${ev.result ? `<p class="result">${ev.result}</p><button class="primary" data-act="advance">Continue ▶</button>` : `<div class="opts">${opts}</div>`}</div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.champion ? '🏆' : '💥'}</div>
      <h1 class="${e.champion ? 'good' : 'bad'}">${e.champion ? 'Champion!' : 'Season over'}</h1>
      <p class="sub">${e.reason}</p>
      <p>🏁 ${e.races} races · 🥇 ${e.wins} wins · 👑 ${e.bosses} bosses beaten</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>🏆 +${e.trophies} trophies (now ${this.meta.trophies})</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help')
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Drive:</b> arrow keys or WASD. <b>Space</b> drifts (handbrake). <b>Shift</b> or <b>X</b> fires nitro. <b>E</b> or <b>Z</b> uses your gadget. <b>R</b> puts the car back on the road. <b>Esc</b> pauses.</li>
          <li><b>Gamepad:</b> stick steers, RT or A is gas, LT or B brakes, X drifts, RB fires nitro, Y or LB uses the gadget.</li>
          <li><b>Touch:</b> ◀ ▶ steer. After the first tap the car drives on by itself. Hold BRAKE to slow down.</li>
          <li><b>Drifting fills nitro.</b> Slide sideways through corners to fill the blue bar, then fire it on a straight.</li>
          <li><b>Surfaces:</b> asphalt grips well, dirt slides, ice is very slippery. Grass and the mud after a ramp slow you down. Hit a ramp fast to jump the mud.</li>
          <li><b>Damage stays.</b> Walls, crashes and mines cost HP. At 0 HP the car is wrecked and loses a third of its speed. Repair at the shop or a pit stop.</li>
          <li><b>Season:</b> 10 races on a branching map with shops, pit stops and side streets. Top 3 earns a part. Time trials ask you to beat the bronze time.</li>
          <li><b>Bosses:</b> Baron Skidmark waits halfway. Queen Vex waits at the end. Finish ahead of Queen Vex to win the title.</li>
          <li><b>Last place</b> (or no medal in a trial) gives a 🏳️. Two of them end the season.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      <button data-act="help">How to play</button>
      ${m.confirm ? '<p class="warn">Abandon this season? It ends as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon season</button>'}
      <button data-act="title">Title screen</button>
    </div></div>`;
  }

  // ---------- Flow ----------

  private enterNode(i: number): void {
    const r = this.run!;
    const node = nodesFor(r)[i];
    if (!node) return;
    this.node = node;
    if (isRaceKind(node.kind)) {
      this.startRace(node);
      return;
    }
    if (node.kind === 'shop') {
      makeShop(r);
      saveRun(r);
      this.screen = 'shop';
    } else if (node.kind === 'pit') {
      this.pitDone = null;
      this.screen = 'pit';
    } else {
      this.event = { def: pickEvent(r), result: null };
      this.screen = 'event';
    }
    this.render();
  }

  private startRace(node: MapNode, autoPlayer = false): void {
    const r = this.run!;
    this.race = makeRace(r, node);
    this.race.autoPlayer = autoPlayer;
    this.par = node.kind === 'trial' ? trialPar(r, node) : null;
    this.finishWait = 0;
    this.lastCount = -1;
    this.screen = 'race';
    this.render();
    if (node.kind === 'trial' && this.par) this.toast(`🥉 Bronze ${fmtTime(this.par[2])} · 🥈 ${fmtTime(this.par[1])} · 🥇 ${fmtTime(this.par[0])}`);
    else if (node.boss) this.toast(`${DRIVER_BY_ID[node.boss].icon} ${DRIVER_BY_ID[node.boss].name} joins the race!`);
    this.last = performance.now();
    this.acc = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private loop(now: number): void {
    if (this.screen !== 'race' || !this.race) {
      engineStop();
      return;
    }
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const race = this.race;
    if (!this.modal && !document.hidden) {
      this.acc += dt;
      race.playerInput = this.readInput();
      while (this.acc >= DT) {
        this.acc -= DT;
        this.physicsStep();
        if (this.screen !== 'race') return;
      }
      const pc = race.cars[playerIndex(race)];
      engineSet(Math.hypot(pc.vx, pc.vy) / 430, pc.nitroOn);
    } else engineStop();
    this.view?.draw(race, this.modal ? 0 : dt, playerIndex(race));
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** One fixed step with effects and sounds. */
  private physicsStep(): void {
    const race = this.race!;
    const pi = playerIndex(race);
    const wasDone = race.done;
    stepRace(race);
    const cnt = Math.ceil(3 - race.t);
    if (cnt !== this.lastCount) {
      this.lastCount = cnt;
      if (cnt > 0 && cnt <= 3) sfx.beep();
      else if (cnt === 0) sfx.go();
    }
    const me = race.cars[pi];
    for (const e of race.events) {
      this.view?.onEvent(race, e);
      const near = Math.hypot(e.x - me.x, e.y - me.y) < 260;
      if (!near && e.car !== pi) continue;
      switch (e.kind) {
        case 'crash':
          sfx.crash(e.amt);
          break;
        case 'wall':
          if (e.car === pi) sfx.wall();
          break;
        case 'mine':
          sfx.mine();
          break;
        case 'oil':
          if (e.car === pi) sfx.oil();
          break;
        case 'shield':
          sfx.shield();
          break;
        case 'jump':
          if (e.car === pi) sfx.jump();
          break;
        case 'land':
          if (e.car === pi) sfx.land();
          break;
        case 'boost':
          if (e.car === pi) sfx.boost();
          break;
        case 'lap':
          if (e.car === pi) sfx.lap();
          break;
        case 'wreck':
          sfx.wreck();
          break;
        case 'gadget':
          if (e.car === pi) sfx.drop();
          break;
        case 'finish':
          if (e.car === pi) sfx.win();
          break;
        default:
          break;
      }
    }
    race.events.length = 0;
    this.view?.afterStep(race);
    if (me.nitroOn && Math.random() < 0.05) sfx.nitro();
    if (race.done && !wasDone) this.finishRace();
    if (race.done) {
      this.finishWait += DT;
      if (this.finishWait > 2.6) this.showResults();
    }
  }

  private finishRace(): void {
    const r = this.run!;
    this.result = applyRace(r, this.node!, this.race!, this.par);
    this.race!.autoPlayer = true;
    this.picked = false;
    if (this.result.place === 0) this.meta.firsts++;
    saveMeta(this.meta);
    saveRun(r);
  }

  private showResults(): void {
    engineStop();
    cancelAnimationFrame(this.raf);
    this.screen = 'results';
    const res = this.result!;
    if (res.strike) sfx.lose();
    else if (res.place <= 2) sfx.item();
    this.render();
  }

  private nextStep(): void {
    const r = this.run!;
    const last = r.stage >= PLAN.length - 1;
    if (r.strikes >= 2) return this.endRun(false, 'Two last-place finishes. The team pulls you from the season.');
    if (last && this.screen === 'results') {
      const champ = !!this.result?.bossBeat;
      return this.endRun(champ, champ ? 'You beat Queen Vex in the final race. The title is yours!' : 'Queen Vex beat you in the final race.');
    }
    advance(r);
    saveRun(r);
    this.screen = 'map';
    this.render();
  }

  private endRun(champion: boolean, reason: string): void {
    const r = this.run!;
    const sc = score(r, champion);
    const tro = trophiesFor(sc);
    this.meta.trophies += tro;
    if (champion) this.meta.wins++;
    this.meta.best = Math.max(this.meta.best, sc);
    this.meta.bestStage = Math.max(this.meta.bestStage, r.stage);
    saveMeta(this.meta);
    clearRun();
    this.run = null;
    this.race = null;
    this.end = { champion, score: sc, trophies: tro, stage: r.stage, reason, races: r.log.length, wins: r.wins, bosses: r.bossBeat };
    this.screen = 'end';
    engineStop();
    if (champion) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Input ----------

  private readInput(): Input {
    const k = this.keys;
    const h = new Set(this.holds.values());
    const inp: Input = { ...NO_INPUT };
    let steer = 0;
    if (k.has('arrowleft') || k.has('a') || h.has('left')) steer -= 1;
    if (k.has('arrowright') || k.has('d') || h.has('right')) steer += 1;
    let gas = k.has('arrowup') || k.has('w') || h.has('gas');
    let brake = k.has('arrowdown') || k.has('s') || h.has('brake');
    let drift = k.has(' ') || h.has('drift');
    let nitro = k.has('shift') || k.has('x') || h.has('nitro');
    let gadget = k.has('e') || k.has('z') || h.has('gadget');
    if (this.autoGas && !brake) gas = true;
    // Gamepad.
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer += ax;
      if (p.buttons[14]?.pressed) steer -= 1;
      if (p.buttons[15]?.pressed) steer += 1;
      const rt = p.buttons[7]?.value ?? 0;
      if (rt > 0.1 || p.buttons[0]?.pressed) gas = true;
      if ((p.buttons[6]?.value ?? 0) > 0.1 || p.buttons[1]?.pressed) brake = true;
      if (p.buttons[2]?.pressed) drift = true;
      if (p.buttons[5]?.pressed) nitro = true;
      if (p.buttons[3]?.pressed || p.buttons[4]?.pressed) gadget = true;
      if (p.buttons[9]?.pressed && !this.modal) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    }
    inp.steer = Math.max(-1, Math.min(1, steer));
    inp.gas = gas ? 1 : 0;
    inp.brake = brake ? 1 : 0;
    inp.drift = drift;
    inp.nitro = nitro;
    inp.gadget = gadget;
    return inp;
  }

  private holdAt(x: number, y: number): Hold | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-hold]');
    return el && !(el as HTMLButtonElement).disabled ? (el.dataset.hold as Hold) : null;
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'race') return;
    const h = this.holdAt(e.clientX, e.clientY);
    if (!h) return;
    e.preventDefault();
    this.holds.set(e.pointerId, h);
    if (e.pointerType !== 'mouse' || h === 'left' || h === 'right') this.autoGas = true;
    this.updateHoldClasses();
  }

  private onMove(e: PointerEvent): void {
    if (!this.holds.has(e.pointerId)) return;
    const h = this.holdAt(e.clientX, e.clientY);
    const old = this.holds.get(e.pointerId);
    // Slide between the two steering buttons.
    if (h && h !== old && (h === 'left' || h === 'right') && (old === 'left' || old === 'right')) {
      this.holds.set(e.pointerId, h);
      this.updateHoldClasses();
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.holds.delete(e.pointerId)) this.updateHoldClasses();
  }

  private updateHoldClasses(): void {
    const on = new Set(this.holds.values());
    this.root.querySelectorAll<HTMLElement>('[data-hold]').forEach((b) => b.classList.toggle('on', on.has(b.dataset.hold as Hold)));
    const gas = this.root.querySelector<HTMLElement>('[data-hold="gas"]');
    gas?.classList.toggle('auto', this.autoGas);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (down && this.modal) {
      if (k === 'escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'race') return;
    if (down && (k === 'escape' || k === 'p')) {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (down) {
      initAudio();
      if (['arrowup', 'w', 'arrowdown', 's'].includes(k)) this.autoGas = false;
      if (k === 'r' && this.race && this.race.t > 3) respawn(this.race, playerIndex(this.race));
      this.keys.add(k);
    } else this.keys.delete(k);
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    if ((el as HTMLButtonElement).disabled) return;
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
        this.last = performance.now();
        this.render();
        return;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        return;
      case 'abandon-yes':
        this.modal = null;
        this.endRun(false, 'You abandoned the season.');
        return;
      case 'title':
        this.modal = null;
        this.race = null;
        engineStop();
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.run = newRun(randomSeedText(), this.meta.car);
        this.meta.runs++;
        saveMeta(this.meta);
        saveRun(this.run);
        this.screen = 'map';
        this.render();
        return;
      case 'continue':
        this.screen = 'map';
        this.render();
        return;
      case 'car':
        this.meta.car = d.id!;
        saveMeta(this.meta);
        sfx.click();
        this.render();
        return;
      case 'unlock': {
        const c = CAR_BY_ID[d.id!];
        if (this.meta.trophies < c.unlock) return sfx.deny();
        this.meta.trophies -= c.unlock;
        this.meta.unlocked.push(c.id);
        this.meta.car = c.id;
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'node':
        this.enterNode(+d.i!);
        return;
      case 'pick': {
        if (this.picked || !this.result || !r) return;
        const id = this.result.picks[+d.i!];
        const refund = equip(r, id);
        this.picked = true;
        saveRun(r);
        sfx.item();
        this.toast(`${PART_BY_ID[id].icon} ${PART_BY_ID[id].name} fitted${refund ? ` · old part sold for $${refund}` : ''}.`);
        this.render();
        return;
      }
      case 'skip':
        this.picked = true;
        this.render();
        return;
      case 'advance':
        this.nextStep();
        return;
      case 'buy': {
        if (!r) return;
        const it = r.shop?.[+d.i!];
        const before = r.money;
        if (buy(r, +d.i!)) {
          sfx.coin();
          if (it?.kind === 'part') this.toast(`${PART_BY_ID[it.id].icon} ${PART_BY_ID[it.id].name} fitted.${r.money > before - it.cost ? ` Old part sold for $${r.money - (before - it.cost)}.` : ''}`);
          saveRun(r);
        } else sfx.deny();
        this.render();
        return;
      }
      case 'pit':
        if (!r || this.pitDone) return;
        this.pitDone = pit(r, d.c as 'repair' | 'tune' | 'clean');
        sfx.item();
        saveRun(r);
        this.render();
        return;
      case 'event-opt': {
        const ev = this.event!;
        const opt = ev.def.options[+d.i!];
        if (!r || ev.result || (opt.can && !opt.can(r))) return;
        ev.result = opt.run(r, rngFor(r, 'event-result', r.stage));
        sfx.item();
        saveRun(r);
        this.render();
        return;
      }
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const rng = new Rng(Date.now() % 100000);
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      if (!el || (el as HTMLButtonElement).disabled) return false;
      el.click();
      return true;
    };
    const api = {
      state: () => {
        const race = this.race;
        const me = race ? race.cars[playerIndex(race)] : null;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          stage: this.run?.stage ?? null,
          race: this.run ? raceNo(this.run) + 1 : null,
          money: this.run?.money ?? null,
          hp: this.run ? Math.ceil(this.run.hp) : null,
          strikes: this.run?.strikes ?? null,
          parts: this.run ? { ...this.run.parts } : null,
          lap: me ? me.lap : null,
          clock: race ? Math.round(race.clock * 10) / 10 : null,
          place: this.result?.place ?? null,
          end: this.end,
        };
      },
      money: (n: number) => {
        if (this.run) this.run.money += n;
        this.render();
      },
      trophies: (n: number) => {
        this.meta.trophies += n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action. In a race it simulates a chunk of race time with the AI driving your car. */
      step: (smart = true) => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const nodes = nodesFor(r!);
            this.enterNode(chooseNode(r!, nodes, smart, rng));
            return 'node';
          }
          case 'race': {
            const race = this.race!;
            race.autoPlayer = true;
            const steps = Math.round((FAST ? 20 : 5) / DT);
            for (let i = 0; i < steps && this.screen === 'race'; i++) {
              this.physicsStep();
              if (race.done) {
                this.showResults();
                break;
              }
            }
            return 'race';
          }
          case 'results': {
            const res = this.result!;
            if (res.picks.length && !this.picked) {
              const i = choosePick(r!, res.picks, smart, rng);
              if (i >= 0) click(`[data-act="pick"][data-i="${i}"]`);
              else click('[data-act="skip"]');
            }
            click('[data-act="advance"]');
            return 'results';
          }
          case 'shop':
            for (const i of shopPlan(r!, smart, rng)) buy(r!, i);
            click('[data-act="advance"]');
            return 'shop';
          case 'pit':
            if (!this.pitDone) {
              this.pitDone = pit(r!, pitChoice(r!, smart, rng));
              this.render();
            }
            click('[data-act="advance"]');
            return 'pit';
          case 'event':
            if (!this.event!.result) {
              if (!click('[data-act="event-opt"]:not([disabled])')) this.event!.result = 'Nothing.';
              this.render();
              return 'event';
            }
            click('[data-act="advance"]');
            return 'event';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
