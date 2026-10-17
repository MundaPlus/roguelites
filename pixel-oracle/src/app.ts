import { botAction } from './bot';
import { CHARMS, FLOORS, MONSTERS, SPELLS, TRAITS, UNLOCKS } from './data';
import { canCast, openVault, pickReward, playCast, playPaint, pray, type PlayResult } from './game';
import { PALETTE, PICTURES, PIC_BY_ID, type Picture } from './pictures';
import { cellsOfLine, lineDone, linesOfCell, mark, mistakeDmg, progress, spellCost, type Puzzle } from './puzzle';
import { Rng } from './rng';
import {
  DOOR_INFO,
  STEPS,
  advance,
  buy,
  clearRun,
  enterDoor,
  finishRun,
  isPuzzleDoor,
  loadMeta,
  loadRun,
  monsterDmg,
  newRun,
  saveMeta,
  saveRun,
  type Door,
  type RunState,
  type ShopItem,
} from './run';
import { initAudio, isMuted, setMuted, sfx } from './sfx';

type Screen = 'title' | 'map' | 'puzzle' | 'reward' | 'shop' | 'shrine' | 'vault' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };
type DragAction = 'paint' | 'mark' | 'unmark' | 'none';

interface Drag {
  start: number;
  action: DragAction;
  axis: 'row' | 'col' | null;
  last: number;
  pointer: number;
  count: number;
}

const PARAMS = new URLSearchParams(location.search);
/** `?debug&fast` skips waits, for bot tests. */
const FAST = PARAMS.has('fast');

const KIND_LABEL: Record<string, string> = {
  monster: 'Monster',
  chest: 'Chest',
  key: 'Key',
  treasure: 'Treasure',
  potion: 'Potion',
  mana: 'Mana',
  charm: 'Charm',
};

const SHOP_INFO: Record<ShopItem['id'], { icon: string; name: string; text: string }> = {
  heal: { icon: '🧪', name: 'Healing Draught', text: 'Heal 3 HP.' },
  maxhp: { icon: '💖', name: 'Vital Ink', text: '+2 max HP and heal 2.' },
  mana: { icon: '🔮', name: 'Mana Vial', text: '+3 mana.' },
  key: { icon: '🗝️', name: 'Spare Key', text: '+1 key. Keys open vaults.' },
  charm: { icon: '', name: '', text: '' },
};

/** Small SVG of a picture. Unknown pictures show as a dim silhouette. */
function picSvg(p: Picture, px: number, known = true): string {
  const n = p.rows.length;
  let rects = '';
  p.rows.forEach((row, r) => {
    for (let c = 0; c < n; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      rects += `<rect x="${c}" y="${r}" width="1.02" height="1.02" fill="${known ? PALETTE[ch] : '#3a3456'}"/>`;
    }
  });
  return `<svg class="pic" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges">${rects}</svg>`;
}

