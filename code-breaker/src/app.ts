/** Screens, input, rendering and the debug API. Game rules live in lock.ts and run.ts. */
import { botDoor, botGuess, botOffer, botShop, botTool, botTrapPay, GOOD } from './bot';
import { COLORS, FINAL, FLOORS, GEAR, MODS, ROOMS, STEPS_PER_FLOOR, TOOLS, UNLOCKS, type ModId, type ToolId } from './data';
import { candidates, currentCode, factPos, phaseOf, spaceSize, submitGuess, tickLock, toolBlock, toolCost, triesLeft, triesMax, triesUsed, type GuessRec, type Lock } from './lock';
import { randomSeedText, Rng } from './rng';
import {
  buy,
  chooseDoor,
  finishLock,
  isFinal,
  keysFor,
  leaveRoom,
  lockReward,
  newRun,
  pickOffer,
  resolveTrap,
  rewardText,
  rngOf,
  runTool,
  score,
  type Run,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'lock' | 'room' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

interface Meta {
  runs: number;
  wins: number;
  best: number;
  bestFloor: number;
  opened: number;
  keys: number;
  unlocks: string[];
  muted: boolean;
}

interface EndInfo {
  won: boolean;
  score: number;
  keys: number;
  floor: number;
  opened: number;
  failed: number;
  guesses: number;
  tools: number;
  seed: string;
}

const RUN_KEY = 'code-breaker.run';
const META_KEY = 'code-breaker.meta';
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has('debug');
/** `?debug&fast`: no animation waits and no clock on Timed locks. */
const FAST = PARAMS.has('fast');

function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, best: 0, bestFloor: 0, opened: 0, keys: 0, unlocks: [], muted: false };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!Array.isArray(m.unlocks)) m.unlocks = [];
    return m;
  } catch {
    return base;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked */
  }
}

function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    if (!r || typeof r.seed !== 'string' || !Array.isArray(r.doors) || r.phase === 'done') return null;
    return r;
  } catch {
    return null;
  }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function peg(c: number | null, cls = '', css = ''): string {
  if (c === null || c === undefined) return `<span class="peg empty ${cls}"></span>`;
  const p = COLORS[c];
  return `<span class="peg ${cls}" style="--c:${p.hex};--k:${p.ink};${css}" title="${p.name}">${p.sym}</span>`;
}

const hearts = (n: number, max: number): string => '❤️'.repeat(Math.max(0, n)) + '<span class="dim">🖤</span>'.repeat(Math.max(0, max - n));

function fbView(l: Lock, r: GuessRec, i: number, anim: boolean): string {
  const n = l.spec.len;
  if (r.hidden) return `<div class="fb hidden" title="Hidden hint">🙈 ?</div>`;
  let pins = '';
  for (let k = 0; k < n; k++) {
    const kind = k < r.ex ? 'ex' : k < r.ex + r.co ? 'co' : 'no';
    pins += `<i class="pin ${kind}" style="${anim ? `animation-delay:${0.15 + k * 0.08}s` : ''}"></i>`;
  }
  const lie = r.lie && l.detector ? '<span class="lie" title="Lie Detector: this hint is false">🚨</span>' : '';
  return `<div class="fb${lie ? ' liar' : ''}" title="${r.ex} right place, ${r.co} wrong place"><span class="pins p${n}">${pins}</span><span class="nums"><b>${r.ex}</b>● <b>${r.co}</b>○</span>${lie}${r.free ? '<span class="tag">free</span>' : ''}<span class="gi">#${i + 1}</span></div>`;
}

