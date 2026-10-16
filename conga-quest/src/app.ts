/** Screens, input, game loop and the debug API. */
import { Bot } from './bot';
import { CLASSES, CLASS_IDS, DT, ENEMIES, GRID_H, GRID_W, MAX_PARTY, STAGES, SYNERGIES, WAVES, isBossWave, stageOf, xpNeed, type ClassId, type Dir } from './data';
import { Renderer } from './render';
import { Rng, hash, randomSeedText } from './rng';
import {
  COST,
  absorb,
  applyOffer,
  canRevive,
  canTrain,
  clearRun,
  endRun,
  loadMeta,
  loadRun,
  makeLeader,
  maxHpOf,
  newRun,
  offerText,
  potion,
  revive,
  reviveCost,
  saveMeta,
  saveRun,
  score,
  shrineOffers,
  train,
  trainCost,
  unlockedClasses,
  type RunState,
} from './run';
import { initAudio, isMuted, play, setMuted, toggleMute } from './sfx';
import { World } from './world';

type Screen = 'title' | 'play' | 'shrine' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
const FAST = PARAMS.has('fast');

const KEYDIR: Record<string, Dir> = {
  ArrowRight: 0,
  KeyD: 0,
  ArrowDown: 1,
  KeyS: 1,
  ArrowLeft: 2,
  KeyA: 2,
  ArrowUp: 3,
  KeyW: 3,
};

