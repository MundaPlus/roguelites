import { Bot } from './bot';
import { DISTRICTS, ENEMIES, FIGHTERS, FIGHTER_IDS, FOODS, PERKS, PROPS, SPECIALS, WEAPONS, type EMove, type PoseId } from './data';
import { DEPTH, GY, Game, H, W, emptyInput, type Actor, type Input } from './game';
import { randomSeedText } from './rng';
import {
  COLS,
  NODE_INFO,
  addPerk,
  advance,
  applyClear,
  applyDeath,
  buy,
  canBuy,
  dinerHeal,
  districtMap,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  nextDistrict,
  saveMeta,
  saveRun,
  score,
  shopLabel,
  stageOpts,
  starsFor,
  unlockCost,
  type MapNode,
  type RunState,
  type StageResult,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'fighters' | 'map' | 'play' | 'clear' | 'shop' | 'diner' | 'reward' | 'end';
type Act = 'light' | 'heavy' | 'jump' | 'grab' | 'sp1' | 'sp2';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'replace'; item: number };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');
const DT = 1000 / 60;
const PERK_PRIO = ['skin', 'knuckles', 'combo', 'vamp', 'boots', 'focus', 'juggle', 'grip', 'weapons', 'hustle'];

const KEYMAP: Record<string, Act> = {
  j: 'light',
  z: 'light',
  k: 'heavy',
  x: 'heavy',
  ' ': 'jump',
  c: 'jump',
  l: 'grab',
  v: 'grab',
  u: 'sp1',
  '1': 'sp1',
  i: 'sp2',
  '2': 'sp2',
};

const PAD_BTN: [number, Act][] = [
  [0, 'jump'],
  [2, 'light'],
  [3, 'heavy'],
  [1, 'grab'],
  [4, 'sp1'],
  [5, 'sp2'],
  [6, 'sp1'],
  [7, 'sp2'],
];

interface Look {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  hat: string;
  hatColor: string;
  hatEmoji?: string;
  wide: number;
}

interface Pose {
  lean: number;
  aF: [number, number];
  aB: [number, number];
  lF: [number, number];
  lB: [number, number];
  dy: number;
  rot: number;
}