export class App {
  private r: Run | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private entry: (number | null)[] = [];
  private cur = 0;
  private busy = false;
  private animRow = -1;
  private end: EndInfo | null = null;
  private lastTick = Date.now();
  private botRng = new Rng(Date.now() & 0xffff);

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    if (this.meta.muted && !isMuted()) toggleMute();
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    setInterval(() => this.tick(), 200);
    this.render();
    if (DEBUG) this.installDebug();
  }

  // ---------- Persistence ----------

  private save(): void {
    if (this.r && this.r.phase !== 'done') store(RUN_KEY, JSON.stringify(this.r));
    else store(RUN_KEY, null);
  }

  private saveMeta(): void {
    store(META_KEY, JSON.stringify(this.meta));
  }

  // ---------- Flow ----------

  private startRun(): void {
    initAudio();
    this.r = newRun(randomSeedText(), { unlocks: this.meta.unlocks, bestFloor: this.meta.bestFloor });
    this.meta.bestFloor = Math.max(this.meta.bestFloor, 1);
    this.saveMeta();
    this.end = null;
    this.goToPhase();
    this.toast(`${FLOORS[0].icon} Floor 1: ${FLOORS[0].name}`);
  }

  private continueRun(): void {
    initAudio();
    if (!this.r) return;
    this.goToPhase();
  }

  /** Shows the screen that fits the run phase. */
  private goToPhase(): void {
    const r = this.r!;
    if (r.phase === 'done') {
      this.finishRun();
      return;
    }
    this.screen = r.phase;
    if (r.phase === 'lock') this.resetEntry();
    this.save();
    this.render();
  }

  private resetEntry(): void {
    const l = this.r?.lock;
    if (!l) return;
    this.entry = new Array(l.spec.len).fill(null);
    // Fill known pegs from Reveal so the player does not need to type them.
    for (const f of l.facts) if (f.yes) this.entry[factPos(l, f)] = f.color;
    this.cur = Math.max(0, this.entry.findIndex((v) => v === null));
  }

  private finishRun(): void {
    const r = this.r!;
    const s = score(r);
    const keys = keysFor(s);
    const m = this.meta;
    m.runs++;
    if (r.won) m.wins++;
    m.best = Math.max(m.best, s);
    m.bestFloor = Math.max(m.bestFloor, r.won ? 4 : r.floor + 1);
    m.opened += r.stats.opened;
    m.keys += keys;
    this.saveMeta();
    this.end = { won: r.won, score: s, keys, floor: r.floor, opened: r.stats.opened, failed: r.stats.failed, guesses: r.stats.guesses, tools: r.stats.tools, seed: r.seed };
    this.r = null;
    store(RUN_KEY, null);
    this.screen = 'end';
    this.modal = null;
    if (this.end.won) sfx.win();
    else sfx.lose();
    this.render();
  }

  private abandon(): void {
    if (!this.r) return;
    this.r.phase = 'done';
    this.finishRun();
  }

  // ---------- Lock actions ----------

  private setColor(c: number): void {
    const l = this.r?.lock;
    if (!l || l.state !== 'open' || this.busy) return;
    if (c >= l.spec.colors) return;
    if (l.removed.includes(c)) {
      sfx.deny();
      this.toast(`${COLORS[c].name} is not in the code.`);
      return;
    }
    this.entry[this.cur] = c;
    sfx.peg(c);
    const nextEmpty = this.entry.findIndex((v, i) => v === null && i > this.cur);
    const anyEmpty = this.entry.findIndex((v) => v === null);
    this.cur = nextEmpty >= 0 ? nextEmpty : anyEmpty >= 0 ? anyEmpty : Math.min(this.cur + 1, l.spec.len - 1);
    this.render();
  }

  private backspace(): void {
    const l = this.r?.lock;
    if (!l || l.state !== 'open' || this.busy) return;
    if (this.entry[this.cur] === null && this.cur > 0) this.cur--;
    this.entry[this.cur] = null;
    sfx.back();
    this.render();
  }

  private clearEntry(): void {
    if (!this.r?.lock || this.busy) return;
    this.entry = this.entry.map(() => null);
    this.cur = 0;
    sfx.back();
    this.render();
  }

  private moveCursor(d: number): void {
    const l = this.r?.lock;
    if (!l) return;
    this.cur = (this.cur + d + l.spec.len) % l.spec.len;
    this.render();
  }

  private submit(): void {
    const r = this.r;
    const l = r?.lock;
    if (!r || !l || l.state !== 'open' || this.busy) return;
    if (this.entry.some((v) => v === null)) {
      sfx.deny();
      this.toast('Fill every slot first.');
      return;
    }
    const before = phaseOf(l, l.guesses.length);
    const rec = submitGuess(l, this.entry as number[], rngOf(r, 'lie'));
    this.animRow = l.guesses.length - 1;
    sfx.submit();
    if (!rec.hidden) for (let i = 0; i < rec.ex + rec.co; i++) sfx.pin(i < rec.ex, i);
    if (!rec.hidden && rec.ex + rec.co === 0) sfx.miss();
    const st = l.state as Lock['state'];
    if (st === 'won') {
      setTimeout(() => sfx.open(), FAST ? 0 : 350);
    } else if (st === 'lost') {
      setTimeout(() => sfx.fail(), FAST ? 0 : 350);
    } else if (phaseOf(l, l.guesses.length) !== before) {
      sfx.shift();
      this.toast('🔄 The code turned one step to the right!');
    }
    this.resetEntry();
    if (st === 'open' && !l.facts.some((f) => f.yes)) {
      // Keep the last guess as a start for the next one.
      this.entry = rec.g.slice();
      this.cur = 0;
    }
    this.save();
    this.lockAnim(FAST ? 0 : 450);
  }

  private lockAnim(ms: number): void {
    if (ms <= 0) {
      this.render();
      this.animRow = -1;
      return;
    }
    this.busy = true;
    this.render();
    setTimeout(() => {
      this.busy = false;
      this.animRow = -1;
      this.render();
      const l = this.r?.lock;
      if (l && l.state === 'won') this.floatAt('.banner', `+${lockReward(this.r!, l)} ⚡`, 'gold');
    }, ms);
  }

  private tool(id: ToolId): void {
    const r = this.r;
    const l = r?.lock;
    if (!r || !l || this.busy) return;
    const cost = toolCost(l, id);
    const res = runTool(r, id, { pos: this.cur, color: this.entry[this.cur] ?? null });
    if (!res.ok) {
      sfx.deny();
      this.toast(res.msg);
      return;
    }
    sfx.tool();
    if (id === 'purge') {
      this.toast(`🧹 ${COLORS[res.color!].sym} ${COLORS[res.color!].name} is not in the code.`);
      this.entry = this.entry.map((v) => (v === res.color ? null : v));
    } else if (id === 'reveal') {
      this.toast(`🔍 Slot ${res.pos! + 1} is ${COLORS[res.color!].sym} ${COLORS[res.color!].name}.`);
      this.entry[res.pos!] = res.color!;
    } else if (id === 'probe') {
      this.toast(`🎯 Slot ${res.pos! + 1}: ${COLORS[res.color!].name} is ${res.msg === 'yes' ? 'RIGHT ✔' : 'wrong ✖'}.`);
    } else this.toast(`🎟️ ${res.msg}`);
    this.save();
    this.render();
    if (cost > 0) this.floatAt(`[data-tool="${id}"]`, `-${cost} ⚡`, 'blue');
    return;
    this.save();
    this.render();
  }

  /** Continue after the lock result banner. */
  private afterLock(): void {
    const r = this.r;
    const l = r?.lock;
    if (!r || !l || l.state === 'open' || this.busy) return;
    const won = l.state === 'won';
    const floorBefore = r.floor;
    const kind = l.spec.kind;
    finishLock(r);
    if (!won) {
      sfx.hurt();
      this.floatAt('.hearts', '-1 ❤️', 'red');
    } else sfx.coin();
    if (r.floor !== floorBefore) this.meta.bestFloor = Math.max(this.meta.bestFloor, r.floor + 1);
    if (r.phase === 'lock' && kind === 'final' && won) this.toast(`🏦 Tumbler ${r.tumbler + 1} of ${FINAL.length}`);
    if (r.phase === 'lock' && !won && kind !== 'door') this.toast('The vault resets with a new code. Try again!');
    if (r.phase === 'room' && r.room?.kind === 'trap') sfx.hurt();
    else if (r.phase === 'room') sfx.door();
    this.goToPhase();
  }

  // ---------- Room actions ----------

  private chooseDoor(i: number): void {
    const r = this.r;
    if (!r || r.phase !== 'map' || !r.doors[i]) return;
    chooseDoor(r, i);
    sfx.door();
    const mod = r.lock!.spec.mod;
    if (mod !== 'none') this.toast(`${MODS[mod].icon} ${MODS[mod].name}: ${MODS[mod].text}`);
    this.goToPhase();
  }

  private pick(i: number): void {
    const r = this.r;
    if (!r || r.phase !== 'room' || !r.room) return;
    const room = r.room;
    if (room.kind === 'shop') {
      const it = room.items[i];
      if (!it) return;
      if (buy(r, i)) {
        sfx.item();
        this.toast(`Bought ${rewardText(it.reward).name}.`);
        this.save();
        this.render();
      } else {
        sfx.deny();
        this.toast(it.sold ? 'Sold out.' : r.energy < it.price ? 'Not enough energy.' : 'Your hearts are full.');
      }
      return;
    }
    if (room.kind === 'trap') {
      resolveTrap(r, i === 0);
      if (i === 0 && (r.phase as string) !== 'done') sfx.coin();
      else sfx.hurt();
      this.goToPhase();
      return;
    }
    if (!room.offers[i]) return;
    const w = room.offers[i];
    const wasVault = room.kind === 'vault';
    pickOffer(r, i);
    if (w.kind === 'heal' || w.kind === 'maxheart') sfx.heal();
    else sfx.item();
    this.toast(`${rewardText(w).icon} ${rewardText(w).name}`);
    if (wasVault) {
      this.meta.bestFloor = Math.max(this.meta.bestFloor, r.floor + 1);
      this.saveMeta();
      if (isFinal(r)) this.toast('🏦 The final vault! Open 3 tumblers in a row.');
      else this.toast(`${FLOORS[r.floor].icon} Floor ${r.floor + 1}: ${FLOORS[r.floor].name}`);
    }
    this.goToPhase();
  }

  private leaveShop(): void {
    const r = this.r;
    if (!r || r.room?.kind !== 'shop') return;
    leaveRoom(r);
    sfx.door();
    this.goToPhase();
  }

  private buyUnlock(id: string): void {
    const u = UNLOCKS.find((x) => x.id === id);
    if (!u || this.meta.unlocks.includes(id)) return;
    if (this.meta.keys < u.cost) {
      sfx.deny();
      this.toast(`Needs ${u.cost} 🗝️.`);
      return;
    }
    initAudio();
    this.meta.keys -= u.cost;
    this.meta.unlocks.push(id);
    this.saveMeta();
    sfx.item();
    this.toast(`Unlocked ${u.name}.`);
    this.render();
  }

  // ---------- Timer ----------

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(500, now - this.lastTick);
    this.lastTick = now;
    const l = this.r?.lock;
    if (FAST || this.screen !== 'lock' || !l || l.spec.mod !== 'timed' || l.state !== 'open' || this.modal || document.hidden) return;
    const before = Math.ceil(l.timeLeft / 1000);
    if (tickLock(l, dt)) {
      sfx.fail();
      this.toast('⏱️ Time is up!');
      this.save();
      this.render();
      return;
    }
    const after = Math.ceil(l.timeLeft / 1000);
    if (after !== before && after <= 10) sfx.tick();
    const bar = this.root.querySelector<HTMLElement>('.timer i');
    const txt = this.root.querySelector<HTMLElement>('.timer b');
    if (bar) bar.style.width = `${(100 * l.timeLeft) / l.timeMax}%`;
    if (txt) txt.textContent = `${after}s`;
    if (after !== before && after % 5 === 0) this.save();
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el) return;
    if (el.classList.contains('modal') && t.closest('[data-stop]')) return;
    if (el.hasAttribute('disabled')) return;
    initAudio();
    const i = Number(el.dataset.i ?? 0);
    switch (el.dataset.act) {
      case 'new':
        this.startRun();
        break;
      case 'continue':
        this.continueRun();
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
      case 'abandon-ask':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon':
        this.modal = null;
        this.abandon();
        break;
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.render();
        break;
      case 'mute':
        this.meta.muted = toggleMute();
        this.saveMeta();
        this.render();
        break;
      case 'unlock':
        this.buyUnlock(el.dataset.id ?? '');
        break;
      case 'door':
        this.chooseDoor(i);
        break;
      case 'pick':
        this.pick(i);
        break;
      case 'leave':
        this.leaveShop();
        break;
      case 'color':
        this.setColor(i);
        break;
      case 'slot':
        if (this.busy) return;
        this.cur = i;
        this.render();
        break;
      case 'back':
        this.backspace();
        break;
      case 'clear':
        this.clearEntry();
        break;
      case 'guess':
        this.submit();
        break;
      case 'tool':
        this.tool(el.dataset.id as ToolId);
        break;
      case 'after-lock':
        this.afterLock();
        break;
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') {
      if (this.modal) this.modal = null;
      else if (this.r && this.screen !== 'title' && this.screen !== 'end') this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.modal) {
      if (k === 'Enter') {
        this.modal = null;
        this.render();
      }
      return;
    }
    initAudio();
    const num = /^[1-9]$/.test(k) ? Number(k) - 1 : -1;
    if (this.screen === 'title') {
      if (k === 'Enter') this.r ? this.continueRun() : this.startRun();
      return;
    }
    if (this.screen === 'end') {
      if (k === 'Enter') this.startRun();
      return;
    }
    if (this.screen === 'map') {
      if (num >= 0) this.chooseDoor(num);
      return;
    }
    if (this.screen === 'room') {
      if (num >= 0) this.pick(num);
      else if (k === 'Enter' || k === ' ') {
        if (this.r?.room?.kind === 'shop') this.leaveShop();
      }
      return;
    }
    if (this.screen !== 'lock') return;
    const l = this.r?.lock;
    if (!l) return;
    if (l.state !== 'open') {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        this.afterLock();
      }
      return;
    }
    if (num >= 0 && num < 8) return this.setColor(num);
    const ci = COLORS.findIndex((c) => c.key === k.toLowerCase());
    if (ci >= 0) return this.setColor(ci);
    const tool = TOOLS.find((t) => t.key === k.toLowerCase());
    if (tool && this.r!.tools.includes(tool.id)) return this.tool(tool.id);
    if (k === 'Backspace') return this.backspace();
    if (k === 'Delete') return this.clearEntry();
    if (k === 'ArrowLeft') return this.moveCursor(-1);
    if (k === 'ArrowRight') return this.moveCursor(1);
    if (k === 'Enter') {
      e.preventDefault();
      this.submit();
    }
  }

  // ---------- Rendering ----------

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private floatAt(sel: string, text: string, cls: string): void {
    if (FAST) return;
    const el = this.root.querySelector<HTMLElement>(sel);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = `float ${cls}`;
    f.textContent = text;
    f.style.left = `${rect.left + rect.width / 2}px`;
    f.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  private render(): void {
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'end') body = this.endView();
    else if (this.r) {
      if (this.screen === 'map') body = this.mapView();
      else if (this.screen === 'lock') body = this.lockView();
      else body = this.roomView();
    } else body = this.titleView();
    const top = this.r && this.screen !== 'title' && this.screen !== 'end' ? this.topView() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
  }

  private topView(): string {
    const r = this.r!;
    const where = isFinal(r) ? `🏦 Vault ${r.tumbler + 1}/${FINAL.length}` : `${FLOORS[r.floor].icon} Floor ${r.floor + 1}/${FLOORS.length + 1}`;
    const gear = r.gear.map((g) => `<span class="gear-ico" title="${esc(GEAR[g].name)}: ${esc(GEAR[g].text)}">${GEAR[g].icon}</span>`).join('');
    return `<header class="top">
      <span class="where">${where}</span>
      <span class="hearts" title="Hearts">${hearts(r.hearts, r.maxHearts)}</span>
      <span class="energy" title="Energy">⚡ <b>${r.energy}</b></span>
      <span class="gears">${gear}</span>
      <span class="grow"></span>
      <button class="icon" data-act="help" title="How to play">?</button>
      <button class="icon" data-act="mute" title="Mute">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const unlocks = UNLOCKS.map((u) => {
      const own = m.unlocks.includes(u.id);
      return `<div class="unlock ${own ? 'own' : ''}"><span class="ico">${u.icon}</span><div><b>${u.name}</b><small>${u.text}</small></div>${
        own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.keys < u.cost ? 'disabled' : ''}>${u.cost} 🗝️</button>`
      }</div>`;
    }).join('');
    const codex = (Object.keys(MODS) as ModId[])
      .filter((id) => id !== 'none')
      .map((id) => {
        const d = MODS[id];
        const open = d.needFloor <= m.bestFloor;
        return `<div class="codex ${open ? '' : 'locked'}"><span class="ico">${open ? d.icon : '🔒'}</span><div><b>${d.name}</b><small>${open ? d.text : `Reach floor ${d.needFloor} to find it.`}</small></div></div>`;
      })
      .join('');
    const demo = [0, 3, 4, 2].map((c) => peg(c)).join('');
    return `<div class="title">
      <div class="logo">🔐</div>
      <h1>Code Breaker</h1>
      <p class="sub">Crack the locks of a vault. Read the hints. Fewer guesses, more energy.</p>
      <div class="demo">${demo}</div>
      <div class="menu-btns">
        ${this.r ? `<button class="primary" data-act="continue">Continue run · floor ${Math.min(this.r.floor + 1, 4)}</button>` : ''}
        <button class="${this.r ? '' : 'primary'}" data-act="new">${this.r ? 'New run (drops the saved run)' : 'New run'}</button>
        <button data-act="help">How to play</button>
        <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
      </div>
      <div class="meta-grid">
        <section class="panel">
          <h3>Records</h3>
          <div class="stats">
            <span>Runs <b>${m.runs}</b></span><span>Wins <b>${m.wins}</b></span>
            <span>Best score <b>${m.best}</b></span><span>Best floor <b>${m.bestFloor >= 4 ? 'Vault' : m.bestFloor}</b></span>
            <span>Locks opened <b>${m.opened}</b></span><span>Keys <b>${m.keys} 🗝️</b></span>
          </div>
        </section>
        <section class="panel">
          <h3>Workshop <small>${m.keys} 🗝️</small></h3>
          <div class="unlocks">${unlocks}</div>
        </section>
        <section class="panel">
          <h3>Lock types</h3>
          <div class="unlocks">${codex}</div>
        </section>
      </div>
    </div>`;
  }

  private specLine(s: Lock['spec']): string {
    return `<span title="Code length">${'●'.repeat(s.len)}</span> · <span title="Colors">${s.colors} colors</span> · <span title="Repeated colors">${s.rep ? '🔁 repeats' : 'no repeats'}</span> · <span title="Tries">${s.limit} tries</span>`;
  }

  private mapView(): string {
    const r = this.r!;
    const f = FLOORS[r.floor];
    const steps = Array.from({ length: STEPS_PER_FLOOR + 1 }, (_, i) => `<span class="dot ${i < r.step ? 'done' : i === r.step ? 'now' : ''}">${i === STEPS_PER_FLOOR ? '🏦' : i + 1}</span>`).join('<i></i>');
    const doors = r.doors
      .map((d, i) => {
        const room = ROOMS[d.room];
        const mod = MODS[d.spec.mod];
        return `<button class="door ${d.room}" data-act="door" data-i="${i}">
          <span class="key">${i + 1}</span>
          <span class="room-ico">${room.icon}</span>
          <b>${room.name}</b>
          <small class="dim">${room.text}</small>
          <span class="lockinfo">${this.specLine(d.spec)}</span>
          <span class="mod ${d.spec.mod}" title="${esc(mod.text)}">${mod.icon} ${mod.name}${d.spec.mod !== 'none' ? `<small>${mod.text}</small>` : ''}</span>
          <small class="space">${spaceSize(d.spec).toLocaleString()} possible codes</small>
        </button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${f.icon} Floor ${r.floor + 1}: ${f.name}</h2>
      <div class="steps">${steps}</div>
      ${this.lastLine()}
      <p class="hint">${r.step >= STEPS_PER_FLOOR ? 'The floor vault blocks the stairs. You must open it.' : 'Pick a door. Each door has a lock. Open it to enter the room behind it.'}</p>
      <div class="doors">${doors}</div>
    </div>`;
  }

  private lastLine(): string {
    const l = this.r?.last;
    if (!l) return '';
    return l.won ? `<p class="last good">Last lock opened in ${l.tries} guesses: +${l.energy} ⚡</p>` : `<p class="last bad">Last lock failed: -1 ❤️</p>`;
  }

  private lockView(): string {
    const r = this.r!;
    const l = r.lock!;
    const n = l.spec.len;
    const mod = MODS[l.spec.mod];
    const kindName = l.spec.kind === 'door' ? `${ROOMS[r.door?.room ?? 'loot'].icon} Door lock` : l.spec.kind === 'vault' ? '🏦 Floor vault' : `🏦 Final vault · tumbler ${r.tumbler + 1}/${FINAL.length}`;
    const left = triesLeft(l);
    const rows: string[] = [];
    l.guesses.forEach((g, i) => {
      if (i === 3 && phaseOf(l, 3) === 1) rows.push(`<div class="shift-row">🔄 The code turned one step right</div>`);
      const anim = i === this.animRow;
      const pegs = g.g.map((c, k) => peg(c, anim ? 'pop' : '', anim ? `animation-delay:${k * 0.04}s` : '')).join('');
      rows.push(`<div class="row done ${anim ? 'new' : ''}"><div class="pegs">${pegs}</div>${fbView(l, g, i, anim)}</div>`);
    });
    if (l.state === 'open') {
      if (l.guesses.length === 3 && phaseOf(l, 3) === 1) rows.push(`<div class="shift-row">🔄 The code turned one step right</div>`);
      const known = new Map<number, number>();
      const nots = new Map<number, number[]>();
      for (const f of l.facts) {
        const p = factPos(l, f);
        if (f.yes) known.set(p, f.color);
        else nots.set(p, [...(nots.get(p) ?? []), f.color]);
      }
      const slots = this.entry
        .map((c, i) => {
          const hint = known.has(i) ? `<span class="fact yes" title="Known">${peg(known.get(i)!, 'mini')}</span>` : (nots.get(i) ?? []).map((x) => `<span class="fact no">${peg(x, 'mini')}</span>`).join('');
          return `<button class="slot ${i === this.cur ? 'sel' : ''}" data-act="slot" data-i="${i}" aria-label="Slot ${i + 1}">${peg(c)}<span class="facts">${hint}</span></button>`;
        })
        .join('');
      rows.push(`<div class="row current"><div class="pegs">${slots}</div><div class="fb now">${l.freeNext ? '🎟️ free' : `${left} left`}</div></div>`);
      for (let i = 1; i < Math.min(left, 3); i++) rows.push(`<div class="row ghost"><div class="pegs">${'<span class="peg empty"></span>'.repeat(n)}</div><div class="fb"></div></div>`);
    }
    const palette = COLORS.slice(0, l.spec.colors)
      .map((c, i) => {
        const gone = l.removed.includes(i);
        return `<button class="pal ${gone ? 'gone' : ''}" data-act="color" data-i="${i}" ${gone ? 'disabled' : ''} title="${c.name} (${i + 1} or ${c.key.toUpperCase()})">${peg(i)}<small>${i + 1}·${c.key.toUpperCase()}</small></button>`;
      })
      .join('');
    const tools = r.tools
      .map((id) => {
        const t = TOOLS.find((x) => x.id === id)!;
        const cost = toolCost(l, id);
        const block = toolBlock(l, id, { pos: this.cur, color: this.entry[this.cur] ?? null });
        const off = !!block || r.energy < cost || l.state !== 'open';
        return `<button class="tool ${off ? 'off' : ''}" data-act="tool" data-id="${id}" data-tool="${id}" title="${esc(t.text)}${block ? ' — ' + esc(block) : ''}"><span>${t.icon}</span><b>${t.name}</b><small>${cost}⚡ · ${t.key.toUpperCase()}</small></button>`;
      })
      .join('');
    const lens = r.lens && l.state === 'open' ? `<span class="lens" title="Solver Lens: codes that still fit every hint">🧮 ${candidates(l).length.toLocaleString()} codes left</span>` : '';
    const timer =
      l.spec.mod === 'timed' ? `<div class="timer"><i style="width:${(100 * l.timeLeft) / Math.max(1, l.timeMax)}%"></i><b>${Math.ceil(l.timeLeft / 1000)}s</b></div>` : '';
    const banner = l.state !== 'open' && !this.busy ? this.bannerView(l) : '';
    return `<div class="lock ${l.state} ${this.busy ? 'busy' : ''}">
      <div class="lock-head">
        <div><b>${kindName}</b> <span class="mod ${l.spec.mod}" title="${esc(mod.text)}">${mod.icon} ${mod.name}</span></div>
        <div class="lock-sub">${this.specLine(l.spec)} ${lens}</div>
        <div class="lock-rule">${l.spec.mod !== 'none' ? `${mod.icon} ${mod.text}` : ''}</div>
        <div class="tries">Tries <b>${triesUsed(l)}</b> / ${triesMax(l)}</div>
        ${timer}
      </div>
      <div class="board">${rows.join('')}</div>
      ${banner}
      ${
        l.state === 'open'
          ? `<div class="palette c${l.spec.colors}">${palette}</div>
      <div class="actions">
        <button data-act="back" title="Backspace">⌫</button>
        <button data-act="clear" title="Delete">Clear</button>
        <button class="primary" data-act="guess" title="Enter" ${this.entry.some((v) => v === null) ? 'disabled' : ''}>Guess ⏎</button>
      </div>
      <div class="tools">${tools}</div>`
          : ''
      }
    </div>`;
  }

  private bannerView(l: Lock): string {
    const r = this.r!;
    const code = currentCode(l)
      .map((c) => peg(c))
      .join('');
    if (l.state === 'won') {
      return `<div class="banner win"><h2>🔓 Unlocked!</h2><p>Opened in ${l.guesses.length} guesses · <b class="gold">+${lockReward(r, l)} ⚡</b></p><button class="primary" data-act="after-lock">Continue ⏎</button></div>`;
    }
    const vault = l.spec.kind !== 'door';
    return `<div class="banner lose"><h2>🔒 The lock jammed</h2><p>The code was</p><div class="pegs">${code}</div><p><b class="bad">-1 ❤️</b> ${vault ? 'The vault resets with a new code.' : 'You lose the room behind this door.'}</p><button class="primary" data-act="after-lock">Continue ⏎</button></div>`;
  }

  private roomView(): string {
    const r = this.r!;
    const room = r.room!;
    const card = (i: number, icon: string, name: string, text: string, extra = '', off = false) =>
      `<button class="card ${off ? 'off' : ''}" data-act="pick" data-i="${i}"><span class="key">${i + 1}</span><span class="ico">${icon}</span><b>${esc(name)}</b><small>${esc(text)}</small>${extra}</button>`;
    if (room.kind === 'trap') {
      return `<div class="room trap"><div class="room-ico shake">⚠️</div><h2>A trap!</h2><p>The floor clicks under your feet. Darts fly from the walls.</p>
        <div class="cards">${card(0, '🧰', `Disarm it`, `Pay ${room.cost} energy.`, '', r.energy < room.cost)}${card(1, '💥', 'Take the hit', 'Lose 1 heart.')}</div>
        ${r.energy < room.cost ? '<p class="hint">You do not have enough energy to disarm it.</p>' : ''}</div>`;
    }
    if (room.kind === 'shop') {
      const items = room.items
        .map((it, i) => {
          const t = rewardText(it.reward);
          const off = it.sold || r.energy < it.price || (it.reward.kind === 'heal' && r.hearts >= r.maxHearts);
          return card(i, t.icon, t.name, t.text, `<span class="price">${it.sold ? 'Sold' : `${it.price} ⚡`}</span>`, off);
        })
        .join('');
      return `<div class="room shop"><div class="room-ico">🛒</div><h2>Shop</h2><p>You have <b>${r.energy} ⚡</b>. Buy as much as you like.</p><div class="cards">${items}</div><button class="primary" data-act="leave">Leave ⏎</button></div>`;
    }
    const isVault = room.kind === 'vault';
    const offers = room.offers
      .map((w, i) => {
        const t = rewardText(w);
        return card(i, t.icon, t.name, t.text);
      })
      .join('');
    const head = isVault
      ? `<div class="room-ico">🏦</div><h2>Floor vault opened</h2><p>Take one piece of gear.</p>`
      : room.rich
        ? `<div class="room-ico">💎</div><h2>A hidden treasure!</h2><p>The mystery room was a treasure room. Pick one.</p>`
        : `<div class="room-ico">💰</div><h2>Loot room</h2><p>Pick one reward.</p>`;
    return `<div class="room loot">${head}<div class="cards">${offers}</div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end ${e.won ? 'win' : 'lose'}">
      <div class="logo">${e.won ? '🏆' : '🚨'}</div>
      <h1>${e.won ? 'The vault is yours!' : 'Caught in the vault'}</h1>
      <p class="sub">${e.won ? 'You opened every lock to the final vault.' : `You fell on ${e.floor >= FLOORS.length ? 'the final vault' : `floor ${e.floor + 1}`}.`}</p>
      <div class="score">Score <b>${e.score}</b></div>
      <div class="stats">
        <span>Locks opened <b>${e.opened}</b></span><span>Locks failed <b>${e.failed}</b></span>
        <span>Guesses <b>${e.guesses}</b></span><span>Tools used <b>${e.tools}</b></span>
        <span>Keys earned <b>+${e.keys} 🗝️</b></span><span>Seed <b>${e.seed}</b></span>
      </div>
      <div class="menu-btns"><button class="primary" data-act="new">New run ⏎</button><button data-act="title">Title</button></div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const colors = COLORS.map((c, i) => `<span class="legend">${peg(i)} ${c.name} <kbd>${i + 1}</kbd>/<kbd>${c.key.toUpperCase()}</kbd></span>`).join('');
      const tools = TOOLS.map((t) => `<li>${t.icon} <b>${t.name}</b> (${t.cost}⚡, <kbd>${t.key.toUpperCase()}</kbd>): ${t.text}${t.unlock ? ' <i>Workshop unlock.</i>' : ''}</li>`).join('');
      const mods = (Object.keys(MODS) as ModId[])
        .filter((id) => id !== 'none')
        .map((id) => `<li>${MODS[id].icon} <b>${MODS[id].name}</b>: ${MODS[id].text}</li>`)
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <p>Each lock hides a code of colored pegs. Guess the code. After each guess the lock gives a hint:</p>
        <p><i class="pin ex"></i> <b>●</b> = a peg with the right color in the right place. <i class="pin co"></i> <b>○</b> = a right color in the wrong place.</p>
        <p>Open the lock before you run out of tries. Each try you keep gives energy ⚡. A failed lock costs a heart ❤️. With no hearts left, the run ends.</p>
        <h3>Controls</h3>
        <p>Click a color or press its key. Click a slot or use <kbd>←</kbd> <kbd>→</kbd> to pick a slot. <kbd>⌫</kbd> deletes, <kbd>Enter</kbd> guesses. <kbd>Esc</kbd> opens the menu. Every color also has a symbol.</p>
        <div class="legends">${colors}</div>
        <h3>Tools</h3><ul>${tools}</ul>
        <h3>Special locks</h3><ul>${mods}</ul>
        <h3>The vault</h3>
        <p>Each floor has 3 doors to pick, then a floor vault. The room behind a door is loot 💰, a shop 🛒 or a mystery ❓ (treasure or a trap). After floor 3 comes the final vault: 3 tumblers in a row. Failed vaults reset with a new code.</p>
        <p>Each run gives keys 🗝️. Spend them in the Workshop for new tools and helpers.</p>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.confirm) {
      return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop><h2>Abandon this run?</h2><p>The run ends now and counts as a loss.</p>
        <div class="menu-btns"><button class="danger" data-act="abandon">Abandon</button><button data-act="modal-close">Cancel</button></div></div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet small" data-stop><h2>Menu</h2>
      <div class="menu-btns col">
        <button class="primary" data-act="modal-close">Resume</button>
        <button data-act="help">How to play</button>
        <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
        <button data-act="title">Title screen (keeps the run)</button>
        <button class="danger" data-act="abandon-ask">Abandon run</button>
      </div></div></div>`;
  }

  // ---------- Debug API ----------

  private installDebug(): void {
    const api = {
      state: () => {
        const r = this.r;
        const l = r?.lock;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          busy: this.busy,
          phase: r?.phase ?? null,
          floor: r?.floor ?? null,
          step: r?.step ?? null,
          tumbler: r?.tumbler ?? null,
          hearts: r?.hearts ?? null,
          energy: r?.energy ?? null,
          gear: r?.gear ?? [],
          lock: l
            ? { spec: l.spec, state: l.state, guesses: l.guesses.length, triesLeft: triesLeft(l), possible: candidates(l).length, entry: this.entry.slice() }
            : null,
          room: r?.room?.kind ?? null,
          end: this.end,
          meta: this.meta,
        };
      },
      /** The secret code of the open lock, in the current turn. */
      code: () => (this.r?.lock ? currentCode(this.r.lock) : null),
      energy: (n: number) => {
        if (this.r) this.r.energy += n;
        this.render();
      },
      keys: (n: number) => {
        this.meta.keys += n;
        this.saveMeta();
        this.render();
      },
      step: (): string => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.screen === 'title') {
          if (this.r) this.continueRun();
          else this.startRun();
          return 'start';
        }
        if (this.screen === 'end') return 'end';
        const r = this.r!;
        const rng = this.botRng;
        if (this.screen === 'map') {
          this.chooseDoor(botDoor(r, rng, GOOD));
          return 'door';
        }
        if (this.screen === 'room') {
          const room = r.room!;
          if (room.kind === 'shop') {
            botShop(r, GOOD);
            this.leaveShop();
            return 'shop';
          }
          if (room.kind === 'trap') {
            this.pick(botTrapPay(r, GOOD) && r.energy >= room.cost ? 0 : 1);
            return 'trap';
          }
          this.pick(botOffer(r, rng, GOOD));
          return 'pick';
        }
        const l = r.lock!;
        if (l.state !== 'open') {
          this.afterLock();
          return 'continue';
        }
        const t = botTool(r, GOOD);
        if (t && runTool(r, t).ok) {
          this.resetEntry();
          this.save();
          this.render();
          return `tool:${t}`;
        }
        this.entry = botGuess(l, rng, GOOD);
        this.submit();
        return 'guess';
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