interface EndInfo {
  victory: boolean;
  score: number;
  wave: number;
  kills: number;
  level: number;
  heroes: ClassId[];
  crashes: number;
  gaveUp: boolean;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private world: World | null = null;
  private renderer = new Renderer();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private cell = 20;
  private ox = 0;
  private oy = 0;
  private cw = 0;
  private ch = 0;
  private dpr = 1;
  private last = 0;
  private acc = 0;
  private hudKey = '';
  private partyKey = '';
  /** Time (ms) when the wave-end pause is over. */
  private transitAt = 0;
  private end: EndInfo | null = null;
  private showPad: boolean;
  private swipe: { id: number; x: number; y: number } | null = null;
  private bot: Bot | null = null;
  private picked = -1;
  private stageObs: ResizeObserver | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    let padPref: string | null = null;
    try {
      setMuted(localStorage.getItem('conga.mute') === '1');
      padPref = localStorage.getItem('conga.pad');
    } catch {
      /* ignore */
    }
    this.showPad = padPref ? padPref === '1' : matchMedia('(pointer: coarse)').matches;
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'play' && !this.modal && this.world && !this.world.done) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    });
    root.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => {
      if (this.swipe?.id === e.pointerId) this.swipe = null;
    });
    window.addEventListener('pointercancel', () => (this.swipe = null));
    if (DEBUG) this.installDebug();
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  private get unlocked(): ClassId[] {
    return unlockedClasses(this.meta);
  }

  // ---------- Input ----------

  private steer(d: Dir): void {
    if (this.screen !== 'play' || this.modal || !this.world) return;
    this.world.queue(d);
  }

  private onKey(e: KeyboardEvent): void {
    initAudio();
    const d = KEYDIR[e.code];
    if (this.screen === 'play' && !this.modal && d !== undefined) {
      e.preventDefault();
      this.steer(d);
      return;
    }
    if (e.code === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.screen === 'play') this.modal = { kind: 'menu', confirm: false };
      else return;
      this.acc = 0;
      this.render();
      return;
    }
    if (e.code === 'KeyP' && this.screen === 'play' && !this.modal) {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (e.code === 'KeyM') this.act('mute');
    if (this.screen === 'shrine' && !this.modal && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      const b = this.root.querySelector<HTMLElement>(`[data-act="offer"][data-i="${Number(e.code.slice(5)) - 1}"]`);
      b?.click();
    }
    if (!this.modal && (e.code === 'Enter' || e.code === 'Space') && this.screen !== 'play') {
      const primary = this.root.querySelector<HTMLButtonElement>('main button.primary:not(:disabled)');
      if (primary) {
        e.preventDefault();
        primary.click();
      }
    }
  }

  private onPointerDown(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    const pad = t.closest<HTMLElement>('[data-d]');
    if (pad) {
      e.preventDefault();
      initAudio();
      this.steer(Number(pad.dataset.d) as Dir);
      pad.classList.add('on');
      setTimeout(() => pad.classList.remove('on'), 120);
      return;
    }
    if (t.closest('.stage') && this.screen === 'play') {
      initAudio();
      this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const s = this.swipe;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 22) return;
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3;
    this.steer(d);
    // A new swipe can start from here without lifting the finger.
    s.x = e.clientX;
    s.y = e.clientY;
  }

  // ---------- Loop ----------

  private loop(t: number): void {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(100, t - (this.last || t));
    this.last = t;
    if (this.screen !== 'play' || !this.world) return;
    if (!this.modal && !document.hidden) {
      if (this.world.done) {
        if (performance.now() >= this.transitAt) this.waveOver();
      } else {
        this.acc += dt / 1000;
        let n = 0;
        while (this.acc >= DT && n < 8 && !this.world.done) {
          this.tick();
          this.acc -= DT;
          n++;
        }
        if (n === 8) this.acc = 0;
      }
    }
    if (this.screen === 'play') this.draw();
  }

  private tick(bot?: Bot): void {
    const w = this.world!;
    if (bot) bot.drive(w);
    w.step();
    this.drain();
    if (w.done) {
      this.transitAt = performance.now() + (FAST ? 0 : w.done === 'clear' ? 1300 : 1600);
      if (w.done === 'clear') {
        this.banner(w.boss ? `${ENEMIES[STAGES[w.stage].boss].icon} Boss defeated!` : '✔ Wave cleared!');
      } else this.banner('💀 The party is gone');
    }
  }

  private drain(): void {
    const w = this.world!;
    for (const ev of w.events) {
      if (ev.kind === 'sfx') play(ev.name);
      else if (ev.kind === 'toast') this.toast(ev.text);
      else this.renderer.fx(ev);
    }
    w.events.length = 0;
    this.updateHud();
  }

  private draw(): void {
    if (!this.ctx || !this.world) return;
    this.renderer.draw(this.ctx, this.world, this.cell, this.ox, this.oy, this.dpr, this.cw, this.ch);
  }

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const r = cv.parentElement!.getBoundingClientRect();
    const cw = Math.max(100, Math.floor(r.width));
    const ch = Math.max(100, Math.floor(r.height));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(cw * this.dpr);
    cv.height = Math.floor(ch * this.dpr);
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    this.cw = cw;
    this.ch = ch;
    this.cell = Math.max(8, Math.floor(Math.min((cw - 8) / GRID_W, (ch - 8) / GRID_H)));
    this.ox = Math.floor((cw - this.cell * GRID_W) / 2);
    this.oy = Math.floor((ch - this.cell * GRID_H) / 2);
    this.ctx = cv.getContext('2d');
    this.draw();
  }

  // ---------- Run flow ----------

  private startRun(): void {
    const leader = this.unlocked.includes(this.meta.leader) ? this.meta.leader : 'knight';
    this.run = newRun(randomSeedText(), leader, this.unlocked);
    this.end = null;
    this.startWave();
  }

  private startWave(): void {
    const r = this.run!;
    r.shrineDone = true;
    saveRun(r);
    this.world = new World(r, r.wave, r.seed, this.unlocked);
    this.renderer.reset();
    this.screen = 'play';
    this.modal = null;
    this.acc = 0;
    this.render();
    const st = STAGES[stageOf(r.wave)];
    if (isBossWave(r.wave)) this.banner(`${ENEMIES[st.boss].icon} ${ENEMIES[st.boss].name}`);
    else this.banner(`${st.icon} Wave ${r.wave}`);
    play('wave');
  }

  private waveOver(): void {
    const w = this.world!;
    const r = this.run!;
    if (w.done === 'clear') {
      absorb(r, w);
      if (r.wave > WAVES) {
        this.finish(true);
        return;
      }
      this.picked = -1;
      this.world = null;
      this.screen = 'shrine';
      saveRun(r);
      this.render();
    } else {
      Object.assign(r, { kills: w.kills, coins: w.coins, gems: w.gems, level: w.level, heroes: [] });
      r.crashes += w.crashes;
      this.finish(false);
    }
  }

  private finish(victory: boolean, gaveUp = false): void {
    const r = this.run!;
    const s = endRun(this.meta, r, victory);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory, score: s, wave: victory ? WAVES : r.wave, kills: r.kills, level: r.level, heroes: r.heroes.map((h) => h.cls), crashes: r.crashes, gaveUp };
    this.run = null;
    this.world = null;
    this.screen = 'end';
    this.modal = null;
    play(victory ? 'win' : 'lose');
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'play':
        body = this.playView();
        break;
      case 'shrine':
        body = this.shrineView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    this.root.classList.toggle('playing', this.screen === 'play');
    this.root.innerHTML = `${this.screen === 'play' ? this.topBar() : ''}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.hudKey = '';
    this.partyKey = '';
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.updateHud();
      this.resize();
      // The party panel can grow or shrink during a wave, so watch the stage size.
      this.stageObs?.disconnect();
      this.stageObs = new ResizeObserver(() => this.resize());
      this.stageObs.observe(this.canvas!.parentElement!);
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

  private banner(text: string): void {
    const b = this.root.querySelector<HTMLElement>('#banner');
    if (!b || FAST) return;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  private updateHud(): void {
    const w = this.world;
    if (!w) return;
    const el = this.root.querySelector<HTMLElement>('#hud');
    const key = `${w.level}|${w.xp}|${w.coins}|${w.remaining()}|${w.kills}`;
    if (el && key !== this.hudKey) {
      this.hudKey = key;
      const st = STAGES[w.stage];
      const need = xpNeed(w.level);
      el.innerHTML = `<span class="stat" title="${st.name}">${st.icon} <b>${w.wave}</b>/${WAVES}</span>
        <span class="stat lvl" title="Party level and gems to the next level">⭐ ${w.level}<span class="xp"><i style="width:${Math.round((w.xp / need) * 100)}%"></i></span></span>
        <span class="stat gold" title="Coins">🪙 ${w.coins}</span>
        <span class="stat" title="Enemies left in this wave">👾 ${w.remaining()}</span>`;
    }
    const pel = this.root.querySelector<HTMLElement>('#party');
    const pkey = w.heroes.map((h) => `${h.cls}${h.stars}:${Math.ceil(h.hp)}/${h.s.maxHp}`).join(',');
    if (pel && pkey !== this.partyKey) {
      this.partyKey = pkey;
      pel.innerHTML = this.partyHtml(
        w.heroes.map((h) => ({ cls: h.cls, stars: h.stars, hp: h.hp, max: h.s.maxHp })),
        w.syn,
        false,
      );
    }
  }

  private partyHtml(list: { cls: ClassId; stars: number; hp: number; max: number }[], syn: Partial<Record<ClassId, number>>, clickable: boolean): string {
    const heroes = list
      .map((h, i) => {
        const d = CLASSES[h.cls];
        const ratio = Math.max(0, Math.min(1, h.hp / h.max));
        const tag = clickable ? 'button' : 'div';
        return `<${tag} class="hero ${i === 0 ? 'lead' : ''}" ${clickable ? `data-act="lead" data-i="${i}" title="Make the ${d.name} the leader"` : `title="${d.name}: ${d.text}"`} style="--c:${d.color}">
          <span class="hi">${d.icon}</span>${i === 0 ? '<span class="crown">👑</span>' : ''}${h.stars ? `<span class="st">${'★'.repeat(h.stars)}</span>` : ''}
          <span class="bar"><i style="width:${ratio * 100}%;background:${ratio > 0.5 ? 'var(--green)' : ratio > 0.25 ? 'var(--gold)' : 'var(--red)'}"></i></span>
          <small>${Math.ceil(h.hp)}/${h.max}</small>
        </${tag}>`;
      })
      .join('');
    const syns = CLASS_IDS.filter((c) => syn[c])
      .map((c) => `<span class="syn" title="${SYNERGIES[c].name}: ${SYNERGIES[c].tiers[syn[c]! - 1]}">${CLASSES[c].icon} ${SYNERGIES[c].name} ${syn[c] === 2 ? 'II' : 'I'}</span>`)
      .join('');
    return `<div class="heroes">${heroes}</div>${syns ? `<div class="syns">${syns}</div>` : ''}`;
  }

  private topBar(): string {
    return `<header class="top">
      <div class="hud" id="hud"></div>
      <span class="grow"></span>
      <button class="icon-btn" data-act="pad" title="Touch arrows">🎮</button>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private playView(): string {
    const pad = this.showPad
      ? `<div class="pad">
          <button class="pk up" data-d="3" aria-label="Up">▲</button>
          <button class="pk left" data-d="2" aria-label="Left">◀</button>
          <button class="pk right" data-d="0" aria-label="Right">▶</button>
          <button class="pk down" data-d="1" aria-label="Down">▼</button>
        </div>`
      : '';
    return `<div class="stage"><canvas id="cv"></canvas><div class="banner" id="banner"></div></div>
      <div class="party" id="party"></div>${pad}
      <p class="keys"><b>←↑→↓</b> or <b>WASD</b> steer the leader · swipe on touch · <b>Esc</b> menu</p>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const unl = this.unlocked;
    const leaders = CLASS_IDS.map((c) => {
      const d = CLASSES[c];
      const open = unl.includes(c);
      return `<button class="chip ${m.leader === c ? 'sel' : ''}" data-act="leader" data-c="${c}" ${open ? '' : 'disabled'} title="${open ? `${d.name}: ${d.text}` : `Clear wave ${d.unlock} to unlock`}">${open ? d.icon : '🔒'} ${d.name}${open ? '' : ` · wave ${d.unlock}`}</button>`;
    }).join('');
    return `<div class="title">
      <div class="logo">${['🛡️', '🏹', '🔮', '✨'].map((e, i) => `<span style="animation-delay:${i * 0.12}s">${e}</span>`).join('')}</div>
      <h1>Conga Quest</h1>
      <p class="sub">Your heroes march in a line. Steer the leader, keep away from walls and your own tail, and let the heroes fight on their own. Survive ${WAVES} waves and 3 bosses.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue · wave ${r.wave} · ${r.heroes.map((h) => CLASSES[h.cls].icon).join('')}</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <div class="zones"><span class="dim">Leader:</span>${leaders}</div>
      <button data-act="help">How to play</button>
      <div class="log">
        <h2>Hall of heroes</h2>
        <p>Runs <b>${m.runs}</b> · Wins <b>${m.wins}</b> · Best wave <b>${m.bestWave || '–'}</b> · Best score <b>${m.bestScore}</b></p>
        <p>Enemies beaten <b>${m.kills}</b></p>
        <p class="dim">Clear more waves to unlock new hero classes.</p>
      </div>
    </div>`;
  }

  private shrineView(): string {
    const r = this.run!;
    const offers = shrineOffers(r, this.unlocked);
    const cards = offers
      .map((o, i) => {
        const t = offerText(r, o);
        const dis = r.shrineDone || (o.kind === 'recruit' && r.heroes.length >= MAX_PARTY);
        return `<button class="offer ${this.picked === i ? 'picked' : ''}" data-act="offer" data-i="${i}" ${dis ? 'disabled' : ''}>
          <span class="big">${t.icon}</span><b>${t.title}</b><small>${t.text}</small><kbd>${i + 1}</kbd></button>`;
      })
      .join('');
    const syn: Partial<Record<ClassId, number>> = {};
    const counts: Partial<Record<ClassId, number>> = {};
    for (const h of r.heroes) counts[h.cls] = (counts[h.cls] ?? 0) + 1;
    for (const c of CLASS_IDS) if ((counts[c] ?? 0) >= 2) syn[c] = (counts[c] ?? 0) >= 3 ? 2 : 1;
    const list = r.heroes.map((h) => ({ cls: h.cls, stars: h.stars, hp: h.hp, max: maxHpOf(r, h) }));
    const next = r.wave;
    const st = STAGES[stageOf(next)];
    const boss = isBossWave(next);
    const newStage = (next - 1) % 5 === 0;
    const fallen = r.fallen.length ? CLASSES[r.fallen[r.fallen.length - 1]].icon : '';
    return `<div class="shrine">
      <h1>⛩️ Shrine</h1>
      <p class="dim">Wave ${next - 1} cleared. ${r.shrineDone ? 'The shrine has given its gift.' : 'Choose one gift.'}</p>
      <div class="offers">${cards}</div>
      <div class="shop">
        <span class="gold">🪙 ${r.coins}</span>
        <button data-act="revive" ${canRevive(r) ? '' : 'disabled'} title="Bring back the last fallen hero">${fallen || '💀'} Revive · ${reviveCost(r)}🪙</button>
        <button data-act="potion" ${r.coins >= COST.potion ? '' : 'disabled'} title="Heal every hero by half of its max HP">🧪 Potion · ${COST.potion}🪙</button>
        <button data-act="train" ${canTrain(r) ? '' : 'disabled'} title="Give the leader one star">${CLASSES[r.heroes[0].cls].icon} Train leader · ${trainCost(r)}🪙</button>
        <button data-act="reroll" ${!r.shrineDone && r.coins >= COST.reroll ? '' : 'disabled'} title="New gifts">🎲 Reroll · ${COST.reroll}🪙</button>
      </div>
      <h3>Party · level ${r.level} <span class="dim">(tap a hero to make it the leader)</span></h3>
      <div class="party">${this.partyHtml(list, syn, true)}</div>
      <div class="next ${boss ? 'boss' : ''}"><span class="big">${boss ? ENEMIES[st.boss].icon : st.icon}</span><div><b>${boss ? `Boss: ${ENEMIES[st.boss].name}` : `Next: wave ${next}${newStage ? ` · ${st.name}` : ''}`}</b><p>${boss ? ENEMIES[st.boss].text : `Enemies here: ${st.pool.map(([id]) => ENEMIES[id].icon).join(' ')}`}</p></div></div>
      <button class="primary" data-act="next" ${r.shrineDone ? '' : 'disabled'}>Start wave ${next} ▶</button>
      <button data-act="title">Title screen (saves the run)</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <div class="logo">${e.victory ? '🏆' : '💀'}</div>
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? 'Victory!' : 'Run over'}</h1>
      <p>${e.victory ? `The Ember Drake falls. ${e.heroes.map((c) => CLASSES[c].icon).join('')} dance home.` : e.gaveUp ? `You gave up in wave ${e.wave}.` : `The last hero fell in wave ${e.wave}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <div class="stats-grid">
        <div><b>🌊 ${e.victory ? WAVES : e.wave - 1}</b><small>Waves cleared</small></div>
        <div><b>⚔️ ${e.kills}</b><small>Enemies</small></div>
        <div><b>⭐ ${e.level}</b><small>Party level</small></div>
        <div><b>💥 ${e.crashes}</b><small>Crashes</small></div>
      </div>
      <button class="primary" data-act="new">▶ New run</button>
      <button data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const classes = CLASS_IDS.map((c) => {
        const d = CLASSES[c];
        return `<tr><td>${d.icon}</td><td><b>${d.name}</b> · ${d.hp} HP</td><td>${d.text}</td></tr>`;
      }).join('');
      const syn = CLASS_IDS.map((c) => `<tr><td>${CLASSES[c].icon}</td><td><b>${SYNERGIES[c].name}</b></td><td>2: ${SYNERGIES[c].tiers[0]}. 3: ${SYNERGIES[c].tiers[1]}.</td></tr>`).join('');
      const enemies = Object.values(ENEMIES)
        .map((d) => `<tr><td>${d.icon}</td><td><b>${d.name}</b></td><td>${d.text}</td></tr>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li>Your party walks as one line at a steady speed. <b>Steer the leader</b> with the arrow keys, WASD, a swipe or the 🎮 arrows. You can queue one turn.</li>
          <li>The line cannot reverse. <b>Hitting a wall, a rock or your own line kills the leader.</b> The next hero takes the lead after a short stop.</li>
          <li><b>Heroes attack on their own</b> when enemies are in range. Melee heroes need enemies next to them. The leader also rams enemies it walks through.</li>
          <li>Enemies hurt the heroes they touch. A hero at 0 HP leaves the line. The run ends when the last hero falls.</li>
          <li>Pick up <b>💎 gems</b> to level up the whole party, <b>🪙 coins</b> for the shrine shop, <b>🍖 food</b> to heal. Free a <b>🔒 captive</b> by running over it.</li>
          <li>After each wave a <b>shrine</b> gives one gift: a new hero, a hero upgrade (★), a feast or coins. You can also revive a fallen hero and pick the leader.</li>
          <li>Two or three heroes of one class give a <b>synergy</b> bonus. A boss waits at waves 5, 10 and 15.</li>
        </ul>
        <h3>Heroes</h3><table class="tbl">${classes}</table>
        <h3>Synergies</h3><table class="tbl">${syn}</table>
        <h3>Enemies</h3><table class="tbl">${enemies}</table>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (the wave restarts when you continue)</button>
    </div></div>`;
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    if (t.closest('[data-d]')) return;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && t.closest('[data-stop]') && !t.closest('button')) return;
    this.act(el.dataset.act!, el);
  }

  private act(a: string, el?: HTMLElement): void {
    const r = this.run;
    switch (a) {
      case 'new':
        play('click');
        this.startRun();
        break;
      case 'continue':
        play('click');
        if (!r) break;
        if (r.wave > 1 && !r.shrineDone) {
          this.screen = 'shrine';
          this.picked = -1;
          this.render();
        } else this.startWave();
        break;
      case 'leader': {
        const c = el?.dataset.c as ClassId;
        if (c && this.unlocked.includes(c)) {
          this.meta.leader = c;
          saveMeta(this.meta);
          play('click');
          this.render();
        }
        break;
      }
      case 'offer': {
        if (!r || r.shrineDone) break;
        const i = Number(el?.dataset.i ?? 0);
        const o = shrineOffers(r, this.unlocked)[i];
        if (!o) break;
        applyOffer(r, o);
        this.picked = i;
        play(o.kind === 'recruit' ? 'recruit' : o.kind === 'upgrade' ? 'level' : 'heal');
        saveRun(r);
        this.render();
        break;
      }
      case 'revive':
        if (r) {
          const c = revive(r);
          if (c) {
            play('recruit');
            this.toast(`${CLASSES[c].icon} The ${CLASSES[c].name} is back!`);
            saveRun(r);
            this.render();
          } else play('deny');
        }
        break;
      case 'potion':
        if (r && potion(r)) {
          play('heal');
          saveRun(r);
          this.render();
        } else play('deny');
        break;
      case 'train':
        if (r && train(r)) {
          play('level');
          saveRun(r);
          this.render();
        } else play('deny');
        break;
      case 'reroll':
        if (r && !r.shrineDone && r.coins >= COST.reroll) {
          r.coins -= COST.reroll;
          r.rerolls++;
          play('click');
          saveRun(r);
          this.render();
        }
        break;
      case 'lead':
        if (r) {
          makeLeader(r, Number(el?.dataset.i ?? 0));
          play('turn');
          saveRun(r);
          this.render();
        }
        break;
      case 'next':
        play('click');
        if (r && r.shrineDone) this.startWave();
        break;
      case 'help':
        this.modal = { kind: 'help' };
        this.render();
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        this.render();
        break;
      case 'modal-close':
        this.modal = null;
        this.acc = 0;
        this.render();
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem('conga.mute', m ? '1' : '0');
        } catch {
          /* ignore */
        }
        const b = this.root.querySelector<HTMLElement>('[data-act="mute"]');
        if (b) b.textContent = m ? '🔇' : '🔊';
        break;
      }
      case 'pad':
        this.showPad = !this.showPad;
        try {
          localStorage.setItem('conga.pad', this.showPad ? '1' : '0');
        } catch {
          /* ignore */
        }
        this.render();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        this.modal = null;
        if (r) {
          if (this.world) Object.assign(r, { kills: this.world.kills, coins: this.world.coins, level: this.world.level });
          this.finish(false, true);
        }
        break;
      case 'title':
        this.modal = null;
        this.world = null;
        this.screen = 'title';
        this.render();
        break;
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => {
        const w = this.world;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          wave: w?.wave ?? this.run?.wave ?? this.end?.wave ?? null,
          heroes: w ? w.heroes.map((h) => `${h.cls}:${Math.ceil(h.hp)}/${h.s.maxHp}`) : (this.run?.heroes.map((h) => `${h.cls}:${h.hp}`) ?? null),
          level: w?.level ?? this.run?.level ?? null,
          coins: w?.coins ?? this.run?.coins ?? null,
          kills: w?.kills ?? this.run?.kills ?? null,
          leader: w?.heroes[0] ? { x: w.heroes[0].x, y: w.heroes[0].y, heading: w.heading } : null,
          enemies: w?.enemies.length ?? null,
          remaining: w?.remaining() ?? null,
          time: w ? Math.round(w.time) : null,
          done: w?.done ?? null,
          shrineDone: this.run?.shrineDone ?? null,
          score: this.run ? score(this.run, false) : (this.end?.score ?? null),
          end: this.end,
        };
      },
      /** One bot action. In a wave it plays a few seconds of game time with the steering bot. */
      step: () => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'shrine': {
            const r = this.run!;
            if (!r.shrineDone) {
              this.bot ??= new Bot('good', new Rng(hash(r.seed, 'dbg')));
              this.bot.shrine(r, this.unlocked);
              this.render();
              return 'shrine';
            }
            click('[data-act="next"]');
            return 'next';
          }
          case 'end':
            return 'end';
          case 'play': {
            const w = this.world!;
            if (w.done) {
              if (performance.now() < this.transitAt) return 'busy';
              this.waveOver();
              return 'wave-over';
            }
            this.bot ??= new Bot('good', new Rng(hash(w.wave, 'dbg')));
            const n = FAST ? 300 : 60;
            for (let i = 0; i < n && !w.done; i++) this.tick(this.bot);
            this.draw();
            return 'play';
          }
        }
        return 'idle';
      },
      /** Kills every enemy and skips the rest of the wave. */
      clear: () => {
        const w = this.world;
        if (!w) return;
        const p = w as unknown as { planIdx: number; plan: unknown[] };
        p.planIdx = p.plan.length;
        for (const e of [...w.enemies]) w.hurtEnemy(e, 1e9, false);
      },
      wave: (n: number) => {
        if (!this.run) this.run = newRun(randomSeedText(), 'knight', this.unlocked);
        this.run.wave = Math.max(1, Math.min(WAVES, n));
        this.startWave();
      },
      xp: (n: number) => this.world?.addXp(n),
      coins: (n: number) => {
        if (this.world) this.world.coins += n;
        else if (this.run) {
          this.run.coins += n;
          this.render();
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
