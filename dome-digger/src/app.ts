import { botInput, botShop, newBot, type Bot } from './bot';
import {
  BOSS_WAVES,
  DOMES,
  DOME_IDS,
  GADGETS,
  LAYERS,
  MAX_LV,
  MONSTERS,
  REPAIR_COST,
  REPAIR_HP,
  RES,
  RES_IDS,
  UPGRADES,
  UP_IDS,
  WAVES,
  layerAt,
  shieldMax,
  type DomeId,
  type GadgetId,
  type UpId,
} from './data';
import { drawDefense, drawHud, drawMine, type DefView, type Float, type MineView, type Particle } from './render';
import { randomSeedText } from './rng';
import {
  buyUpgrade,
  canConvert,
  canPay,
  canRepair,
  clearRun,
  cleared,
  convert,
  coresFor,
  costText,
  loadMeta,
  loadRun,
  newRun,
  repair,
  saveMeta,
  saveRun,
  score,
  upCost,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';
import {
  GROUND,
  GUN_Y,
  H,
  W,
  angleTo,
  canUse,
  depthOf,
  has,
  inDome,
  mineTime,
  nextCycle,
  stepWorld,
  useGadget,
  type Fx,
  type Input,
  type World,
} from './world';

type Screen = 'title' | 'play' | 'shop' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };
type Hold = 'L' | 'R' | 'U' | 'D' | 'RL' | 'RR' | 'F';

/** `?debug&fast` lets `debug.step()` simulate bigger chunks of time. */
const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const DT = 1 / 60;

export class App {
  private w: World | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { victory: boolean; score: number; cores: number; wave: number; stats: World['stats']; dome: DomeId } | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private cw = 0;
  private ch = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private clock = 0;
  private camY = -2;
  private mineView: MineView | null = null;
  private defView: DefView | null = null;
  private parts: Particle[] = [];
  private floats: Float[] = [];
  private shake = 0;
  private hurt = 0;
  private flash = 0;
  private sndT: Record<string, number> = {};
  private hudT = 0;
  private saveT = 0;
  private padKey = '';

  // Input state.
  private keys = new Set<string>();
  private holds = new Map<number, Hold>();
  private ptr: { id: number; x: number; y: number; down: boolean; mouse: boolean; t: number } | null = null;

