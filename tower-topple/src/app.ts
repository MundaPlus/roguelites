import { CURSES, KIND_INFO, MATS, SHAPES, SPELLS, UNLOCKS, WORLDS } from './data';
import { bestPlan, botSpell } from './bot';
import { DROP_SPEED, Game, VIEW_H, VIEW_W, blockColor, pieceBoxes, pieceH, pieceW, type ChallengeSpec, type GameResult } from './game';
import { DT, type Body } from './physics';
import { randomSeedText } from './rng';
import {
  HAND_MAX,
  NODE_INFO,
  STEPS,
  addCard,
  advance,
  applyChallenge,
  bricksFor,
  buy,
  choices,
  clearRun,
  finalScore,
  loadMeta,
  loadRun,
  makeShop,
  makeSpec,
  newRun,
  restHeal,
  rngFor,
  saveMeta,
  saveRun,
  spellPool,
  type MapNode,
  type Rewards,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'game' | 'result' | 'shop' | 'rest' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');
const BOT_PRIO = ['vines', 'glue', 'heavy', 'calm', 'mend', 'shrink', 'ledge', 'undo'];
const MUTE_KEY = 'towertopple.mute';

type RunSave = RunState & { inChallenge?: boolean };

export class App {
  private run: RunSave | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  // Challenge
  private game: Game | null = null;
  private node: MapNode | null = null;
  private endWait = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private last = 0;
  private acc = 0;
  private scale = 20;
  private particles: Particle[] = [];
  private floats: Float[] = [];
  private shake = 0;
  private flash = 0;
  private banner: { text: string; sub: string; color: string; t: number } | null = null;
  private clouds: { x: number; y: number; r: number }[] = [];
  private ghost: { key: string; y: number | null; t: number } = { key: '', y: null, t: 0 };
  private hold: { dir: number; t: number; next: number } | null = null;
  private soft = false;
  private drag: { id: number; x0: number; y0: number; t0: number; left0: number; moved: boolean } | null = null;
  private dragTarget: number | null = null;
  private handKey = '';
  private hudKey = '';

  // Other screens
  private result: { won: boolean; res: GameResult; rewards: Rewards | null; picked: boolean; node: MapNode } | null = null;
  private shop: ShopItem[] = [];
  private rest: { picks: string[] | null; done: boolean } = { picks: null, done: false };
  private end: { victory: boolean; score: number; bricks: number; world: number; height: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* ignore */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      this.hold = null;
      this.soft = false;
    });
    for (let i = 0; i < 7; i++) this.clouds.push({ x: Math.random() * VIEW_W - VIEW_W / 2, y: Math.random() * 40, r: 0.8 + Math.random() * 1.4 });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
    requestAnimationFrame((t) => this.loop(t));
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
      case 'game':
        body = this.gameView();
        break;
      case 'result':
        body = this.resultView();
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
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.handKey = '';
    this.hudKey = '';
    if (this.screen === 'game') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.updateSide();
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

  private topBar(): string {
    const r = this.run!;
    const W = WORLDS[Math.min(r.world, WORLDS.length - 1)];
    const lives = this.game && this.screen === 'game' ? this.game.lives : r.lives;
    return `<header class="top">
      <span class="lives" id="tb-lives" title="Lives">❤️ ${Math.max(0, lives)}/${r.maxLives}</span>
      <span title="Coins">🪙 ${r.coins}</span>
      <span title="World and step">${W.icon} ${Math.min(r.world + 1, 3)}-${r.step + 1}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play" aria-label="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const shop = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.bricks >= u.cost ? '' : 'disabled'}>🧱 ${u.cost}</button>`}</div>`;
    }).join('');
    return `<div class="title">
      <div class="logo" aria-hidden="true">${this.logoBlocks()}</div>
      <h1>Tower Topple</h1>
      <p class="sub">Stack falling blocks into a tower that really wobbles. Beat races, storms and laser ceilings across 3 worlds.</p>
      ${this.run ? `<button class="primary" data-act="continue">▶ Continue run (world ${this.run.world + 1}, ❤️ ${this.run.lives})</button>` : ''}
      <button class="${this.run ? '' : 'primary'}" data-act="new">${this.run ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best world ${m.bestWorld} · Best height ${Math.round(m.bestHeight)} · Best score ${m.best}</p>
      <h2>Workshop <small>🧱 ${m.bricks} bricks</small></h2>
      <p class="sub">Each run gives bricks. Unlock spells, block sets and perks for later runs.</p>
      <div class="armory">${shop}</div>
    </div>`;
  }

  private logoBlocks(): string {
    // [color, x, row from the bottom]
    const cells: [string, number, number][] = [
      ['#4cc9f0', 0, 0], ['#4cc9f0', 1, 0], ['#4cc9f0', 2, 0], ['#4cc9f0', 3, 0],
      ['#ffd166', 1, 1], ['#ffd166', 2, 1], ['#ffd166', 1, 2], ['#ffd166', 2, 2],
      ['#c77dff', 0, 3], ['#c77dff', 1, 3], ['#c77dff', 2, 3], ['#c77dff', 1, 4],
    ];
    return cells.map(([c, x, y], i) => `<i style="--c:${c};left:${x * 22}px;top:${(4 - y) * 22}px;animation-delay:${i * 0.05}s"></i>`).join('');
  }

  private nodeDetail(n: MapNode): string {
    const r = this.run!;
    if (n.kind === 'rest' || n.kind === 'shop') return NODE_INFO[n.kind].text;
    const s = makeSpec(r, n);
    const parts: string[] = [];
    if (s.kind === 'race') parts.push(`Reach height <b>${s.goal}</b> in ${s.time}s`);
    if (s.kind === 'hold') parts.push(`Place <b>${s.blocks}</b> blocks, then hold ${s.hold}s`);
    if (s.kind === 'ceiling') parts.push(`Fit <b>${s.blocks}</b> blocks under height ${s.goal}`);
    if (n.kind === 'elite') parts.push(`Curses: ${s.curses.map((c) => CURSES[c].icon).join(' ')}`);
    if (n.kind === 'boss') parts.push(`${WORLDS[r.world].boss.icon} ${WORLDS[r.world].boss.name}: ${WORLDS[r.world].boss.text}`);
    return parts.join('<br>');
  }

  private mapView(): string {
    const r = this.run!;
    const W = WORLDS[r.world];
    const track = r.map[r.world]
      .map((row, i) => {
        const cls = i < r.step ? 'done' : i === r.step ? 'now' : '';
        const icon = i < r.step && r.path[i] !== undefined ? NODE_INFO[row[r.path[i]].kind].icon : row.length === 1 ? NODE_INFO[row[0].kind].icon : '❔';
        return `<span class="node ${cls}">${icon}</span>`;
      })
      .join('<span class="link"></span>');
    const rooms = choices(r)
      .map((n, i) => {
        const info = NODE_INFO[n.kind];
        const sub = n.kind === 'elite' ? ` · ${KIND_INFO[n.ch].name}` : '';
        return `<button class="room ${n.kind}" data-act="node" data-i="${i}"><span class="big">${info.icon}</span><b>${info.name}${sub}</b><small>${this.nodeDetail(n)}</small></button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${W.icon} World ${r.world + 1}: ${W.name}</h2>
      <p class="sub">${this.worldHazards(r.world)}</p>
      <div class="track">${track}</div>
      <h3>Choose your next step</h3>
      <div class="rooms">${rooms}</div>
      ${this.handHtml(false)}
    </div>`;
  }

  private worldHazards(w: number): string {
    const W = WORLDS[w];
    const h: string[] = [];
    if (W.wind > 0) h.push('🌬️ wind');
    if (W.quake > 0) h.push('🌋 quakes');
    if (W.ice > 0) h.push('❄️ ice blocks');
    if (W.stone > 0) h.push('🪨 stone blocks');
    if (W.moving > 0) h.push('↔️ moving platform');
    return `Hazards: ${h.join(' · ')}`;
  }

  private handHtml(castable: boolean): string {
    const r = this.run!;
    const cards = r.hand
      .map((id, i) => {
        const s = SPELLS[id];
        const ok = castable && this.game ? this.game.canCast(id) : true;
        return `<button class="card ${ok ? '' : 'off'}" ${castable ? `data-act="cast" data-i="${i}"` : ''} title="${s.name}: ${s.text}" ${castable && !ok ? 'disabled' : ''}>
          <span class="ci">${s.icon}</span><span class="cn">${s.name}</span>${castable ? `<kbd>${i + 1}</kbd>` : ''}</button>`;
      })
      .join('');
    const empty = Array.from({ length: HAND_MAX - r.hand.length }, () => '<span class="card empty"></span>').join('');
    return `<div class="hand" id="hand">${cards}${empty}</div>`;
  }

  private gameView(): string {
    return `<div class="play">
      <div class="cv-wrap"><canvas id="cv"></canvas></div>
      <aside class="side">
        <div class="info" id="info"></div>
        <div id="hand-wrap"></div>
        <div class="pad">
          <button data-pad="left" aria-label="Move left">◀</button>
          <button data-pad="rot" aria-label="Rotate">⟳</button>
          <button data-pad="soft" aria-label="Fall faster">▼</button>
          <button data-pad="slam" aria-label="Drop">⤓</button>
          <button data-pad="right" aria-label="Move right">▶</button>
        </div>
        <p class="hint keys">← → move · ↑ rotate · ↓ faster · Space drop · 1–5 spells · Esc menu. Drag on the tower to move, tap to rotate.</p>
      </aside>
    </div>`;
  }

  /** Refreshes the hand and info panel when they change. */
  private updateSide(): void {
    const g = this.game;
    if (!g || this.screen !== 'game') return;
    const hk = `${this.run!.hand.join(',')}|${this.run!.hand.map((id) => g.canCast(id)).join('')}`;
    if (hk !== this.handKey) {
      this.handKey = hk;
      const el = this.root.querySelector('#hand-wrap');
      if (el) el.innerHTML = this.handHtml(true);
    }
    const s = g.spec;
    const ik = `${s.kind}|${g.phase}|${g.lives}`;
    if (ik !== this.hudKey) {
      this.hudKey = ik;
      const el = this.root.querySelector('#info');
      const tier = s.tier === 'boss' ? `${WORLDS[s.world].boss.icon} ${WORLDS[s.world].boss.name}` : s.tier === 'elite' ? '💀 Elite' : '';
      if (el)
        el.innerHTML = `<b>${KIND_INFO[s.kind].icon} ${KIND_INFO[s.kind].name}</b> ${tier ? `<span class="foe">${tier}</span>` : ''}
          <p>${KIND_INFO[s.kind].text}</p>
          <p class="dim">A block that falls off costs a life.${s.curses.length ? ` Curses: ${s.curses.map((c) => `${CURSES[c].icon} ${CURSES[c].name}`).join(', ')}.` : ''}</p>`;
      const tb = this.root.querySelector('#tb-lives');
      if (tb) tb.textContent = `❤️ ${Math.max(0, g.lives)}/${this.run!.maxLives}`;
    }
  }

  private resultView(): string {
    const r = this.result!;
    if (!r.won) {
      return `<div class="reward">
        <h1 class="bad">💥 Failed</h1>
        <p>${r.res.reason}. ${r.res.reason === 'Out of lives' ? '' : 'You lose 1 more life.'}</p>
        <p class="dim">Height ${r.res.height.toFixed(1)} · Blocks ${r.res.placed} · Lives lost ${r.res.livesLost}</p>
        <p>🪙 +3 coins</p>
        <button class="primary" data-act="advance">Continue</button>
      </div>`;
    }
    const rw = r.rewards!;
    const full = this.run!.hand.length >= HAND_MAX;
    const picks = rw.picks
      .map((id, i) => {
        const s = SPELLS[id];
        return `<button class="pick" data-act="pick" data-i="${i}" ${r.picked || full ? 'disabled' : ''}><span class="big">${s.icon}</span><b>${s.name}</b><small>${s.text}</small></button>`;
      })
      .join('');
    return `<div class="reward">
      <h1 class="good">${r.node.kind === 'boss' ? '👑 Boss beaten!' : '🏆 Cleared!'}</h1>
      <p class="dim">${r.res.reason} · Height ${r.res.height.toFixed(1)} · Lives lost ${r.res.livesLost}</p>
      <p>🪙 +${rw.coins} coins${rw.life ? ` · ❤️ +${rw.life} ${rw.life === 1 ? 'life' : 'lives'}${r.res.livesLost === 0 ? ' (flawless)' : ''}` : ''}${rw.extra ? ` · bonus card ${SPELLS[rw.extra].icon} ${SPELLS[rw.extra].name}` : ''}</p>
      <h3>${r.picked ? 'Card taken' : full ? 'Your hand is full (5 cards)' : 'Take a spell card'}</h3>
      <div class="picks">${picks}</div>
      <button class="primary" data-act="advance">${r.picked || full ? 'Continue' : 'Skip'}</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = this.shop
      .map((it, i) => {
        const name = it.kind === 'spell' ? `${SPELLS[it.id].icon} ${SPELLS[it.id].name}` : it.kind === 'life' ? '❤️ 1 life' : '💗 +1 max life';
        const text = it.kind === 'spell' ? SPELLS[it.id].text : it.kind === 'life' ? 'Gain 1 life now.' : 'Raise your max lives by 1 and gain 1 life.';
        const can = !it.sold && r.coins >= it.price && !(it.kind === 'spell' && r.hand.length >= HAND_MAX) && !(it.kind === 'life' && r.lives >= r.maxLives);
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${can ? '' : 'disabled'}><b>${name}</b><small>${text}</small><span class="cost">${it.sold ? 'Sold' : `🪙 ${it.price}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv">
      <h2>🛒 Shop</h2>
      <p class="sub">You have 🪙 ${r.coins}. Hand ${r.hand.length}/${HAND_MAX}.</p>
      <div class="picks">${items}</div>
      ${this.handHtml(false)}
      <button class="primary" data-act="advance">Leave</button>
    </div>`;
  }

  private restView(): string {
    const r = this.run!;
    if (this.rest.picks) {
      const picks = this.rest.picks
        .map((id, i) => `<button class="pick" data-act="study" data-i="${i}" ${r.hand.length >= HAND_MAX ? 'disabled' : ''}><span class="big">${SPELLS[id].icon}</span><b>${SPELLS[id].name}</b><small>${SPELLS[id].text}</small></button>`)
        .join('');
      return `<div class="restv"><h2>📖 Study</h2><p class="sub">Take one spell card.</p><div class="picks">${picks}</div><button data-act="advance">Skip</button></div>`;
    }
    return `<div class="restv">
      <h2>🔥 Camp</h2>
      <p class="sub">A quiet night by the fire. ❤️ ${r.lives}/${r.maxLives}</p>
      <div class="opts">
        <button class="primary" data-act="rest-heal" ${r.lives >= r.maxLives ? 'disabled' : ''}>🛌 Rest: gain 3 lives</button>
        <button data-act="rest-study" ${r.hand.length >= HAND_MAX ? 'disabled' : ''}>📖 Study: take 1 of 3 spells</button>
      </div>
      ${this.handHtml(false)}
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Toppled'}</h1>
      <p>${e.victory ? 'The Storm Wizard falls silent. Your tower touches the clouds.' : `Your run ended in world ${e.world + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p class="dim">Best height this run: ${e.height.toFixed(1)}</p>
      <p>🧱 +${e.bricks} bricks for the Workshop</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Blocks fall from the top.</b> Move them with <kbd>←</kbd> <kbd>→</kbd> (or drag on the tower), turn them with <kbd>↑</kbd> (or tap), and drop with <kbd>Space</kbd>. Hold <kbd>↓</kbd> to fall faster. On phones use the buttons below the tower.</li>
          <li><b>Real physics.</b> Once a block touches the tower it is on its own: it has weight and friction and can slide, tip and fall.</li>
          <li><b>Lives.</b> Each block that falls off the platform costs 1 life. At 0 lives the run ends.</li>
          <li><b>Challenges:</b> 🏁 <b>Race</b> — build up to the goal line and keep the tower there for 2 seconds. ⏳ <b>Hold</b> — place all blocks, then survive a storm. 📏 <b>Ceiling</b> — place all blocks below the red laser; a block that rests above it is zapped.</li>
          <li><b>Spell cards</b> (keys <kbd>1</kbd>–<kbd>5</kbd>): 🍯 Glue sticks the falling block, ⚓ Heavy pins it, 🔹 Shrink makes it small, 🌿 Vines roots the whole tower. Each card is used once.</li>
          <li><b>Hazards:</b> wind, quakes, slippery ❄️ ice blocks, heavy 🪨 stone blocks, rockfall and a moving platform. Elites and bosses cast curses; a warning shows first.</li>
          <li>Win challenges for coins and new cards. Rest at camps, shop for spells, and beat the boss of each of the 3 worlds.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run${this.screen === 'game' ? ', but leaving a challenge costs 1 life' : ''})</button>
    </div></div>`;
  }

  // ---------- Actions ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop]');
    if (!el || !el.dataset.act) return;
    this.action(el.dataset.act, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    const r = this.run;
    switch (act) {
      case 'new':
        this.startRun();
        break;
      case 'continue':
        if (r?.inChallenge) {
          r.inChallenge = false;
          r.lives--;
          this.toast('You left a challenge: −1 life');
          if (r.lives <= 0) {
            this.endRun(false);
            return;
          }
          saveRun(r);
        }
        this.screen = 'map';
        this.render();
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
        this.render();
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem(MUTE_KEY, m ? '1' : '0');
        } catch {
          /* ignore */
        }
        this.render();
        break;
      }
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        this.modal = null;
        this.game = null;
        this.endRun(false);
        break;
      case 'title':
        this.modal = null;
        if (this.screen === 'game' && this.game && r) r.inChallenge = true;
        if (r) saveRun(r);
        this.game = null;
        this.screen = 'title';
        this.run = loadRun();
        this.render();
        break;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === d.id);
        if (!u || this.meta.bricks < u.cost || this.meta.unlocked.includes(u.id)) return;
        this.meta.bricks -= u.cost;
        this.meta.unlocked.push(u.id);
        saveMeta(this.meta);
        sfx.buy();
        this.toast(`${u.icon} ${u.name} unlocked`);
        this.render();
        break;
      }
      case 'node':
        this.enterNode(choices(r!)[Number(d.i)], Number(d.i));
        break;
      case 'cast':
        this.castCard(Number(d.i));
        break;
      case 'pick': {
        const res = this.result;
        if (!res || res.picked || !res.rewards) return;
        if (addCard(r!, res.rewards.picks[Number(d.i)])) {
          res.picked = true;
          sfx.spell();
          saveRun(r!);
          this.render();
        }
        break;
      }
      case 'advance':
        this.nextStep();
        break;
      case 'buy': {
        const it = this.shop[Number(d.i)];
        if (it && buy(r!, it)) {
          sfx.buy();
          saveRun(r!);
        } else sfx.deny();
        this.render();
        break;
      }
      case 'rest-heal': {
        const n = restHeal(r!);
        sfx.heal();
        this.toast(`❤️ +${n} lives`);
        this.nextStep();
        break;
      }
      case 'rest-study':
        this.rest.picks = rngFor(r!, 'study', r!.world, r!.step).shuffle([...spellPool(r!)]).slice(0, 3);
        this.render();
        break;
      case 'study': {
        const id = this.rest.picks?.[Number(d.i)];
        if (id && addCard(r!, id)) {
          sfx.spell();
          this.nextStep();
        }
        break;
      }
    }
  }

  private startRun(): void {
    this.run = newRun(randomSeedText(), this.meta);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.modal = null;
    this.screen = 'map';
    this.render();
  }

  private enterNode(n: MapNode, i: number): void {
    const r = this.run!;
    r.path[r.step] = i;
    sfx.click();
    if (n.kind === 'rest') {
      this.rest = { picks: null, done: false };
      this.screen = 'rest';
      this.render();
      return;
    }
    if (n.kind === 'shop') {
      this.shop = makeShop(r);
      this.screen = 'shop';
      this.render();
      return;
    }
    this.startChallenge(n);
  }

  private startChallenge(n: MapNode): void {
    const r = this.run!;
    const spec: ChallengeSpec = makeSpec(r, n);
    this.node = n;
    this.game = new Game(spec, r.lives);
    r.inChallenge = true;
    saveRun(r);
    this.particles = [];
    this.floats = [];
    this.banner = null;
    this.endWait = 0;
    this.acc = 0;
    this.hold = null;
    this.soft = false;
    this.dragTarget = null;
    this.screen = 'game';
    this.render();
    const intro =
      spec.kind === 'race' ? `Reach height ${spec.goal}` : spec.kind === 'hold' ? `Place ${spec.blocks} blocks, then hold` : `Fit ${spec.blocks} blocks below ${spec.goal}`;
    this.showBanner(`${KIND_INFO[spec.kind].icon} ${KIND_INFO[spec.kind].name}`, intro, '#ffb703');
  }

  private castCard(i: number): void {
    const r = this.run;
    const g = this.game;
    if (!r || !g || this.screen !== 'game' || this.modal) return;
    const id = r.hand[i];
    if (!id) return;
    if (!g.cast(id)) {
      sfx.deny();
      this.toast(`${SPELLS[id].name} cannot be used now`);
      return;
    }
    r.hand.splice(i, 1);
    this.updateSide();
  }

  private finishChallenge(): void {
    const g = this.game!;
    const r = this.run!;
    const res = g.result();
    const node = this.node!;
    const rewards = applyChallenge(r, node, res, g.lives);
    r.inChallenge = false;
    this.game = null;
    if (r.lives <= 0) {
      this.endRun(false);
      return;
    }
    saveRun(r);
    this.result = { won: res.won, res, rewards, picked: false, node };
    this.screen = 'result';
    this.render();
  }

  private nextStep(): void {
    const r = this.run!;
    const won = advance(r);
    if (won) {
      this.endRun(true);
      return;
    }
    saveRun(r);
    this.screen = 'map';
    this.render();
    if (r.step === 0) this.toast(`${WORLDS[r.world].icon} World ${r.world + 1}: ${WORLDS[r.world].name}`);
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const score = finalScore(r, victory);
    const bricks = bricksFor(score);
    const m = this.meta;
    m.bricks += bricks;
    if (victory) m.wins++;
    m.best = Math.max(m.best, score);
    m.bestHeight = Math.max(m.bestHeight, r.bestHeight);
    m.bestWorld = Math.max(m.bestWorld, Math.min(3, r.world + (victory ? 0 : 1)));
    saveMeta(m);
    clearRun();
    this.end = { victory, score, bricks, world: Math.min(r.world, 2), height: r.bestHeight };
    this.run = null;
    this.game = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) initAudio();
    const k = e.key;
    if (down && k === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.run && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen !== 'game' || this.modal || !this.game) return;
    const g = this.game;
    const left = k === 'ArrowLeft' || k === 'a' || k === 'A';
    const right = k === 'ArrowRight' || k === 'd' || k === 'D';
    if (left || right) {
      e.preventDefault();
      const dir = left ? -1 : 1;
      if (down && !e.repeat) {
        g.move(dir);
        this.hold = { dir, t: 0, next: 0.17 };
      } else if (!down && this.hold?.dir === dir) this.hold = null;
      return;
    }
    if (k === 'ArrowDown' || k === 's' || k === 'S') {
      e.preventDefault();
      this.soft = down;
      return;
    }
    if (!down || e.repeat) return;
    if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') {
      e.preventDefault();
      g.rotate();
    } else if (k === ' ') {
      e.preventDefault();
      this.slam();
    } else if (/^[1-5]$/.test(k)) this.castCard(Number(k) - 1);
  }

  private slam(): void {
    const g = this.game;
    if (!g?.piece || g.slam) return;
    g.slam = true;
    sfx.slam();
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    const pad = (e.target as HTMLElement).closest<HTMLElement>('[data-pad]');
    const g = this.game;
    if (pad && g && this.screen === 'game' && !this.modal) {
      e.preventDefault();
      const p = pad.dataset.pad;
      if (p === 'left' || p === 'right') {
        const dir = p === 'left' ? -1 : 1;
        g.move(dir);
        this.hold = { dir, t: 0, next: 0.2 };
      } else if (p === 'rot') g.rotate();
      else if (p === 'soft') this.soft = true;
      else if (p === 'slam') this.slam();
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (e.target === this.canvas && g?.piece && !this.modal) {
      e.preventDefault();
      this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), left0: g.piece.left, moved: false };
    }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    const g = this.game;
    if (!d || d.id !== e.pointerId || !g?.piece || !this.canvas) return;
    const cellPx = this.canvas.getBoundingClientRect().width / VIEW_W;
    const dx = (e.clientX - d.x0) / cellPx;
    if (Math.abs(e.clientX - d.x0) > 8) d.moved = true;
    this.dragTarget = Math.round((d.left0 + dx) * 2) / 2;
  }

  private onUp(e: PointerEvent): void {
    const pad = (e.target as HTMLElement | null)?.closest?.('[data-pad]') as HTMLElement | null;
    if (pad || this.hold) {
      this.hold = null;
      this.soft = false;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    this.dragTarget = null;
    const g = this.game;
    if (!g) return;
    const dt = performance.now() - d.t0;
    const dy = e.clientY - d.y0;
    if (dy > 70 && dt < 450 && Math.abs(e.clientX - d.x0) < dy) this.slam();
    else if (!d.moved && dt < 350 && Math.abs(dy) < 10) g.rotate();
  }

  /** Per fixed step: held keys and drag. */
  private inputTick(): void {
    const g = this.game!;
    g.drop = this.soft;
    if (this.hold) {
      this.hold.t += DT;
      if (this.hold.t >= this.hold.next) {
        this.hold.next += 0.06;
        g.move(this.hold.dir);
      }
    }
    if (this.dragTarget !== null && g.piece) {
      const diff = this.dragTarget - g.piece.left;
      if (Math.abs(diff) >= 0.5) {
        if (!g.move(Math.sign(diff))) this.dragTarget = null;
      }
    }
  }

  // ---------- Loop ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const narrow = window.innerWidth <= 860;
    const maxW = wrap.clientWidth;
    const reserve = narrow ? 44 + 150 : 70;
    const maxH = Math.max(300, window.innerHeight - reserve);
    const w = Math.floor(Math.min(maxW, (maxH * VIEW_W) / VIEW_H, 600));
    const h = Math.floor((w * VIEW_H) / VIEW_W);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    this.scale = cv.width / VIEW_W;
  }

  private loop(ts: number): void {
    const dt = Math.min(0.1, Math.max(0, (ts - (this.last || ts)) / 1000));
    this.last = ts;
    const g = this.game;
    if (g && this.screen === 'game' && !this.modal && !document.hidden) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 6) {
        if (g.status === 'play') this.inputTick();
        g.tick();
        this.acc -= DT;
        n++;
      }
      if (n >= 6) this.acc = 0;
      this.handleEvents();
      if (g.status !== 'play') {
        this.endWait -= dt;
        if (this.endWait <= 0) this.finishChallenge();
      }
      this.updateSide();
    }
    this.updateFx(dt);
    if (this.screen === 'game') this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  private showBanner(text: string, sub: string, color: string): void {
    this.banner = { text, sub, color, t: 2.2 };
  }

  private puff(x: number, y: number, color: string, n: number, speed = 2): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s * 0.8, life, max: life, color, size: 0.08 + Math.random() * 0.14 });
    }
  }

  private handleEvents(): void {
    const g = this.game!;
    for (const ev of g.events) {
      switch (ev.type) {
        case 'land':
          if (ev.speed > 1.5) {
            sfx.land(ev.speed);
            this.puff(ev.x, ev.y, 'rgba(255,240,220,0.8)', 6, 1.5);
          }
          break;
        case 'lost':
          sfx.lost();
          this.flash = 0.35;
          this.shake = Math.max(this.shake, 0.15);
          this.floats.push({ x: Math.max(-VIEW_W / 2 + 1.5, Math.min(VIEW_W / 2 - 1.5, ev.x)), y: Math.max(g.camY + 2, ev.y), text: '−1 ❤️', color: '#ef476f', t: 1.4 });
          break;
        case 'spared':
          this.floats.push({ x: Math.max(-VIEW_W / 2 + 1.5, Math.min(VIEW_W / 2 - 1.5, ev.x)), y: Math.max(g.camY + 2, ev.y), text: 'lost (no cost)', color: '#bfae8e', t: 1.1 });
          break;
        case 'zap':
          sfx.zap();
          this.flash = 0.3;
          this.puff(ev.x, ev.y, '#ff4d6d', 16, 4);
          this.floats.push({ x: ev.x, y: ev.y, text: 'ZAP −1 ❤️', color: '#ff4d6d', t: 1.4 });
          break;
        case 'spell': {
          sfx.spell();
          const p = g.piece;
          const x = p ? p.left + pieceW(p) / 2 : 0;
          const y = p ? p.bottom + pieceH(p) + 0.6 : g.height + 2;
          this.floats.push({ x, y, text: `${SPELLS[ev.id].icon} ${SPELLS[ev.id].name}`, color: '#ffe8a3', t: 1.3 });
          this.puff(x, y - 0.5, '#ffe8a3', 14, 3);
          if (ev.id === 'mend') sfx.heal();
          break;
        }
        case 'warn':
          sfx.warn();
          this.showBanner(`⚠️ ${CURSES[ev.id].icon} ${CURSES[ev.id].name} incoming`, CURSES[ev.id].text, '#ff9f43');
          break;
        case 'curse':
          sfx.curse();
          if (ev.id === 'quake') this.shake = Math.max(this.shake, 0.4);
          this.showBanner(`${CURSES[ev.id].icon} ${CURSES[ev.id].name}!`, CURSES[ev.id].text, '#ef476f');
          break;
        case 'goal':
          sfx.goal();
          this.floats.push({ x: 0, y: g.spec.goal + 1, text: 'Hold it!', color: '#ffd166', t: 1.2 });
          break;
        case 'storm':
          sfx.storm();
          this.showBanner('⛈️ Storm!', `Keep the tower up for ${g.spec.hold} seconds`, '#4cc9f0');
          break;
        case 'glue':
          sfx.glue();
          this.puff(ev.x, ev.y, '#f4a261', 12, 2);
          break;
        case 'pin':
          sfx.pin();
          this.puff(ev.x, ev.y, '#adb5bd', 12, 2.5);
          break;
        case 'move':
          sfx.move();
          break;
        case 'rotate':
          sfx.rotate();
          break;
        case 'end':
          if (ev.won) {
            sfx.win();
            this.showBanner('🏆 Cleared!', ev.reason, '#7ee08a');
            for (let i = 0; i < 5; i++) this.puff(Math.random() * 8 - 4, g.height * Math.random(), ['#ffd166', '#7ee08a', '#4cc9f0', '#c77dff'][i % 4], 10, 4);
          } else {
            sfx.lose();
            this.showBanner('💥 Failed', ev.reason, '#ef476f');
          }
          this.endWait = FAST ? 0 : 1.8;
          break;
        default:
          break;
      }
    }
    g.events.length = 0;
  }

  private updateFx(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 6 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.t -= dt;
      f.y += dt * 0.8;
    }
    this.floats = this.floats.filter((f) => f.t > 0);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    const wind = this.game?.wind ?? 0;
    for (const c of this.clouds) {
      c.x += (0.25 + wind * 0.8) * dt;
      if (c.x > VIEW_W / 2 + 3) c.x = -VIEW_W / 2 - 3;
      if (c.x < -VIEW_W / 2 - 3) c.x = VIEW_W / 2 + 3;
    }
  }

  // ---------- Drawing ----------

  private draw(): void {
    const ctx = this.ctx;
    const g = this.game;
    const cv = this.canvas;
    if (!ctx || !cv || !g) return;
    const S = this.scale;
    const W = WORLDS[g.spec.world];
    const quaking = g.quakeT > 0 ? 0.08 : 0;
    const sh = this.shake * 0.4 + quaking;
    const ox = sh ? (Math.random() - 0.5) * sh * S : 0;
    const oy = sh ? (Math.random() - 0.5) * sh * S : 0;
    const cam = g.camY;
    const sx = (x: number): number => (x + VIEW_W / 2) * S + ox;
    const sy = (y: number): number => (cam + VIEW_H - y) * S + oy;

    // Sky.
    const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
    const k = Math.min(1, Math.max(0, cam / 30));
    grad.addColorStop(0, mix(W.sky[0], '#0b1026', k * 0.6));
    grad.addColorStop(1, mix(W.sky[1], W.sky[0], k * 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Far hills (parallax).
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, cv.height);
    for (let x = 0; x <= VIEW_W; x += 0.5) {
      const hy = -3 + 2.2 * Math.sin(x * 0.7 + g.spec.world) + 1.2 * Math.sin(x * 1.9);
      ctx.lineTo(x * S, (cam * 0.6 + VIEW_H - hy) * S);
    }
    ctx.lineTo(cv.width, cv.height);
    ctx.fill();
    // Clouds.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const c of this.clouds) {
      const y = sy(c.y + cam * 0.5);
      ctx.beginPath();
      ctx.ellipse(sx(c.x), y, c.r * S * 1.6, c.r * S * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Height ruler.
    ctx.font = `${Math.round(S * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let h = 0; h <= cam + VIEW_H; h += 2) {
      if (h < cam - 1) continue;
      const y = sy(h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, y, S * (h % 10 === 0 ? 0.7 : 0.35), Math.max(1, S * 0.04));
      if (h % 4 === 0 && h > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(String(h), S * 0.8, y);
      }
    }
    // Goal or ceiling line.
    const s = g.spec;
    if (s.kind === 'race') {
      const y = sy(s.goal);
      ctx.strokeStyle = g.goalT > 0 ? '#7ee08a' : '#ffd166';
      ctx.lineWidth = Math.max(2, S * 0.08);
      ctx.setLineDash([S * 0.4, S * 0.25]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cv.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.textAlign = 'right';
      ctx.fillText(`🏁 ${s.goal}`, cv.width - S * 0.3, y - S * 0.45);
      if (g.goalT > 0) {
        ctx.fillStyle = 'rgba(126,224,138,0.25)';
        ctx.fillRect(0, y - S * 0.15, (cv.width * Math.min(1, g.goalT / 2)), S * 0.3);
      }
    } else if (s.kind === 'ceiling') {
      const y = sy(s.goal);
      ctx.fillStyle = 'rgba(239,71,111,0.10)';
      ctx.fillRect(0, 0, cv.width, y);
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = S * 0.5;
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = Math.max(2, S * 0.09 + Math.sin(performance.now() / 90) * S * 0.02);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cv.width, y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff8fa3';
      ctx.textAlign = 'right';
      ctx.fillText('laser ceiling', cv.width - S * 0.3, y - S * 0.45);
    }
    // Platform and pillar.
    const pl = g.platform;
    const pw = g.platW;
    const px0 = sx(pl.x - pw / 2);
    ctx.fillStyle = shade(W.ground, -0.35);
    ctx.fillRect(sx(pl.x - pw * 0.3), sy(-1), pw * 0.6 * S, cv.height);
    const pg = ctx.createLinearGradient(0, sy(0), 0, sy(-1));
    pg.addColorStop(0, shade(W.ground, 0.25));
    pg.addColorStop(1, shade(W.ground, -0.2));
    ctx.fillStyle = pg;
    roundRect(ctx, px0, sy(0), pw * S, S, S * 0.15);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px0 + S * 0.1, sy(0), pw * S - S * 0.2, Math.max(1, S * 0.08));
    // Bodies.
    for (const b of g.world.bodies) {
      if (b.tag.role === 'platform') continue;
      this.drawBody(ctx, b, sx, sy, S);
    }
    // Falling piece with its drop guide.
    const p = g.piece;
    if (p) {
      const key = `${p.left}|${p.cells.join(';')}|${p.cs}`;
      this.ghost.t -= 1;
      if (key !== this.ghost.key || this.ghost.t <= 0) {
        this.ghost = { key, y: g.landing(p.cells, p.cs, p.left, p.bottom), t: 8 };
      }
      const color = blockColor(p.shape, p.mat);
      if (this.ghost.y !== null) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(sx(p.left), sy(p.bottom), pieceW(p) * S, (p.bottom - this.ghost.y) * S);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.setLineDash([S * 0.15, S * 0.12]);
        ctx.lineWidth = Math.max(1, S * 0.05);
        for (const bx of pieceBoxes(p.cells, p.cs, p.left, this.ghost.y)) ctx.strokeRect(sx(bx.x - bx.hw), sy(bx.y + bx.hh), bx.hw * 2 * S, bx.hh * 2 * S);
        ctx.setLineDash([]);
      }
      ctx.shadowColor = p.glue ? '#f4a261' : p.heavy ? '#adb5bd' : color;
      ctx.shadowBlur = S * 0.6;
      for (const [cx, cy] of p.cells) this.drawCell(ctx, sx(p.left + cx * p.cs), sy(p.bottom + (cy + 1) * p.cs), p.cs * S, color, p.mat);
      ctx.shadowBlur = 0;
      if (p.glue) {
        ctx.fillStyle = 'rgba(244,162,97,0.85)';
        for (const [cx, cy] of p.cells) {
          ctx.beginPath();
          ctx.arc(sx(p.left + (cx + 0.5) * p.cs), sy(p.bottom + cy * p.cs), S * 0.14 * p.cs, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Particles and floats.
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(sx(q.x) - (q.size * S) / 2, sy(q.y) - (q.size * S) / 2, q.size * S, q.size * S);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(S * 0.6)}px system-ui, sans-serif`;
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.t * 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(f.text, sx(f.x) + 2, sy(f.y) + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx(f.x), sy(f.y));
    }
    ctx.globalAlpha = 1;
    // Wind streaks.
    if (Math.abs(g.wind) > 0.15) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = Math.max(1, S * 0.04);
      const n = Math.min(14, Math.round(Math.abs(g.wind) * 4));
      const t = performance.now() / 1000;
      for (let i = 0; i < n; i++) {
        const yy = ((i * 37) % 100) / 100;
        const xx = (((t * g.wind * 0.6 + i * 0.37) % 1) + 1) % 1;
        const x = xx * cv.width;
        const y = yy * cv.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.sign(g.wind) * S * (0.8 + Math.abs(g.wind) * 0.3), y);
        ctx.stroke();
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(239,71,111,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    this.drawHud(ctx, g, S);
  }

  private drawHud(ctx: CanvasRenderingContext2D, g: Game, S: number): void {
    const cv = this.canvas!;
    const s = g.spec;
    const pad = S * 0.35;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(10,12,24,0.78)';
    roundRect(ctx, pad, pad, S * 6.4, S * (s.curses.length ? 2.55 : 1.75), S * 0.25);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(S * 0.55)}px system-ui, sans-serif`;
    ctx.fillText(`${KIND_INFO[s.kind].icon} ${KIND_INFO[s.kind].name}`, pad * 2, pad * 1.6);
    ctx.font = `${Math.round(S * 0.48)}px system-ui, sans-serif`;
    let line = '';
    if (s.kind === 'race') line = `Height ${g.height.toFixed(1)} / ${s.goal} · ⏱ ${Math.ceil(g.timeLeft)}s`;
    else if (s.kind === 'ceiling') line = `Blocks ${Math.min(g.placed, s.blocks)} / ${s.blocks}`;
    else if (g.phase === 'storm') line = `⛈️ Storm · hold ${Math.ceil(s.hold - g.stormT)}s`;
    else line = `Blocks ${Math.min(g.placed, s.blocks)} / ${s.blocks}`;
    ctx.fillStyle = s.kind === 'race' && g.timeLeft < 15 ? '#ff8fa3' : '#e9ecef';
    ctx.fillText(line, pad * 2, pad * 1.6 + S * 0.7);
    if (s.curses.length) {
      const boss = s.tier === 'boss' ? WORLDS[s.world].boss.icon : '💀';
      const c = CURSES[g.nextCurse];
      ctx.fillStyle = g.calmT > 0 ? '#7ee08a' : '#ffb4a2';
      ctx.fillText(g.calmT > 0 ? `🕊️ Calm ${Math.ceil(g.calmT)}s` : `${boss} next ${c ? c.icon : ''} in ${Math.max(0, Math.ceil(g.curseT))}s`, pad * 2, pad * 1.6 + S * 1.4);
    }
    // Lives and next block.
    ctx.textAlign = 'right';
    ctx.font = `${Math.round(S * 0.55)}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`❤️ ${Math.max(0, g.lives)}`, cv.width - pad * 1.5, pad * 1.6);
    const box = S * 2.2;
    const bx = cv.width - pad - box;
    const by = pad + S * 0.9;
    ctx.fillStyle = 'rgba(10,12,24,0.55)';
    roundRect(ctx, bx, by, box, box, S * 0.25);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${Math.round(S * 0.32)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('next', bx + box / 2, by + S * 0.08);
    const cells = SHAPES[g.next].cells;
    const cw = Math.max(...cells.map((c) => c[0])) + 1;
    const ch = Math.max(...cells.map((c) => c[1])) + 1;
    const cs = Math.min((box * 0.7) / cw, (box * 0.55) / ch);
    const x0 = bx + (box - cw * cs) / 2;
    const y0 = by + S * 0.45 + (box - S * 0.45 - ch * cs) / 2;
    for (const [cx, cy] of cells) this.drawCell(ctx, x0 + cx * cs, y0 + (ch - 1 - cy) * cs, cs, blockColor(g.next, 'wood'), 'wood');
    // Banner.
    const b = this.banner;
    if (b) {
      const a = Math.min(1, b.t * 2, (2.2 - b.t) * 4 + 0.2);
      ctx.globalAlpha = Math.max(0, a);
      const y = cv.height * 0.36;
      ctx.fillStyle = 'rgba(10,12,24,0.7)';
      ctx.fillRect(0, y - S * 1.1, cv.width, S * 2.3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = b.color;
      ctx.font = `bold ${Math.round(S * 0.9)}px system-ui, sans-serif`;
      ctx.fillText(b.text, cv.width / 2, y - S * 0.3);
      ctx.fillStyle = '#e9ecef';
      ctx.font = `${Math.round(S * 0.45)}px system-ui, sans-serif`;
      ctx.fillText(b.sub, cv.width / 2, y + S * 0.55);
      ctx.globalAlpha = 1;
    }
    ctx.textBaseline = 'alphabetic';
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, mat: string): void {
    const inset = Math.max(0.5, size * 0.04);
    ctx.fillStyle = mat === 'ice' ? 'rgba(189,224,254,0.82)' : color;
    ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + inset, y + inset, size - inset * 2, size * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + inset, y + size - inset - size * 0.14, size - inset * 2, size * 0.14);
    if (mat === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.25, y + size * 0.7);
      ctx.lineTo(x + size * 0.6, y + size * 0.3);
      ctx.stroke();
    } else if (mat === 'stone' || mat === 'rock') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + size * 0.25, y + size * 0.4, size * 0.12, size * 0.12);
      ctx.fillRect(x + size * 0.6, y + size * 0.55, size * 0.1, size * 0.1);
    } else if (mat === 'iron') {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const [fx, fy] of [[0.2, 0.3], [0.8, 0.3], [0.2, 0.72], [0.8, 0.72]]) {
        ctx.beginPath();
        ctx.arc(x + size * fx, y + size * fy, size * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawBody(ctx: CanvasRenderingContext2D, b: Body, sx: (x: number) => number, sy: (y: number) => number, S: number): void {
    for (let i = 0; i < b.wb.length; i++) {
      const w = b.wb[i];
      const box = b.boxes[i];
      const ang = Math.atan2(w.s, w.c);
      ctx.save();
      ctx.translate(sx(w.x), sy(w.y));
      ctx.rotate(-ang);
      const cs = box.cs;
      const nx = Math.max(1, Math.round((w.hw * 2) / cs));
      const ny = Math.max(1, Math.round((w.hh * 2) / cs));
      const color = box.col ?? MATS[box.mat]?.color ?? '#ffd166';
      for (let ix = 0; ix < nx; ix++) {
        for (let iy = 0; iy < ny; iy++) {
          this.drawCell(ctx, (-w.hw + ix * cs) * S, (-w.hh + iy * cs) * S, cs * S, color, box.mat);
        }
      }
      if (b.tag.rooted) {
        ctx.strokeStyle = 'rgba(56,176,0,0.9)';
        ctx.lineWidth = Math.max(1.5, S * 0.08);
        ctx.beginPath();
        ctx.moveTo(-w.hw * S, w.hh * S);
        for (let k = 0; k <= 8; k++) {
          const xx = -w.hw + (k / 8) * w.hw * 2;
          ctx.lineTo(xx * S, (w.hh - 0.25 - 0.18 * Math.sin(k * 1.7)) * S);
        }
        ctx.stroke();
        ctx.fillStyle = '#70e000';
        for (let k = 1; k < 8; k += 2) {
          const xx = -w.hw + (k / 8) * w.hw * 2;
          ctx.beginPath();
          ctx.ellipse(xx * S, (w.hh - 0.35) * S, S * 0.12, S * 0.07, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // ---------- Debug API ----------

  private installDebug(): void {
    const planned = new WeakSet<object>();
    const botTick = (g: Game): void => {
      const r = this.run!;
      if (g.piece && !planned.has(g.piece)) {
        planned.add(g.piece);
        let plan = bestPlan(g);
        for (let k = 0; k < 2; k++) {
          const sp = botSpell(g, r.hand, plan);
          if (!sp) break;
          const i = r.hand.indexOf(sp);
          this.castCard(i);
          if (sp === 'shrink') plan = bestPlan(g);
        }
        if (plan) g.place(plan.cells, plan.left);
        g.slam = true;
      } else if (!g.piece) {
        const sp = botSpell(g, r.hand, null);
        if (sp) this.castCard(r.hand.indexOf(sp));
      }
    };
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        world: this.run?.world ?? null,
        step: this.run?.step ?? null,
        lives: this.game ? this.game.lives : (this.run?.lives ?? null),
        coins: this.run?.coins ?? null,
        hand: this.run?.hand ?? null,
        challenge: this.game
          ? {
              kind: this.game.spec.kind,
              tier: this.game.spec.tier,
              goal: this.game.spec.goal,
              blocks: this.game.spec.blocks,
              placed: this.game.placed,
              height: +this.game.height.toFixed(2),
              t: +this.game.t.toFixed(1),
              status: this.game.status,
              bodies: this.game.world.bodies.length,
              piece: this.game.piece ? { shape: this.game.piece.shape, left: this.game.piece.left, bottom: +this.game.piece.bottom.toFixed(2), cells: this.game.piece.cells.join(';'), slam: this.game.slam } : null,
            }
          : null,
        end: this.end,
      }),
      /** One bot action for automatic tests. */
      step: (): string => {
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
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
            const opts = choices(r!);
            let pick = opts.findIndex((o) => o.kind !== 'rest' && o.kind !== 'shop' && o.kind !== 'elite');
            const rest = opts.findIndex((o) => o.kind === 'rest');
            const shop = opts.findIndex((o) => o.kind === 'shop');
            if (rest >= 0 && r!.lives <= r!.maxLives - 2) pick = rest;
            else if (shop >= 0 && r!.coins >= 24) pick = shop;
            if (pick < 0) pick = 0;
            click(`[data-act="node"][data-i="${pick}"]`);
            return 'node';
          }
          case 'game': {
            const g = this.game!;
            if (g.status !== 'play') {
              if (FAST || this.endWait <= 0) this.finishChallenge();
              return 'busy';
            }
            const n = FAST ? 240 : 60;
            for (let i = 0; i < n && g.status === 'play'; i++) {
              botTick(g);
              g.tick();
            }
            this.handleEvents();
            this.updateSide();
            return 'play';
          }
          case 'result': {
            const res = this.result!;
            if (res.won && !res.picked && res.rewards && r!.hand.length < HAND_MAX) {
              const best = [...res.rewards.picks].sort((a, b) => BOT_PRIO.indexOf(a) - BOT_PRIO.indexOf(b))[0];
              click(`[data-act="pick"][data-i="${res.rewards.picks.indexOf(best)}"]`);
            }
            click('[data-act="advance"]');
            return 'result';
          }
          case 'shop': {
            if (r!.lives <= 3) {
              const i = this.shop.findIndex((s) => s.kind === 'life');
              if (i >= 0) this.action('buy', { i: String(i) });
            }
            for (const id of BOT_PRIO) {
              const i = this.shop.findIndex((s) => s.id === id);
              if (i >= 0 && buy(r!, this.shop[i])) sfx.buy();
            }
            click('[data-act="advance"]');
            return 'shop';
          }
          case 'rest':
            if (this.rest.picks) {
              if (!click('[data-act="study"]:not([disabled])')) click('[data-act="advance"]');
            } else if (!click('[data-act="rest-heal"]:not([disabled])')) {
              if (!click('[data-act="rest-study"]:not([disabled])')) this.nextStep();
            }
            return 'rest';
          case 'end':
            return 'end';
        }
        return 'idle';
      },
      card: (id: string) => {
        if (this.run && SPELLS[id]) addCard(this.run, id);
        this.handKey = '';
        if (this.screen !== 'game') this.render();
      },
      lives: (n: number) => {
        if (this.game) this.game.lives = n;
        if (this.run) this.run.lives = n;
      },
      bricks: (n: number) => {
        this.meta.bricks += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        const g = this.game;
        if (g && g.status === 'play') {
          (g as unknown as { finish: (w: boolean, r: string) => void }).finish(true, 'Debug win');
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
    void STEPS;
    void DROP_SPEED;
  }
}

// ---------- Small helpers ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hex(c: string): [number, number, number] {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

function shade(c: string, t: number): string {
  return t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t);
}
