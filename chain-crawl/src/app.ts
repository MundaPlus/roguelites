import { bestPath, pickChoice, pickSkill, threat } from './bot';
import {
  CLASSES,
  COLS,
  ENEMIES,
  GOAL_FLOOR,
  ROWS,
  SKILLS,
  SLOTS,
  SLOT_ICON,
  STAT_ICON,
  STAT_LABEL,
  TILE_ICON,
  type Stats,
} from './data';
import {
  choose,
  clearRun,
  enemies,
  enemyPhase,
  finishRun,
  foeDef,
  isBossFloor,
  itemValue,
  killsNeeded,
  loadMeta,
  loadRun,
  newRun,
  preview,
  rc,
  refill,
  resolveChain,
  saveMeta,
  saveRun,
  settle,
  skillCd,
  stats,
  upDef,
  useSkill,
  validStep,
  type Choice,
  type Ev,
  type Item,
  type Run,
  type Tile,
} from './game';
import { Rng, randomSeedText } from './rng';
import { initAudio, isMuted, setMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'play' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips the animation waits, for bot tests. */
const FAST = PARAMS.has('fast');

const CELL = 100 / COLS;
const OFFER_TITLE = { level: '⭐ Level up!', shop: '🪙 Shop', forge: '🛡️ Forge' } as const;
const OFFER_SUB = {
  level: 'Your XP bar is full. Pick one upgrade.',
  shop: 'Your coin bar is full. Pick one piece of gear. It replaces the gear in that slot.',
  forge: 'Your shield bar is full. Pick one armor upgrade.',
} as const;

function statLine(k: keyof Stats, v: number): string {
  if (k === 'cdr') return `${STAT_ICON[k]} −${v} skill cooldown`;
  return `${STAT_ICON[k]} +${v} ${STAT_LABEL[k].toLowerCase()}`;
}

const itemText = (it: Item): string =>
  (Object.keys(it.stats) as (keyof Stats)[]).map((k) => statLine(k, it.stats[k]!)).join('<br>');

function bar(cls: string, label: string, v: number, max: number): string {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return `<div class="bar ${cls}"><div class="fill" style="width:${pct}%"></div><span>${label} ${v}/${max}</span></div>`;
}

const wait = (ms: number): Promise<void> => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

export class App {
  private run: Run | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private cls = 'warrior';
  private path: number[] = [];
  private dragging = false;
  private cursor = -1;
  private busy = false;
  private tileEls = new Map<number, HTMLElement>();
  private end: { win: boolean; score: number; gems: number; run: Run; newUnlock: boolean } | null = null;
  private botRng = new Rng(1234);

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMuted(this.meta.muted);
    this.cls = this.meta.unlocked.find((c) => CLASSES[c]) ?? 'warrior';
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
    window.addEventListener('pointercancel', () => this.onUp());
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'play') body = this.playView();
    else body = this.endView();
    this.root.innerHTML = `<main class="screen s-${this.screen}">${body}</main>${this.modalView()}`;
    this.tileEls.clear();
    if (this.screen === 'play') this.syncBoard(false);
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private titleView(): string {
    const m = this.meta;
    const classes = Object.values(CLASSES)
      .map((c) => {
        const own = m.unlocked.includes(c.id);
        const sel = own && this.cls === c.id;
        const skills = c.skills.map((s) => `${SKILLS[s].icon} ${SKILLS[s].name}`).join(' · ');
        const act = own
          ? `<button class="${sel ? 'primary' : ''}" data-act="cls" data-id="${c.id}">${sel ? '✔ Chosen' : 'Choose'}</button>`
          : `<button data-act="unlock" data-id="${c.id}" ${m.gems >= c.cost ? '' : 'disabled'}>💎 ${c.cost}</button>`;
        return `<div class="cls ${sel ? 'sel' : ''} ${own ? '' : 'locked'}"><span class="big">${c.icon}</span><span><b>${c.name}</b><small>${c.text}</small><small class="dim">${skills}</small></span>${act}</div>`;
      })
      .join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>⛓️</span> Chain Crawl</h1>
      <p class="sub">Drag chains of matching tiles. Swords cut down monsters, shields fix armor, potions heal, coins buy gear. Reach floor ${GOAL_FLOOR} and slay the dragon.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue (${CLASSES[r.hero.cls].icon} floor ${r.floor}, ❤️ ${r.hero.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? `New run as ${CLASSES[this.cls].name} (abandons the current one)` : `▶ New run as ${CLASSES[this.cls].name}`}</button>
      <div class="row"><button data-act="help">How to play</button><button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button></div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.best} · Kills ${m.kills}</p>
      <h2>Classes <small>💎 ${m.gems} gems</small></h2>
      <p class="sub">Each run gives gems. Unlock new classes with other skills.</p>
      <div class="classes">${classes}</div>
    </div>`;
  }

  private playView(): string {
    return `<header class="top" id="hud">${this.hudView()}</header>
      <div class="play">
        <div class="col-main">
          <div class="bars" id="bars">${this.barsView()}</div>
          <div class="board-wrap"><div class="board" id="board"><svg class="trail" viewBox="0 0 ${COLS} ${ROWS}"><polyline id="trail" points=""/></svg><div class="fx" id="fx"></div></div></div>
          <div class="info" id="info">${this.infoView()}</div>
          <div class="skills" id="skills">${this.skillsView()}</div>
        </div>
        <aside class="side" id="side">${this.sideView()}</aside>
      </div>
      ${this.offerView()}`;
  }

  private hudView(): string {
    const r = this.run!;
    const h = r.hero;
    const s = stats(h);
    const boss = isBossFloor(r.floor);
    const prog = boss ? '<b class="foe">BOSS</b>' : `☠️ ${r.floorKills}/${killsNeeded(r.floor)}`;
    return `<span class="hpv" title="Health">❤️ <b>${Math.max(0, h.hp)}</b>/${s.maxHp}</span>
      <span title="Armor">🛡️ <b>${h.armor}</b>/${s.maxArmor}</span>
      ${h.poison > 0 ? `<span class="poison" title="Poison: 1 damage per turn">🤢 ${h.poison}</span>` : ''}
      <span title="Floor">🏚️ ${r.floor}/${GOAL_FLOOR}</span>
      <span title="Kills on this floor">${prog}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>`;
  }

  private barsView(): string {
    const r = this.run!;
    return `${bar('xp', `⭐ Lv ${r.hero.level}`, r.xp, r.xpNeed)}${bar('coin', '🪙', r.coins, r.coinNeed)}${bar('forge', '🛡️', r.shields, r.shieldNeed)}`;
  }

  private infoView(): string {
    const r = this.run!;
    if (this.path.length) {
      const p = preview(r, this.path)!;
      const n = this.path.length;
      const ok = n >= 3 ? '' : ' <span class="dim">(3+ to clear)</span>';
      if (p.group === 'attack') {
        const foes = this.path.filter((i) => r.grid[i]?.e).length;
        return `⛓️ ${n} · ⚔️ <b>${p.dmg}</b> damage to ${foes} ${foes === 1 ? 'enemy' : 'enemies'}${p.kills ? ` · <b class="good">${p.kills} kill${p.kills > 1 ? 's' : ''}</b>` : ''}${ok}`;
      }
      const s = stats(r.hero);
      if (p.group === 'shield') {
        const armor = Math.min(p.gain, s.maxArmor - r.hero.armor);
        const forge = Math.ceil((p.gain - armor) / s.shieldRepair);
        return `⛓️ ${n} · <b>+${armor}</b> 🛡️ armor${forge ? ` · <b>+${forge}</b> forge` : ''}${ok}`;
      }
      if (p.group === 'potion') return `⛓️ ${n} · <b>+${Math.min(p.gain, s.maxHp - r.hero.hp)}</b> ❤️ heal${ok}`;
      return `⛓️ ${n} · <b>+${p.gain}</b> 🪙 coins${ok}`;
    }
    const th = threat(r);
    const fresh = enemies(r).filter((t) => t.e!.fresh).length;
    return `Enemies hit for about <b class="${th > r.hero.armor ? 'bad' : ''}">${th}</b> after your move${fresh ? ` · 💤 ${fresh} new` : ''}${r.frozen ? ' · ❄️ frozen' : ''}`;
  }

  private skillsView(): string {
    const r = this.run!;
    const h = r.hero;
    return CLASSES[h.cls].skills
      .map((id, i) => {
        const d = SKILLS[id];
        const cd = h.cds[i];
        return `<button class="skill ${cd ? 'cool' : 'ready'}" data-act="skill" data-i="${i}" ${cd || this.busy ? 'disabled' : ''} title="${d.text} Cooldown ${skillCd(r, id)}.">
          <span class="big">${d.icon}</span><span><b>${d.name}</b><small>${cd ? `⏳ ${cd} turns` : `Ready · key ${i + 1}`}</small></span></button>`;
      })
      .join('');
  }

  private sideView(): string {
    const r = this.run!;
    const h = r.hero;
    const s = stats(h);
    const keys: (keyof Stats)[] = ['baseDmg', 'swordDmg', 'pierce', 'block', 'spikes', 'shieldRepair', 'potionHeal', 'coinValue', 'xpBonus'];
    const st = keys.map((k) => `<span title="${STAT_LABEL[k]}">${STAT_ICON[k]} ${STAT_LABEL[k]} <b>${s[k]}</b></span>`).join('');
    const gear = SLOTS.map((sl) => {
      const it = h.gear[sl];
      return `<div class="gear"><span>${it ? it.icon : SLOT_ICON[sl]}</span><span>${it ? `<b>${it.name}</b><small>${itemText(it)}</small>` : `<small class="dim">No ${sl}</small>`}</span></div>`;
    }).join('');
    const seen = new Set<string>();
    const foes = enemies(r)
      .map((t) => t.e!)
      .filter((f) => !seen.has(f.t) && seen.add(f.t))
      .map((f) => {
        const d = foeDef(f);
        return `<p><span>${d.icon}</span> <b>${d.name}</b> ⚔️${f.atk}${f.armor ? ` 🛡️${f.armor}` : ''} <small>${d.text}</small></p>`;
      })
      .join('');
    return `<h3>${CLASSES[h.cls].icon} ${CLASSES[h.cls].name} · Lv ${h.level}</h3>
      <div class="stat-grid">${st}</div>
      <h3>Gear</h3>${gear}
      <h3>On the board</h3><div class="einfo">${foes || '<p class="dim">No enemies.</p>'}</div>`;
  }

  private choiceCard(c: Choice, i: number): string {
    if (c.kind === 'up') {
      const u = upDef(c.id);
      const n = this.run!.hero.ups[c.id] ?? 0;
      return `<button class="pick" data-act="choose" data-i="${i}"><span class="big">${u.icon}</span><b>${u.name}${n ? ` ${n + 1}` : ''}</b><small>${u.text}</small><small class="key">key ${i + 1}</small></button>`;
    }
    const it = c.item;
    const cur = this.run!.hero.gear[it.slot];
    const better = itemValue(it) > itemValue(cur);
    return `<button class="pick" data-act="choose" data-i="${i}"><span class="big">${it.icon}</span><b>${it.name}</b><small class="dim">${SLOT_ICON[it.slot]} ${it.slot}</small><small>${itemText(it)}</small>
      <small class="${better ? 'good' : 'dim'}">${cur ? `replaces ${cur.name}` : 'empty slot'}</small><small class="key">key ${i + 1}</small></button>`;
  }

  private offerView(): string {
    const o = this.run?.offer;
    if (!o || this.busy) return '';
    const cards = o.opts.map((c, i) => this.choiceCard(c, i)).join('');
    const skip = o.kind === 'shop' ? `<button data-act="choose" data-i="-1">Leave: heal 20% (key 0)</button>` : '';
    return `<div class="modal offer"><div class="sheet"><h2>${OFFER_TITLE[o.kind]}</h2><p class="sub">${OFFER_SUB[o.kind]}</p><div class="picks">${cards}</div>${skip}</div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    const r = e.run;
    return `<div class="end">
      <div class="huge">${e.win ? '🏆' : '💀'}</div>
      <h1 class="${e.win ? '' : 'lost'}">${e.win ? 'Victory!' : 'Defeat'}</h1>
      <p class="sub">${e.win ? 'The Ember Dragon falls. You climb out of the dungeon with its hoard.' : `You fell on floor ${r.floor}.`}</p>
      <p class="score">Score <b>${e.score}</b> · 💎 +${e.gems} gems</p>
      <div class="stat-grid end-stats">
        <span>🏚️ Floor <b>${r.floor}</b></span><span>☠️ Kills <b>${r.kills}</b></span><span>⭐ Level <b>${r.hero.level}</b></span>
        <span>🔁 Turns <b>${r.turn}</b></span><span>⛓️ Longest chain <b>${r.biggest}</b></span><span>💔 Damage taken <b>${r.dmgTaken}</b></span>
      </div>
      ${e.newUnlock ? '<p class="good">You can afford a new class on the title screen.</p>' : ''}
      <div class="row"><button class="primary" data-act="new">▶ New run</button><button data-act="title">Title screen</button></div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal;
    if (!m) return '';
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Drag</b> a path through <b>3 or more</b> matching tiles. Paths go in all 8 directions and may not cross the same tile twice. Drag back one step to undo it.</li>
          <li><b>⚔️ Swords and enemies chain together.</b> Every enemy in the chain takes your base damage plus your damage per sword in the chain.</li>
          <li><b>🛡️ Shields</b> repair armor. Extra shields fill the forge bar. <b>🧪 Potions</b> heal. <b>🪙 Coins</b> fill the shop bar.</li>
          <li>Tiles fall down and new tiles drop in from the top.</li>
          <li><b>After each move, every enemy attacks.</b> Armor takes the damage first. Enemies with 💤 just arrived and wait one turn. The numbers on an enemy are its HP (red) and attack (orange).</li>
          <li>Full bars give rewards: ⭐ XP → level-up choice, 🪙 coins → gear shop, 🛡️ shields → forge upgrade.</li>
          <li>Kill enemies to go down. Every 5th floor holds a <b>boss</b>. Beat the dragon on floor ${GOAL_FLOOR} to win.</li>
          <li><b>Skills</b> do not use a turn. They recharge over turns.</li>
          <li><b>Keys:</b> arrows move the cursor, <kbd>Space</kbd> adds a tile (press it on the last tile to clear the chain), <kbd>Backspace</kbd> undoes, <kbd>Esc</kbd> cancels, <kbd>1</kbd> <kbd>2</kbd> use skills.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  /** Update the parts around the board without rebuilding it. */
  private refresh(): void {
    if (this.screen !== 'play') return this.render();
    const set = (id: string, html: string): void => {
      const el = this.root.querySelector<HTMLElement>(`#${id}`);
      if (el) el.innerHTML = html;
    };
    set('hud', this.hudView());
    set('bars', this.barsView());
    set('info', this.infoView());
    set('skills', this.skillsView());
    set('side', this.sideView());
    const old = this.root.querySelector('.modal.offer');
    const offer = this.offerView();
    if (old) old.remove();
    if (offer) this.root.querySelector('main')!.insertAdjacentHTML('beforeend', offer);
  }

  // ---------- Board ----------

  private tileHtml(t: Tile): string {
    if (!t.e) return `<span class="ico">${TILE_ICON[t.k as Exclude<typeof t.k, 'enemy'>]}</span>`;
    const f = t.e;
    const d = foeDef(f);
    const timer = d.special === 'explode' || d.special === 'spawn' || d.special === 'breath' ? `<i class="timer" title="Turns left">${f.timer}</i>` : '';
    return `<span class="ico">${d.icon}</span>${f.fresh ? '<i class="zz">💤</i>' : timer}${f.armor ? `<i class="arm">${f.armor}</i>` : ''}<i class="ehp">${f.hp}</i><i class="eatk">${f.atk}</i>${d.boss ? `<i class="bhp" style="width:${(f.hp / f.max) * 100}%"></i>` : ''}`;
  }

  /** Make the tile elements match the grid. New tiles fall in from above the board. */
  private syncBoard(animate: boolean): void {
    const board = this.root.querySelector<HTMLElement>('#board');
    if (!board || !this.run) return;
    const grid = this.run.grid;
    const alive = new Set<number>();
    const newPerCol = new Array<number>(COLS).fill(0);
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (t && !this.tileEls.has(t.id)) newPerCol[i % COLS]++;
    }
    const entering: HTMLElement[] = [];
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (!t) continue;
      alive.add(t.id);
      const [r, c] = rc(i);
      let el = this.tileEls.get(t.id);
      const cls = `tile k-${t.k}${t.e && foeDef(t.e).boss ? ' boss' : ''}${t.e?.fresh ? ' fresh' : ''}`;
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = String(t.id);
        el.className = cls;
        el.style.left = `${c * CELL}%`;
        el.style.top = animate ? `${(r - newPerCol[c]) * CELL}%` : `${r * CELL}%`;
        board.insertBefore(el, board.querySelector('.trail'));
        this.tileEls.set(t.id, el);
        if (animate) entering.push(el);
      }
      el.className = cls;
      el.dataset.i = String(i);
      el.innerHTML = this.tileHtml(t);
      if (!entering.includes(el)) {
        el.style.left = `${c * CELL}%`;
        el.style.top = `${r * CELL}%`;
      } else {
        el.dataset.tr = String(r);
      }
    }
    if (entering.length) {
      void board.offsetWidth;
      for (const el of entering) el.style.top = `${Number(el.dataset.tr) * CELL}%`;
    }
    for (const [id, el] of this.tileEls) {
      if (!alive.has(id)) {
        el.remove();
        this.tileEls.delete(id);
      }
    }
    this.drawPath();
  }

  private drawPath(): void {
    const line = this.root.querySelector<SVGPolylineElement>('#trail');
    if (!line || !this.run) return;
    line.setAttribute('points', this.path.map((i) => `${(i % COLS) + 0.5},${Math.floor(i / COLS) + 0.5}`).join(' '));
    line.setAttribute('class', this.path.length >= 3 ? 'ok' : '');
    for (const el of this.tileEls.values()) {
      const i = Number(el.dataset.i);
      el.classList.toggle('in', this.path.includes(i));
      el.classList.toggle('cur', i === this.cursor);
      el.classList.toggle('dim', this.path.length > 0 && !this.path.includes(i) && !validStep(this.run, this.path, i));
    }
    const info = this.root.querySelector<HTMLElement>('#info');
    if (info) info.innerHTML = this.infoView();
  }

  private elOf(id: number): HTMLElement | undefined {
    return this.tileEls.get(id);
  }

  /** Floating text over a board cell or a tile. */
  private float(at: { id?: number; i?: number }, text: string, cls: string): void {
    const fx = this.root.querySelector<HTMLElement>('#fx');
    if (!fx) return;
    let left = 50;
    let top = 50;
    const el = at.id !== undefined ? this.elOf(at.id) : undefined;
    if (el) {
      left = parseFloat(el.style.left) + CELL / 2;
      top = parseFloat(el.style.top) + CELL / 2;
    } else if (at.i !== undefined && at.i >= 0) {
      const [r, c] = rc(at.i);
      left = c * CELL + CELL / 2;
      top = r * CELL + CELL / 2;
    }
    const f = document.createElement('div');
    f.className = `float ${cls}`;
    f.textContent = text;
    f.style.left = `${left}%`;
    f.style.top = `${top}%`;
    fx.appendChild(f);
    setTimeout(() => f.remove(), 1000);
  }

  private shake(): void {
    const b = this.root.querySelector<HTMLElement>('.board-wrap');
    if (!b) return;
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  }

  private flashHud(cls: string): void {
    const h = this.root.querySelector<HTMLElement>('#hud');
    if (!h) return;
    h.classList.remove(cls);
    void h.offsetWidth;
    h.classList.add(cls);
  }

  /** Play the visual and sound side of a list of events. */
  private showEvents(ev: Ev[]): void {
    let hits = 0;
    let kills = 0;
    for (const e of ev) {
      switch (e.t) {
        case 'hit':
          hits++;
          if (e.kill) kills++;
          this.float({ id: e.id }, `-${e.dmg}`, e.kill ? 'dmg big' : 'dmg');
          this.elOf(e.id)?.classList.add(e.kill ? 'die' : 'hurt');
          break;
        case 'gain':
          if (e.what === 'armor') {
            this.float({ i: e.at }, `+${e.n} 🛡️`, 'armor');
            sfx.armor();
          } else if (e.what === 'heal') {
            this.float({ i: e.at }, `+${e.n} ❤️`, 'heal');
            sfx.heal();
          } else if (e.what === 'coin') {
            this.float({ i: e.at }, `+${e.n} 🪙`, 'coin');
            sfx.coin();
          } else this.float({ i: e.at }, `+${e.n} forge`, 'armor small');
          break;
        case 'xp':
          this.float({ i: e.at }, `+${e.n} ⭐`, 'xp small');
          break;
        case 'atk':
          this.elOf(e.id)?.classList.add('lunge');
          this.float({ id: e.id }, `${e.through ? '💥' : '⚔️'}${e.dmg}`, 'atk small');
          break;
        case 'hurt':
          if (e.hp > 0) {
            sfx.hurt();
            this.shake();
            this.flashHud('hit');
          } else sfx.block();
          this.float({ i: -1 }, e.hp > 0 ? `-${e.hp} ❤️${e.armor ? `  -${e.armor} 🛡️` : ''}` : `-${e.armor} 🛡️`, e.hp > 0 ? 'hurt big' : 'armor big');
          break;
        case 'poison':
          this.flashHud('hit');
          break;
        case 'boom':
          sfx.boom();
          this.shake();
          this.float({ id: e.id }, `💥 ${e.dmg}`, 'hurt big');
          this.elOf(e.id)?.classList.add('die');
          break;
        case 'spawn':
          this.float({ id: e.from }, '✨ summon', 'xp small');
          break;
        case 'regen':
          this.float({ id: e.id }, `+${e.n}`, 'heal small');
          break;
        case 'spike':
          this.float({ id: e.id }, `🌵${e.dmg}`, 'dmg small');
          if (e.kill) this.elOf(e.id)?.classList.add('die');
          break;
        case 'breath':
          this.toast('🐉 The dragon breathes fire!');
          break;
        case 'floor':
          sfx.floor();
          this.toast(isBossFloor(e.n) ? `🏚️ Floor ${e.n}: a boss lurks here!` : `🏚️ Floor ${e.n}`);
          break;
        case 'boss': {
          sfx.boss();
          const t = this.run!.grid.find((x) => x?.id === e.id);
          if (t?.e) this.toast(`${foeDef(t.e).icon} ${foeDef(t.e).name} appears!`);
          break;
        }
        case 'shuffle':
          this.toast('🔀 The board shuffles');
          break;
        case 'cure':
        case 'win':
        case 'dead':
          break;
      }
    }
    if (hits) {
      sfx.hit();
      if (kills) sfx.kill(kills);
    }
  }

  // ---------- Turn flow ----------

  private async playMove(path: number[]): Promise<void> {
    const run = this.run;
    if (!run || this.busy || run.offer || run.over) return;
    this.busy = true;
    this.path = [];
    this.cursor = -1;
    this.drawPath();
    // Clear the chain.
    const cleared = path.map((i) => run.grid[i]!);
    const ev1 = resolveChain(run, path);
    for (const t of cleared) if (!t.e) this.elOf(t.id)?.classList.add('pop');
    this.showEvents(ev1);
    await wait(260);
    // Drop new tiles.
    const ev2 = refill(run);
    this.syncBoard(true);
    this.showEvents(ev2);
    sfx.drop();
    this.refresh();
    await wait(300);
    // Enemy turn.
    if (!run.over) {
      const ev3 = enemyPhase(run);
      this.showEvents(ev3);
      this.refresh();
      await wait(340);
      for (const el of this.tileEls.values()) el.classList.remove('lunge', 'hurt');
      this.syncBoard(true);
    }
    const ev4 = settle(run);
    this.showEvents(ev4);
    this.busy = false;
    if (run.over) return this.finish();
    saveRun(run);
    if (run.offer) this.offerSound();
    this.refresh();
  }

  private offerSound(): void {
    const k = this.run?.offer?.kind;
    if (k === 'level') sfx.level();
    else if (k) sfx.shop();
  }

  private castSkill(i: number): void {
    const run = this.run;
    if (!run || this.busy || run.offer || run.over) return;
    const ev = useSkill(run, i);
    if (!ev) {
      sfx.deny();
      return;
    }
    sfx.skill();
    this.path = [];
    this.showEvents(ev);
    this.syncBoard(true);
    if (run.over) return this.finish();
    saveRun(run);
    if (run.offer) this.offerSound();
    this.refresh();
  }

  private pickOffer(i: number): void {
    const run = this.run;
    if (!run?.offer || this.busy) return;
    if (i >= run.offer.opts.length) return;
    if (i < 0 && run.offer.kind !== 'shop') return;
    sfx.click();
    choose(run, i);
    saveRun(run);
    if (run.offer) this.offerSound();
    this.refresh();
  }

  private finish(): void {
    const run = this.run!;
    const before = Object.values(CLASSES).filter((c) => !this.meta.unlocked.includes(c.id) && this.meta.gems >= c.cost).length;
    const { score, gems } = finishRun(this.meta, run);
    const after = Object.values(CLASSES).filter((c) => !this.meta.unlocked.includes(c.id) && this.meta.gems >= c.cost).length;
    saveMeta(this.meta);
    clearRun();
    this.end = { win: run.over === 'win', score, gems, run, newUnlock: after > before };
    if (run.over === 'win') sfx.win();
    else sfx.lose();
    this.run = null;
    const go = (): void => {
      this.toastEl.classList.remove('show');
      this.screen = 'end';
      this.modal = null;
      this.render();
    };
    if (FAST) go();
    else setTimeout(go, 900);
  }

  private startRun(): void {
    if (this.run) {
      // Abandoning counts as a run.
      this.run.over = 'dead';
      finishRun(this.meta, this.run);
      saveMeta(this.meta);
    }
    this.run = newRun(randomSeedText(), this.cls);
    saveRun(this.run);
    this.screen = 'play';
    this.modal = null;
    this.path = [];
    this.render();
    this.toast(`${CLASSES[this.cls].icon} Floor 1. Kill ${killsNeeded(1)} enemies to go down.`);
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'modal-close' && target.closest('[data-stop]') && !target.closest('button')) return;
    const act = btn.dataset.act!;
    switch (act) {
      case 'new':
        this.startRun();
        break;
      case 'continue':
        this.screen = 'play';
        this.render();
        if (this.run?.offer) this.offerSound();
        break;
      case 'cls':
        this.cls = btn.dataset.id!;
        sfx.click();
        this.render();
        break;
      case 'unlock': {
        const c = CLASSES[btn.dataset.id!];
        if (this.meta.gems >= c.cost && !this.meta.unlocked.includes(c.id)) {
          this.meta.gems -= c.cost;
          this.meta.unlocked.push(c.id);
          this.cls = c.id;
          saveMeta(this.meta);
          sfx.level();
          this.toast(`${c.icon} ${c.name} unlocked`);
          this.render();
        }
        break;
      }
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
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        if (this.run) {
          this.run.over = 'dead';
          this.modal = null;
          this.finish();
        }
        break;
      case 'title':
        this.screen = 'title';
        this.modal = null;
        this.render();
        break;
      case 'mute':
        this.meta.muted = toggleMute();
        saveMeta(this.meta);
        if (this.screen === 'play') this.refresh();
        else this.render();
        break;
      case 'skill':
        this.castSkill(Number(btn.dataset.i));
        break;
      case 'choose':
        this.pickOffer(Number(btn.dataset.i));
        break;
    }
  }

  /** Board cell under a point. Diagonal moves need the pointer near the cell center. */
  private cellAt(x: number, y: number, strict: boolean): number {
    const board = this.root.querySelector<HTMLElement>('#board');
    if (!board) return -1;
    const b = board.getBoundingClientRect();
    const cw = b.width / COLS;
    const ch = b.height / ROWS;
    const c = Math.floor((x - b.left) / cw);
    const r = Math.floor((y - b.top) / ch);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
    if (strict) {
      const dx = (x - b.left) / cw - (c + 0.5);
      const dy = (y - b.top) / ch - (r + 0.5);
      if (Math.hypot(dx, dy) > 0.42) return -1;
    }
    return r * COLS + c;
  }

  private onDown(e: PointerEvent): void {
    initAudio();
    if (this.screen !== 'play' || this.busy || this.modal || this.run?.offer) return;
    if (!(e.target as HTMLElement).closest('#board')) return;
    const i = this.cellAt(e.clientX, e.clientY, false);
    if (i < 0) return;
    e.preventDefault();
    this.dragging = true;
    this.cursor = -1;
    this.path = [i];
    sfx.link(0);
    this.drawPath();
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging || !this.run) return;
    const i = this.cellAt(e.clientX, e.clientY, true);
    if (i < 0) return;
    this.extend(i);
  }

  /** Add a cell to the path, or step back when it is the previous cell. */
  private extend(i: number): boolean {
    const p = this.path;
    if (p[p.length - 1] === i) return false;
    if (p.length >= 2 && p[p.length - 2] === i) {
      p.pop();
      sfx.unlink();
      this.drawPath();
      return true;
    }
    if (!validStep(this.run!, p, i)) return false;
    p.push(i);
    sfx.link(p.length);
    this.drawPath();
    return true;
  }

  private onUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.submit();
  }

  private submit(): void {
    if (this.path.length >= 3) void this.playMove(this.path.slice());
    else {
      if (this.path.length > 1) sfx.deny();
      this.path = [];
      this.drawPath();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.modal) {
        this.modal = null;
        this.render();
      } else if (this.path.length) {
        this.path = [];
        this.drawPath();
      } else if (this.screen === 'play') {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
      return;
    }
    if (this.modal) return;
    if (e.key === 'h' || e.key === '?') {
      this.modal = { kind: 'help' };
      this.render();
      return;
    }
    if (e.key === 'm') {
      this.meta.muted = toggleMute();
      saveMeta(this.meta);
      if (this.screen === 'play') this.refresh();
      return;
    }
    if (this.screen === 'title' && e.key === 'Enter') {
      initAudio();
      if (this.run) {
        this.screen = 'play';
        this.render();
      } else this.startRun();
      return;
    }
    if (this.screen !== 'play' || !this.run || this.busy) return;
    initAudio();
    if (this.run.offer) {
      if (/^[1-3]$/.test(e.key)) this.pickOffer(Number(e.key) - 1);
      if (e.key === '0') this.pickOffer(-1);
      return;
    }
    if (e.key === '1' || e.key === '2') {
      this.castSkill(Number(e.key) - 1);
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      if (this.cursor < 0) this.cursor = this.path.length ? this.path[this.path.length - 1] : 14;
      const [r, c] = rc(this.cursor);
      const nr = Math.max(0, Math.min(ROWS - 1, r + moves[e.key][0]));
      const nc = Math.max(0, Math.min(COLS - 1, c + moves[e.key][1]));
      this.cursor = nr * COLS + nc;
      this.drawPath();
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this.cursor < 0) {
        this.cursor = 14;
        this.drawPath();
        return;
      }
      const p = this.path;
      if (p.length && p[p.length - 1] === this.cursor) return this.submit();
      if (p.includes(this.cursor)) {
        this.path = p.slice(0, p.indexOf(this.cursor) + 1);
        this.drawPath();
        return;
      }
      if (!p.length) {
        this.path = [this.cursor];
        sfx.link(0);
        this.drawPath();
      } else if (!this.extend(this.cursor)) sfx.deny();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.path.pop();
      this.drawPath();
    }
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        busy: this.busy,
        offer: this.run?.offer?.kind ?? null,
        cls: this.run?.hero.cls ?? this.cls,
        floor: this.run?.floor ?? this.end?.run.floor,
        hp: this.run?.hero.hp,
        armor: this.run?.hero.armor,
        level: this.run?.hero.level,
        kills: this.run?.kills ?? this.end?.run.kills,
        turn: this.run?.turn ?? this.end?.run.turn,
        enemies: this.run ? enemies(this.run).map((t) => `${ENEMIES[t.e!.t].id} ${t.e!.hp}/${t.e!.max}`) : null,
        end: this.end ? { win: this.end.win, score: this.end.score, gems: this.end.gems } : null,
      }),
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'close';
        }
        if (this.screen === 'title') {
          if (this.run) {
            this.screen = 'play';
            this.render();
            return 'continue';
          }
          this.startRun();
          return 'start';
        }
        if (this.screen === 'end') return 'end';
        const run = this.run!;
        if (run.offer) {
          this.pickOffer(pickChoice(run));
          return 'choose';
        }
        const k = pickSkill(run);
        if (k >= 0) {
          this.castSkill(k);
          return 'skill';
        }
        await this.playMove(bestPath(run, this.botRng, 12));
        return 'move';
      },
      win: () => {
        if (!this.run) return;
        this.run.over = 'win';
        this.finish();
      },
      hp: (n: number) => {
        if (!this.run) return;
        this.run.hero.hp = n;
        this.refresh();
      },
      gems: (n: number) => {
        this.meta.gems += n;
        saveMeta(this.meta);
        this.render();
      },
      floor: (n: number) => {
        if (!this.run) return;
        this.run.floor = n;
        this.run.floorKills = 0;
        this.refresh();
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