const hearts = (hp: number, max: number): string => `<span class="hud-hp" title="HP">❤️ <b>${Math.max(0, hp)}</b>/${max}</span>`;

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private end: { win: boolean; score: number; shards: number; run: RunState } | null = null;

  // Puzzle UI
  private mode: 'paint' | 'mark' = 'paint';
  private cursor = 0;
  private spell: string | null = null;
  private lineChoice: number | null = null;
  private drag: Drag | null = null;
  private keyDrag: DragAction | null = null;
  private busyUntil = 0;
  private boardEl: HTMLElement | null = null;
  private cellEls: HTMLElement[] = [];
  private shownPuzzle: Puzzle | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setMuted(!!this.meta.muted);
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => this.onDown(e));
    root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('.board')) e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.endDrag());
    window.addEventListener('pointercancel', () => this.endDrag());
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('resize', () => this.fitBoard());
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Screen state ----------

  private syncScreen(): void {
    if (this.end) {
      this.screen = 'end';
      return;
    }
    const r = this.run;
    if (!r || this.screen === 'title') return;
    const room = r.room;
    if (!room) this.screen = 'map';
    else if (room.puzzle) this.screen = room.puzzle.solved ? 'reward' : 'puzzle';
    else if (room.door.kind === 'shop') this.screen = 'shop';
    else if (room.door.kind === 'shrine') this.screen = 'shrine';
    else this.screen = 'vault';
  }

  private busy(): boolean {
    return performance.now() < this.busyUntil;
  }

  private wait(ms: number, fn: () => void): void {
    if (FAST) {
      fn();
      return;
    }
    this.busyUntil = performance.now() + ms;
    setTimeout(() => {
      this.busyUntil = 0;
      fn();
    }, ms);
  }

  private save(): void {
    if (this.run && !this.run.result) saveRun(this.run);
  }

  private saveMetaNow(): void {
    this.meta.muted = isMuted();
    saveMeta(this.meta);
  }

  // ---------- Rendering ----------

  private render(): void {
    this.syncScreen();
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'puzzle':
      case 'reward':
        body = this.puzzleView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'shrine':
        body = this.shrineView();
        break;
      case 'vault':
        body = this.vaultView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.boardEl = this.root.querySelector<HTMLElement>('.board');
    this.cellEls = this.boardEl ? Array.from(this.boardEl.querySelectorAll<HTMLElement>('.cell')) : [];
    this.shownPuzzle = this.boardEl ? (this.run?.room?.puzzle ?? null) : null;
    if (this.boardEl) {
      this.fitBoard();
      if (this.screen === 'reward') this.paintPicture(false);
      else {
        this.markAllClues();
        this.setCursor(this.cursor);
      }
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
    const fl = FLOORS[r.floor];
    const charms = r.charms.map((id) => `<span class="charm-ic" title="${CHARMS[id].name}: ${CHARMS[id].text}">${CHARMS[id].icon}</span>`).join('');
    return `<header class="top">
      ${hearts(r.hp, r.maxHp)}
      <span class="hud-mana" title="Mana">✨ <b>${r.mana}</b>/${r.maxMana}</span>
      <span title="Gold">💰 ${r.gold}</span>
      <span title="Keys">🗝️ ${r.keys}</span>
      <span class="hud-floor" title="${fl.name}">${fl.icon} ${r.floor + 1}-${Math.min(r.step + 1, STEPS + 1)}</span>
      <span class="charms">${charms}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private refreshTop(): void {
    const top = this.root.querySelector('.top');
    if (top && this.run) top.outerHTML = this.topBar();
  }

  private titleView(): string {
    const m = this.meta;
    const lib = UNLOCKS.map((u) => {
      const own = m.unlocked.includes(u.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.shards >= u.cost ? '' : 'disabled'}>💎 ${u.cost}</button>`}</div>`;
    }).join('');
    const gallery = PICTURES.map((p) => {
      const found = m.pics.includes(p.id);
      return `<span class="thumb ${found ? 'found' : ''}" title="${found ? p.name : '???'}">${picSvg(p, 34, found)}</span>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">${picSvg(PIC_BY_ID.shadow, 72)}<h1>Pixel Oracle</h1></div>
      <p class="sub">Read the number clues. Paint the hidden picture. Every wrong cell hurts. Climb 8 floors of the Oracle's tower.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (floor ${r.floor + 1}, ❤️ ${r.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best floor ${m.bestFloor} · Best score ${m.best}</p>
      <h2>Oracle's Library <small>💎 ${m.shards} shards</small></h2>
      <p class="sub">Each run gives shards. Unlock spells and picture packs for later runs.</p>
      <div class="armory">${lib}</div>
      <h2>Gallery <small>${m.pics.length}/${PICTURES.length}</small></h2>
      <div class="gallery">${gallery}</div>
    </div>`;
  }

  private doorCard(d: Door, i: number): string {
    const r = this.run!;
    const info = DOOR_INFO[d.kind];
    let title = `${info.icon} ${info.name}`;
    let detail = info.text;
    let extra = '';
    if (d.kind === 'monster' || d.kind === 'guardian') {
      const m = MONSTERS[d.pic!];
      const dmg = this.doorDmg(d);
      title = `${m.icon} ${PIC_BY_ID[d.pic!].name}`;
      detail = d.kind === 'guardian' ? 'Floor guardian. Beat it to climb.' : 'A fight. Drops gold.';
      extra = `<span class="chip bad">💥 ${dmg} per mistake</span>${m.trait !== 'none' ? `<span class="chip" title="${TRAITS[m.trait].text}">${TRAITS[m.trait].icon} ${TRAITS[m.trait].name}</span>` : ''}`;
    } else if (d.kind === 'mystery' && d.pic && r.charms.includes('compass')) {
      extra = `<span class="chip good">🧭 ${KIND_LABEL[PIC_BY_ID[d.pic].kind]}</span>`;
    }
    if (isPuzzleDoor(d.kind)) extra = `<span class="chip">🔳 ${d.size}×${d.size}</span>${d.kind === 'monster' || d.kind === 'guardian' ? '' : `<span class="chip">💥 ${this.doorDmg(d)}</span>`}${extra}`;
    const locked = d.kind === 'vault' && r.keys < 1;
    return `<button class="door door-${d.kind}" data-act="door" data-i="${i}" ${locked ? 'disabled' : ''}>
      <span class="door-num">${i + 1}</span>
      <b>${title}</b>
      <small>${detail}</small>
      <span class="chips">${extra}</span>
    </button>`;
  }

  private doorDmg(d: Door): number {
    return monsterDmg(this.run!, d);
  }

  private mapView(): string {
    const r = this.run!;
    const fl = FLOORS[r.floor];
    const dots = [...Array(STEPS + 1).keys()]
      .map((s) => `<span class="dot ${s < r.step ? 'done' : s === r.step ? 'now' : ''}">${s === STEPS ? '👑' : s + 1}</span>`)
      .join('<span class="dash"></span>');
    const tower = FLOORS.map((f, i) => `<span class="fl ${i < r.floor ? 'done' : i === r.floor ? 'now' : ''}" title="${f.name}">${f.icon}</span>`).reverse().join('');
    const charms = r.charms.length
      ? r.charms.map((id) => `<div class="charm-row"><span class="big">${CHARMS[id].icon}</span><span><b>${CHARMS[id].name}</b><small>${CHARMS[id].text}</small></span></div>`).join('')
      : '<p class="dim">No charms yet. Chests, vaults, guardians and shops give charms.</p>';
    const spells = r.spells.map((id) => `<span class="chip" title="${SPELLS[id].text}">${SPELLS[id].icon} ${SPELLS[id].name} · ✨${SPELLS[id].cost}</span>`).join('');
    return `<div class="map">
      <div class="tower">${tower}</div>
      <div class="map-main">
        <h2>${fl.icon} Floor ${r.floor + 1}: ${fl.name}</h2>
        <div class="steps">${dots}</div>
        <p class="sub">${r.step >= STEPS ? 'The guardian waits.' : 'Choose a door.'}</p>
        <div class="doors">${r.doors.map((d, i) => this.doorCard(d, i)).join('')}</div>
        <h3>Spells</h3>
        <div class="chips">${spells}</div>
        <h3>Charms</h3>
        <div class="charm-list">${charms}</div>
      </div>
    </div>`;
  }

  private puzzleView(): string {
    const r = this.run!;
    const room = r.room!;
    const p = room.puzzle!;
    const d = room.door;
    let foe = '';
    if (d.kind === 'monster' || d.kind === 'guardian') foe = `${MONSTERS[d.pic!].icon} ${PIC_BY_ID[d.pic!].name}`;
    else if (d.kind === 'rune') foe = `🔣 Rune`;
    else foe = `${DOOR_INFO[d.kind].icon} ${d.kind === 'mystery' ? 'Mystery picture' : DOOR_INFO[d.kind].name}`;
    const board = this.boardHtml(p);
    const side = this.screen === 'reward' ? this.rewardPanel() : this.toolsHtml();
    return `<div class="pz">
      <div class="pz-head">${this.headHtml(foe, p)}</div>
      <div class="board-wrap"><div class="board ${this.screen === 'reward' ? 'solved' : ''}">${board}</div><div class="fx"></div></div>
      <div class="tools">${side}</div>
    </div>`;
  }

  private headHtml(foe: string, p: Puzzle): string {
    const tr = p.trait !== 'none' ? `<span class="chip" title="${TRAITS[p.trait].text}">${TRAITS[p.trait].icon} ${TRAITS[p.trait].name}</span>` : '';
    return `<b class="foe">${foe}</b>
      <span class="chip bad" title="HP lost per wrong paint">💥 ${mistakeDmg(p)}</span>${tr}
      ${p.ward ? `<span class="chip good" title="Mistakes that cost no HP">🛡️ ${p.ward}</span>` : ''}
      <span class="chip" title="Mistakes">✖ ${p.mistakes}</span>
      <span class="chip" title="Painted">${Math.round(progress(p) * 100)}%</span>`;
  }

  private boardHtml(p: Puzzle): string {
    const n = p.w;
    let html = `<div class="corner">${p.w}×${p.h}</div>`;
    for (let c = 0; c < p.w; c++) html += `<div class="cc clue" data-line="${p.h + c}">${this.clueHtml(p, p.h + c)}</div>`;
    for (let r = 0; r < p.h; r++) {
      html += `<div class="rc clue" data-line="${r}">${this.clueHtml(p, r)}</div>`;
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const b = `${c % 5 === 4 && c < n - 1 ? ' bR' : ''}${r % 5 === 4 && r < p.h - 1 ? ' bB' : ''}`;
        html += `<div class="cell s${p.cells[i]}${b}${i === this.cursor ? ' cur' : ''}" data-i="${i}"></div>`;
      }
    }
    return html;
  }

  private clueHtml(p: Puzzle, li: number): string {
    if (p.hidden.includes(li)) return '<span class="q">?</span>';
    const clue = li < p.h ? p.rows[li] : p.cols[li - p.h];
    return clue.map((v) => `<span>${v}</span>`).join('');
  }

  private toolsHtml(): string {
    const r = this.run!;
    const p = r.room!.puzzle!;
    const spells = r.spells
      .map((id, k) => {
        const s = SPELLS[id];
        const cost = spellCost(p, id);
        return `<button class="spell ${this.spell === id ? 'on' : ''}" data-act="spell" data-id="${id}" ${canCast(r, id) ? '' : 'disabled'} title="${s.text}">
          <span class="sk">${k + 1}</span>${s.icon}<span class="sn">${s.name}</span><span class="cost">✨${cost}</span></button>`;
      })
      .join('');
    return `<div class="modes">
        <button class="mode ${this.mode === 'paint' ? 'on' : ''}" data-act="mode" data-mode="paint" title="Paint (Z)">■ Paint</button>
        <button class="mode ${this.mode === 'mark' ? 'on' : ''}" data-act="mode" data-mode="mark" title="Mark empty (X)">✖ Mark</button>
      </div>
      <div class="spells">${spells}</div>
      <div class="hint">${this.hintHtml()}</div>`;
  }

  private hintHtml(): string {
    if (this.spell) {
      const s = SPELLS[this.spell];
      if (this.lineChoice !== null && this.run?.room?.puzzle) {
        const p = this.run.room.puzzle;
        const [row, col] = linesOfCell(p, this.lineChoice);
        return `${s.icon} ${s.name}: <button data-act="cast-line" data-line="${row}">→ Row ${row + 1}</button> <button data-act="cast-line" data-line="${col}">↓ Column ${col - p.h + 1}</button> <button data-act="cancel-spell">Cancel</button>`;
      }
      const how = s.target === 'cell' ? 'Tap a cell (or Space at the cursor).' : 'Tap a clue, or a cell and then pick its row or column (keys R / C).';
      return `${s.icon} <b>${s.name}</b>: ${how} <button data-act="cancel-spell">Cancel</button>`;
    }
    return this.mode === 'paint'
      ? 'Drag to paint a line of cells. Right-click, or Mark mode, crosses out cells. Keys: arrows, Z paint, X mark.'
      : 'Mark mode: drag to cross out cells you know are empty. Marks are your notes and are not checked.';
  }

  private refreshTools(): void {
    const t = this.root.querySelector('.tools');
    if (t && this.screen === 'puzzle') t.innerHTML = this.toolsHtml();
    const h = this.root.querySelector('.pz-head');
    const r = this.run;
    if (h && r?.room?.puzzle) {
      const foe = h.querySelector('.foe')?.innerHTML ?? '';
      h.innerHTML = this.headHtml(foe, r.room.puzzle);
    }
  }

  private rewardPanel(): string {
    const r = this.run!;
    const room = r.room!;
    const p = room.puzzle!;
    const rw = room.reward;
    const pic = p.pic ? PIC_BY_ID[p.pic] : null;
    const name = pic ? pic.name : 'Rune';
    const kind = pic ? KIND_LABEL[pic.kind] : 'Rune';
    const lines = (rw?.lines ?? []).map((l) => `<li>${l}</li>`).join('');
    let charms = '';
    if (rw && !rw.picked && rw.charms.length) {
      charms = `<p class="sub">Choose a charm:</p><div class="picks">${rw.charms
        .map((id) => `<button class="pick" data-act="pick-charm" data-id="${id}"><span class="big">${CHARMS[id].icon}</span><b>${CHARMS[id].name}</b><small>${CHARMS[id].text}</small></button>`)
        .join('')}</div><button data-act="pick-charm" data-id="">Skip</button>`;
    }
    const cont = !rw || rw.picked ? `<button class="primary" data-act="leave">Continue ▶</button>` : '';
    return `<div class="reward">
      <h2>🎨 ${name} <small>${kind}</small></h2>
      <ul class="gains">${lines}</ul>
      ${charms}${cont}
    </div>`;
  }

  private shopView(): string {
    const r = this.run!;
    const items = r.room!.shop!.map((it, i) => {
      const info = it.id === 'charm' ? { icon: CHARMS[it.charm!].icon, name: CHARMS[it.charm!].name, text: `Charm: ${CHARMS[it.charm!].text}` } : SHOP_INFO[it.id];
      return `<div class="arm ${it.sold ? 'own' : ''}"><span class="big">${info.icon}</span><span><b>${info.name}</b><small>${info.text}</small></span>
        ${it.sold ? '<span class="ok">Sold</span>' : `<button data-act="buy" data-i="${i}" ${r.gold >= it.cost ? '' : 'disabled'}>💰 ${it.cost}</button>`}</div>`;
    });
    return `<div class="room"><h2>🛒 The Ink Merchant</h2><p class="sub">“Fresh ink, old charms. Gold only.”</p><div class="armory">${items.join('')}</div><button class="primary" data-act="leave">Leave ▶</button></div>`;
  }

  private shrineView(): string {
    const r = this.run!;
    const used = r.room!.used;
    return `<div class="room center"><div class="huge">⛩️</div><h2>Quiet Shrine</h2>
      <p class="sub">${used ? 'Your wounds are gone.' : 'A calm light fills the room. Pray to refill all HP.'}</p>
      ${used ? '<button class="primary" data-act="leave">Continue ▶</button>' : `<button class="primary" data-act="pray">🙏 Pray (❤️ ${r.hp} → ${r.maxHp})</button>`}</div>`;
  }

  private vaultView(): string {
    const r = this.run!;
    const room = r.room!;
    if (room.used) return `<div class="room center"><div class="huge">🔓</div><h2>Vault</h2><p class="sub">The vault is empty now.</p><button class="primary" data-act="leave">Continue ▶</button></div>`;
    return `<div class="room center"><div class="huge">🔐</div><h2>Vault</h2><p class="sub">Use 1 key (you have ${r.keys}) to take one charm.</p>
      <div class="picks">${room.choices
        .map((id) => `<button class="pick" data-act="vault" data-id="${id}" ${r.keys > 0 ? '' : 'disabled'}><span class="big">${CHARMS[id].icon}</span><b>${CHARMS[id].name}</b><small>${CHARMS[id].text}</small></button>`)
        .join('')}</div>
      <button data-act="leave">Leave (keep the key)</button></div>`;
  }

  private endView(): string {
    const e = this.end!;
    const r = e.run;
    const pics = r.stats.pics.map((id) => `<span class="thumb found" title="${PIC_BY_ID[id].name}">${picSvg(PIC_BY_ID[id], 40)}</span>`).join('');
    return `<div class="room center end">
      <div class="huge">${e.win ? '🔮' : '💀'}</div>
      <h1>${e.win ? 'The Oracle is yours!' : 'The ink runs dry'}</h1>
      <p class="sub">${e.win ? 'You solved the Oracle\'s Shadow and claimed the spire.' : `You fell on floor ${r.floor + 1}: ${FLOORS[r.floor].name}.`}</p>
      <div class="score">Score <b>${e.score}</b> · 💎 +${e.shards} shards</div>
      <p class="stats">Puzzles ${r.stats.solved} · Clean ${r.stats.clean} · Mistakes ${r.stats.mistakes} · Monsters ${r.stats.kills} · Gold ${r.gold} · Charms ${r.charms.length}</p>
      <div class="gallery">${pics}</div>
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
          <li><b>Clues.</b> The numbers next to each row and above each column give the runs of painted cells in that line, in order. "3 1" means a run of 3, a gap, then a run of 1.</li>
          <li><b>Paint</b> cells you are sure of. Drag to paint a straight line. A wrong paint costs HP (💥) and shows the cell as empty.</li>
          <li><b>Mark</b> (✖, right-click or Mark mode) cells you think are empty. Marks are notes. They are not checked and cost nothing.</li>
          <li>Every puzzle can be solved by logic alone. You never need to guess.</li>
          <li><b>Mana ✨</b> comes from clean solves (no mistakes). Spend it on spells: Peek a cell, clear or reveal a line.</li>
          <li><b>Doors.</b> Each floor has 2 door choices and a guardian. Monsters hit harder but drop gold. Chests, mystery pictures and keys give prizes. Shrines refill HP. Keys open vaults with charms.</li>
          <li>Climb 8 floors. Puzzles grow from 5×5 to 15×15.</li>
          <li><b>Keys:</b> arrows move, Z / Space paint, X mark (hold and move to drag), Q switches mode, 1–7 spells, Esc cancels.</li>
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

  // ---------- Board view ----------

  private fitBoard(): void {
    const b = this.boardEl;
    const p = this.shownPuzzle;
    if (!b || !p) return;
    const wrap = b.parentElement!;
    const maxRow = Math.max(...p.rows.map((c) => c.length), 1);
    const maxCol = Math.max(...p.cols.map((c) => c.length), 1);
    const used = ['.top', '.pz-head', '.tools'].reduce((a, s) => a + (this.root.querySelector<HTMLElement>(s)?.offsetHeight ?? 0), 0);
    const availW = Math.min(wrap.clientWidth || window.innerWidth - 24, 900) - 4;
    const wide = window.innerWidth >= 900;
    const availH = Math.max(240, window.innerHeight - (wide ? 110 : used + 56));
    const cs = Math.floor(Math.max(13, Math.min(48, availW / (p.w + maxRow * 0.62 + 0.5), availH / (p.h + maxCol * 0.72 + 0.5))));
    b.style.setProperty('--cs', `${cs}px`);
    b.style.setProperty('--rcw', `${Math.ceil(maxRow * cs * 0.62 + 6)}px`);
    b.style.setProperty('--cch', `${Math.ceil(maxCol * cs * 0.72 + 4)}px`);
    b.style.gridTemplateColumns = `var(--rcw) repeat(${p.w}, var(--cs))`;
    b.style.gridTemplateRows = `var(--cch) repeat(${p.h}, var(--cs))`;
  }

  private updateCells(idxs: Iterable<number>): void {
    const p = this.run?.room?.puzzle;
    if (!p) return;
    for (const i of idxs) {
      const el = this.cellEls[i];
      if (!el) continue;
      el.classList.remove('s0', 's1', 's2', 's3');
      el.classList.add(`s${p.cells[i]}`);
    }
  }

  private updateClues(lines: number[]): void {
    const p = this.run?.room?.puzzle;
    if (!p || !this.boardEl) return;
    for (const li of new Set(lines)) {
      const el = this.boardEl.querySelector<HTMLElement>(`.clue[data-line="${li}"]`);
      if (!el) continue;
      el.innerHTML = this.clueHtml(p, li);
      el.classList.toggle('done', lineDone(p, li));
    }
  }

  private markAllClues(): void {
    const p = this.run?.room?.puzzle;
    if (!p) return;
    this.updateClues([...Array(p.w + p.h).keys()]);
  }

  private setCursor(i: number): void {
    const p = this.run?.room?.puzzle;
    if (!p) return;
    this.cellEls[this.cursor]?.classList.remove('cur');
    this.cursor = Math.max(0, Math.min(p.cells.length - 1, i));
    this.cellEls[this.cursor]?.classList.add('cur');
    if (this.boardEl) {
      const [row, col] = linesOfCell(p, this.cursor);
      this.boardEl.querySelectorAll('.clue.hl').forEach((e) => e.classList.remove('hl'));
      this.boardEl.querySelector(`.clue[data-line="${row}"]`)?.classList.add('hl');
      this.boardEl.querySelector(`.clue[data-line="${col}"]`)?.classList.add('hl');
    }
  }

  private float(i: number, text: string, cls: string): void {
    const fx = this.root.querySelector<HTMLElement>('.fx');
    const cell = this.cellEls[i];
    if (!fx || !cell) return;
    const wr = fx.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${cr.left - wr.left + cr.width / 2}px`;
    el.style.top = `${cr.top - wr.top}px`;
    fx.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  private flashLines(lines: number[]): void {
    const p = this.run?.room?.puzzle;
    if (!p || !this.boardEl) return;
    for (const li of lines) {
      this.boardEl.querySelector(`.clue[data-line="${li}"]`)?.classList.add('flash');
      cellsOfLine(p, li).forEach((i, k) => {
        const el = this.cellEls[i];
        if (!el) return;
        el.style.animationDelay = `${k * 18}ms`;
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      });
    }
  }

  /** Color the solved picture, cell by cell in a diagonal wave. */
  private paintPicture(animate: boolean): void {
    const p = this.run?.room?.puzzle;
    if (!p) return;
    const pic = p.pic ? PIC_BY_ID[p.pic] : null;
    this.boardEl?.classList.add('solved');
    this.cellEls.forEach((el, i) => {
      const r = Math.floor(i / p.w);
      const c = i % p.w;
      el.classList.remove('s0', 's2', 's3', 'cur');
      if (p.sol[i] !== '1') {
        el.classList.add('s3');
        return;
      }
      const ch = pic ? pic.rows[r][c] : null;
      const color = ch ? PALETTE[ch] : `hsl(${240 + ((r * 7 + c * 11) % 50)}, 70%, ${55 + ((r + c) % 3) * 6}%)`;
      el.style.setProperty('--pc', color);
      el.style.transitionDelay = animate ? `${(r + c) * 28}ms` : '0ms';
      el.classList.add('pix');
    });
  }

  // ---------- Game actions ----------

  private startRun(): void {
    initAudio();
    this.run = newRun(this.meta);
    this.end = null;
    this.screen = 'map';
    this.mode = 'paint';
    this.save();
    sfx.door();
    this.render();
    this.toast(`${FLOORS[0].icon} Floor 1: ${FLOORS[0].name}`);
  }

  private chooseDoor(i: number): void {
    const r = this.run;
    if (!r || r.room || !r.doors[i]) return;
    const d = r.doors[i];
    if (d.kind === 'vault' && r.keys < 1) {
      sfx.deny();
      return;
    }
    enterDoor(r, i);
    this.cursor = 0;
    this.spell = null;
    this.lineChoice = null;
    sfx.door();
    this.save();
    this.render();
    if (d.kind === 'guardian') this.toast(`${MONSTERS[d.pic!].icon} ${PIC_BY_ID[d.pic!].name} blocks the stairs!`);
  }

  /** Apply a drag action to cells. Returns false when the drag must stop. */
  private applyCells(action: DragAction, idxs: number[], count = 0): boolean {
    const r = this.run;
    const p = r?.room?.puzzle;
    if (!r || !p || p.solved || r.result) return false;
    if (action === 'mark' || action === 'unmark') {
      const ch = mark(p, idxs, action === 'mark');
      if (ch.length) {
        sfx.mark();
        this.updateCells(ch);
        this.save();
      }
      return true;
    }
    if (action !== 'paint') return false;
    const res = playPaint(r, idxs);
    if (res.painted.length) sfx.paint(count + res.painted.length);
    this.afterMove(res);
    return res.wrong === null;
  }

  private afterMove(res: PlayResult): void {
    const r = this.run!;
    const p = r.room!.puzzle!;
    const touched = [...res.painted, ...res.emptied];
    for (const li of res.lines) touched.push(...cellsOfLine(p, li));
    this.updateCells(touched);
    this.updateClues([...res.lines, ...touched.flatMap((i) => linesOfCell(p, i))]);
    if (res.lines.length && !res.solved) {
      sfx.line();
      this.flashLines(res.lines);
    }
    if (res.wrong !== null) {
      if (res.dmg) {
        sfx.hurt();
        this.float(res.wrong, `-${res.dmg} ❤️`, 'bad');
        this.boardEl?.classList.remove('shake');
        void this.boardEl?.offsetWidth;
        this.boardEl?.classList.add('shake');
      } else {
        sfx.ward();
        this.float(res.wrong, '🛡️ blocked', 'good');
      }
      if (res.manaLoss) this.float(res.wrong, `-${res.manaLoss} ✨`, 'mana');
      this.cellEls[res.wrong]?.classList.add('wrong');
    }
    if (res.healed) this.toast(`❤️ +${res.healed} HP`);
    this.refreshTop();
    if (res.died) {
      this.drag = null;
      this.save();
      sfx.lose();
      this.wait(900, () => this.finish(false));
      return;
    }
    if (res.solved) {
      this.drag = null;
      this.spell = null;
      sfx.solve();
      this.paintPicture(!FAST);
      this.save();
      this.wait(1100, () => {
        this.render();
        const rw = r.room?.reward;
        if (rw?.lines.some((l) => l.includes('gold'))) sfx.coin();
      });
      return;
    }
    this.save();
    this.refreshTools();
  }

  private selectSpell(id: string): void {
    const r = this.run;
    if (!r || this.screen !== 'puzzle' || this.busy()) return;
    if (this.spell === id) {
      this.cancelSpell();
      return;
    }
    if (!canCast(r, id)) {
      sfx.deny();
      this.toast(`${SPELLS[id].icon} Not enough mana.`);
      return;
    }
    if (SPELLS[id].target === 'none') {
      this.cast(id, -1);
      return;
    }
    this.spell = id;
    this.lineChoice = null;
    this.boardEl?.classList.add('targeting');
    this.refreshTools();
  }

  private cancelSpell(): void {
    this.spell = null;
    this.lineChoice = null;
    this.boardEl?.classList.remove('targeting');
    this.refreshTools();
  }

  private cast(id: string, target: number): void {
    const r = this.run!;
    const res = playCast(r, id, target);
    this.spell = null;
    this.lineChoice = null;
    this.boardEl?.classList.remove('targeting');
    if (!res) {
      sfx.deny();
      this.refreshTools();
      return;
    }
    if (id === 'mend') sfx.heal();
    else sfx.spell();
    if (id === 'ward') this.toast('🛡️ Ward: the next 2 mistakes are blocked.');
    this.afterMove(res);
  }

  private castOnCell(i: number): void {
    const id = this.spell;
    if (!id) return;
    if (SPELLS[id].target === 'cell') this.cast(id, i);
    else {
      this.lineChoice = i;
      this.refreshTools();
    }
  }

  private leaveRoom(): void {
    const r = this.run;
    if (!r || this.busy()) return;
    const room = r.room;
    if (room?.reward && !room.reward.picked) return;
    const floor = r.floor;
    const won = advance(r);
    if (won) {
      this.finish(true);
      return;
    }
    this.save();
    this.render();
    if (r.floor !== floor) {
      sfx.item();
      this.toast(`${FLOORS[r.floor].icon} Floor ${r.floor + 1}: ${FLOORS[r.floor].name}`);
    } else sfx.door();
  }

  private finish(win: boolean): void {
    const r = this.run!;
    r.result = win ? 'win' : 'lose';
    const res = finishRun(r, this.meta);
    this.saveMetaNow();
    clearRun();
    this.end = { win, score: res.score, shards: res.shards, run: r };
    this.run = null;
    this.modal = null;
    if (win) sfx.win();
    this.render();
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'modal-close' && (e.target as HTMLElement).closest('[data-stop]') && t.classList.contains('modal')) return;
    initAudio();
    const act = t.dataset.act!;
    const r = this.run;
    switch (act) {
      case 'new':
        this.startRun();
        break;
      case 'continue':
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
        this.closeModal();
        break;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        break;
      case 'abandon-yes':
        if (r) {
          this.modal = null;
          sfx.lose();
          this.finish(false);
        }
        break;
      case 'title':
        this.modal = null;
        this.end = null;
        this.screen = 'title';
        this.render();
        break;
      case 'mute':
        setMuted(!isMuted());
        this.saveMetaNow();
        this.refreshTop();
        break;
      case 'unlock': {
        const u = UNLOCKS.find((x) => x.id === t.dataset.id);
        if (u && this.meta.shards >= u.cost && !this.meta.unlocked.includes(u.id)) {
          this.meta.shards -= u.cost;
          this.meta.unlocked.push(u.id);
          this.saveMetaNow();
          sfx.item();
          this.toast(`${u.icon} ${u.name} unlocked for new runs.`);
          this.render();
        }
        break;
      }
      case 'door':
        this.chooseDoor(Number(t.dataset.i));
        break;
      case 'mode':
        this.mode = t.dataset.mode === 'mark' ? 'mark' : 'paint';
        this.refreshTools();
        break;
      case 'spell':
        this.selectSpell(t.dataset.id!);
        break;
      case 'cancel-spell':
        this.cancelSpell();
        break;
      case 'cast-line':
        if (this.spell) this.cast(this.spell, Number(t.dataset.line));
        break;
      case 'pick-charm':
        if (r) {
          pickReward(r, t.dataset.id || null);
          if (t.dataset.id) {
            sfx.item();
            this.toast(`${CHARMS[t.dataset.id].icon} ${CHARMS[t.dataset.id].name}`);
          }
          this.save();
          this.render();
        }
        break;
      case 'leave':
        this.leaveRoom();
        break;
      case 'buy': {
        const it = r?.room?.shop?.[Number(t.dataset.i)];
        if (r && it && buy(r, it)) {
          sfx.coin();
          this.save();
          this.render();
        } else sfx.deny();
        break;
      }
      case 'pray':
        if (r) {
          const h = pray(r);
          sfx.heal();
          this.toast(`⛩️ +${h} HP`);
          this.save();
          this.render();
        }
        break;
      case 'vault':
        if (r && openVault(r, t.dataset.id!)) {
          sfx.item();
          this.toast(`${CHARMS[t.dataset.id!].icon} ${CHARMS[t.dataset.id!].name}`);
          this.save();
          this.render();
        }
        break;
    }
  }

  private closeModal(): void {
    this.modal = null;
    this.render();
  }

  private cellAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cell');
    if (!el || !this.boardEl?.contains(el)) return null;
    return Number(el.dataset.i);
  }

  private onDown(e: PointerEvent): void {
    if (this.screen !== 'puzzle' || this.modal || this.busy()) return;
    const target = e.target as HTMLElement;
    const clue = target.closest<HTMLElement>('.clue');
    if (clue && this.spell && SPELLS[this.spell].target === 'line') {
      this.cast(this.spell, Number(clue.dataset.line));
      return;
    }
    const cell = target.closest<HTMLElement>('.cell');
    if (!cell) return;
    e.preventDefault();
    initAudio();
    const i = Number(cell.dataset.i);
    this.setCursor(i);
    if (this.spell) {
      this.castOnCell(i);
      return;
    }
    const p = this.run!.room!.puzzle!;
    const v = p.cells[i];
    const markMode = this.mode === 'mark' || e.button === 2;
    let action: DragAction = 'none';
    if (v === 0) action = markMode ? 'mark' : 'paint';
    else if (v === 2) action = 'unmark';
    this.drag = { start: i, action, axis: null, last: i, pointer: e.pointerId, count: 0 };
    if (action !== 'none' && !this.applyCells(action, [i], 0)) this.drag = null;
    else if (this.drag) this.drag.count = 1;
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointer || d.action === 'none') return;
    const j = this.cellAt(e.clientX, e.clientY);
    if (j === null || j === d.last) return;
    const p = this.run?.room?.puzzle;
    if (!p) return;
    const sr = Math.floor(d.start / p.w);
    const sc = d.start % p.w;
    const jr = Math.floor(j / p.w);
    const jc = j % p.w;
    if (!d.axis) {
      if (jr === sr && jc === sc) return;
      d.axis = Math.abs(jc - sc) >= Math.abs(jr - sr) ? 'row' : 'col';
    }
    const end = d.axis === 'row' ? sr * p.w + jc : jr * p.w + sc;
    d.last = j;
    this.setCursor(end);
    const cells: number[] = [];
    if (d.axis === 'row') {
      const step = jc >= sc ? 1 : -1;
      for (let c = sc; c !== jc + step; c += step) cells.push(sr * p.w + c);
    } else {
      const step = jr >= sr ? 1 : -1;
      for (let r = sr; r !== jr + step; r += step) cells.push(r * p.w + sc);
    }
    const todo = cells.filter((i) => (d.action === 'unmark' ? p.cells[i] === 2 : p.cells[i] === 0));
    if (!todo.length) return;
    if (!this.applyCells(d.action, todo, d.count)) {
      this.drag = null;
      return;
    }
    d.count += todo.length;
  }

  private endDrag(): void {
    this.drag = null;
  }

  private keyAction(kind: 'paint' | 'mark'): DragAction {
    const p = this.run?.room?.puzzle;
    if (!p) return 'none';
    const v = p.cells[this.cursor];
    if (v === 0) return kind;
    if (v === 2) return kind === 'mark' ? 'unmark' : 'none';
    return 'none';
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key;
    if (this.modal) {
      if (k === 'Escape' || k === 'Enter') {
        e.preventDefault();
        this.closeModal();
      }
      return;
    }
    if (k === '?') {
      this.modal = { kind: 'help' };
      this.render();
      return;
    }
    if (this.screen === 'puzzle') {
      this.puzzleKey(e);
      return;
    }
    if (k === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen === 'map' && /^[1-3]$/.test(k)) {
      this.chooseDoor(Number(k) - 1);
      return;
    }
    if ((this.screen === 'reward' || this.screen === 'vault') && /^[1-3]$/.test(k)) {
      const picks = this.root.querySelectorAll<HTMLElement>('.pick:not([disabled])');
      picks[Number(k) - 1]?.click();
      return;
    }
    if (k === 'Enter') {
      const b = this.root.querySelector<HTMLElement>('main button.primary:not([disabled])');
      if (b) {
        e.preventDefault();
        b.click();
      }
    }
  }

  private puzzleKey(e: KeyboardEvent): void {
    const k = e.key;
    const r = this.run!;
    const p = r.room!.puzzle!;
    if (this.busy()) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (moves[k]) {
      e.preventDefault();
      const [dx, dy] = moves[k];
      const c = (this.cursor % p.w) + dx;
      const rr = Math.floor(this.cursor / p.w) + dy;
      if (c < 0 || c >= p.w || rr < 0 || rr >= p.h) return;
      this.setCursor(rr * p.w + c);
      sfx.move();
      if (this.keyDrag && this.keyDrag !== 'none' && !this.spell) {
        const v = p.cells[this.cursor];
        const ok = this.keyDrag === 'unmark' ? v === 2 : v === 0;
        if (ok && !this.applyCells(this.keyDrag, [this.cursor])) this.keyDrag = null;
      }
      return;
    }
    if (e.repeat) return;
    if (k === 'Escape') {
      if (this.spell) this.cancelSpell();
      else {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
      return;
    }
    if (this.spell) {
      const def = SPELLS[this.spell];
      const [row, col] = linesOfCell(p, this.cursor);
      if (def.target === 'cell' && (k === ' ' || k === 'Enter' || k === 'z' || k === 'Z')) {
        e.preventDefault();
        this.cast(this.spell, this.cursor);
      } else if (def.target === 'line' && (k === 'r' || k === 'R' || k === ' ' || k === 'Enter')) {
        e.preventDefault();
        this.cast(this.spell, row);
      } else if (def.target === 'line' && (k === 'c' || k === 'C')) this.cast(this.spell, col);
      else if (/^[1-7]$/.test(k)) this.spellKey(Number(k));
      return;
    }
    if (k === ' ' || k === 'z' || k === 'Z' || k === 'Enter') {
      e.preventDefault();
      this.keyDrag = this.keyAction(this.mode === 'mark' && k !== 'z' && k !== 'Z' ? 'mark' : 'paint');
      if (this.keyDrag !== 'none') this.applyCells(this.keyDrag, [this.cursor]);
    } else if (k === 'x' || k === 'X') {
      this.keyDrag = this.keyAction('mark');
      if (this.keyDrag !== 'none') this.applyCells(this.keyDrag, [this.cursor]);
    } else if (k === 'q' || k === 'Q' || k === 'Tab') {
      e.preventDefault();
      this.mode = this.mode === 'paint' ? 'mark' : 'paint';
      this.refreshTools();
    } else if (/^[1-7]$/.test(k)) this.spellKey(Number(k));
  }

  private spellKey(n: number): void {
    const id = this.run?.spells[n - 1];
    if (id) this.selectSpell(id);
  }

  private onKeyUp(e: KeyboardEvent): void {
    if ([' ', 'z', 'Z', 'x', 'X', 'Enter'].includes(e.key)) this.keyDrag = null;
  }

  // ---------- Debug ----------

  private installDebug(): void {
    const rng = new Rng(Date.now() & 0xffff);
    const api = {
      state: () => {
        const r = this.run;
        const p = r?.room?.puzzle;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          busy: this.busy(),
          floor: r ? r.floor + 1 : null,
          step: r?.step ?? null,
          hp: r?.hp ?? null,
          mana: r?.mana ?? null,
          gold: r?.gold ?? null,
          keys: r?.keys ?? null,
          charms: r?.charms ?? null,
          doors: r && !r.room ? r.doors.map((d) => `${d.kind}${d.pic ? ':' + d.pic : ''} ${d.size}`) : null,
          puzzle: p ? { size: p.w, pic: p.pic, mistakes: p.mistakes, progress: Math.round(progress(p) * 100), hidden: p.hidden.length, solved: p.solved } : null,
          end: this.end ? { win: this.end.win, score: this.end.score, shards: this.end.shards, floor: this.end.run.floor + 1 } : null,
        };
      },
      /** One bot action. The bot uses the line solver and slips now and then. */
      step: () => {
        if (this.busy()) return 'busy';
        if (this.modal) {
          this.closeModal();
          return 'modal';
        }
        if (this.screen === 'title') {
          this.startRun();
          return 'new';
        }
        if (this.screen === 'end') return 'end';
        const r = this.run!;
        const a = botAction(r, rng, { slip: 0.02, stuck: 0.05, smart: true });
        switch (a.t) {
          case 'door':
            this.chooseDoor(a.i);
            break;
          case 'line':
            if (a.fills.length && !this.applyCells('paint', a.fills)) break;
            if (a.empties.length && r.room?.puzzle && !r.room.puzzle.solved) this.applyCells('mark', a.empties);
            break;
          case 'paint':
            this.applyCells('paint', a.cells);
            break;
          case 'cast':
            this.cast(a.id, a.target);
            break;
          case 'pick':
            pickReward(r, a.charm);
            this.save();
            this.render();
            break;
          case 'buy': {
            const it = r.room!.shop![a.i];
            if (buy(r, it)) sfx.coin();
            this.save();
            this.render();
            break;
          }
          case 'pray':
            pray(r);
            this.save();
            this.render();
            break;
          case 'vault':
            openVault(r, a.charm);
            this.save();
            this.render();
            break;
          case 'leave':
            this.leaveRoom();
            break;
        }
        return a.t;
      },
      hp: (n: number) => {
        if (this.run) this.run.hp = n;
        this.refreshTop();
      },
      mana: (n: number) => {
        if (this.run) this.run.mana = n;
        this.refreshTop();
        this.refreshTools();
      },
      shards: (n: number) => {
        this.meta.shards += n;
        this.saveMetaNow();
        this.render();
      },
      /** Solve the current puzzle at once. */
      solve: () => {
        const p = this.run?.room?.puzzle;
        if (!p || p.solved) return false;
        const fills = p.cells.map((_, i) => i).filter((i) => p.sol[i] === '1');
        this.applyCells('paint', fills);
        return true;
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
