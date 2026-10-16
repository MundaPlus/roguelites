import { Ai } from './ai';
import { BOSS, FIGHTERS, FIGHTER_IDS, NORMALS, SLOT_MOTION, SLOT_NAME, SPECIALS, STAGES, STAGE_IDS, STYLE_INFO, SUPERS, TECHS, type Slot } from './data';
import { drawFighter, drawProj, drawShadow, stageCanvas, type Look } from './draw';
import { GROUND, H, TECH_WINDOW, W, hitbox, hurtboxes, newFight, noInput, step, type Ev, type Fight, type Fighter, type Input } from './game';
import { randomSeedText } from './rng';
import {
  LADDER,
  applyPick,
  botAi,
  clearRun,
  fightSeed,
  fighterOpen,
  healAmount,
  honorFor,
  loadMeta,
  loadRun,
  newRun,
  oppAi,
  oppDef,
  oppSetup,
  playerSetup,
  saveMeta,
  saveRun,
  stageOpen,
  winFight,
  type FightLog,
  type Meta,
  type Pick,
  type RunState,
} from './run';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'select' | 'ladder' | 'fight' | 'reward' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'moves' };
type Phase = 'intro' | 'fight' | 'ko';

const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
/** `?debug&fast` skips intros and the KO pause for bot tests. */
const FAST = PARAMS.has('fast');
const MUTE_KEY = 'dueldojo.mute';
const SHOW_BOXES = PARAMS.has('boxes');

/** Order in which the debug bot picks techniques. */
const BOT_PRIO = ['power', 'vigor', 'guard', 'vamp', 'meditate', 'secondwind', 'countersense', 'momentum', 'focus', 'ready', 'overdrive', 'swift', 'grip', 'thorns', 'ironguard', 'kipup', 'slippery', 'firststrike'];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  color: string;
  t: number;
}
interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}
interface Banner {
  text: string;
  color: string;
  t: number;
  max: number;
  size: number;
  y: number;
}