  private bot: Bot | null = null;
  private ro: ResizeObserver | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMuted(this.meta.muted);
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
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('.s-play')) e.preventDefault();
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- DOM rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'play':
        body = `<div class="play"><div class="stage"><div class="cv-wrap"><canvas id="cv"></canvas></div><div class="pad" id="pad"></div></div><aside class="side" id="side"></aside></div>`;
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.w && (this.screen === 'play' || this.screen === 'shop') ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.padKey = '';
      this.ro?.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(this.canvas!.parentElement!);
      }
      this.resize();
      this.updateHud(true);
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

  private topInner(): string {
    const w = this.w!;
    const res = RES_IDS.map((r) => `<span title="${RES[r].name}">${RES[r].icon}${w.res[r]}</span>`).join('');
    const hpCls = w.domeHp < 30 ? 'bad' : '';
    return `<span class="${hpCls}" title="Dome HP">❤️${Math.ceil(w.domeHp)}</span>
      <span class="shd" title="Shield">🛡️${Math.floor(w.shield)}</span>
      <span class="res">${res}</span>
      <span class="wv" title="Wave">🌊${Math.min(w.wave, WAVES)}/${WAVES}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound (M)">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>`;
  }

  private topBar(): string {
    return `<header class="top" id="top">${this.topInner()}</header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const domes = DOME_IDS.map((id) => {
      const d = DOMES[id];
      const own = m.domes.includes(id);
      const pick = m.pick === id;
      const btn = own
        ? `<button class="${pick ? 'primary' : ''}" data-act="pick-dome" data-id="${id}">${pick ? '✔ Selected' : 'Select'}</button>`
        : `<button data-act="unlock" data-id="${id}" ${m.cores >= d.cost ? '' : 'disabled'}>🔆 ${d.cost}</button>`;
      return `<div class="dome-card ${pick ? 'sel' : ''} ${own ? '' : 'locked'}"><span class="big">${d.icon}</span><span class="dtext"><b>${d.name}</b><small>${d.text}</small></span>${btn}</div>`;
    }).join('');
    const w = this.w;
    return `<div class="title">
      <div class="logo"><span class="dome-ico">⛏️</span><h1>Dome Digger</h1></div>
      <p class="sub">Dig under your dome for iron, water and crystal. Get back before the wave hits. Hold the dome for ${WAVES} waves.</p>
      ${w ? `<button class="primary" data-act="continue">▶ Continue run (wave ${w.wave}, ❤️ ${Math.ceil(w.domeHp)})</button>` : ''}
      <button class="${w ? '' : 'primary'}" data-act="new">${w ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best wave ${m.bestWave} · Best score ${m.best}</p>
      <h2>Domes <small>🔆 ${m.cores} cores</small></h2>
      <p class="sub">Each run gives cores. Unlock new domes with other weapons.</p>
      <div class="domes">${domes}</div>
    </div>`;
  }

  private upCard(id: UpId): string {
    const w = this.w!;
    const u = UPGRADES[id];
    const lv = w.lv[id];
    const cost = upCost(w, id);
    const can = !!cost && canPay(w, cost);
    const pips = Array.from({ length: MAX_LV }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="up">
      <div class="up-head"><span class="big">${u.icon}</span><b>${u.name}</b><span class="pips">${pips}</span></div>
      <small>${u.text(lv)}</small>
      ${cost ? `<small class="next">Next: ${u.text(lv + 1)}</small>` : '<small class="ok">Max level</small>'}
      ${cost ? `<button class="${can ? 'primary' : ''}" data-act="buy" data-id="${id}" ${can ? '' : 'disabled'}>${costText(cost)}</button>` : ''}
    </div>`;
  }

  private shopView(): string {
    const w = this.w!;
    const after = w.phase === 'cleared';
    const next = after ? w.wave + 1 : w.wave;
    const boss = BOSS_WAVES[next];
    const preview = Object.values(MONSTERS)
      .filter((m) => m.cost > 0 && m.from <= next)
      .map((m) => `<span class="mchip" style="--c:${m.color}" title="${m.text}">${m.name}</span>`)
      .join('');
    const gadgets = w.gadgets.length
      ? w.gadgets.map((g) => `<div class="gad"><span class="big">${GADGETS[g].icon}</span><span><b>${GADGETS[g].name}</b><small>${GADGETS[g].text}</small></span></div>`).join('')
      : '<p class="dim">None yet. Dig up the glowing <b>?</b> blocks.</p>';
    const hpPct = (w.domeHp / w.domeMax) * 100;
    return `<div class="shop">
      <h2>${after ? `🎉 Wave ${w.wave} cleared` : '🛠️ Dome workshop'}</h2>
      <p class="sub">${after ? `Spend your resources. Wave ${next} of ${WAVES} comes in ${Math.round(mineTime({ ...w, wave: next } as World))} s after you go back down.` : `The wave timer is paused. ${Math.ceil(w.timer)} s left until wave ${w.wave}.`}</p>
      <div class="bank">${RES_IDS.map((r) => `<span class="chip">${RES[r].icon} ${w.res[r]} ${RES[r].name}</span>`).join('')}</div>
      <div class="hull">
        <div class="hp"><div class="hp-fill" style="width:${hpPct}%"></div><span>Dome ❤️ ${Math.ceil(w.domeHp)} / ${w.domeMax}</span></div>
        <button data-act="repair" ${canRepair(w) ? '' : 'disabled'}>🔧 Repair +${REPAIR_HP} (${costText(REPAIR_COST)})</button>
        ${has(w, 'converter') ? `<button data-act="convert" ${canConvert(w) ? '' : 'disabled'}>♻️ 4 🔩 → 1 💎</button>` : ''}
      </div>
      <div class="ups">${UP_IDS.map((id) => this.upCard(id)).join('')}</div>
      <h3>Gadgets</h3><div class="gads">${gadgets}</div>
      <h3>Next: wave ${next}${boss ? ` <span class="bad">· Boss: ${MONSTERS[boss].name}</span>` : ''}</h3>
      <div class="mons">${preview}</div>
      <button class="primary big-btn" data-act="leave-shop">⛏️ Back to the mine</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const s = e.stats;
    return `<div class="end">
      <div class="huge">${e.victory ? '🏆' : '💥'}</div>
      <h1>${e.victory ? 'The dome holds!' : 'The dome fell'}</h1>
      <p class="sub">${e.victory ? `You survived all ${WAVES} waves with the ${DOMES[e.dome].name}.` : `You held out until wave ${e.wave}.`}</p>
      <div class="score">Score <b>${e.score}</b></div>
      <p>+${e.cores} 🔆 cores</p>
      <div class="end-stats">
        <span>🌊 Waves cleared ${e.victory ? WAVES : e.wave - 1}</span>
        <span>⛏️ Blocks dug ${s.dug}</span>
        <span>📦 Resources ${s.ore}</span>
        <span>💀 Monsters ${s.kills}</span>
        <span>🧰 Gadgets ${s.gadgets}</span>
        <span>🩸 Damage taken ${Math.round(s.taken)}</span>
      </div>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Two phases, one clock.</b> The bar at the top counts down to the next wave. Mine until it runs out, then defend the dome.</li>
          <li><b>Dig.</b> Move into rock to drill it. Arrow keys or WASD, the on-screen pad, or hold a finger or the mouse on the side of the keeper you want to go. Up uses the jetpack.</li>
          <li><b>Ore.</b> 🔩 Iron (near the top), 💧 water (middle), 💎 crystal (deep). Deeper rock is harder. You carry only a few items, and each one slows you down. Walk into the dome to drop them.</li>
          <li><b>Gadgets.</b> Glowing <b>?</b> blocks hold gadgets such as a lift home, a blast charge or an orbital strike.</li>
          <li><b>Waves.</b> When the timer ends, monsters attack. The weapon only fires while you are in the dome, so get back fast. The shield takes hits first and refills when the dome is not hit for 3 s.</li>
          <li><b>Aim.</b> Move the mouse (or drag a finger) and hold the button to fire. Keys: ← → turn, Space fires. The laser hits the first monster on the line and burns acid spit out of the air.</li>
          <li><b>Workshop.</b> After each wave, buy upgrades: drill, cargo rack, jetpack, weapon and shield. Repair the dome. You can also open it from the dome while mining (U).</li>
          <li><b>Win</b> by holding the dome for ${WAVES} waves. Waves 5 and 10 bring a Rock Titan, wave ${WAVES} the Hive Queen.</li>
          <li>Keys: E lift, Q blast, F strike, U workshop, M mute, Esc menu.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.confirm) {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Abandon this run?</h2><p>The run ends now and counts as a loss.</p>
        <button class="danger" data-act="abandon-yes">Yes, abandon</button>
        <button data-act="modal-close">Cancel</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button class="primary" data-act="modal-close">▶ Resume</button>
      <button data-act="help">How to play</button>
      <button data-act="abandon">Abandon run</button>
      <button data-act="title">Save and go to the title screen</button>
    </div></div>`;
  }

  // ---------- Play screen: side panel, pad and top bar ----------

  private view(): 'mine' | 'def' {
    const w = this.w!;
    return w.phase === 'wave' && w.docked ? 'def' : w.phase === 'cleared' || w.phase === 'won' || w.phase === 'lost' ? 'def' : 'mine';
  }

  private padHtml(): string {
    const w = this.w!;
    const btn = (g: GadgetId, key: string): string =>
      has(w, g) ? `<button class="gbtn" data-act="gadget" data-id="${g}" ${canUse(w, g) ? '' : 'disabled'} title="${GADGETS[g].name} (${key})">${GADGETS[g].icon}<small>${key}</small></button>` : '';
    if (this.view() === 'def') {
      const sword = w.dome === 'sword';
      const auto = w.dome === 'turret';
      if (auto) {
        return `<div class="auto-note"><b>🎯 Auto turret</b><small>It aims at the closest monster and fires by itself.</small></div>
        <div class="acts">${btn('strike', 'F')}</div>`;
      }
      return `<div class="dpad def">
          <button class="hold" data-hold="RL" title="Turn left (←)">⟲</button>
          <button class="hold fire" data-hold="F" title="Fire (Space)">${sword ? '🗡️ Swing' : '🔥 Fire'}</button>
          <button class="hold" data-hold="RR" title="Turn right (→)">⟳</button>
        </div>
        <div class="acts">${btn('strike', 'F')}</div>`;
    }
    const shop = w.phase === 'mine' && inDome(w) ? `<button class="gbtn" data-act="open-shop" title="Workshop (U)">🛠️<small>U</small></button>` : '';
    return `<div class="dpad">
        <span></span><button class="hold" data-hold="U" title="Jetpack (↑)">▲</button><span></span>
        <button class="hold" data-hold="L" title="Left (←)">◀</button><button class="hold" data-hold="D" title="Dig down (↓)">▼</button><button class="hold" data-hold="R" title="Right (→)">▶</button>
      </div>
      <div class="acts">${shop}${btn('lift', 'E')}${btn('blast', 'Q')}${w.phase === 'wave' ? btn('strike', 'F') : ''}</div>`;
  }

  private sideHtml(): string {
    const w = this.w!;
    const lv = UP_IDS.map((id) => `<span title="${UPGRADES[id].name}">${UPGRADES[id].icon} ${w.lv[id]}</span>`).join('');
    const gad = w.gadgets.map((g) => `<span title="${GADGETS[g].name}: ${GADGETS[g].text}">${GADGETS[g].icon}</span>`).join('') || '<span class="dim">none</span>';
    const depth = depthOf(w);
    const view = this.view();
    const tip =
      view === 'def'
        ? w.dome === 'turret'
          ? 'The turret aims and fires by itself. Use the strike when it gets crowded.'
          : 'Move the mouse to aim. Hold the button or Space to fire. ← → turn.'
        : w.phase === 'wave'
          ? '<b class="bad">The wave is here. Fly back up to the dome!</b>'
          : 'Arrows or WASD to move and dig. ↑ jetpack. Walk into the dome to drop your cargo.';
    return `<h3>${DOMES[w.dome].icon} ${DOMES[w.dome].name}</h3>
      <p class="hint">${tip}</p>
      <div class="kv"><span>Depth</span><b>${depth} m · ${LAYERS[layerAt(depth)].name}</b></div>
      <div class="kv"><span>Cargo</span><b>${w.k.cargo.map((r) => RES[r].icon).join('') || '—'}</b></div>
      <div class="kv"><span>Shield</span><b>${Math.floor(w.shield)} / ${shieldMax(w.lv.shield)}</b></div>
      <h3>Upgrades</h3><div class="lvls">${lv}</div>
      <h3>Gadgets</h3><div class="lvls">${gad}</div>
      <p class="hint">E lift · Q blast · F strike · U workshop (in the dome)</p>`;
  }

  /** Refresh the DOM around the canvas. Cheap, so it can run a few times per second. */
  private updateHud(force = false): void {
    if (this.screen !== 'play' || !this.w) return;
    const w = this.w;
    const top = this.root.querySelector<HTMLElement>('#top');
    if (top) top.innerHTML = this.topInner();
    const side = this.root.querySelector<HTMLElement>('#side');
    if (side && side.offsetParent !== null) side.innerHTML = this.sideHtml();
    const key = [
      this.view(),
      w.phase,
      w.gadgets.join(),
      ...(['lift', 'blast', 'strike'] as GadgetId[]).map((g) => canUse(w, g)),
      w.phase === 'mine' && inDome(w),
    ].join('|');
    if (force || key !== this.padKey) {
      this.padKey = key;
      const pad = this.root.querySelector<HTMLElement>('#pad');
      if (pad) pad.innerHTML = this.padHtml();
      this.holds.clear();
    }
  }

  // ---------- Loop ----------

  private resize(): void {
    if (!this.canvas) return;
    const wrap = this.canvas.parentElement!;
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(200, Math.floor(r.width));
    this.ch = Math.max(200, Math.floor(r.height));
    this.canvas.width = this.cw * dpr;
    this.canvas.height = this.ch * dpr;
    this.canvas.style.width = `${this.cw}px`;
    this.canvas.style.height = `${this.ch}px`;
    this.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const tick = (now: number): void => {
      if (this.screen !== 'play' || !this.canvas) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number): void {
    const w = this.w!;
    this.clock += dt;
    const paused = !!this.modal || document.hidden || this.bot !== null;
    if (!paused) {
      this.acc += dt;
      const fx: Fx[] = [];
      while (this.acc >= DT) {
        this.acc -= DT;
        stepWorld(w, this.input(), DT, fx);
        if (this.checkPhase()) break;
      }
      this.handleFx(fx);
      this.saveT += dt;
      if (this.saveT > 5) {
        this.saveT = 0;
        this.save();
      }
      // Dig sound and dust.
      if (w.k.dig >= 0 && this.view() === 'mine') {
        if (this.every('dig', 0.13)) sfx.dig();
        if (Math.random() < 0.3) {
          const tx = (w.k.dig % W) + 0.5;
          const ty = Math.floor(w.k.dig / W) + 0.5;
          this.burst('mine', tx - (tx - w.k.x) * 0.4, ty - (ty - w.k.y) * 0.4, 1, LAYERS[layerAt(Math.max(0, ty - GROUND))].color, 0.12);
        }
      }
      if (w.firing && this.every('laser', w.dome === 'sword' ? 0.18 : 0.09)) (w.dome === 'sword' ? sfx.sword : sfx.laser)();
      if (w.k.jet && this.view() === 'mine' && this.every('jet', 0.08)) {
        sfx.jet();
        this.burst('mine', w.k.x - w.k.face * 0.17, w.k.y + 0.4, 1, '#ff9f1c', 0.1, 0, 3);
      }
    }
    this.stepFx(dt);
    this.draw();
    this.hudT += dt;
    if (this.hudT > 0.15) {
      this.hudT = 0;
      this.updateHud();
    }
  }

  private every(key: string, gap: number): boolean {
    if ((this.sndT[key] ?? 0) > this.clock) return false;
    this.sndT[key] = this.clock + gap;
    return true;
  }

  /** Handle phase changes after a step. Returns true when the screen changed. */
  private checkPhase(): boolean {
    const w = this.w;
    if (!w || this.screen !== 'play') return false;
    if (w.phase === 'cleared') {
      sfx.clear();
      this.toast(`Wave ${w.wave} cleared!`);
      this.screen = 'shop';
      this.save();
      this.render();
      return true;
    }
    if (w.phase === 'won' || w.phase === 'lost') {
      this.finish(w.phase === 'won');
      return true;
    }
    return false;
  }

  private finish(victory: boolean): void {
    const w = this.w!;
    if (victory) w.phase = 'won';
    const s = score(w);
    const cores = coresFor(s);
    const m = this.meta;
    m.cores += cores;
    if (victory) m.wins++;
    m.bestWave = Math.max(m.bestWave, victory ? WAVES : cleared(w));
    m.best = Math.max(m.best, s);
    saveMeta(m);
    clearRun();
    this.end = { victory, score: s, cores, wave: w.wave, stats: { ...w.stats }, dome: w.dome };
    this.w = null;
    this.bot = null;
    this.screen = 'end';
    (victory ? sfx.win : sfx.lose)();
    this.toastEl.classList.remove('show');
    this.render();
  }

  private save(): void {
    if (this.w && (this.screen === 'play' || this.screen === 'shop')) saveRun(this.w);
  }

  // ---------- Effects ----------

  private burst(scene: 'mine' | 'def', x: number, y: number, n: number, color: string, size: number, speed = 2, life = 0.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (scene === 'mine' ? 1 : -1), t: life, max: life, color, size, scene });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  private float(scene: 'mine' | 'def', x: number, y: number, text: string, color: string, size = 1): void {
    this.floats.push({ x, y, text, color, t: 1, size, scene });
    if (this.floats.length > 40) this.floats.shift();
  }

  private handleFx(fx: Fx[]): void {
    const w = this.w;
    if (!w) return;
    for (const f of fx) {
      switch (f.k) {
        case 'break': {
          const depth = Math.max(0, f.y - GROUND);
          this.burst('mine', f.x, f.y, 8, LAYERS[layerAt(depth)].color, 0.16, 3);
          if (this.every('crumble', 0.05)) sfx.crumble();
          break;
        }
        case 'ore':
          if (this.every('ore', 0.06)) sfx.ore();
          this.float('mine', f.x, f.y - 0.3, f.text ?? '+1', f.color ?? '#fff', 0.8);
          break;
        case 'deposit':
          sfx.deposit();
          this.float('mine', f.x, f.y, `📦 ${f.text}`, '#ffd166', 1.1);
          break;
        case 'gadget':
          sfx.gadget();
          this.toast(`Gadget found: ${f.text}`);
          this.float('mine', f.x, f.y - 0.5, f.text ?? '', '#ffe66d', 1.2);
          this.burst('mine', f.x, f.y, 24, '#ffe66d', 0.15, 4, 0.8);
          break;
        case 'alarm':
          sfx.alarm();
          this.toast(inDome(w) || w.docked ? `🚨 Wave ${w.wave}! Defend the dome.` : `🚨 Wave ${w.wave}! Get back to the dome!`);
          this.shake = Math.max(this.shake, 0.3);
          break;
        case 'docked':
          if (w.phase === 'wave') this.padKey = '';
          break;
        case 'hit':
          this.burst('def', f.x, f.y, 4, f.color ?? '#a7f070', 0.2, 3, 0.3);
          break;
        case 'kill':
          if (this.every('kill', 0.04)) sfx.kill();
          this.burst('def', f.x, f.y, 14, f.color ?? '#fff', 0.3, 5, 0.6);
          break;
        case 'dome':
          if (this.every('hurt', 0.15)) sfx.hurt();
          this.shake = Math.max(this.shake, 0.25);
          this.hurt = 0.35;
          this.float('def', f.x, f.y + 1, f.text ?? '', '#ff6b6b');
          break;
        case 'shield':
          if (this.every('shield', 0.1)) sfx.shield();
          this.float('def', f.x, f.y + 1, f.text ?? '', '#7ad7ff', 0.8);
          this.burst('def', f.x, f.y, 5, '#7ad7ff', 0.2, 3, 0.35);
          break;
        case 'strike':
          sfx.strike();
          this.flash = 0.5;
          this.shake = 0.6;
          for (const m of w.mons) this.burst('def', m.x, m.y, 10, '#fff3b0', 0.3, 5, 0.6);
          this.float('def', 0, 9, `🛰️ ${f.text}`, '#ffd166', 1.5);
          break;
        case 'blast':
          sfx.strike();
          this.shake = 0.4;
          this.burst('mine', f.x, f.y, 30, '#ffb703', 0.2, 6, 0.6);
          break;
        case 'lift':
          sfx.gadget();
          this.burst('mine', f.x, f.y, 16, '#7ad7ff', 0.15, 3, 0.6);
          this.camY = -3;
          break;
        case 'drone':
          sfx.coin();
          this.float('mine', f.x, f.y, '🛸 +1', '#ffd166', 0.9);
          break;
        case 'dig':
          break;
      }
    }
  }

  private stepFx(dt: number): void {
    for (const p of this.parts) {
      p.t -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.scene === 'mine' ? 6 : -6) * dt;
    }
    this.parts = this.parts.filter((p) => p.t > 0);
    for (const f of this.floats) {
      f.t -= dt * 0.9;
      f.y += (f.scene === 'mine' ? -0.8 : 1.2) * dt;
    }
    this.floats = this.floats.filter((f) => f.t > 0);
    this.shake = Math.max(0, this.shake - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.flash = Math.max(0, this.flash - dt);
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.w;
    if (!ctx || !w) return;
    const view = this.view();
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 14, (Math.random() - 0.5) * this.shake * 14);
    if (view === 'mine') {
      const ts = this.cw / W;
      const rows = this.ch / ts;
      const target = Math.max(-2.5, Math.min(H - rows + 0.5, w.k.y - rows * 0.42));
      this.camY += (target - this.camY) * Math.min(1, 0.12 * 60 * (1 / 60) * 6);
      this.mineView = drawMine(ctx, w, this.cw, this.ch, this.camY, this.parts, this.floats, this.clock);
      this.defView = null;
    } else {
      this.defView = drawDefense(ctx, w, this.cw, this.ch, this.parts, this.floats, this.clock, this.hurt);
      this.mineView = null;
    }
    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,250,220,${this.flash})`;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    drawHud(ctx, w, this.cw, this.clock, view);
  }

  // ---------- Input ----------

  private input(): Input {
    const w = this.w!;
    const h = new Set(this.holds.values());
    const k = this.keys;
    const L = k.has('left') || h.has('L');
    const R = k.has('right') || h.has('R');
    const U = k.has('up') || h.has('U');
    const D = k.has('down') || h.has('D');
    if (this.view() === 'mine') {
      let x = (R ? 1 : 0) - (L ? 1 : 0);
      let y = (D ? 1 : 0) - (U ? 1 : 0) - (k.has('space') ? 1 : 0);
      const p = this.ptr;
      if (p && p.down && this.mineView && this.canvas) {
        const r = this.canvas.getBoundingClientRect();
        const px = p.x - r.left;
        const py = p.y - r.top;
        const kx = w.k.x * this.mineView.ts;
        const ky = (w.k.y - this.mineView.camY) * this.mineView.ts;
        const dx = px - kx;
        const dy = py - ky;
        const dead = this.mineView.ts * 0.5;
        if (Math.abs(dx) > dead || Math.abs(dy) > dead) {
          if (Math.abs(dx) > Math.abs(dy) * 0.8) {
            x = Math.sign(dx);
            y = dy < -this.mineView.ts * 1.2 ? -1 : 0;
          } else {
            x = 0;
            y = Math.sign(dy);
          }
        }
      }
      return { x, y: Math.max(-1, Math.min(1, y)), rot: 0, aim: null, fire: false };
    }
    const rl = k.has('left') || h.has('RL');
    const rr = k.has('right') || h.has('RR');
    const rot = (rr ? 1 : 0) - (rl ? 1 : 0);
    let fire = h.has('F') || k.has('space') || k.has('up');
    let aim: number | null = null;
    const p = this.ptr;
    if (!rot && p && this.defView && this.canvas && (p.down || (p.mouse && this.clock - p.t < 4))) {
      const r = this.canvas.getBoundingClientRect();
      const ax = (p.x - r.left - this.defView.cx) / this.defView.s;
      const ay = (this.defView.gy - (p.y - r.top)) / this.defView.s;
      aim = angleTo(ax, Math.max(ay, GUN_Y - 6));
      if (p.down) fire = true;
    }
    return { x: 0, y: 0, rot, aim, fire };
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    const el = e.target as HTMLElement;
    const hold = el.closest<HTMLElement>('[data-hold]');
    if (hold && !(hold as HTMLButtonElement).disabled) {
      e.preventDefault();
      this.holds.set(e.pointerId, hold.dataset.hold as Hold);
      hold.classList.add('on');
      try {
        hold.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (el === this.canvas) {
      e.preventDefault();
      this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, down: true, mouse: e.pointerType === 'mouse', t: this.clock };
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.screen !== 'play' || !this.canvas) return;
    const p = this.ptr;
    if (p && p.down && p.id === e.pointerId) {
      p.x = e.clientX;
      p.y = e.clientY;
      p.t = this.clock;
      return;
    }
    if (e.pointerType === 'mouse' && e.target === this.canvas) {
      this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, down: false, mouse: true, t: this.clock };
    }
    // A finger that slides off a hold button releases it.
    const h = this.holds.get(e.pointerId);
    if (h && e.pointerType !== 'mouse') {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-hold]');
      if (!over || over.dataset.hold !== h) this.release(e.pointerId);
    }
  }

  private release(id: number): void {
    const h = this.holds.get(id);
    this.holds.delete(id);
    if (h) this.root.querySelector(`[data-hold="${h}"]`)?.classList.remove('on');
  }

  private onUp(e: PointerEvent): void {
    this.release(e.pointerId);
    if (this.ptr && this.ptr.id === e.pointerId) {
      this.ptr.down = false;
      if (!this.ptr.mouse) this.ptr = null;
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const map: Record<string, string> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      Space: 'space',
    };
    const k = map[e.code];
    if (k) {
      if (this.screen === 'play' && !this.modal) e.preventDefault();
      if (down) this.keys.add(k);
      else this.keys.delete(k);
      if (down) initAudio();
      return;
    }
    if (!down || e.repeat) return;
    if (e.code === 'Escape') {
      if (this.modal) this.action('modal-close', {});
      else if (this.screen === 'play' || this.screen === 'shop') this.action('menu', {});
      return;
    }
    if (e.code === 'KeyM') return this.action('mute', {});
    if (this.screen !== 'play' || this.modal) return;
    if (e.code === 'KeyE') this.action('gadget', { id: 'lift' });
    if (e.code === 'KeyQ') this.action('gadget', { id: 'blast' });
    if (e.code === 'KeyF') this.action('gadget', { id: 'strike' });
    if (e.code === 'KeyU' || e.code === 'KeyB') this.action('open-shop', {});
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private startRun(): void {
    this.w = newRun(randomSeedText(), this.meta.pick);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.w);
    this.camY = -2.5;
    this.parts = [];
    this.floats = [];
    this.screen = 'play';
    this.modal = null;
    this.render();
    this.toast(`⛏️ Dig! Wave 1 comes in ${Math.round(this.w.timer)} s.`);
  }

  private action(act: string, d: DOMStringMap | Record<string, string>): void {
    const w = this.w;
    switch (act) {
      case 'mute':
        toggleMute();
        this.meta.muted = isMuted();
        saveMeta(this.meta);
        if (this.screen === 'play') this.updateHud();
        else this.render();
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
        if (w) this.finish(false);
        return;
      case 'title':
        this.save();
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        this.startRun();
        return;
      case 'continue':
        if (!w) return;
        this.screen = w.phase === 'cleared' ? 'shop' : 'play';
        this.render();
        return;
      case 'pick-dome':
        this.meta.pick = d.id as DomeId;
        saveMeta(this.meta);
        this.render();
        return;
      case 'unlock': {
        const id = d.id as DomeId;
        const cost = DOMES[id].cost;
        if (this.meta.cores < cost || this.meta.domes.includes(id)) return sfx.deny();
        this.meta.cores -= cost;
        this.meta.domes.push(id);
        this.meta.pick = id;
        saveMeta(this.meta);
        sfx.buy();
        this.render();
        return;
      }
      case 'gadget': {
        if (!w || this.screen !== 'play') return;
        const fx: Fx[] = [];
        if (useGadget(w, d.id as GadgetId, fx)) {
          this.handleFx(fx);
          this.updateHud(true);
          this.checkPhase();
        } else if (has(w, d.id as GadgetId)) sfx.deny();
        return;
      }
      case 'open-shop':
        if (!w || w.phase !== 'mine' || !inDome(w)) return;
        this.screen = 'shop';
        this.render();
        return;
      case 'buy':
        if (!w) return;
        if (buyUpgrade(w, d.id as UpId)) {
          sfx.buy();
          if (d.id === 'shield') w.shield = shieldMax(w.lv.shield);
        } else sfx.deny();
        this.render();
        return;
      case 'repair':
        if (w && repair(w)) sfx.buy();
        else sfx.deny();
        this.render();
        return;
      case 'convert':
        if (w && convert(w)) sfx.buy();
        else sfx.deny();
        this.render();
        return;
      case 'leave-shop':
        if (!w) return;
        if (w.phase === 'cleared') {
          nextCycle(w);
          this.toast(`⛏️ Wave ${w.wave} comes in ${Math.round(w.timer)} s.`);
        }
          this.screen = 'play';
        this.save();
        this.render();
        return;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const w = this.w;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          phase: w?.phase ?? null,
          view: w && this.screen === 'play' ? this.view() : null,
          wave: w?.wave ?? null,
          timer: w ? Math.round(w.timer * 10) / 10 : null,
          hp: w ? Math.round(w.domeHp) : null,
          shield: w ? Math.round(w.shield) : null,
          res: w ? { ...w.res } : null,
          lv: w ? { ...w.lv } : null,
          gadgets: w ? [...w.gadgets] : null,
          depth: w ? depthOf(w) : null,
          cargo: w ? w.k.cargo.length : null,
          monsters: w ? w.mons.length + w.queue.length : null,
          docked: w?.docked ?? null,
          end: this.end,
        };
      },
      /** One bot action. In play it simulates a few seconds with a simple bot. */
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
          case 'play': {
            const w = this.w!;
            this.bot ??= newBot(true, Math.floor(Math.random() * 1e9));
            const n = FAST ? 360 : 120;
            const fx: Fx[] = [];
            for (let i = 0; i < n; i++) {
              stepWorld(w, botInput(w, this.bot, DT, fx), DT, fx);
              if (w.phase !== 'mine' && w.phase !== 'wave') break;
            }
            this.handleFx(fx.slice(-30));
            this.updateHud();
            this.checkPhase();
            return 'play';
          }
          case 'shop': {
            const w = this.w!;
            this.bot ??= newBot(true, 7);
            botShop(w, this.bot);
            this.action('leave-shop', {});
            return 'shop';
          }
          case 'end':
            return 'end';
        }
      },
      res: (n = 20) => {
        if (this.w) for (const r of RES_IDS) this.w.res[r] += n;
        this.screen === 'shop' ? this.render() : this.updateHud();
      },
      /** Let the human take over again after bot steps. */
      human: () => {
        this.bot = null;
      },
      wave: () => {
        if (this.w && this.w.phase === 'mine') this.w.timer = 0.1;
      },
      win: () => {
        if (this.w) this.finish(true);
      },
      lose: () => {
        if (this.w) this.finish(false);
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}