const hpBar = (hp: number, max: number): string => {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<div class="hp"><div class="hp-fill" style="width:${pct}%"></div><span>${Math.max(0, Math.round(hp))} / ${max}</span></div>`;
};

function hashN(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private g: Game | null = null;
  private node: MapNode | null = null;
  private clearInfo: { bonus: number; res: StageResult; boss: boolean; name: string } | null = null;
  private end: { victory: boolean; score: number; stars: number; district: number; kills: number; combo: number } | null = null;
  private dinerDone = false;

  // Input
  private keys = new Set<string>();
  private queued = new Set<Act>();
  private stick = { id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
  private padPrev: boolean[] = [];
  private touchUi = matchMedia('(pointer: coarse)').matches;
  private auto = false;
  private bot = new Bot('good');
  private inp: Input = emptyInput();

  // Canvas
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scale = 1;
  private last = 0;
  private acc = 0;
  private hidden = false;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem('sb.mute') === '1');
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
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('touchstart', () => this.setTouch(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (this.hidden && this.screen === 'play' && !this.modal) {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
    });
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
    this.startLoop();
  }

  private setTouch(): void {
    if (this.touchUi) return;
    this.touchUi = true;
    if (this.screen === 'play') this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'fighters':
        body = this.fightersView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'play':
        body = this.playView();
        break;
      case 'clear':
        body = this.clearView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'diner':
        body = this.dinerView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' && this.screen !== 'fighters' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'play') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.canvas!.addEventListener('contextmenu', (e) => e.preventDefault());
      this.resize();
      this.draw();
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
    const d = DISTRICTS[Math.min(r.district, DISTRICTS.length - 1)];
    const f = FIGHTERS[r.fighter];
    const stats = this.screen === 'play' ? '' : `<span>❤️ ${Math.max(0, r.hp)}/${r.maxHp}</span><span>💰 ${r.cash}</span>${r.lives ? `<span>🆙 ${r.lives}</span>` : ''}`;
    return `<header class="top">
      <span class="who">${f.icon} ${f.name}</span>
      ${stats}
      <span>${d.icon} ${Math.min(r.district + 1, 5)}-${Math.min(r.col + 1, COLS)}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu (Esc)">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const roster = FIGHTER_IDS.map((id) => {
      const f = FIGHTERS[id];
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${f.icon}</span><span><b>${f.name}</b><small>${f.text}</small></span>
        ${own ? '<span class="ok">✔ Ready</span>' : `<button data-act="unlock" data-id="${id}" ${m.stars >= cost ? '' : 'disabled'}>⭐ ${cost}</button>`}</div>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>👊</span> Street Brawl</h1>
      <p class="sub">Fight through 5 districts of a city run by gangs. Chain combos, throw thugs into each other, grab a pipe. Beat the boss of each district.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (${DISTRICTS[Math.min(r.district, 4)].icon} ${r.district + 1}-${r.col + 1}, ❤️ ${r.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best district ${m.bestDistrict} · Best score ${m.best} · KOs ${m.kills} · Best combo ${m.bestCombo}</p>
      <h2>Fighters <small>⭐ ${m.stars} stars</small></h2>
      <p class="sub">Each run gives stars. Spend them to unlock fighters with other move sets.</p>
      <div class="armory">${roster}</div>
    </div>`;
  }

  private fightersView(): string {
    const cards = FIGHTER_IDS.map((id) => {
      const f = FIGHTERS[id];
      const own = this.meta.unlocked.includes(id);
      const sp = SPECIALS[f.special];
      return `<button class="pick fighter" data-act="fighter" data-id="${id}" ${own ? '' : 'disabled'}>
        <span class="huge">${f.icon}</span><b>${f.name}</b>
        <small>${f.text}</small>
        <small>❤️ ${f.hp} HP · 👟 speed ${f.speed} · ${f.light.length}-hit string</small>
        <small>Special: ${sp.icon} ${sp.name}</small>
        ${own ? '' : `<span class="cost">🔒 ⭐ ${f.cost}</span>`}
      </button>`;
    }).join('');
    return `<div class="map"><h2>Choose your fighter</h2><div class="picks">${cards}</div><button data-act="title">Back</button></div>`;
  }

  private statusHtml(): string {
    const r = this.run!;
    const sp = r.specials.map((s) => `<span class="chip" title="${SPECIALS[s].text}">${SPECIALS[s].icon} ${SPECIALS[s].name}</span>`).join('');
    const perks = Object.entries(r.perks)
      .map(([id, n]) => `<span class="chip" title="${PERKS[id].text}">${PERKS[id].icon} ${PERKS[id].name}${n > 1 ? ` ×${n}` : ''}</span>`)
      .join('');
    const w = r.weapon ? `<span class="chip">${WEAPONS[r.weapon].icon} ${WEAPONS[r.weapon].name}</span>` : '';
    return `<div class="status">${hpBar(r.hp, r.maxHp)}<div class="chips">${sp}${perks}${w}</div></div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const d = DISTRICTS[r.district];
    const map = districtMap(r, r.district);
    const track = map
      .map((opts, i) => {
        const state = i < r.col ? 'done' : i === r.col ? 'now' : '';
        const label = i < r.col && r.path[i] !== undefined ? NODE_INFO[opts[r.path[i]].kind].icon : opts.map((o) => NODE_INFO[o.kind].icon).join('/');
        return `<span class="node ${state}">${label}</span>`;
      })
      .join('<span class="link"></span>');
    const rooms = map[r.col]
      .map((n, i) => {
        const info = NODE_INFO[n.kind];
        let extra = '';
        if (n.kind === 'boss') {
          const b = ENEMIES[d.boss];
          extra = `<small class="foe">${b.icon} ${b.name}: ${b.text}</small>`;
        }
        return `<button class="room r-${n.kind}" data-act="node" data-i="${i}"><span class="big">${info.icon}</span><b>${n.name}</b><small>${info.name}. ${info.text}</small>${extra}</button>`;
      })
      .join('');
    const foes = [...new Set(d.pool.map(([id]) => id))].map((id) => `<span class="chip" title="${ENEMIES[id].text}">${ENEMIES[id].icon} ${ENEMIES[id].name}</span>`).join('');
    return `<div class="map">
      <h2>${d.icon} District ${r.district + 1}: ${d.name}</h2>
      <div class="track">${track}</div>
      <p class="sub">Choose your street.</p>
      <div class="rooms">${rooms}</div>
      <div class="chips">Gangs here: ${foes}</div>
      ${this.statusHtml()}
    </div>`;
  }

  private playView(): string {
    const r = this.run!;
    const sp = r.specials;
    const pad = this.touchUi
      ? `<div class="pad">
        <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
        <div class="btns">
          <button class="pb sp" data-k="sp1" ${sp[0] ? '' : 'disabled'}>${sp[0] ? SPECIALS[sp[0]].icon : '·'}</button>
          <button class="pb sp" data-k="sp2" ${sp[1] ? '' : 'disabled'}>${sp[1] ? SPECIALS[sp[1]].icon : '·'}</button>
          <button class="pb" data-k="grab">✊<small>grab</small></button>
          <button class="pb" data-k="jump">⤴️<small>jump</small></button>
          <button class="pb big" data-k="heavy">🦶<small>heavy</small></button>
          <button class="pb big" data-k="light">👊<small>punch</small></button>
        </div>
      </div>`
      : `<p class="keys">Move <kbd>←↑↓→</kbd>/<kbd>WASD</kbd> · Punch <kbd>J</kbd>/<kbd>Z</kbd>/left click · Heavy <kbd>K</kbd>/<kbd>X</kbd>/right click · Jump <kbd>Space</kbd>/<kbd>C</kbd> · Grab/pick up <kbd>L</kbd>/<kbd>V</kbd> · Specials <kbd>U</kbd> <kbd>I</kbd> · Menu <kbd>Esc</kbd> · <button class="link-btn" data-act="touch">touch buttons</button></p>`;
    const tips = ['Punch, punch, heavy = launcher. Hit them again in the air.', 'Grab ✊ an enemy, then heavy to throw it into others.', 'A red ! means a strong attack. Step out of its lane.', 'Stand on a weapon and press ✊ to pick it up.'];
    const tip = this.touchUi ? `<p class="tip">💡 ${tips[(r.district * 5 + r.col) % tips.length]}</p>` : '';
    return `<div class="play ${this.touchUi ? 'touch' : ''}"><div class="cv-wrap"><canvas id="cv"></canvas></div>${tip}${pad}</div>`;
  }

  private clearView(): string {
    const c = this.clearInfo!;
    const r = this.run!;
    return `<div class="reward">
      <h2 class="good">${c.boss ? '👑 Boss down!' : '✅ Street clear!'}</h2>
      <p class="sub">${c.name}</p>
      <div class="statgrid">
        <span>KOs</span><b>${c.res.kills}</b>
        <span>Cash found</span><b>💰 ${c.res.cash}</b>
        <span>Clear bonus</span><b>💰 ${c.bonus}</b>
        <span>Best combo</span><b>${c.res.maxCombo} hits</b>
        <span>Damage taken</span><b>${c.res.dmgTaken}</b>
      </div>
      ${this.statusHtml()}
      <p>💰 ${r.cash} cash</p>
      <button class="primary" data-act="next">Continue ▶</button>
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = (r.shop ?? [])
      .map((it, i) => {
        const l = shopLabel(it);
        const ok = canBuy(r, it);
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}><span class="big">${l.icon}</span><b>${l.name}</b><small>${l.text}</small><span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 ${this.node?.name ?? 'Shop'}</h2><p>💰 ${r.cash} cash</p><div class="picks">${items}</div>
      ${this.statusHtml()}
      <button class="primary" data-act="leave">Leave ▶</button></div>`;
  }

  private dinerView(): string {
    const r = this.run!;
    const heal = dinerHeal(r);
    return `<div class="restv"><h2>🍜 ${this.node?.name ?? 'Diner'}</h2><p class="sub">Take a break before the next street.</p>
      ${
        this.dinerDone
          ? '<p class="good">You feel ready.</p><button class="primary" data-act="leave">Continue ▶</button>'
          : `<div class="picks">
        <button class="pick" data-act="eat" ${r.hp < r.maxHp ? '' : 'disabled'}><span class="big">🍜</span><b>Eat</b><small>Heal ${heal} HP (now ${r.hp}/${r.maxHp}).</small></button>
        <button class="pick" data-act="train"><span class="big">🏋️</span><b>Train</b><small>+10 max HP and heal 10.</small></button>
      </div>`
      }
      ${this.statusHtml()}</div>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const d = DISTRICTS[r.district];
    const picks = (r.reward ?? [])
      .map((id) => `<button class="pick" data-act="perk" data-id="${id}"><span class="big">${PERKS[id].icon}</span><b>${PERKS[id].name}</b><small>${PERKS[id].text}</small>${r.perks[id] ? `<small class="dim">You have ${r.perks[id]}/${PERKS[id].max}</small>` : ''}</button>`)
      .join('');
    return `<div class="reward"><h2 class="good">${d.icon} ${d.name} is free!</h2><p class="sub">The gangs here are done. Choose a reward.</p>
      <div class="picks">${picks || '<p class="dim">You have every upgrade.</p>'}</div>
      ${picks ? '' : '<button class="primary" data-act="perk" data-id="">Continue ▶</button>'}
      ${this.statusHtml()}</div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 The city is free!' : '💀 Knocked out'}</h1>
      <p>${e.victory ? 'Mr. Big is down. The streets are safe again.' : `You fell in district ${e.district + 1}: ${DISTRICTS[Math.min(e.district, 4)].name}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>KOs ${e.kills} · Best combo ${e.combo}</p>
      <p>⭐ +${e.stars} stars</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Move</b> left, right and up or down the street (depth). Enemies hit you only when you share their lane, so step out of a lane to dodge.</li>
          <li><b>Punch</b> again and again for a combo string. The last hit knocks down. <b>Heavy</b> is a strong single hit. After 2 punches, heavy is a <b>launcher</b>: hit the enemy again while it flies (juggle).</li>
          <li><b>Jump</b>, then punch or heavy for a jump kick or a dive kick. Jumping also clears shockwaves and thrown knives.</li>
          <li><b>Grab</b> an enemy in front of you. Punch to knee it (up to 3 times), heavy or grab to throw it. Hold back to throw behind you. Thrown enemies hit other enemies. Bruisers and bosses are too big to grab (except for Tank).</li>
          <li><b>Weapons</b>: stand on a pipe, bottle, chair, knife or bat and press grab. Punch swings it, heavy throws it. Weapons break after some hits. Break crates and barrels for food, cash and weapons.</li>
          <li><b>Specials</b> (U and I) are strong moves with a cooldown. You cannot be hurt during most of them. Buy more in shops.</li>
          <li>The screen locks during a fight. Beat every enemy to go on. Enemies take turns to attack, and some wait around you. A red <b>!</b> shows a strong attack: get out of its lane.</li>
          <li>Each district has 5 steps: choose streets, shops and a diner, then fight the boss. Cash buys food, moves, upgrades and an extra life. Lose all HP and the run ends.</li>
        </ul>
        <p class="dim">Keys: arrows/WASD move · J/Z punch · K/X heavy · Space/C jump · L/V grab · U/I specials · Esc menu. Mouse: left click punch, right click heavy. Gamepad: X punch, Y heavy, A jump, B grab, LB/RB specials, Start menu.</p>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'replace') {
      const r = this.run!;
      const it = r.shop![m.item];
      const opts = r.specials.map((s, i) => `<button class="pick" data-act="replace" data-i="${i}"><span class="big">${SPECIALS[s].icon}</span><b>Forget ${SPECIALS[s].name}</b></button>`).join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop><h2>Learn ${SPECIALS[it.id].icon} ${SPECIALS[it.id].name}</h2><p>You know 2 moves. Which one do you forget?</p><div class="picks">${opts}</div><button data-act="modal-close">Cancel</button></div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      <button class="primary" data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
      ${this.screen === 'play' ? '<p class="dim">If you leave during a fight, the street restarts when you continue.</p>' : ''}
    </div></div>`;
  }

  // ---------- Flow ----------

  private startRun(fighter: string): void {
    this.run = newRun(randomSeedText(), fighter);
    this.meta.runs++;
    saveMeta(this.meta);
    this.screen = 'map';
    saveRun(this.run);
    this.render();
  }

  private chooseNode(i: number): void {
    const r = this.run!;
    const node = districtMap(r, r.district)[r.col][i];
    if (!node) return;
    r.path[r.col] = i;
    this.node = node;
    if (node.kind === 'shop') {
      r.shop = makeShop(r);
      r.at = 'shop';
      this.screen = 'shop';
    } else if (node.kind === 'diner') {
      r.at = 'diner';
      this.dinerDone = false;
      this.screen = 'diner';
    } else {
      r.at = 'play';
      saveRun(r);
      this.startStage();
      return;
    }
    saveRun(r);
    this.render();
  }

  private startStage(): void {
    const r = this.run!;
    const node = districtMap(r, r.district)[r.col][r.path[r.col]];
    this.node = node;
    this.g = new Game(stageOpts(r, node));
    this.screen = 'play';
    this.acc = 0;
    this.render();
  }

  private stageOver(): void {
    const g = this.g!;
    const r = this.run!;
    const res = g.result();
    if (g.done === 'dead') {
      applyDeath(r, res);
      this.endRun(false);
      return;
    }
    const boss = this.node?.kind === 'boss';
    const bonus = applyClear(r, res, boss);
    this.clearInfo = { bonus, res, boss, name: this.node?.name ?? '' };
    this.meta.bestCombo = Math.max(this.meta.bestCombo, res.maxCombo);
    this.g = null;
    this.screen = 'clear';
    r.at = 'map';
    // Saving the run here means a reload continues after the clear.
    const after = advance(r);
    saveRun(r);
    if (after === 'reward') sfx.win();
    this.render();
  }

  private afterClear(): void {
    const r = this.run!;
    this.screen = r.at === 'reward' ? 'reward' : 'map';
    this.render();
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    const m = this.meta;
    r.won = victory;
    const sc = score(r);
    const stars = starsFor(r);
    m.stars += stars;
    m.best = Math.max(m.best, sc);
    m.bestDistrict = Math.max(m.bestDistrict, Math.min(5, r.district + (victory ? 0 : 1)));
    m.kills += r.kills;
    m.bestCombo = Math.max(m.bestCombo, r.maxCombo);
    if (victory) m.wins++;
    saveMeta(m);
    saveRun(null);
    this.end = { victory, score: sc, stars, district: r.district, kills: r.kills, combo: r.maxCombo };
    this.run = null;
    this.g = null;
    this.modal = null;
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  private continueRun(): void {
    const r = this.run;
    if (!r) return;
    if (r.at === 'play' && r.path[r.col] !== undefined) return this.startStage();
    if (r.at === 'shop') {
      this.node = districtMap(r, r.district)[r.col][r.path[r.col]];
      if (!r.shop) r.shop = makeShop(r);
      this.screen = 'shop';
    } else if (r.at === 'diner') {
      this.node = districtMap(r, r.district)[r.col][r.path[r.col]];
      this.dinerDone = false;
      this.screen = 'diner';
    } else if (r.at === 'reward') this.screen = 'reward';
    else this.screen = 'map';
    this.render();
  }

  private leave(): void {
    const r = this.run!;
    advance(r);
    saveRun(r);
    this.screen = r.at === 'reward' ? 'reward' : 'map';
    this.render();
  }

  private buyItem(i: number, slot = -1): void {
    const r = this.run!;
    const it = r.shop![i];
    if (!canBuy(r, it)) {
      sfx.deny();
      return;
    }
    if (it.kind === 'special' && r.specials.length >= 2 && slot < 0) {
      this.modal = { kind: 'replace', item: i };
      this.render();
      return;
    }
    buy(r, it, slot);
    sfx.buy();
    this.toast(`Bought ${shopLabel(it).name}`);
    saveRun(r);
    this.render();
  }

  // ---------- Loop ----------

  private startLoop(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      const dt = Math.min(100, now - this.last);
      this.last = now;
      this.pollPad();
      if (this.screen !== 'play' || !this.g) return;
      if (!this.modal && !this.hidden) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= DT && n < 5) {
          this.acc -= DT;
          n++;
          this.tick(true);
          if (this.screen !== 'play' || !this.g) return;
        }
        if (n >= 5) this.acc = 0;
      }
      this.draw();
    };
    requestAnimationFrame(frame);
  }

  private readInput(): void {
    const inp = this.inp;
    const k = this.keys;
    let mx = 0;
    let mz = 0;
    if (k.has('arrowleft') || k.has('a')) mx -= 1;
    if (k.has('arrowright') || k.has('d')) mx += 1;
    if (k.has('arrowup') || k.has('w')) mz -= 1;
    if (k.has('arrowdown') || k.has('s')) mz += 1;
    if (this.stick.id >= 0) {
      const len = Math.hypot(this.stick.dx, this.stick.dy);
      if (len > 8) {
        mx += this.stick.dx / Math.max(36, len);
        mz += this.stick.dy / Math.max(36, len);
      }
    }
    mx += this.padAxes[0];
    mz += this.padAxes[1];
    inp.mx = Math.max(-1, Math.min(1, mx));
    inp.mz = Math.max(-1, Math.min(1, mz));
    for (const a of ['light', 'heavy', 'jump', 'grab', 'sp1', 'sp2'] as Act[]) inp[a] = this.queued.has(a);
    this.queued.clear();
  }

  private padAxes: [number, number] = [0, 0];

  private pollPad(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) {
      this.padAxes = [0, 0];
      return;
    }
    const dz = (v: number): number => (Math.abs(v) < 0.3 ? 0 : v);
    const b = (i: number): boolean => !!gp.buttons[i]?.pressed;
    let ax = dz(gp.axes[0] ?? 0);
    let ay = dz(gp.axes[1] ?? 0);
    if (b(14)) ax = -1;
    if (b(15)) ax = 1;
    if (b(12)) ay = -1;
    if (b(13)) ay = 1;
    this.padAxes = [ax, ay];
    const now = gp.buttons.map((x) => x.pressed);
    const edge = (i: number): boolean => !!now[i] && !this.padPrev[i];
    if (this.screen === 'play' && !this.modal) for (const [i, a] of PAD_BTN) if (edge(i)) this.queued.add(a);
    if (edge(9)) {
      if (this.modal) this.modal = null;
      else if (this.screen === 'play') this.modal = { kind: 'menu', confirm: false };
      this.render();
    }
    if ((this.screen !== 'play' || this.modal) && edge(0)) this.root.querySelector<HTMLElement>('.modal button.primary, main button.primary:not([disabled]), main button.pick:not([disabled]), main button.room')?.click();
    this.padPrev = now;
  }

  /** One fixed 60 Hz step with input and sounds. */
  private tick(sound: boolean): void {
    const g = this.g!;
    if (this.auto) this.bot.input(g, this.inp);
    else this.readInput();
    g.step(this.inp);
    if (sound) for (const e of g.ev) sfx[e]?.();
    if (g.done && g.doneT > (FAST || this.auto ? 1 : g.done === 'dead' ? 100 : 75)) this.stageOver();
  }

  // ---------- Canvas ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const padH = this.touchUi ? (window.innerHeight > window.innerWidth ? 210 : 0) : 40;
    const maxW = Math.min(wrap.clientWidth || window.innerWidth, 1280);
    const maxH = window.innerHeight - 52 - padH;
    const w = Math.max(240, Math.min(maxW, (maxH * W) / H));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = `${w}px`;
    cv.style.height = `${(w * H) / W}px`;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(((w * H) / W) * dpr);
    this.scale = (w / W) * dpr;
  }

  private sy(z: number, y: number): number {
    return GY + z - y;
  }

  private draw(): void {
    const ctx = this.ctx;
    const g = this.g;
    if (!ctx || !g) return;
    const d = DISTRICTS[g.o.district];
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.save();
    if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake * 1.5, (Math.random() - 0.5) * g.shake * 1.5);
    this.drawBackground(ctx, g, d);
    ctx.translate(-g.camX, 0);

    // Shadows
    const shadow = (x: number, z: number, y: number, r: number): void => {
      const k = Math.max(0.35, 1 - y / 120);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, GY + z, r * k, r * 0.32 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const actors = [g.p, ...g.enemies];
    for (const a of actors) shadow(a.x, a.z, a.y, 15 * a.size * (a.st === 'down' || a.st === 'dead' ? 1.8 : 1));
    for (const it of g.items) shadow(it.x, it.z, it.y, 9);
    for (const pr of g.props) shadow(pr.x, pr.z, 0, 14);

    // Depth-sorted objects
    const list: { z: number; fn: () => void }[] = [];
    for (const a of actors) list.push({ z: a.z + (a.st === 'held' ? 0.6 : 0), fn: () => this.drawActor(ctx, g, a) });
    for (const it of g.items)
      list.push({
        z: it.z - 0.1,
        fn: () => {
          const blink = it.kind === 'cash' && it.t > 780 && Math.floor(it.t / 6) % 2 === 0;
          if (blink) return;
          const icon = it.kind === 'weapon' ? WEAPONS[it.type].icon : it.kind === 'food' ? FOODS[it.type].icon : '💵';
          const bob = it.y > 0 ? 0 : Math.sin((g.frame + it.id * 13) / 10) * 1.5;
          ctx.save();
          ctx.translate(it.x, this.sy(it.z, it.y) - 8 + bob);
          if (it.kind === 'weapon') ctx.rotate(-0.7);
          this.emoji(ctx, icon, 0, 0, 16);
          ctx.restore();
          if (it.kind === 'weapon' && Math.abs(it.x - g.p.x) < 30 && Math.abs(it.z - g.p.z) < 16 && !g.p.weapon) {
            ctx.fillStyle = '#ffd166';
            ctx.font = 'bold 8px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(this.touchUi ? '✊ pick up' : 'L: pick up', it.x, this.sy(it.z, 0) - 22);
          }
        },
      });
    for (const pr of g.props) list.push({ z: pr.z, fn: () => this.emoji(ctx, PROPS[pr.type].icon, pr.x, this.sy(pr.z, 0) - 13, 26) });
    for (const pr of g.projs)
      list.push({
        z: pr.z + 0.2,
        fn: () => {
          const y = this.sy(pr.z, pr.y);
          if (pr.kind === 'wave') {
            ctx.strokeStyle = '#ffd166';
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
              const xx = pr.x - Math.sign(pr.vx) * i * 7;
              ctx.moveTo(xx - 4, y);
              ctx.lineTo(xx, y - 14 + i * 2);
              ctx.lineTo(xx + 4, y);
            }
            ctx.stroke();
          } else if (pr.kind === 'bullet') {
            ctx.fillStyle = '#ffe066';
            ctx.fillRect(pr.x - 5, y - 1.5, 10, 3);
            ctx.fillStyle = 'rgba(255,224,102,0.35)';
            ctx.fillRect(pr.x - Math.sign(pr.vx) * 18 - 8, y - 1, 16, 2);
          } else {
            ctx.save();
            ctx.translate(pr.x, y);
            ctx.rotate(pr.rot);
            this.emoji(ctx, pr.icon, 0, 0, 15);
            ctx.restore();
          }
        },
      });
    list.sort((a, b) => a.z - b.z);
    for (const o of list) o.fn();

    // Particles
    for (const s of g.parts) {
      const k = s.life / s.max;
      const x = s.x;
      const y = this.sy(s.z, s.y);
      if (s.kind === 'ring') {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = k;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y, s.size * (1 - k * 0.7), s.size * 0.35 * (1 - k * 0.7), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.kind === 'star') {
        ctx.fillStyle = s.color;
        ctx.globalAlpha = k;
        const r = s.size * (0.6 + (1 - k));
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const rr = i % 2 ? r * 0.35 : r;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.fill();
      } else {
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.min(1, k * 1.5);
        if (s.kind === 'dust') {
          ctx.beginPath();
          ctx.arc(x, y, s.size * (1.5 - k), 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
      ctx.globalAlpha = 1;
    }

    // Floating numbers
    ctx.textAlign = 'center';
    for (const f of g.floats) {
      const k = f.t / 60;
      const y = this.sy(f.z, f.y) - f.t * 0.6;
      ctx.globalAlpha = Math.min(1, (1 - k) * 2);
      ctx.font = `900 ${f.size * (f.t < 5 ? 1.3 : 1)}px system-ui`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    this.drawHud(ctx, g);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, g: Game, d: (typeof DISTRICTS)[number]): void {
    const sky = ctx.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, d.sky[0]);
    sky.addColorStop(1, d.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, GY);
    // Far skyline
    const far = g.camX * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = Math.floor(far / 40) - 1; i < Math.floor(far / 40) + 14; i++) {
      const h = 40 + hashN(i, 7) * 60;
      ctx.fillRect(i * 40 - far, GY - 30 - h, 38, h + 30);
    }
    // Near buildings
    const near = g.camX * 0.65;
    const bw = 90;
    for (let i = Math.floor(near / bw) - 1; i < Math.floor(near / bw) + 8; i++) {
      const x = i * bw - near;
      const h = 70 + hashN(i, 3) * 55;
      ctx.fillStyle = d.wall[Math.floor(hashN(i, 5) * d.wall.length)];
      ctx.fillRect(x, GY - 16 - h, bw - 4, h + 16);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + bw - 10, GY - 16 - h, 6, h + 16);
      for (let wy = 0; wy < Math.floor(h / 22); wy++)
        for (let wx = 0; wx < 3; wx++) {
          const lit = hashN(i * 31 + wx, wy) > 0.45;
          ctx.fillStyle = lit ? 'rgba(255,220,140,0.75)' : 'rgba(0,0,0,0.35)';
          ctx.fillRect(x + 10 + wx * 24, GY - 10 - h + wy * 22, 14, 12);
        }
      if (hashN(i, 9) > 0.55) {
        const flick = Math.sin(g.frame / 9 + i) > -0.85 ? 1 : 0.3;
        ctx.fillStyle = d.neon;
        ctx.globalAlpha = 0.9 * flick;
        ctx.fillRect(x + 12, GY - 40, bw - 30, 10);
        ctx.globalAlpha = 1;
      }
    }
    // Sidewalk and street
    ctx.fillStyle = '#6c6f7a';
    ctx.fillRect(0, GY - 16, W, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const sOff = g.camX % 30;
    for (let x = -sOff; x < W; x += 30) ctx.fillRect(x, GY - 16, 1, 16);
    ctx.fillStyle = d.ground;
    ctx.fillRect(0, GY, W, H - GY);
    ctx.fillStyle = '#888';
    ctx.fillRect(0, GY, W, 2);
    const lOff = g.camX % 60;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = -lOff; x < W; x += 60) ctx.fillRect(x, GY + DEPTH / 2, 30, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, GY + DEPTH + 10, W, H - GY - DEPTH - 10);
    // Exit sign at the end of the street
    const ex = g.length - 30 - g.camX;
    if (ex < W + 20) {
      ctx.fillStyle = 'rgba(126,224,138,0.25)';
      ctx.fillRect(ex, GY - 16, 40, DEPTH + 26);
    }
  }

  private look(a: Actor): Look {
    if (a.team === 'p') {
      const f = FIGHTERS[a.kind];
      return { skin: f.skin, shirt: f.shirt, pants: f.pants, hair: f.hair, hat: 'hair', hatColor: f.hair, wide: a.kind === 'tank' ? 1.35 : a.kind === 'mika' ? 0.9 : 1 };
    }
    const e = ENEMIES[a.kind];
    return { skin: e.skin, shirt: e.shirt, pants: e.pants, hair: '#222', hat: e.hat, hatColor: e.hatColor, hatEmoji: e.hatEmoji, wide: e.ai === 'heavy' ? 1.6 : e.id === 'anchor' ? 1.5 : 1 };
  }

  private pose(g: Game, a: Actor): Pose {
    const guard: Pose = { lean: 0.08, aF: [0.6, 2.5], aB: [0.3, 2.2], lF: [0.22, 0.05], lB: [-0.22, -0.08], dy: Math.sin((g.frame + a.id * 7) / 9) * 0.8, rot: 0 };
    const moving = Math.abs(a.vx) + Math.abs(a.vz) > 0.3;
    switch (a.st) {
      case 'idle': {
        if (!moving) return guard;
        const ph = (g.tick + a.id * 5) * 0.28;
        const s = Math.sin(ph);
        return { ...guard, lF: [s * 0.55, s * 0.55 - 0.15 + Math.max(0, -s) * 0.4], lB: [-s * 0.55, -s * 0.55 - 0.15 + Math.max(0, s) * 0.4], dy: Math.abs(Math.cos(ph)) * 1.5 };
      }
      case 'jump':
        return { ...guard, lF: [1.1, -0.1], lB: [0.5, -0.6], aF: [1.0, 2.6], dy: 0 };
      case 'hit':
        return { lean: -0.45, aF: [-0.3, 0.6], aB: [-0.5, 0.3], lF: [0.25, 0.1], lB: [-0.35, -0.2], dy: -1, rot: 0 };
      case 'air':
        return { lean: -0.3, aF: [-1.2, -1.6], aB: [-1.8, -2], lF: [0.6, 0.3], lB: [0.3, 0.6], dy: 0, rot: -Math.min(1.3, a.t * 0.08) };
      case 'down':
      case 'dead':
        return { lean: 0, aF: [-2.6, -2.8], aB: [-2.4, -2.6], lF: [0.1, 0], lB: [-0.1, 0], dy: 0, rot: -Math.PI / 2 };
      case 'getup':
        return { ...guard, rot: -(Math.PI / 2) * Math.max(0, 1 - a.t / 16), dy: -3 };
      case 'held':
        return { lean: -0.3, aF: [-0.6, -0.2], aB: [-0.8, -0.4], lF: [0.3, 0.3], lB: [-0.2, -0.1], dy: 2, rot: 0 };
      case 'thrown':
        return { lean: 0, aF: [2.6, 3], aB: [-2.6, -3], lF: [0.4, 0.2], lB: [-0.4, -0.2], dy: 0, rot: -a.t * 0.35 };
      case 'grab': {
        const knee = a.knees > 0 && a.t < 14;
        return { ...guard, aF: [1.4, 1.5], aB: [1.3, 1.7], lF: knee ? [1.5, 0.2] : guard.lF, lean: 0.12 };
      }
      case 'throw': {
        const k = Math.min(1, a.t / 8);
        return { ...guard, aF: [2.8 - k * 1.3, 3 - k * 1.4], aB: [2.6 - k * 1.3, 2.9 - k * 1.4], lean: -0.3 + k * 0.6 };
      }
      case 'attack': {
        const m = a.move!;
        const wind = a.t < m.su;
        const strike = a.t >= m.su && a.t < m.su + m.act + 3;
        return this.attackPose(m.pose, wind, strike, guard, a, g);
      }
    }
    return guard;
  }

  private attackPose(pose: PoseId, wind: boolean, strike: boolean, guard: Pose, a: Actor, g: Game): Pose {
    const P = (o: Partial<Pose>): Pose => ({ ...guard, dy: 0, ...o });
    switch (pose) {
      case 'jab':
      case 'cross':
        return wind ? P({ aF: [0.3, 2.7], lean: -0.05 }) : strike ? P({ aF: [1.57, 1.57], lean: pose === 'cross' ? 0.3 : 0.15, aB: [0.2, 2.3] }) : guard;
      case 'hook':
        return wind ? P({ aF: [0.1, 2.4], lean: -0.15 }) : strike ? P({ aF: [1.4, 2.1], lean: 0.35, aB: [-0.2, 1.8] }) : guard;
      case 'elbow':
        return wind ? P({ lean: -0.2 }) : strike ? P({ aF: [1.3, 2.9], lean: 0.4 }) : guard;
      case 'upper':
        return wind ? P({ aF: [0.2, 1.4], dy: -4, lean: 0.2 }) : strike ? P({ aF: [2.7, 3.0], dy: 2, lean: -0.15 }) : guard;
      case 'kick':
        return wind ? P({ lF: [0.9, -0.4], lean: -0.1 }) : strike ? P({ lF: [1.6, 1.6], lean: -0.35 }) : guard;
      case 'round':
        return wind ? P({ lF: [0.6, -0.5], lean: -0.2 }) : strike ? P({ lF: [1.85, 1.85], lean: -0.55, aF: [0.9, 1.6] }) : guard;
      case 'knee':
        return strike ? P({ lF: [1.5, 0.15], lean: 0.1, aF: [1.2, 1.6] }) : guard;
      case 'spin': {
        const ph = Math.floor(a.t / 4) % 2;
        return P({ lF: [1.6, 1.6], lB: [-0.1, 0], lean: -0.35, aF: [1.9, 1.9], aB: [-1.9, -1.9], rot: 0, dy: 2, ...(ph ? { aF: [-1.9, -1.9] as [number, number], aB: [1.9, 1.9] as [number, number] } : {}) });
      }
      case 'slam':
        return wind ? P({ aF: [3.0, 3.1], aB: [2.8, 3.0], lF: [0.9, -0.2], lB: [0.4, -0.5], lean: -0.2 }) : strike ? P({ aF: [1.0, 0.7], aB: [0.9, 0.6], dy: -5, lean: 0.4, lF: [0.6, 0], lB: [-0.6, -0.3] }) : P({ dy: -3 });
      case 'dash':
        return wind ? P({ aF: [0.2, 2.6], lean: -0.1, dy: -2 }) : strike ? P({ aF: [1.57, 1.57], aB: [-1.0, -0.6], lean: 0.6, lF: [0.5, 0.2], lB: [-0.9, -0.5] }) : guard;
      case 'swing':
        return wind ? P({ aF: [2.9, 3.1], lean: -0.2 }) : strike ? P({ aF: [1.3, 0.9], lean: 0.3 }) : guard;
      case 'slash':
        return wind ? P({ aF: [0.5, 2.9] }) : strike ? P({ aF: [1.7, 1.4], lean: 0.25 }) : guard;
      case 'jkick':
        return wind ? P({ lF: [0.9, -0.3], dy: -3 }) : P({ lF: [1.4, 1.5], lB: [0.2, -1.2], lean: -0.25, aF: [1.0, 2.4] });
      case 'dive':
        return P({ lF: [0.9, 0.7], lB: [0.3, -0.8], lean: 0.35, aF: [-0.6, 0.2], rot: 0.35 });
      case 'throw':
        return wind ? P({ aF: [2.8, 3.0], lean: -0.25 }) : strike ? P({ aF: [1.6, 1.6], lean: 0.3 }) : guard;
      case 'charge': {
        if (wind) return P({ lean: 0.2, dy: -2, aF: [0.4, 1.0] });
        const s = Math.sin(g.tick * 0.5);
        return P({ lean: 0.6, aF: [1.3, 1.3], aB: [1.1, 1.2], lF: [s * 0.7, s * 0.7 - 0.2], lB: [-s * 0.7, -s * 0.7 - 0.2] });
      }
      case 'rage':
        return P({ aF: [2.6, 3.0], aB: [2.4, 2.9], lean: -0.25, lF: [0.4, 0.3], lB: [-0.4, -0.3] });
    }
    return guard;
  }

  private drawActor(ctx: CanvasRenderingContext2D, g: Game, a: Actor): void {
    const lk = this.look(a);
    const ps = this.pose(g, a);
    const depth = 0.92 + 0.12 * (a.z / DEPTH);
    const s = a.size * depth;
    let f = a.f;
    if (a.st === 'attack' && a.move?.pose === 'spin') f = Math.floor(a.t / 6) % 2 ? (a.f === 1 ? -1 : 1) : a.f;
    const blink = a.team === 'p' && a.inv > 0 && a.st !== 'attack' && Math.floor(g.frame / 3) % 2 === 0;
    const dead = a.st === 'dead' && Math.floor(g.frame / 4) % 2 === 0;
    if (dead) return;
    const white = a.flash > 3;
    const col = (c: string): string => (white ? '#ffffff' : c);
    ctx.save();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.translate(a.x, this.sy(a.z, a.y));
    if (a.sq > 0) {
      const k = a.sq / 6;
      ctx.scale(1 + 0.18 * k, 1 - 0.18 * k);
    }
    ctx.scale(s * f, s);
    const lying = a.st === 'down' || a.st === 'dead';
    if (lying) ctx.translate(0, -5);
    if (ps.rot) ctx.rotate(ps.rot);
    const hipY = -22 - ps.dy;
    const pt = (x: number, y: number, len: number, ang: number): [number, number] => [x + Math.sin(ang) * len, y + Math.cos(ang) * len];
    const limb = (x: number, y: number, ang: [number, number], l1: number, l2: number, c: string, w: number): [number, number] => {
      const k = pt(x, y, l1, ang[0]);
      const e = pt(k[0], k[1], l2, ang[1]);
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(k[0], k[1]);
      ctx.lineTo(e[0], e[1]);
      ctx.stroke();
      return e;
    };
    const wide = lk.wide;
    const shX = hipY;
    const sh = pt(0, shX, -18, -ps.lean);
    const shoulder: [number, number] = [sh[0], sh[1]];
    // Back limbs
    limb(-2 * wide, hipY, ps.lB, 11, 11, col(this.shade(lk.pants)), 5.5 * wide);
    limb(shoulder[0] - 2, shoulder[1] + 2, ps.aB, 9, 9, col(this.shade(lk.skin)), 4.2 * Math.min(1.3, wide));
    // Torso
    ctx.strokeStyle = col(lk.shirt);
    ctx.lineWidth = 11 * wide;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, hipY - 2);
    ctx.lineTo(shoulder[0], shoulder[1] + 3);
    ctx.stroke();
    ctx.fillStyle = col(lk.pants);
    ctx.beginPath();
    ctx.ellipse(0, hipY, 6 * wide, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Front leg
    limb(2 * wide, hipY, ps.lF, 11, 11, col(lk.pants), 5.5 * wide);
    // Head
    const head = pt(shoulder[0], shoulder[1], -8, -ps.lean * 0.6);
    ctx.fillStyle = col(lk.skin);
    ctx.beginPath();
    ctx.arc(head[0], head[1], 7, 0, Math.PI * 2);
    ctx.fill();
    if (!white) {
      ctx.fillStyle = '#111';
      ctx.fillRect(head[0] + 3, head[1] - 2, 2, 2.4);
      if (a.st === 'hit' || a.st === 'air' || a.st === 'down') {
        ctx.fillStyle = '#111';
        ctx.fillRect(head[0] + 1, head[1] + 3, 4, 1.4);
      }
    }
    this.drawHat(ctx, lk, head, white);
    // Front arm and weapon
    const hand = limb(shoulder[0] + 1, shoulder[1] + 2, ps.aF, 9, 9, col(lk.skin), 4.5 * Math.min(1.3, wide));
    ctx.fillStyle = col(lk.skin);
    ctx.beginPath();
    ctx.arc(hand[0], hand[1], 3.2 * Math.min(1.3, wide), 0, Math.PI * 2);
    ctx.fill();
    const wIcon = a.weapon ? WEAPONS[a.weapon.id].icon : a.team === 'e' && a.kind === 'knife' ? '🔪' : a.kind === 'big' ? '🦯' : a.kind === 'cleaver' ? '🔪' : '';
    if (wIcon && !lying) {
      ctx.save();
      ctx.translate(hand[0], hand[1]);
      ctx.rotate(Math.PI - ps.aF[1] - 0.7);
      ctx.scale(-1, 1);
      this.emoji(ctx, wIcon, 0, -6, 14);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Telegraph for strong enemy attacks
    if (a.team === 'e' && a.st === 'attack' && a.move && a.t < a.move.su) {
      const m = a.move as EMove;
      if (m.armor || m.dash || m.leap || m.proj || a.boss || m.big) {
        const y = this.sy(a.z, a.y) - 64 * s - (a.t % 10 < 5 ? 2 : 0);
        ctx.font = '900 16px system-ui';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000';
        ctx.strokeText('!', a.x, y);
        ctx.fillStyle = '#ff4d6d';
        ctx.fillText('!', a.x, y);
      }
    }
    // Small HP bar over hurt enemies
    if (a.team === 'e' && !a.boss && a.hp > 0 && a.hp < a.max && a.st !== 'dead') {
      const y = this.sy(a.z, a.y) - 60 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(a.x - 13, y, 26, 3.5);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(a.x - 13, y, (26 * a.hp) / a.max, 3.5);
    }
  }

  private shade(c: string): string {
    // Darker copy of a #rrggbb color for back limbs.
    const n = parseInt(c.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * 0.75);
    const gg = Math.round(((n >> 8) & 255) * 0.75);
    const b = Math.round((n & 255) * 0.75);
    return `rgb(${r},${gg},${b})`;
  }

  private drawHat(ctx: CanvasRenderingContext2D, lk: Look, head: [number, number], white: boolean): void {
    const [x, y] = head;
    const c = white ? '#fff' : lk.hatColor;
    ctx.fillStyle = c;
    switch (lk.hat) {
      case 'hair':
        ctx.beginPath();
        ctx.arc(x - 1, y - 2, 7.4, Math.PI * 0.95, Math.PI * 2.05);
        ctx.fill();
        ctx.fillRect(x - 8, y - 3, 4, 6);
        break;
      case 'cap':
        ctx.beginPath();
        ctx.arc(x, y - 2, 7.4, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x, y - 3, 11, 2.5);
        break;
      case 'bandana':
        ctx.fillRect(x - 7, y - 6, 14, 4);
        ctx.fillRect(x - 11, y - 5, 5, 2);
        break;
      case 'mohawk':
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(x - 6 + i * 3, y - 5);
          ctx.lineTo(x - 5 + i * 3, y - 13);
          ctx.lineTo(x - 3 + i * 3, y - 5);
          ctx.fill();
        }
        break;
      case 'beanie':
        ctx.beginPath();
        ctx.arc(x, y - 2, 7.6, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y - 10, 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bald':
        if (!white) {
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          ctx.arc(x - 2, y - 4, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'emoji':
        if (lk.hatEmoji) {
          ctx.save();
          ctx.scale(-1, 1);
          this.emoji(ctx, lk.hatEmoji, -x, y - 8, 15);
          ctx.restore();
        }
        break;
    }
  }

  private emoji(ctx: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  private drawHud(ctx: CanvasRenderingContext2D, g: Game): void {
    const p = g.p;
    const f = FIGHTERS[g.o.fighter];
    const r = this.run!;
    // Player panel
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(4, 4, 158, 32);
    this.emoji(ctx, f.icon, 16, 15, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(f.name.toUpperCase(), 28, 13);
    ctx.fillStyle = '#7ee08a';
    ctx.fillText(`💰 ${r.cash + g.cash}`, 78, 13);
    if (g.lives) ctx.fillText(`🆙${g.lives}`, 128, 13);
    ctx.fillStyle = '#333';
    ctx.fillRect(28, 18, 128, 8);
    const k = Math.max(0, p.hp / p.max);
    ctx.fillStyle = k > 0.5 ? '#ffd166' : k > 0.25 ? '#ff9f43' : '#ff4d6d';
    ctx.fillRect(28, 18, 128 * k, 8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px system-ui';
    ctx.fillText(`${Math.max(0, Math.ceil(p.hp))}/${p.max}`, 30, 25);
    if (p.weapon) {
      const w = WEAPONS[p.weapon.id];
      this.emoji(ctx, w.icon, 16, 31, 9);
      ctx.fillStyle = '#ccc';
      ctx.font = '7px system-ui';
      ctx.fillText(`${'▮'.repeat(Math.min(12, p.weapon.dur))}`, 28, 33);
    }
    // Specials
    g.o.specials.forEach((id, i) => {
      const sp = SPECIALS[id];
      const x = W - 24 - (g.o.specials.length - 1 - i) * 30;
      const y = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      this.emoji(ctx, sp.icon, x, y + 1, 13);
      const cd = g.cds[i];
      if (cd > 0) {
        const max = Math.round(sp.cd * (1 - 0.2 * g.perk('focus')));
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * cd) / max);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (!this.touchUi) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(i === 0 ? 'U' : 'I', x + 9, y + 13);
      }
    });
    // Wave progress
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 8px system-ui';
    ctx.fillText(`${DISTRICTS[g.o.district].icon} ${g.o.name} · fight ${Math.min(g.waveIdx + 1, g.waves.length)}/${g.waves.length}`, W / 2, 12);
    // Combo
    if (g.combo >= 2) {
      const pop = g.comboT < 6 ? 1.25 : 1;
      ctx.textAlign = 'right';
      ctx.font = `900 italic ${Math.round(18 * pop)}px system-ui`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(`${g.combo}`, W - 40, 62);
      ctx.fillStyle = g.combo >= 10 ? '#ff4d6d' : '#ffd166';
      ctx.fillText(`${g.combo}`, W - 40, 62);
      ctx.font = '900 italic 9px system-ui';
      ctx.fillText('HITS', W - 10, 62);
    }
    // Boss bar
    const b = g.boss();
    if (b && b.hp > 0) {
      const def = ENEMIES[b.kind];
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W / 2 - 120, H - 22, 240, 16);
      ctx.fillStyle = '#333';
      ctx.fillRect(W / 2 - 100, H - 14, 196, 5);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(W / 2 - 100, H - 14, (196 * b.hp) / b.max, 5);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(def.name.toUpperCase(), W / 2 - 100, H - 16);
      this.emoji(ctx, def.icon, W / 2 - 110, H - 13, 11);
    }
    // GO arrow
    const clearAhead = !g.lock && !g.done && g.alive().length === 0 && g.tick > 60;
    if (clearAhead && Math.floor(g.frame / 20) % 2 === 0) {
      ctx.textAlign = 'right';
      ctx.font = '900 italic 20px system-ui';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      ctx.strokeText('GO ▶', W - 10, 100);
      ctx.fillStyle = '#ffd166';
      ctx.fillText('GO ▶', W - 10, 100);
    }
    // Banner
    if (g.banner) {
      const t = g.banner.t;
      const a = Math.min(1, t / 15, (150 - t) / 20);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 74, W, 46);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '900 18px system-ui';
      ctx.fillText(g.banner.text, W / 2 + (1 - Math.min(1, t / 12)) * 80, 96);
      ctx.fillStyle = '#ffd166';
      ctx.font = '9px system-ui';
      ctx.fillText(g.banner.sub.length > 90 ? `${g.banner.sub.slice(0, 88)}…` : g.banner.sub, W / 2, 111);
      ctx.globalAlpha = 1;
    }
    // Stage over
    if (g.done) {
      ctx.fillStyle = g.done === 'dead' ? 'rgba(120,0,0,0.35)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = '900 italic 32px system-ui';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      const txt = g.done === 'dead' ? 'K.O.' : this.node?.kind === 'boss' ? 'BOSS DOWN!' : 'STREET CLEAR!';
      ctx.strokeText(txt, W / 2, H / 2);
      ctx.fillStyle = g.done === 'dead' ? '#ff4d6d' : '#ffd166';
      ctx.fillText(txt, W / 2, H / 2);
    }
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent, down: boolean): void {
    const key = e.key.toLowerCase();
    if (down && (key === 'escape' || key === 'p')) {
      if (this.modal) this.modal = null;
      else if (this.screen === 'play' || (this.run && this.screen !== 'title' && this.screen !== 'end')) this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen !== 'play' || this.modal) {
      if (down && key === 'enter') this.root.querySelector<HTMLElement>('.modal button.primary, main button.primary:not([disabled])')?.click();
      return;
    }
    if (key.startsWith('arrow') || key === ' ') e.preventDefault();
    if (down) {
      initAudio();
      if (!e.repeat && KEYMAP[key]) this.queued.add(KEYMAP[key]);
      this.keys.add(key);
    } else this.keys.delete(key);
  }

  private onDown(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    initAudio();
    if (this.screen !== 'play' || this.modal) return;
    const btn = t.closest<HTMLElement>('[data-k]');
    if (btn) {
      e.preventDefault();
      this.queued.add(btn.dataset.k as Act);
      btn.classList.add('on');
      setTimeout(() => btn.classList.remove('on'), 120);
      if (navigator.vibrate) navigator.vibrate(8);
      return;
    }
    const st = t.closest<HTMLElement>('#stick');
    if (st) {
      e.preventDefault();
      const r = st.getBoundingClientRect();
      this.stick = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, dx: 0, dy: 0 };
      this.onMove(e);
      return;
    }
    if (t.id === 'cv') {
      if (e.pointerType === 'mouse') this.queued.add(e.button === 2 ? 'heavy' : 'light');
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.stick.id) return;
    let dx = e.clientX - this.stick.cx;
    let dy = e.clientY - this.stick.cy;
    const len = Math.hypot(dx, dy);
    if (len > 44) {
      dx = (dx / len) * 44;
      dy = (dy / len) * 44;
    }
    this.stick.dx = dx;
    this.stick.dy = dy;
    const knob = this.root.querySelector<HTMLElement>('#knob');
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.stick.id) return;
    this.stick = { id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
    const knob = this.root.querySelector<HTMLElement>('#knob');
    if (knob) knob.style.transform = '';
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && t.closest('[data-stop]') && !t.closest('button')) return;
    initAudio();
    this.action(el.dataset.act!, el.dataset);
  }

  private action(act: string, d: DOMStringMap): void {
    if (act !== 'mute') sfx.click();
    switch (act) {
      case 'help':
        this.modal = { kind: 'help' };
        break;
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        break;
      case 'modal-close':
        this.modal = null;
        this.acc = 0;
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem('sb.mute', m ? '1' : '0');
        } catch {
          /* ignore */
        }
        break;
      }
      case 'touch':
        this.touchUi = true;
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        break;
      case 'abandon-yes':
        this.modal = null;
        if (this.run) {
          if (this.g) applyDeath(this.run, this.g.result());
          this.endRun(false);
        }
        return;
      case 'title':
        this.modal = null;
        this.g = null;
        this.screen = 'title';
        this.run = loadRun();
        break;
      case 'continue':
        this.continueRun();
        return;
      case 'new':
        this.screen = 'fighters';
        break;
      case 'fighter':
        this.startRun(d.id!);
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.stars >= cost && !this.meta.unlocked.includes(id)) {
          this.meta.stars -= cost;
          this.meta.unlocked.push(id);
          saveMeta(this.meta);
          sfx.buy();
          this.toast(`${FIGHTERS[id].icon} ${FIGHTERS[id].name} unlocked!`);
        }
        break;
      }
      case 'node':
        this.chooseNode(Number(d.i));
        return;
      case 'next':
        this.afterClear();
        return;
      case 'buy':
        this.buyItem(Number(d.i));
        return;
      case 'replace': {
        const m = this.modal;
        this.modal = null;
        if (m?.kind === 'replace') this.buyItem(m.item, Number(d.i));
        return;
      }
      case 'leave':
        this.leave();
        return;
      case 'eat': {
        const r = this.run!;
        r.hp = Math.min(r.maxHp, r.hp + dinerHeal(r));
        this.dinerDone = true;
        sfx.food();
        saveRun(r);
        break;
      }
      case 'train': {
        const r = this.run!;
        r.maxHp += 10;
        r.hp = Math.min(r.maxHp, r.hp + 10);
        this.dinerDone = true;
        sfx.buy();
        saveRun(r);
        break;
      }
      case 'perk': {
        const r = this.run!;
        if (d.id) {
          addPerk(r, d.id);
          this.toast(`${PERKS[d.id].icon} ${PERKS[d.id].name}`);
        }
        if (nextDistrict(r) === 'win') {
          this.endRun(true);
          return;
        }
        saveRun(r);
        this.screen = 'map';
        break;
      }
    }
    this.render();
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
        const g = this.g;
        const r = this.run;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          fighter: r?.fighter ?? null,
          district: r?.district ?? null,
          col: r?.col ?? null,
          at: r?.at ?? null,
          hp: g ? g.p.hp : (r?.hp ?? null),
          maxHp: r?.maxHp ?? null,
          cash: r?.cash ?? null,
          lives: r?.lives ?? null,
          specials: r?.specials ?? null,
          perks: r?.perks ?? null,
          stage: g ? { px: Math.round(g.p.x), pz: Math.round(g.p.z), pst: g.p.st, combo: g.combo, name: g.o.name, kind: g.o.kind, wave: g.waveIdx, waves: g.waves.length, enemies: g.alive().map((e) => `${e.kind} ${e.hp}/${e.max} ${e.st}`), tick: g.tick, done: g.done } : null,
          end: this.end,
          meta: { ...this.meta },
        };
      },
      /** One bot action. In a fight it simulates up to `frames` frames (default 600) with the fighting bot. */
      step: (frames = 600) => {
        if (this.modal) {
          if (!click('.modal [data-act="replace"]')) click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) click('[data-act="new"]');
            return 'title';
          case 'fighters': {
            const own = FIGHTER_IDS.filter((id) => this.meta.unlocked.includes(id));
            click(`[data-act="fighter"][data-id="${own[own.length - 1]}"]`);
            return 'fighters';
          }
          case 'map': {
            const nodes = districtMap(r!, r!.district)[r!.col];
            const find = (k: string): number => nodes.findIndex((n) => n.kind === k);
            let i = 0;
            if (find('diner') >= 0 && (r!.hp < r!.maxHp * 0.6 || r!.cash < 40)) i = find('diner');
            else if (find('shop') >= 0 && r!.cash >= 40) i = find('shop');
            else if (find('street') >= 0) i = find('street');
            else i = Math.max(0, find('shop'));
            click(`[data-act="node"][data-i="${i}"]`);
            return 'map';
          }
          case 'play': {
            this.auto = true;
            for (let i = 0; i < frames && this.g && this.screen === 'play'; i++) this.tick(false);
            this.auto = false;
            if (this.screen === 'play') this.draw();
            return 'play';
          }
          case 'clear':
            click('[data-act="next"]');
            return 'clear';
          case 'shop': {
            const stock = r!.shop ?? [];
            const order = ['feast', 'food', 'life', 'special', 'perk', 'maxhp'];
            for (const k of order) {
              const i = stock.findIndex((it) => it.kind === k && canBuy(r!, it) && !(k === 'special' && r!.specials.length >= 2) && !((k === 'food' || k === 'feast') && r!.hp > r!.maxHp * 0.7));
              if (i >= 0) {
                this.buyItem(i);
                return 'buy';
              }
            }
            click('[data-act="leave"]');
            return 'shop';
          }
          case 'diner':
            if (!this.dinerDone) click(r!.hp < r!.maxHp * 0.8 ? '[data-act="eat"]' : '[data-act="train"]');
            else click('[data-act="leave"]');
            return 'diner';
          case 'reward': {
            const offer = (r!.reward ?? []).slice().sort((a, b) => PERK_PRIO.indexOf(a) - PERK_PRIO.indexOf(b));
            if (!click(`[data-act="perk"][data-id="${offer[0] ?? ''}"]`)) click('[data-act="perk"]');
            return 'reward';
          }
          case 'end':
            return 'end';
        }
        return this.screen;
      },
      /** Bot plays in real time. */
      auto: (on = true) => {
        this.auto = on;
      },
      /** Kill all enemies of the current fight. */
      clear: () => {
        for (const e of this.g?.enemies ?? []) e.hp = 0;
      },
      cash: (n: number) => {
        if (this.run) this.run.cash += n;
        this.render();
      },
      stars: (n: number) => {
        this.meta.stars += n;
        saveMeta(this.meta);
        this.render();
      },
      hp: (n: number) => {
        if (this.g) this.g.p.hp = n;
        else if (this.run) this.run.hp = n;
      },
      fast: FAST,
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