const KEYMAP: Record<string, keyof Input> = {
  ArrowLeft: 'l',
  KeyA: 'l',
  ArrowRight: 'r',
  KeyD: 'r',
  ArrowUp: 'u',
  KeyW: 'u',
  ArrowDown: 'd',
  KeyS: 'd',
  KeyJ: 'a',
  KeyZ: 'a',
  KeyK: 'b',
  KeyX: 'b',
  KeyL: 's',
  KeyC: 's',
  KeyI: 't',
  KeyV: 't',
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function hpBar(hp: number, max: number): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<div class="hp"><div class="hp-fill" style="width:${pct}%"></div><span>${Math.ceil(hp)} / ${max}</span></div>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta: Meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private selFighter = 'kai';
  private end: { victory: boolean; score: number; honor: number; rung: number; unlocks: string[]; log: FightLog[]; opp: string | null } | null = null;
  private lastWin: { heal: number; score: number; log: FightLog } | null = null;

  // Fight
  private f: Fight | null = null;
  private ai: Ai | null = null;
  private bot: Ai | null = null;
  private auto = false;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hidden = false;
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private floats: Float[] = [];
  private banners: Banner[] = [];
  private shake = 0;
  private flashA = 0;
  private trail: [number, number] = [0, 0];
  private comboShow: [number, number] = [0, 0];
  private comboT: [number, number] = [0, 0];
  private stageId = 'dojo';
  private tick60 = 0;
  private camX = W / 2;
  private camW = W;
  private hudK = 1;
  /** Logical view width: narrower on portrait phones. */
  private vw = W;

  // Input
  private keys: Input = noInput();
  private touch: Input = noInput();
  private pad: Input = noInput();
  private padMenu = false;
  private superKey = false;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* storage blocked */
    }
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onPointer(e, true));
    window.addEventListener('pointerup', (e) => this.onPointer(e, false));
    window.addEventListener('pointercancel', (e) => this.onPointer(e, false));
    root.addEventListener('pointermove', (e) => this.onPadMove(e));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys = noInput();
      this.touch = noInput();
    });
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (this.hidden && this.screen === 'fight' && !this.modal && !this.auto) this.openModal({ kind: 'menu', confirm: false });
    });
    if (DEBUG) this.installDebug();
    this.render();
  }

  // ---------- DOM ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'select':
        body = this.selectView();
        break;
      case 'ladder':
        body = this.ladderView();
        break;
      case 'fight':
        body = this.fightView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' && this.screen !== 'select' ? this.topBar() : this.screen === 'title' ? '' : this.miniBar();
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'fight') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.loop();
    } else {
      this.stopLoop();
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

  private miniBar(): string {
    return `<header class="top"><b class="brand">🥋 Duel Dojo</b><span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button></header>`;
  }

  private topBar(): string {
    const r = this.run!;
    const fd = FIGHTERS[r.fighter];
    return `<header class="top">
      <span>${fd.icon} <b>${fd.name}</b></span>
      <span>❤️ ${Math.ceil(r.hp)}/${r.maxHp}</span>
      <span>🪜 ${Math.min(r.rung + 1, LADDER)}/${LADDER}</span>
      <span class="hide-s">⭐ ${r.score}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="moves" title="Move list">📜</button>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const shop = [
      ...FIGHTER_IDS.filter((id) => FIGHTERS[id].cost !== 0).map((id) => {
        const d = FIGHTERS[id];
        const own = fighterOpen(m, id);
        const btn = own ? '<span class="ok">✔ Unlocked</span>' : d.cost < 0 ? '<span class="dim">Beat the ladder</span>' : `<button data-act="unlock" data-id="${id}" ${m.honor >= d.cost ? '' : 'disabled'}>🎖️ ${d.cost}</button>`;
        return `<div class="arm ${own ? 'own' : ''}"><span class="big">${d.icon}</span><span><b>${d.name}</b> <small>Fighter · ${d.title}: ${d.text}</small></span>${btn}</div>`;
      }),
      ...STAGE_IDS.filter((id) => STAGES[id].cost !== 0).map((id) => {
        const s = STAGES[id];
        const own = stageOpen(m, id);
        const btn = own ? '<span class="ok">✔ Unlocked</span>' : s.cost < 0 ? '<span class="dim">Beat the ladder</span>' : `<button data-act="unlock" data-id="${id}" ${m.honor >= s.cost ? '' : 'disabled'}>🎖️ ${s.cost}</button>`;
        return `<div class="arm ${own ? 'own' : ''}"><span class="big">${s.icon}</span><span><b>${s.name}</b> <small>Stage · joins the ladder rotation.</small></span>${btn}</div>`;
      }),
    ].join('');
    return `<div class="title">
      <div class="logo"><span>🥋</span><h1>Duel Dojo</h1></div>
      <p class="sub">One-on-one fights. Climb a ladder of 8 masters. Learn a new technique after each win. Your HP carries over.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue (${FIGHTERS[r.fighter].name}, fight ${r.rung + 1}/8, ❤️ ${Math.ceil(r.hp)})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <div class="row">
        <button data-act="help">How to play</button>
        <button data-act="motion" class="${m.motion ? 'on' : ''}">Motion inputs: <b>${m.motion ? 'ON' : 'OFF'}</b></button>
      </div>
      <p class="stats">Runs ${m.runs} · Ladder wins ${m.wins} · Best fight ${m.bestRung}/8 · Best score ${m.best} · KOs ${m.kos}</p>
      <h2>Dojo <small>🎖️ ${m.honor} honor</small></h2>
      <p class="sub">Each run gives honor. Unlock fighters and stages.</p>
      <div class="armory">${shop}</div>
    </div>`;
  }

  private specialList(specials: Partial<Record<Slot, string>>, superId: string): string {
    const slots: Slot[] = ['n', 'f', 'b', 'd'];
    const rows = slots
      .map((s) => {
        const id = specials[s];
        if (!id) return `<li class="dim"><kbd>${SLOT_NAME[s]}</kbd> empty</li>`;
        const d = SPECIALS[id];
        return `<li><kbd>${SLOT_NAME[s]}</kbd> ${d.icon} <b>${d.name}</b> <small>${d.text}</small></li>`;
      })
      .join('');
    return `<ul class="moves">${rows}<li><kbd>S + H</kbd> ⚡ <b>${SUPERS[superId].name}</b> <small>Super. Needs a full meter.</small></li></ul>`;
  }

  private selectView(): string {
    const cards = FIGHTER_IDS.map((id) => {
      const d = FIGHTERS[id];
      const open = fighterOpen(this.meta, id);
      const sel = this.selFighter === id;
      const bar = (v: number, max: number): string => `<i class="bar"><i style="width:${Math.min(100, (v / max) * 100)}%"></i></i>`;
      return `<button class="fcard ${sel ? 'sel' : ''}" data-act="fighter" data-id="${id}" ${open ? '' : 'disabled'}>
        <span class="big">${d.icon}</span><b>${d.name}</b><small>${d.title}</small>
        ${open ? `<span class="fstats"><span>HP ${bar(d.hp, 125)}</span><span>Speed ${bar(d.walk, 1.3)}</span><span>Power ${bar(d.dmg, 1.15)}</span></span>` : `<small class="dim">🔒 ${d.cost < 0 ? 'Beat the ladder' : `${d.cost} honor`}</small>`}
      </button>`;
    }).join('');
    const d = FIGHTERS[this.selFighter];
    return `<div class="select">
      <h2>Choose your fighter</h2>
      <div class="fcards">${cards}</div>
      <div class="panel"><h3>${d.icon} ${d.name} <small>${d.title}</small></h3><p class="sub">${d.text}</p>${this.specialList(d.specials, d.super)}</div>
      <div class="row"><button data-act="title">◀ Back</button><button class="primary" data-act="start">Start run ▶</button></div>
    </div>`;
  }

  private ladderView(): string {
    const r = this.run!;
    const rungs = r.ladder
      .map((id, i) => {
        const o = oppDef(id);
        const state = i < r.rung ? 'done' : i === r.rung ? 'now' : '';
        return `<li class="rung ${state} ${id === BOSS.id ? 'boss' : ''}" style="--gi:${o.gi}">
          <span class="num">${i + 1}</span><span class="av">${o.icon}</span>
          <span class="nm"><b>${esc(o.name)}</b><small>${STYLE_INFO[o.style].icon} ${o.style} · ${STAGES[r.stages[i]].icon}</small></span>
          ${i < r.rung ? '<span class="ok">✔</span>' : ''}
        </li>`;
      })
      .reverse()
      .join('');
    const o = oppDef(r.ladder[r.rung]);
    const techs = Object.entries(r.techs)
      .map(([id, n]) => `<span class="chip" title="${TECHS[id].text}">${TECHS[id].icon} ${TECHS[id].name}${n > 1 ? ` ×${n}` : ''}</span>`)
      .join('');
    const fd = FIGHTERS[r.fighter];
    return `<div class="ladder">
      <div class="next-up panel">
        <p class="dim">Fight ${r.rung + 1} of ${LADDER}${o.id === BOSS.id ? ' · <b class="bad">BOSS</b>' : ''}</p>
        <h2>${o.icon} ${esc(o.name)}</h2>
        <p>${STYLE_INFO[o.style].icon} <b>${o.style}</b>: ${STYLE_INFO[o.style].text}</p>
        <p class="quote">“${esc(o.line)}”</p>
        <p class="dim">Stage: ${STAGES[r.stages[r.rung]].icon} ${STAGES[r.stages[r.rung]].name}</p>
        <button class="primary big-btn" data-act="fight">Fight! ▶</button>
      </div>
      <ol class="rungs">${rungs}</ol>
      <div class="panel me">
        <h3>${fd.icon} ${fd.name}</h3>
        ${hpBar(r.hp, r.maxHp)}
        <p class="dim">After each win you heal ${healAmount(r)} HP.</p>
        ${this.specialList(r.specials, fd.super)}
        <div class="bag">${techs || '<span class="dim">No techniques yet.</span>'}</div>
      </div>
    </div>`;
  }

  private fightView(): string {
    return `<div class="fightv">
      <div class="cv-wrap"><canvas id="cv"></canvas></div>
      <div class="touch">
        <div class="dpad" data-pad><span class="knob"></span><i class="u">▲</i><i class="d">▼</i><i class="l">◀</i><i class="r">▶</i></div>
        <div class="btns">
          <button class="tb" data-btn="a">L<small>light</small></button>
          <button class="tb" data-btn="b">H<small>heavy</small></button>
          <button class="tb sp" data-btn="s">S<small>special</small></button>
          <button class="tb" data-btn="t">T<small>throw</small></button>
          <button class="tb su" data-btn="super">S+H<small>super</small></button>
        </div>
      </div>
      <p class="hint keys">Move: <kbd>←→↑↓</kbd>/<kbd>WASD</kbd> · Light <kbd>J</kbd>/<kbd>Z</kbd> · Heavy <kbd>K</kbd>/<kbd>X</kbd> · Special <kbd>L</kbd>/<kbd>C</kbd> (+ direction) · Throw <kbd>I</kbd>/<kbd>V</kbd> · Super <kbd>L</kbd>+<kbd>K</kbd> · Block: hold back · Pause <kbd>Esc</kbd></p>
    </div>`;
  }

  private pickHtml(p: Pick, i: number): string {
    const r = this.run!;
    if (p.kind === 'special') {
      const d = SPECIALS[p.id];
      const old = r.specials[d.slot];
      return `<button class="pick" data-act="pick" data-i="${i}"><span class="tag">New special</span><span class="big">${d.icon}</span><b>${d.name}</b><small><kbd>${SLOT_NAME[d.slot]}</kbd> ${d.text}</small>${old ? `<small class="warn">Replaces ${SPECIALS[old].name}</small>` : ''}</button>`;
    }
    const t = TECHS[p.id];
    const n = r.techs[p.id] ?? 0;
    return `<button class="pick" data-act="pick" data-i="${i}"><span class="tag">${t.kind === 'stat' ? 'Stat' : 'Passive'}</span><span class="big">${t.icon}</span><b>${t.name}${t.max > 1 ? ` ${'★'.repeat(n + 1)}` : ''}</b><small>${t.text}</small></button>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const w = this.lastWin!;
    const o = oppDef(w.log.opp);
    return `<div class="reward">
      <h2 class="good">K.O.! ${esc(o.name)} is down.</h2>
      <p>${w.log.perfect ? '<b class="gold">PERFECT!</b> · ' : ''}HP left ${w.log.hp} · Max combo ${w.log.combo} · ⭐ +${w.score}</p>
      <p class="good">You rest and heal ${w.heal} HP (now ${Math.ceil(r.hp)}/${r.maxHp}).</p>
      <h3>Learn a technique</h3>
      <div class="picks">${(r.offer ?? []).map((p, i) => this.pickHtml(p, i)).join('')}</div>
      <button data-act="skip">Skip</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    const rows = e.log.map((l) => `<li>${esc(oppDef(l.opp).name)} ${l.perfect ? '<b class="gold">perfect</b>' : ''} <small>HP ${l.hp} · combo ${l.combo} · ⭐ ${l.score}</small></li>`).join('');
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Grand Master!' : '💀 Defeated'}</h1>
      <p>${e.victory ? 'The Oni Shogun falls. The dojo is yours.' : `${e.opp ? esc(oppDef(e.opp).name) : 'Your opponent'} beat you in fight ${e.rung + 1} of ${LADDER}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>🎖️ +${e.honor} honor for the dojo</p>
      ${e.unlocks.map((u) => `<p class="gold">🔓 Unlocked: ${u}</p>`).join('')}
      ${rows ? `<ol class="log">${rows}</ol>` : ''}
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Win 8 fights in a row.</b> The 8th is the boss. One round per fight, 60 seconds. If time runs out, the higher HP (in %) wins.</li>
          <li><b>Move</b> with ←→, <b>jump</b> with ↑, <b>crouch</b> with ↓. Hold <b>back</b> (away from the opponent) to <b>block</b>. Hold down-back to block low.</li>
          <li><b>Light</b> (J/Z) is fast. <b>Heavy</b> (K/X) hits harder. Crouch + attack gives low hits. Lows must be blocked crouching. Jump attacks and overheads must be blocked standing.</li>
          <li><b>Throw</b> (I/V, or Light + Heavy together) beats a block but loses to attacks. Press throw within ${TECH_WINDOW} frames when you are grabbed to break the throw.</li>
          <li><b>Specials</b>: press Special (L/C) alone or with →, ← or ↓. Each fighter has up to 4. Turn on <b>motion inputs</b> on the title screen to also use ↓↘→, ↓↙←, →↓↘ and ↓↓ + an attack (+10% damage).</li>
          <li><b>Combos</b>: when a hit or block connects, cancel Light into Light or Heavy, and Heavy into a special or the super.</li>
          <li><b>Super</b>: Special + Heavy together when the meter is full. The meter fills when you attack, get hit or block.</li>
          <li><b>After each win</b> pick a technique: a new special, a stat upgrade or a passive. You heal ${this.run ? healAmount(this.run) : '35%'} HP. Your HP carries over to the next fight.</li>
          <li>Touch: the pad on the left, buttons on the right. Gamepad: stick or d-pad, A light, B heavy, X special, Y throw, RB super, Start pause.</li>
          <li>Each run gives honor. Spend it on the title screen to unlock fighters and stages.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'moves') {
      const r = this.run;
      const fd = r ? FIGHTERS[r.fighter] : FIGHTERS.kai;
      const motion = (['n', 'f', 'b', 'd'] as Slot[])
        .filter((s) => r?.specials[s])
        .map((s) => `<li><kbd>${SLOT_MOTION[s]}</kbd> ${SPECIALS[r!.specials[s]!].name}</li>`)
        .join('');
      const normals = Object.values(NORMALS)
        .map((n) => `<tr><td>${n.name}</td><td>${n.startup}</td><td>${n.active}</td><td>${n.recovery}</td><td>${n.dmg}</td><td>${n.level}</td></tr>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>📜 ${fd.name}: moves</h2>
        ${this.specialList(r?.specials ?? fd.specials, fd.super)}
        ${this.meta.motion && motion ? `<h3>Motion inputs</h3><ul class="moves">${motion}</ul>` : ''}
        <h3>Frame data (normals)</h3>
        <table class="fd"><tr><th>Move</th><th>Start</th><th>Active</th><th>Recov.</th><th>Dmg</th><th>Level</th></tr>${normals}</table>
        <button class="primary" data-act="modal-close">Close</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Paused</h2>
      ${
        m.confirm
          ? '<p>Abandon this run? Your progress on the ladder is lost.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button><button data-act="abandon-no">No</button>'
          : `<button class="primary" data-act="modal-close">▶ Resume</button>
             <button data-act="moves">📜 Move list</button>
             <button data-act="help">How to play</button>
             <button data-act="motion">Motion inputs: ${this.meta.motion ? 'ON' : 'OFF'}</button>
             ${this.screen === 'fight' ? '' : '<button data-act="to-title">Title screen (keeps the run)</button>'}
             <button data-act="abandon">Abandon run</button>`
      }
    </div></div>`;
  }

  private openModal(m: Modal | null): void {
    this.modal = m;
    if (this.screen === 'fight') {
      const old = this.root.querySelector('.modal');
      old?.remove();
      if (m) this.root.insertAdjacentHTML('beforeend', this.modalView());
      this.keys = noInput();
      this.touch = noInput();
      this.last = performance.now();
    } else this.render();
  }

  // ---------- Events ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'modal-close' && target.closest('[data-stop]') && !target.closest('button')) return;
    const act = el.dataset.act!;
    switch (act) {
      case 'help':
        this.openModal({ kind: 'help' });
        break;
      case 'moves':
        this.openModal({ kind: 'moves' });
        break;
      case 'menu':
        this.openModal({ kind: 'menu', confirm: false });
        break;
      case 'modal-close':
        this.openModal(null);
        break;
      case 'mute': {
        const m = toggleMute();
        try {
          localStorage.setItem(MUTE_KEY, m ? '1' : '0');
        } catch {
          /* storage blocked */
        }
        el.textContent = m ? '🔇' : '🔊';
        break;
      }
      case 'motion':
        this.meta.motion = !this.meta.motion;
        saveMeta(this.meta);
        if (this.f) this.f.fs[0].mods.motion = this.meta.motion;
        this.toast(this.meta.motion ? 'Motion inputs ON: ↓↘→ + attack and more. See the move list.' : 'Motion inputs OFF: use Special + direction.');
        if (this.modal) this.openModal(this.modal);
        else this.render();
        break;
      case 'unlock': {
        const id = el.dataset.id!;
        const cost = FIGHTERS[id]?.cost ?? STAGES[id]?.cost ?? 0;
        if (this.meta.honor < cost || cost <= 0) {
          sfx.deny();
          break;
        }
        this.meta.honor -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.pick();
        this.toast(`Unlocked ${FIGHTERS[id]?.name ?? STAGES[id].name}!`);
        this.render();
        break;
      }
      case 'continue':
        sfx.click();
        this.screen = 'ladder';
        this.render();
        break;
      case 'new':
        sfx.click();
        this.screen = 'select';
        if (!fighterOpen(this.meta, this.selFighter)) this.selFighter = 'kai';
        this.render();
        break;
      case 'fighter':
        sfx.click();
        this.selFighter = el.dataset.id!;
        this.render();
        break;
      case 'start':
        this.startRun();
        break;
      case 'title':
        this.screen = 'title';
        this.render();
        break;
      case 'fight':
        this.startFight();
        break;
      case 'pick':
        this.takePick(Number(el.dataset.i));
        break;
      case 'skip':
        this.takePick(-1);
        break;
      case 'to-title':
        this.modal = null;
        this.f = null;
        this.screen = 'title';
        this.render();
        break;
      case 'abandon':
        this.openModal({ kind: 'menu', confirm: true });
        break;
      case 'abandon-no':
        this.openModal({ kind: 'menu', confirm: false });
        break;
      case 'abandon-yes':
        this.modal = null;
        this.f = null;
        this.loseRun();
        break;
    }
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) initAudio();
    if (down && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (this.modal) this.openModal(null);
      else if (this.screen === 'fight') this.openModal({ kind: 'menu', confirm: false });
      return;
    }
    if (this.screen !== 'fight') {
      if (down && (e.code === 'Enter' || e.code === 'Space') && !this.modal) {
        const p = this.root.querySelector<HTMLElement>('button.primary:not([disabled])');
        if (p && document.activeElement === document.body) {
          e.preventDefault();
          p.click();
        }
      }
      return;
    }
    const k = KEYMAP[e.code];
    if (e.code === 'KeyO') {
      this.superKey = down;
      e.preventDefault();
      return;
    }
    if (!k) return;
    e.preventDefault();
    this.keys[k] = down;
  }

  private onPointer(e: PointerEvent, down: boolean): void {
    if (down) initAudio();
    const t = e.target as HTMLElement;
    if (down) {
      const btn = t.closest<HTMLElement>('[data-btn]');
      if (btn) {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('on');
        btn.dataset.pid = String(e.pointerId);
        const b = btn.dataset.btn!;
        if (b === 'super') {
          this.touch.s = true;
          this.touch.b = true;
        } else this.touch[b as keyof Input] = true;
        return;
      }
      const pad = t.closest<HTMLElement>('[data-pad]');
      if (pad) {
        e.preventDefault();
        pad.setPointerCapture?.(e.pointerId);
        pad.dataset.pid = String(e.pointerId);
        this.padDir(pad, e);
      }
      return;
    }
    for (const btn of this.root.querySelectorAll<HTMLElement>('[data-btn]')) {
      if (btn.dataset.pid !== String(e.pointerId)) continue;
      btn.classList.remove('on');
      delete btn.dataset.pid;
      const b = btn.dataset.btn!;
      if (b === 'super') {
        this.touch.s = false;
        this.touch.b = false;
      } else this.touch[b as keyof Input] = false;
    }
    const pad = this.root.querySelector<HTMLElement>('[data-pad]');
    if (pad && pad.dataset.pid === String(e.pointerId)) {
      delete pad.dataset.pid;
      this.touch.l = this.touch.r = this.touch.u = this.touch.d = false;
      const knob = pad.querySelector<HTMLElement>('.knob');
      if (knob) knob.style.transform = '';
    }
  }

  private onPadMove(e: PointerEvent): void {
    const pad = this.root.querySelector<HTMLElement>('[data-pad]');
    if (pad && pad.dataset.pid === String(e.pointerId)) this.padDir(pad, e);
  }

  private padDir(pad: HTMLElement, e: PointerEvent): void {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const dead = r.width * 0.14;
    const len = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const on = len > dead;
    this.touch.r = on && Math.cos(a) > 0.38;
    this.touch.l = on && Math.cos(a) < -0.38;
    this.touch.d = on && Math.sin(a) > 0.38;
    this.touch.u = on && Math.sin(a) < -0.38;
    const knob = pad.querySelector<HTMLElement>('.knob');
    const k = Math.min(len, r.width * 0.32) / (len || 1);
    if (knob) knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }

  private pollPad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) {
      this.pad = noInput();
      return;
    }
    const b = (i: number): boolean => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    this.pad = { l: b(14) || ax < -0.5, r: b(15) || ax > 0.5, u: b(12) || ay < -0.5, d: b(13) || ay > 0.5, a: b(0), b: b(1) || b(5), s: b(2) || b(5), t: b(3) };
    const menu = b(9);
    if (menu && !this.padMenu) this.openModal(this.modal ? null : { kind: 'menu', confirm: false });
    this.padMenu = menu;
  }

  private playerInput(): Input {
    const k = this.keys;
    const t = this.touch;
    const p = this.pad;
    const i: Input = {
      l: k.l || t.l || p.l,
      r: k.r || t.r || p.r,
      u: k.u || t.u || p.u,
      d: k.d || t.d || p.d,
      a: k.a || t.a || p.a,
      b: k.b || t.b || p.b || this.superKey,
      s: k.s || t.s || p.s || this.superKey,
      t: k.t || t.t || p.t,
    };
    return i;
  }

  // ---------- Run flow ----------

  private startRun(): void {
    if (!fighterOpen(this.meta, this.selFighter)) {
      sfx.deny();
      return;
    }
    sfx.pick();
    this.run = newRun(randomSeedText(), this.selFighter, this.meta);
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.screen = 'ladder';
    this.render();
  }

  private startFight(): void {
    const r = this.run!;
    this.f = newFight(playerSetup(r, this.meta), oppSetup(r), fightSeed(r));
    this.ai = new Ai(oppAi(r), fightSeed(r) + 1);
    this.bot = new Ai(botAi(), fightSeed(r) + 2);
    this.stageId = r.stages[r.rung];
    this.phase = 'intro';
    this.phaseT = FAST ? 0 : 110;
    this.sparks = [];
    this.rings = [];
    this.floats = [];
    this.banners = [];
    this.shake = 0;
    this.flashA = 0;
    this.trail = [this.f.fs[0].hp, this.f.fs[1].hp];
    this.camX = W / 2;
    this.camW = W;
    this.comboShow = [0, 0];
    this.comboT = [0, 0];
    this.keys = noInput();
    this.touch = noInput();
    this.screen = 'fight';
    this.modal = null;
    const o = oppDef(r.ladder[r.rung]);
    this.banner(`FIGHT ${r.rung + 1}`, '#fff', 60, 34, 150);
    this.banner(o.id === BOSS.id ? `👑 ${o.name}` : o.name, o.gi, 60, 22, 190);
    sfx.bell();
    this.render();
  }

  private finishFight(): void {
    const f = this.f!;
    const r = this.run!;
    const won = f.over?.winner === 0;
    this.meta.kos += f.fs[1].ko ? 1 : 0;
    if (!won) {
      this.f = null;
      this.loseRun();
      return;
    }
    this.lastWin = winFight(r, f);
    this.meta.bestRung = Math.max(this.meta.bestRung, r.rung);
    this.f = null;
    if (r.rung >= LADDER) {
      this.winRun();
      return;
    }
    saveRun(r);
    saveMeta(this.meta);
    sfx.win();
    this.screen = 'reward';
    this.render();
  }

  private takePick(i: number): void {
    const r = this.run!;
    if (i >= 0 && r.offer?.[i]) {
      const p = r.offer[i];
      applyPick(r, p);
      sfx.pick();
      this.toast(p.kind === 'special' ? `Learned ${SPECIALS[p.id].name}!` : `${TECHS[p.id].icon} ${TECHS[p.id].name}`);
    } else r.offer = null;
    saveRun(r);
    this.screen = 'ladder';
    this.render();
  }

  private winRun(): void {
    const r = this.run!;
    const honor = honorFor(r, true);
    const unlocks: string[] = [];
    for (const id of ['oni', 'volcano']) {
      if (!this.meta.unlocked.includes(id)) {
        this.meta.unlocked.push(id);
        unlocks.push(id === 'oni' ? '👹 Oni (fighter)' : '🌋 Oni Gate (stage)');
      }
    }
    this.meta.honor += honor;
    this.meta.wins++;
    this.meta.bestRung = LADDER;
    this.meta.best = Math.max(this.meta.best, r.score);
    saveMeta(this.meta);
    this.end = { victory: true, score: r.score, honor, rung: LADDER, unlocks, log: r.log, opp: null };
    this.run = null;
    clearRun();
    sfx.win();
    this.screen = 'end';
    this.render();
  }

  private loseRun(): void {
    const r = this.run;
    if (!r) {
      this.screen = 'title';
      this.render();
      return;
    }
    const honor = honorFor(r, false);
    this.meta.honor += honor;
    this.meta.best = Math.max(this.meta.best, r.score);
    saveMeta(this.meta);
    this.end = { victory: false, score: r.score, honor, rung: r.rung, unlocks: [], log: r.log, opp: r.ladder[r.rung] };
    this.run = null;
    clearRun();
    sfx.lose();
    this.screen = 'end';
    this.render();
  }

  // ---------- Fight loop ----------

  private resize(): void {
    const cv = this.canvas;
    if (!cv) return;
    const wrap = cv.parentElement!;
    const touch = this.root.querySelector<HTMLElement>('.touch');
    const avail = wrap.clientWidth;
    const touchH = touch && getComputedStyle(touch).display !== 'none' ? touch.offsetHeight + 20 : 40;
    const maxH = Math.max(180, window.innerHeight - 70 - touchH);
    this.vw = avail < 560 && window.innerHeight > window.innerWidth ? 440 : W;
    const w = Math.min(avail, 960, (maxH * this.vw) / H);
    const h = (w * H) / this.vw;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.hudK = Math.max(1, Math.min(1.5, (360 * this.vw) / W / w));
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    cv.width = Math.round(w * this.dpr);
    cv.height = Math.round(h * this.dpr);
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop(): void {
    this.stopLoop();
    this.last = performance.now();
    this.acc = 0;
    const frame = (now: number): void => {
      if (this.screen !== 'fight' || !this.f) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.modal && !this.hidden) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= 1 / 60 && n < 6) {
          this.acc -= 1 / 60;
          this.tick();
          n++;
          if (this.screen !== 'fight') return;
        }
      }
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** One 60 Hz frame. */
  private tick(): void {
    const f = this.f;
    if (!f) return;
    this.tick60++;
    if (!this.auto) this.pollPad();
    this.updateFx();
    if (this.phase === 'intro') {
      if (--this.phaseT <= 0) {
        this.phase = 'fight';
        this.banner('FIGHT!', '#f77f00', 50, 54);
        sfx.bell();
      }
      return;
    }
    if (this.phase === 'ko') {
      // Slow motion for the first frames of the KO.
      this.phaseT--;
      if (FAST || this.phaseT < 90 || this.phaseT % 3 === 0) this.stepFight();
      if (this.phaseT <= 0) this.finishFight();
      return;
    }
    this.stepFight();
    if (f.over) {
      this.phase = 'ko';
      this.phaseT = FAST ? 1 : 150;
      const w = f.over.winner;
      if (f.over.reason === 'time') this.banner('TIME!', '#ffd166', 90, 54);
      else this.banner('K.O.', '#ef476f', 100, 70);
      if (w === 0 && f.fs[0].stats.taken === 0) this.banner('PERFECT', '#ffd166', 100, 34, 240);
      sfx.ko();
      this.shake = Math.max(this.shake, 14);
      this.flashA = 0.8;
    }
  }

  private stepFight(): void {
    const f = this.f!;
    const pIn = this.auto ? this.bot!.input(f, 0) : this.playerInput();
    const eIn = this.ai!.input(f, 1);
    step(f, [pIn, eIn]);
    for (const ev of f.events) this.onEvent(ev);
    for (const s of [0, 1] as const) {
      const ft = f.fs[s];
      this.trail[s] = Math.max(ft.hp, this.trail[s] - (this.trail[s] > ft.hp && f.fs[s].st !== 'hit' ? 0.6 : 0));
      if (ft.combo >= 2) {
        this.comboShow[s] = ft.combo;
        this.comboT[s] = 70;
      }
    }
  }

  private onEvent(ev: Ev): void {
    const sy = GROUND - ev.y;
    switch (ev.k) {
      case 'hit': {
        const big = !!ev.big;
        this.burst(ev.x, sy, big ? 18 : 10, ev.counter ? '#ff5d8f' : '#ffd166', big ? 5 : 3.5);
        this.rings.push({ x: ev.x, y: sy, r: 4, max: big ? 46 : 28, color: '#fff', t: 0 });
        this.floats.push({ x: ev.x, y: sy - 16, text: String(ev.dmg), color: ev.side === 0 ? '#ef476f' : '#fff', t: 0, size: big ? 22 : 16 });
        this.shake = Math.max(this.shake, big ? 9 : 4);
        if (big) this.flashA = Math.max(this.flashA, 0.18);
        if (ev.counter) this.banner('COUNTER', '#ff5d8f', 40, 24, 120, ev.side);
        sfx.hit(big);
        if (ev.counter) sfx.counter();
        break;
      }
      case 'block':
        this.burst(ev.x, sy, 6, '#8ecae6', 2.5);
        this.rings.push({ x: ev.x, y: sy, r: 6, max: 20, color: '#8ecae6', t: 0 });
        sfx.block();
        break;
      case 'throw':
        this.burst(ev.x, sy, 16, '#fff', 4);
        this.floats.push({ x: ev.x, y: sy - 20, text: String(ev.dmg), color: '#ffd166', t: 0, size: 22 });
        this.shake = Math.max(this.shake, 12);
        this.banner('THROW', '#ffd166', 45, 26, 120);
        sfx.throw();
        break;
      case 'tech':
        this.burst(ev.x, sy, 10, '#8ecae6', 3);
        this.banner('TECH!', '#8ecae6', 45, 26, 120);
        sfx.tech();
        break;
      case 'parry':
        this.rings.push({ x: ev.x, y: sy, r: 8, max: 60, color: '#bde0fe', t: 0 });
        this.banner('PARRY!', '#bde0fe', 45, 28, 120);
        this.flashA = Math.max(this.flashA, 0.3);
        sfx.parry();
        break;
      case 'super':
        this.banner(`⚡ ${ev.text}`, ev.side === 0 ? '#ffd166' : '#ef476f', 60, 30, 110);
        this.rings.push({ x: ev.x, y: sy, r: 10, max: 120, color: '#ffd166', t: 0 });
        sfx.super();
        break;
      case 'special':
        if (ev.side === 0) this.floats.push({ x: ev.x, y: sy - 70, text: ev.text ?? '', color: '#bde0fe', t: 0, size: 12 });
        sfx.special();
        break;
      case 'proj':
        sfx.proj();
        break;
      case 'clash':
        this.burst(ev.x, sy, 14, '#fff', 4);
        sfx.clash();
        break;
      case 'whiff':
        sfx.whoosh();
        break;
      case 'jump':
        sfx.jump();
        break;
      case 'land':
        this.dust(ev.x, 4);
        break;
      case 'down':
        this.dust(ev.x, 12);
        this.shake = Math.max(this.shake, 5);
        sfx.down();
        break;
      case 'wind':
        this.floats.push({ x: ev.x, y: sy, text: '🌬️ Second Wind', color: '#7ee08a', t: 0, size: 14 });
        sfx.heal();
        break;
    }
  }

  private banner(text: string, color: string, max: number, size: number, y = 150, side?: 0 | 1): void {
    if (FAST && DEBUG) return;
    this.banners = this.banners.filter((b) => b.y !== y);
    this.banners.push({ text, color, t: 0, max, size, y: side === undefined ? y : y + (side === 0 ? 0 : 0) });
  }

  private burst(x: number, y: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0, max: 14 + Math.random() * 12, color, size: 1.5 + Math.random() * 2.5 });
    }
  }

  private dust(x: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.sparks.push({ x: x + (Math.random() - 0.5) * 30, y: GROUND - 2, vx: (Math.random() - 0.5) * 2.5, vy: -Math.random() * 1.2, life: 0, max: 20 + Math.random() * 14, color: 'rgba(220,200,170,0.7)', size: 3 + Math.random() * 3 });
    }
  }

  private updateFx(): void {
    for (const s of this.sparks) {
      s.life++;
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.15;
      s.vx *= 0.95;
    }
    this.sparks = this.sparks.filter((s) => s.life < s.max);
    if (this.sparks.length > 300) this.sparks.splice(0, this.sparks.length - 300);
    for (const r of this.rings) r.t++;
    this.rings = this.rings.filter((r) => r.t < 14);
    for (const fl of this.floats) fl.t++;
    this.floats = this.floats.filter((fl) => fl.t < 50);
    for (const b of this.banners) b.t++;
    this.banners = this.banners.filter((b) => b.t < b.max);
    this.shake *= 0.85;
    if (this.shake < 0.3) this.shake = 0;
    this.flashA *= 0.85;
    for (const s of [0, 1]) if (this.comboT[s] > 0) this.comboT[s]--;
  }

  // ---------- Drawing ----------

  private look(ft: Fighter): Look {
    return { gi: ft.gi, belt: ft.belt, skin: ft.def.skin, hair: ft.hair, size: ft.def.size };
  }

  private draw(): void {
    const c = this.ctx;
    const f = this.f;
    if (!c || !f || !this.canvas) return;
    c.setTransform(this.canvas.width / this.vw, 0, 0, this.canvas.height / H, 0, 0);
    const VW = this.vw;
    c.save();
    if (this.shake > 0) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    // Camera: zoom in when the fighters are close.
    const [a0, b0] = f.fs;
    const span = Math.abs(a0.x - b0.x);
    const air = Math.max(a0.y, b0.y);
    const want = Math.max(Math.min(VW, 440) + Math.min(120, air), Math.min(W, span + 300));
    this.camW += (want - this.camW) * 0.08;
    this.camX += ((a0.x + b0.x) / 2 - this.camX) * 0.12;
    const z = VW / this.camW;
    const cx = Math.max(this.camW / 2, Math.min(W - this.camW / 2, this.camX));
    c.translate(VW / 2, H);
    c.scale(z, z);
    c.translate(-cx, -H);
    if (z < 1) {
      c.fillStyle = STAGES[this.stageId].sky[0];
      c.fillRect(-20, H - H / z - 20, W + 40, H / z);
    }
    c.drawImage(stageCanvas(this.stageId), -10, -10, W + 20, H + 20);
    if (this.stageId === 'volcano') {
      c.fillStyle = 'rgba(255,120,40,0.7)';
      for (let i = 0; i < 12; i++) {
        const x = (i * 97 + this.tick60 * (0.3 + (i % 3) * 0.2)) % W;
        const y = GROUND - ((this.tick60 * (0.6 + (i % 4) * 0.3) + i * 53) % 260);
        c.fillRect(x, y, 2, 2);
      }
    }
    if (f.freeze > 0) {
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(-20, -400, W + 40, H + 440);
    }
    const [p, e] = f.fs;
    drawShadow(c, p);
    drawShadow(c, e);
    // The attacking fighter is drawn on top.
    const order = e.st === 'move' && p.st !== 'move' ? [p, e] : [e, p];
    for (const ft of order) {
      const white = ft.flash > 0 && ft.flash % 2 === 0;
      const aura = f.freeze > 0 && f.freezeSide === ft.side ? '#ffd166' : ft.meter >= 100 ? (ft.side === 0 ? 'rgba(255,209,102,0.5)' : 'rgba(239,71,111,0.45)') : ft.st === 'move' && ft.move?.parry ? '#bde0fe' : null;
      drawFighter(c, ft, this.look(ft), { white, aura, win: !!f.over && f.over.winner === ft.side && this.phase === 'ko' && this.phaseT < 100 });
      if (ft.st === 'thrown' && ft.side === 0) {
        c.fillStyle = '#fff';
        c.font = 'bold 18px system-ui';
        c.textAlign = 'center';
        c.fillText('BREAK! (T)', ft.x, GROUND - 130);
      }
    }
    for (const pr of f.projs) drawProj(c, pr, this.tick60);
    if (SHOW_BOXES) {
      for (const ft of f.fs) {
        c.strokeStyle = '#4cc9f0';
        for (const b of hurtboxes(ft)) c.strokeRect(b.x1, GROUND - b.y2, b.x2 - b.x1, b.y2 - b.y1);
        const hb = hitbox(ft);
        c.strokeStyle = '#ef476f';
        if (hb) c.strokeRect(hb.x1, GROUND - hb.y2, hb.x2 - hb.x1, hb.y2 - hb.y1);
      }
    }
    for (const r of this.rings) {
      const t = r.t / 14;
      c.strokeStyle = r.color;
      c.globalAlpha = 1 - t;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(r.x, r.y, r.r + (r.max - r.r) * t, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
    for (const s of this.sparks) {
      c.globalAlpha = 1 - s.life / s.max;
      c.fillStyle = s.color;
      c.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    for (const fl of this.floats) {
      c.globalAlpha = Math.min(1, 2 - fl.t / 25);
      c.font = `900 ${fl.size}px system-ui, sans-serif`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.strokeText(fl.text, fl.x, fl.y - fl.t * 0.8);
      c.fillStyle = fl.color;
      c.fillText(fl.text, fl.x, fl.y - fl.t * 0.8);
    }
    c.globalAlpha = 1;
    c.restore();
    if (this.flashA > 0.02) {
      c.fillStyle = `rgba(255,255,255,${this.flashA})`;
      c.fillRect(0, 0, VW, H);
    }
    this.drawHud(c, f);
  }

  private drawHud(c: CanvasRenderingContext2D, f: Fight): void {
    // Bigger HUD on small canvases.
    const k = this.hudK;
    const W = this.vw;
    const bw = W === 640 ? 236 : (W - 24 - 60) / 2;
    const bh = 16 * k;
    const bars: [number, number] = [12, W - 12 - bw];
    c.textBaseline = 'alphabetic';
    for (const s of [0, 1] as const) {
      const ft = f.fs[s];
      const x = bars[s];
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(x - 3, 9, bw + 6, bh + 6);
      const frac = Math.max(0, ft.hp / ft.maxHp);
      const tr = Math.max(0, this.trail[s] / ft.maxHp);
      const fill = (v: number, col: string | CanvasGradient): void => {
        c.fillStyle = col;
        const w = bw * v;
        c.fillRect(s === 0 ? x + bw - w : x, 12, w, bh);
      };
      fill(tr, '#ef476f');
      const g = c.createLinearGradient(0, 12, 0, 12 + bh);
      g.addColorStop(0, frac > 0.3 ? '#ffe066' : '#ff9f43');
      g.addColorStop(1, frac > 0.3 ? '#f4a300' : '#e85d04');
      fill(frac, g);
      c.font = `800 ${Math.round(14 * k)}px system-ui, sans-serif`;
      c.textAlign = s === 0 ? 'left' : 'right';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.fillStyle = '#fff';
      const label = `${ft.name}  ${Math.ceil(ft.hp)}`;
      const ly = 12 + bh + 16 * k;
      c.strokeText(label, s === 0 ? x : x + bw, ly);
      c.fillText(label, s === 0 ? x : x + bw, ly);
      // super meter
      const mw = 150 * Math.min(k, 1.3);
      const mh = 7 * k;
      const mx = s === 0 ? 12 : W - 12 - mw;
      const my = H - 10 - mh;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
      const full = ft.meter >= 100;
      c.fillStyle = full ? (this.tick60 % 20 < 10 ? '#ffd166' : '#fff') : '#4cc9f0';
      const mwf = (mw * ft.meter) / 100;
      c.fillRect(s === 0 ? mx : mx + mw - mwf, my, mwf, mh);
      c.font = `800 ${Math.round(11 * k)}px system-ui, sans-serif`;
      c.fillStyle = full ? '#ffd166' : '#cfe8ff';
      c.strokeText(full ? 'SUPER READY' : 'SUPER', s === 0 ? mx : mx + mw, my - 5);
      c.fillText(full ? 'SUPER READY' : 'SUPER', s === 0 ? mx : mx + mw, my - 5);
      // combo counter
      if (this.comboT[1 - s] > 0 && this.comboShow[1 - s] >= 2) {
        const n = this.comboShow[1 - s];
        c.font = `900 ${Math.round(24 * k)}px system-ui, sans-serif`;
        c.globalAlpha = Math.min(1, this.comboT[1 - s] / 20);
        c.lineWidth = 5;
        c.strokeText(`${n} HITS`, s === 0 ? 16 : W - 16, ly + 34 * k);
        c.fillStyle = '#ffd166';
        c.fillText(`${n} HITS`, s === 0 ? 16 : W - 16, ly + 34 * k);
        c.globalAlpha = 1;
      }
    }
    // timer
    const tr = 21 * Math.min(k, 1.3);
    c.fillStyle = 'rgba(0,0,0,0.75)';
    c.beginPath();
    c.arc(W / 2, 8 + tr, tr, 0, Math.PI * 2);
    c.fill();
    const secs = Math.max(0, Math.ceil(f.timer / 60));
    c.fillStyle = secs <= 10 ? '#ef476f' : '#fff';
    c.font = `900 ${Math.round(tr)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText(String(secs), W / 2, 8 + tr * 1.35);
    // banners
    for (const b of this.banners) {
      const t = b.t / b.max;
      const sc = b.t < 6 ? 1.6 - b.t * 0.1 : 1;
      c.save();
      c.globalAlpha = t > 0.8 ? (1 - t) * 5 : 1;
      c.translate(W / 2, b.y);
      c.scale(sc, sc);
      c.font = `900 ${b.size}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = 6;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(b.text, 0, 0);
      c.fillStyle = b.color;
      c.fillText(b.text, 0, 0);
      c.restore();
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
        const f = this.f;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          phase: this.screen === 'fight' ? this.phase : null,
          fighter: this.run?.fighter ?? null,
          rung: this.run?.rung ?? null,
          hp: this.run ? Math.ceil(this.run.hp) : null,
          maxHp: this.run?.maxHp ?? null,
          opp: this.run ? this.run.ladder[this.run.rung] ?? null : null,
          fight: f
            ? {
                frame: f.frame,
                timer: f.timer,
                p: `${f.fs[0].st} hp ${Math.ceil(f.fs[0].hp)} meter ${Math.round(f.fs[0].meter)}`,
                e: `${f.fs[1].st} hp ${Math.ceil(f.fs[1].hp)} meter ${Math.round(f.fs[1].meter)}`,
                over: f.over,
              }
            : null,
          techs: this.run ? { ...this.run.techs } : null,
          specials: this.run ? { ...this.run.specials } : null,
          offer: this.run?.offer ?? null,
          score: this.run?.score ?? this.end?.score ?? null,
          auto: this.auto,
          end: this.end ? { victory: this.end.victory, score: this.end.score, rung: this.end.rung, honor: this.end.honor } : null,
          meta: { ...this.meta },
        };
      },
      /** One bot action. In a fight it simulates up to `frames` frames (default 600) with the AI playing for you. */
      step: (frames = 600) => {
        if (this.modal) {
          click('.modal [data-act="modal-close"]');
          return 'modal';
        }
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="continue"]')) click('[data-act="new"]');
            return 'title';
          case 'select':
            click('[data-act="start"]');
            return 'select';
          case 'ladder':
            click('[data-act="fight"]');
            return 'ladder';
          case 'fight': {
            this.auto = true;
            for (let i = 0; i < frames && this.f && this.screen === 'fight'; i++) this.tick();
            if (this.screen === 'fight') this.draw();
            return 'fight';
          }
          case 'reward': {
            const offer = this.run?.offer ?? [];
            const rank = (p: Pick): number => (p.kind === 'special' ? (Object.keys(this.run!.specials).length < 4 ? 1.5 : 50) : BOT_PRIO.indexOf(p.id));
            const best = offer.slice().sort((a, b) => rank(a) - rank(b))[0];
            if (best) click(`[data-act="pick"][data-i="${offer.indexOf(best)}"]`);
            else click('[data-act="skip"]');
            return 'reward';
          }
          case 'end':
            return 'end';
        }
      },
      /** The bot plays for you in real time. */
      auto: (on = true) => {
        this.auto = on;
      },
      /** Win the current fight at once. */
      win: () => {
        if (!this.f) return;
        this.f.fs[1].hp = 0;
        this.f.fs[1].ko = true;
        this.f.over = { winner: 0, reason: 'ko' };
      },
      honor: (n: number) => {
        this.meta.honor += n;
        saveMeta(this.meta);
        this.render();
      },
      fast: FAST,
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
