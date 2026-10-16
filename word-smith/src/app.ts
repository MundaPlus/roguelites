import { bestMove, botPotion } from './bot';
import { BOOKS, CHAPTERS, ENEMIES, GEMS, POTIONS, VALUE, lengthMult } from './data';
import { isLoaded, loadWords, wordCount } from './dict';
import {
  alive,
  def,
  enemyTurn,
  fightResult,
  playWord,
  preview,
  scramble,
  tileFor,
  tileValue,
  usable,
  usePotion,
  type EnemyInst,
  type Fight,
  type Fx,
  type Hero,
  type Tile,
} from './fight';
import { randomSeedText } from './rng';
import {
  LOCKED,
  PLAN,
  ROOM_INFO,
  addBook,
  advance,
  applyPick,
  canTake,
  clearRun,
  eventDef,
  fightRewards,
  inkFor,
  loadMeta,
  loadRun,
  makeShop,
  newRun,
  pickEvent,
  pickLabel,
  restHeal,
  rngFor,
  roomKind,
  saveMeta,
  saveRun,
  score,
  startFight,
  unlockCost,
  unlockInfo,
  type Room,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'event' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

/** `?debug&fast` skips animation waits, for bot tests. */
const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, FAST ? 0 : ms));

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const letterText = (ch: string): string => (ch === 'q' ? 'Qu' : ch.toUpperCase());

function hpBar(hp: number, max: number, cls = ''): string {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return `<div class="hp ${cls}"><div class="hp-fill" style="width:${pct}%"></div><span>${Math.max(0, hp)} / ${max}</span></div>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private sel: number[] = [];
  private busy = false;
  private afterQ = false;
  private seen = new Set<number>();
  private end: { victory: boolean; score: number; ink: number; chapter: number; words: number; longest: string; best: number } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
    loadWords()
      .then(() => this.render())
      .catch(() => this.toast('Could not load the word list. Reload the page.'));
  }

  private get hero(): Hero {
    return this.run!.hero;
  }

  private get f(): Fight | null {
    return this.run?.fight ?? null;
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'map':
        body = this.mapView();
        break;
      case 'fight':
        body = this.fightView();
        break;
      case 'reward':
        body = this.rewardView();
        break;
      case 'shop':
        body = this.shopView();
        break;
      case 'rest':
        body = this.restView();
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
    if (this.f) for (const t of this.f.grid) this.seen.add(t.id);
    if (this.screen !== 'fight') document.querySelectorAll('.float, .fly').forEach((el) => el.remove());
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const h = r.hero;
    const books = h.books.map((id) => `<span class="relic" title="${BOOKS[id].name}: ${BOOKS[id].text}">${BOOKS[id].icon}</span>`).join('');
    const ch = CHAPTERS[Math.min(r.chapter, CHAPTERS.length - 1)];
    return `<header class="top">
      <span>❤️ ${Math.max(0, h.hp)}/${h.maxHp}</span>
      <span>💰 ${h.gold}</span>
      <span title="Chapter and step">${ch.icon} ${Math.min(r.chapter + 1, 3)}-${r.step + 1}</span>
      <span title="Gems">💠 ${h.gems.length}</span>
      <span class="relics">${books}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play" aria-label="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound" aria-label="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu" aria-label="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const archive = LOCKED.map((id) => {
      const it = unlockInfo(id);
      const own = m.unlocked.includes(id);
      const cost = unlockCost(id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${it.icon}</span><span><b>${it.name}</b><small>${it.kind}: ${it.text}</small></span>
        ${own ? '<span class="ok">✔ Unlocked</span>' : `<button data-act="unlock" data-id="${id}" ${m.ink >= cost ? '' : 'disabled'}>🖋️ ${cost}</button>`}</div>`;
    }).join('');
    const ready = isLoaded();
    const r = this.run;
    return `<div class="title">
      <h1><span class="logo">${'WORD'.split('').map((c) => `<i>${c}</i>`).join('')}</span> Smith</h1>
      <p class="sub">Spell words from a grid of 16 letter tiles. Every word is an attack. Long words and rare letters hit harder. Clear 3 chapters and beat their bosses.</p>
      ${ready ? '' : '<p class="dim">Loading the word list…</p>'}
      ${r ? `<button class="primary" data-act="continue" ${ready ? '' : 'disabled'}>▶ Continue run (chapter ${r.chapter + 1}, ❤️ ${r.hero.hp})</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new" ${ready ? '' : 'disabled'}>${r ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best chapter ${m.bestChapter} · Best score ${m.best}${m.longest ? ` · Longest word <b>${esc(m.longest.toUpperCase())}</b>` : ''}</p>
      ${ready ? `<p class="dim small">${wordCount().toLocaleString('en')} words in the dictionary</p>` : ''}
      <h2>Archive <small>🖋️ ${m.ink} ink</small></h2>
      <p class="sub">Each run gives ink. Unlock gems, books and starting kits for later runs.</p>
      <div class="armory">${archive}</div>
    </div>`;
  }

  private inventory(): string {
    const h = this.hero;
    const gems = h.gems.length ? h.gems.map((g) => `<span class="chip" title="${GEMS[g].text}">${GEMS[g].icon} ${GEMS[g].name}</span>`).join('') : '<span class="dim">none</span>';
    const books = h.books.length ? h.books.map((b) => `<span class="chip" title="${BOOKS[b].text}">${BOOKS[b].icon} ${BOOKS[b].name}</span>`).join('') : '<span class="dim">none</span>';
    const pots = h.potions.length ? h.potions.map((p) => `<span class="chip" title="${POTIONS[p].text}">${POTIONS[p].icon} ${POTIONS[p].name}</span>`).join('') : '<span class="dim">none</span>';
    return `<div class="inv"><div><h3>Gems</h3><div class="bag">${gems}</div></div>
      <div><h3>Books</h3><div class="bag">${books}</div></div>
      <div><h3>Potions (${h.potions.length}/${h.slots})</h3><div class="bag">${pots}</div></div></div>`;
  }

  private mapView(): string {
    const r = this.run!;
    const ch = CHAPTERS[r.chapter];
    const track = PLAN.map((opts, i) => {
      const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
      return `<span class="node ${state}">${opts.map((o) => ROOM_INFO[o].icon).join('')}</span>`;
    }).join('<span class="link"></span>');
    const rooms = PLAN[r.step]
      .map((room, i) => {
        const info = ROOM_INFO[room];
        let extra = '';
        if (room === 'boss') extra = `<small class="foe">${ENEMIES[ch.boss].icon} ${ENEMIES[ch.boss].name}</small>`;
        if (room === 'elite') extra = `<small class="foe">${ENEMIES[ch.elite].icon} ${ENEMIES[ch.elite].name}</small>`;
        return `<button class="room r-${room}" data-act="room" data-room="${room}"><span class="key">${i + 1}</span><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}</button>`;
      })
      .join('');
    return `<div class="map">
      <h2>${ch.icon} Chapter ${r.chapter + 1}: ${ch.name}</h2>
      ${r.step === PLAN.length - 1 ? `<p class="warn">${ch.bossLine}</p>` : ''}
      <div class="track">${track}</div>
      <div class="rooms">${rooms}</div>
      ${this.inventory()}
    </div>`;
  }

  // ---------- Fight view ----------

  private enemyCard(e: EnemyInst, f: Fight): string {
    const d = def(e);
    const dead = e.hp <= 0;
    const tgt = !dead && e.uid === (f.enemies.find((x) => x.uid === f.target && x.hp > 0)?.uid ?? alive(f)[0]?.uid);
    const soon = e.wait <= 1;
    return `<button class="enemy ${dead ? 'dead' : ''} ${tgt ? 'target' : ''} ${f.kind}" data-act="target" data-uid="${e.uid}" title="${esc(d.text)}">
      <span class="timer ${soon ? 'soon' : ''}" title="Turns until it attacks">⚔️${e.atk} in ${e.wait}</span>
      <span class="eicon">${d.icon}</span>
      <b class="ename">${d.name}</b>
      ${hpBar(e.hp, e.max)}
      <span class="estat">${e.block ? `<i>🛡️${e.block}</i>` : ''}${e.poison ? `<i>☠️${e.poison}</i>` : ''}<small>${esc(d.text)}</small></span>
    </button>`;
  }

  private tileHtml(t: Tile, i: number): string {
    const k = this.sel.indexOf(i);
    const h = this.hero;
    const cls = ['tile'];
    if (k >= 0) cls.push('sel');
    if (t.gem) cls.push('gem');
    if (t.lock) cls.push('locked');
    if (t.crack) cls.push('cracked');
    if (t.poison) cls.push('poison');
    if (!this.seen.has(t.id)) cls.push('new');
    const style = t.gem ? ` style="--gc:${GEMS[t.gem].color}"` : '';
    const tip = [t.gem ? `${GEMS[t.gem].name}: ${GEMS[t.gem].text}` : '', t.lock ? `Locked for ${t.lock} turns` : '', t.crack ? 'Cracked: worth 0' : '', t.poison ? 'Poisoned: hurts you 1 each turn. Use it to clean it.' : '']
      .filter(Boolean)
      .join(' · ');
    return `<button class="${cls.join(' ')}" data-act="tile" data-i="${i}"${style}${tip ? ` title="${tip}"` : ''} ${t.lock ? 'aria-disabled="true"' : ''}>
      <span class="ch">${letterText(t.ch)}</span>
      <span class="val">${tileValue(h, t)}</span>
      ${t.gem ? `<span class="gi">${GEMS[t.gem].icon}</span>` : ''}
      ${t.lock ? `<span class="lk">🔒${t.lock}</span>` : ''}
      ${t.poison ? '<span class="pz">☠️</span>' : ''}
      ${k >= 0 ? `<span class="ord">${k + 1}</span>` : ''}
    </button>`;
  }

  private wordBox(): string {
    const f = this.f!;
    const h = this.hero;
    const p = preview(h, f, this.sel);
    const letters = this.sel.map((i) => `<span>${letterText(f.grid[i].ch)}</span>`).join('');
    let info = '<span class="dim">Type or tap letters to spell a word.</span>';
    if (this.sel.length) {
      const extras = [p.heal ? `💚${p.heal}` : '', p.block ? `🛡️${p.block}` : '', p.gold ? `💰${p.gold}` : '', p.poison ? `☠️${p.poison}` : '', p.delay ? `⚫+${p.delay}` : '', ...p.notes].filter(Boolean).join(' ');
      info = p.valid
        ? `<span class="ok">⚔️ ${p.dmg} damage</span> <span class="dim">${p.len} letters ×${lengthMult(p.len)}</span> ${extras}`
        : `<span class="bad">${p.reason}</span>${p.len >= 3 ? '' : ''}`;
    }
    const can = p.valid && !this.busy;
    return `<div class="wordbox ${p.valid ? 'valid' : ''}">
      <div class="word">${letters || '<span class="ph">…</span>'}</div>
      <div class="winfo">${info}</div>
      <div class="wbtns">
        <button data-act="clear" ${this.sel.length && !this.busy ? '' : 'disabled'} title="Clear (Esc)">✖</button>
        <button data-act="scramble" ${this.busy ? 'disabled' : ''} title="New letters for the grid. Uses a turn. (Key 0)">🔀 Scramble</button>
        <button class="primary attack" data-act="attack" ${can ? '' : 'disabled'} title="Attack (Enter)">⚔️ Attack</button>
      </div>
    </div>`;
  }

  private fightView(): string {
    const f = this.f!;
    const h = this.hero;
    const pots = Array.from({ length: h.slots }, (_, i) => {
      const id = h.potions[i];
      return id
        ? `<button class="pot" data-act="potion" data-i="${i}" title="${POTIONS[id].name}: ${POTIONS[id].text} (key ${i + 1})" ${this.busy ? 'disabled' : ''}>${POTIONS[id].icon}<small>${i + 1}</small></button>`
        : '<span class="pot empty"></span>';
    }).join('');
    return `<div class="fight">
      <div class="enemies n${f.enemies.length}">${f.enemies.map((e) => this.enemyCard(e, f)).join('')}</div>
      <div class="hero" id="hero">
        <span class="hicon">🧙</span>
        <div class="hbar">${hpBar(h.hp, h.maxHp, 'me')}</div>
        ${f.block ? `<span class="hblock" title="Block absorbs damage">🛡️ ${f.block}</span>` : ''}
        ${f.muse ? '<span class="hblock" title="Next word deals double">✨</span>' : ''}
        <div class="pots">${pots}</div>
      </div>
      ${this.wordBox()}
      <div class="grid">${f.grid.map((t, i) => this.tileHtml(t, i)).join('')}</div>
      <p class="hint">Keys: letters select tiles · Enter attacks · Backspace removes · Esc clears · 0 scrambles · 1–4 potions · ←/→ target</p>
    </div>`;
  }

  /** Update the fight parts without losing running animations. */
  private refreshFight(): void {
    if (this.screen !== 'fight' || this.modal) return this.render();
    const f = this.f!;
    const wb = this.root.querySelector('.wordbox');
    const grid = this.root.querySelector('.grid');
    if (!wb || !grid) return this.render();
    wb.outerHTML = this.wordBox();
    grid.innerHTML = f.grid.map((t, i) => this.tileHtml(t, i)).join('');
    for (const t of f.grid) this.seen.add(t.id);
  }

  // ---------- Other screens ----------

  private pickCard(p: ReturnType<typeof pickLabel>, extra = ''): string {
    return `<span class="big">${p.icon}</span><b>${p.name}</b><small>${p.text}</small>${extra}`;
  }

  private rewardView(): string {
    const rw = this.run!.rewards!;
    const h = this.hero;
    const book = rw.book ? `<p class="good">The elite drops ${BOOKS[rw.book].icon} <b>${BOOKS[rw.book].name}</b>: ${BOOKS[rw.book].text}</p>` : '';
    const choice = rw.bookChoice.length
      ? `<h3>Choose a book</h3><div class="picks">${rw.bookChoice
          .map((id) => `<button class="pick ${rw.bookPicked ? 'off' : ''}" data-act="book-pick" data-id="${id}" ${rw.bookPicked ? 'disabled' : ''}>${this.pickCard(pickLabel({ kind: 'book', id }))}</button>`)
          .join('')}</div>`
      : '';
    const picks = rw.picked
      ? '<p class="dim">Reward taken.</p>'
      : `<div class="picks">${rw.picks
          .map((p, i) => {
            const ok = canTake(h, p);
            return `<button class="pick" data-act="pick" data-i="${i}" ${ok ? '' : 'disabled'}><span class="key">${i + 1}</span>${this.pickCard(pickLabel(p), ok ? '' : '<small class="warn">Potion belt full</small>')}</button>`;
          })
          .join('')}</div>`;
    const canGo = rw.picked && (!rw.bookChoice.length || rw.bookPicked);
    return `<div class="reward">
      <h2 class="good">Victory!</h2>
      <p>💰 +${rw.gold} gold${rw.heal ? ` · ❤️ +${rw.heal} HP` : ''}</p>
      ${book}${choice}
      <h3>Choose one reward</h3>${picks}
      ${rw.picked ? '' : '<button data-act="skip">Skip</button>'}
      <button class="primary" data-act="advance" ${canGo ? '' : 'disabled'}>Continue ▶</button>
    </div>`;
  }

  private shopView(): string {
    const h = this.hero;
    const items = this.run!.shop!.map((it, i) => {
      const body = 'heal' in it ? this.pickCard({ icon: '🍵', name: `Heal ${it.heal} HP`, text: 'A warm cup of tea.' }) : this.pickCard(pickLabel(it.pick));
      const ok = !it.sold && h.gold >= it.cost && ('heal' in it ? h.hp < h.maxHp : canTake(h, it.pick));
      return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${ok ? '' : 'disabled'}>${body}<span class="cost">${it.sold ? 'Sold' : `💰 ${it.cost}`}</span></button>`;
    }).join('');
    return `<div class="shopv"><h2>🛒 Book Shop</h2><p>💰 ${h.gold} gold</p><div class="picks">${items}</div>
      <button class="primary" data-act="advance">Leave ▶</button>${this.inventory()}</div>`;
  }

  private restView(): string {
    const h = this.hero;
    return `<div class="restv"><h2>🕯️ Reading Room</h2><p class="sub">A quiet room with soft chairs. Rest, or study.</p>
      <div class="picks">
        <button class="pick" data-act="rest-heal"><span class="key">1</span><span class="big">💤</span><b>Rest</b><small>Heal ${restHeal(h)} HP (now ${h.hp}/${h.maxHp}).</small></button>
        <button class="pick" data-act="rest-study"><span class="key">2</span><span class="big">📖</span><b>Study</b><small>+6 max HP.</small></button>
      </div>${this.inventory()}</div>`;
  }

  private eventView(): string {
    const ev = this.run!.event!;
    const d = eventDef(ev.id);
    const r = this.run!;
    const opts = ev.result
      ? `<p class="result">${ev.result}</p><button class="primary" data-act="advance">Continue ▶</button>`
      : d.options.map((o, i) => `<button data-act="event-opt" data-i="${i}" ${!o.can || o.can(r) ? '' : 'disabled'}>${o.label}</button>`).join('');
    return `<div class="eventv"><span class="huge">${d.icon}</span><h2>${d.title}</h2><p>${d.text}</p><div class="opts">${opts}</div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory!' : '💀 Defeat'}</h1>
      <p>${e.victory ? 'The Unspeller falls silent. The library is safe.' : `You fell in chapter ${e.chapter + 1}.`}</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p>Words ${e.words} · Longest <b>${esc(e.longest.toUpperCase() || '—')}</b> · Best hit ${e.best}</p>
      <p>🖋️ +${e.ink} ink for the Archive</p>
      <button class="primary" data-act="title">Title screen</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      const vals = [1, 2, 3, 4].map((v) => `<b>${v}</b>: ${Object.keys(VALUE).filter((c) => VALUE[c] === v).map((c) => letterText(c)).join(' ')}`).join('<br>');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Spell a word</b> with the 16 tiles. Tap tiles, or type the letters. Words need 3+ letters. Press <b>Attack</b> or Enter.</li>
          <li><b>Damage</b> = the sum of the letter values × a length bonus (3 letters ×1, 5 letters ×1.6, 7 letters ×2.4, 10 letters ×3.6). "Qu" is one tile with two letters.</li>
          <li>Letter values:<br>${vals}</li>
          <li>Used tiles are replaced. The grid always has 5 to 7 vowels.</li>
          <li><b>Enemies</b> attack when their timer (⚔️ N in T) reaches 0. Each word or scramble is one turn. Tap an enemy to target it.</li>
          <li><b>Gem tiles</b> have a color and add an effect to the word. Each gem you own adds gem tiles to the grid.</li>
          <li><b>Bad tiles</b> come from enemies: 🔒 locked tiles cannot be used for a few turns, cracked tiles are worth 0, ☠️ poisoned tiles hurt you 1 per turn until you use them.</li>
          <li><b>Scramble</b> gives new letters to all unlocked tiles, but costs a turn.</li>
          <li><b>Potions</b> do not cost a turn. <b>Books</b> are passive bonuses.</li>
          <li>Walk the map: fights, elites, shops, events and reading rooms. Beat the boss of each of the 3 chapters.</li>
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

  // ---------- Effects ----------

  private float(anchor: Element | null, text: string, cls: string): void {
    if (!anchor || FAST) return;
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `float ${cls}`;
    el.textContent = text;
    el.style.left = `${r.left + r.width / 2 + (Math.random() * 30 - 15)}px`;
    el.style.top = `${r.top + r.height * 0.35}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  private bump(el: Element | null, cls: string): void {
    if (!el) return;
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
  }

  private enemyEl(uid: number): Element | null {
    return this.root.querySelector(`.enemy[data-uid="${uid}"]`);
  }

  private playFx(fx: Fx[]): void {
    const hero = this.root.querySelector('#hero');
    for (const e of fx) {
      switch (e.k) {
        case 'hit':
          this.float(this.enemyEl(e.uid), `-${e.n}`, e.n >= 40 ? 'dmg big' : 'dmg');
          this.bump(this.enemyEl(e.uid), 'hit');
          sfx.hit(e.n >= 40);
          break;
        case 'kill':
          sfx.kill();
          break;
        case 'heal':
          this.float(hero, `+${e.n}`, 'heal');
          sfx.heal();
          break;
        case 'block':
          this.float(hero, `🛡️+${e.n}`, 'blockf');
          sfx.block();
          break;
        case 'gold':
          this.float(hero, `💰+${e.n}`, 'goldf');
          sfx.coin();
          break;
        case 'hurt':
          if (e.n > 0) {
            this.float(hero, `-${e.n}`, 'dmg');
            this.bump(hero, 'hurt');
            this.bump(this.root.querySelector('.fight'), 'shake');
            sfx.hurt();
          } else sfx.block();
          break;
        case 'eattack':
          this.bump(this.enemyEl(e.uid), 'lunge');
          break;
        case 'eheal':
          this.float(this.enemyEl(e.uid), `+${e.n}`, 'heal');
          break;
        case 'eblock':
          this.float(this.enemyEl(e.uid), `🛡️+${e.n}`, 'blockf');
          break;
        case 'epoison':
          this.float(this.enemyEl(e.uid), `☠️${e.n}`, 'poisonf');
          break;
        case 'msg':
          this.toast(e.text);
          sfx.curse();
          break;
      }
    }
  }

  private flyWord(word: string, uid: number): void {
    const from = this.root.querySelector('.word');
    const to = this.enemyEl(uid);
    if (!from || !to || FAST) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'fly';
    el.textContent = word.toUpperCase();
    el.style.left = `${a.left + a.width / 2}px`;
    el.style.top = `${a.top + a.height / 2}px`;
    el.style.setProperty('--dx', `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
    el.style.setProperty('--dy', `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  }

  // ---------- Fight actions ----------

  private selectTile(i: number): void {
    const f = this.f;
    if (!f || this.busy) return;
    const k = this.sel.indexOf(i);
    if (k >= 0) {
      this.sel = this.sel.slice(0, k);
      sfx.untile();
    } else {
      if (!usable(f.grid[i])) return sfx.deny();
      this.sel.push(i);
      sfx.tile(this.sel.length);
    }
    this.refreshFight();
  }

  private typeLetter(ch: string): void {
    const f = this.f;
    if (!f || this.busy) return;
    if (ch === 'u' && this.afterQ) {
      this.afterQ = false;
      return;
    }
    const i = tileFor(f, ch, this.sel);
    if (i < 0) {
      sfx.deny();
      this.bump(this.root.querySelector('.wordbox'), 'nope');
      return;
    }
    this.afterQ = ch === 'q';
    this.sel.push(i);
    sfx.tile(this.sel.length);
    this.refreshFight();
  }

  private async attack(): Promise<void> {
    const f = this.f;
    if (!f || this.busy) return;
    const h = this.hero;
    const p = preview(h, f, this.sel);
    if (!p.valid) {
      sfx.deny();
      this.bump(this.root.querySelector('.wordbox'), 'nope');
      return;
    }
    const target = (f.enemies.find((e) => e.uid === f.target && e.hp > 0) ?? alive(f)[0]).uid;
    this.busy = true;
    sfx.word(p.len);
    this.flyWord(p.word, target);
    const res = playWord(h, f, this.sel)!;
    this.sel = [];
    this.afterQ = false;
    this.run!.words++;
    if (f.longest.length > this.run!.longest.length) this.run!.longest = f.longest;
    this.run!.best = Math.max(this.run!.best, f.best);
    await wait(220);
    this.render();
    this.playFx(res.fx);
    await this.afterTurn(res.free);
  }

  private async doScramble(): Promise<void> {
    const f = this.f;
    if (!f || this.busy) return;
    this.busy = true;
    this.sel = [];
    const free = scramble(this.hero, f);
    sfx.scramble();
    this.render();
    await this.afterTurn(free);
  }

  private async afterTurn(free: boolean): Promise<void> {
    const f = this.f!;
    const h = this.hero;
    if (!fightResult(h, f) && !free) {
      await wait(450);
      const fx = enemyTurn(h, f);
      this.render();
      this.playFx(fx);
    }
    const res = fightResult(h, f);
    if (res) {
      await wait(650);
      this.busy = false;
      if (res === 'win') this.winFight();
      else this.endRun(false);
      return;
    }
    if (!alive(f).some((e) => e.uid === f.target)) f.target = alive(f)[0].uid;
    this.busy = false;
    saveRun(this.run!);
    this.render();
  }

  private drink(i: number): void {
    const f = this.f;
    if (!f || this.busy) return;
    const fx = usePotion(this.hero, f, i);
    if (!fx) {
      sfx.deny();
      this.toast('That potion would do nothing now.');
      return;
    }
    sfx.potion();
    this.render();
    this.playFx(fx);
    const res = fightResult(this.hero, f);
    if (res) {
      this.busy = true;
      void this.afterTurn(true);
      return;
    }
    if (!alive(f).some((e) => e.uid === f.target)) f.target = alive(f)[0].uid;
    saveRun(this.run!);
  }

  private winFight(): void {
    const r = this.run!;
    const f = r.fight!;
    r.kills += f.kills;
    r.fights++;
    const kind = f.kind;
    const rw = fightRewards(r, kind);
    r.hero.gold += rw.gold;
    r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + rw.heal);
    if (rw.book) addBook(r.hero, rw.book);
    r.rewards = rw;
    r.fight = null;
    this.sel = [];
    sfx.win();
    this.go('reward');
  }

  // ---------- Run flow ----------

  private go(at: RunState['at']): void {
    const r = this.run!;
    r.at = at;
    this.screen = at;
    saveRun(r);
    this.render();
    window.scrollTo(0, 0);
  }

  private enterRoom(room: Room): void {
    const r = this.run!;
    r.room = room;
    sfx.step();
    if (room === 'fight' || room === 'elite' || room === 'boss') {
      r.fight = startFight(r, room);
      this.sel = [];
      this.seen.clear();
      for (const t of r.fight.grid) this.seen.add(t.id);
      this.go('fight');
      if (room !== 'fight') this.toast(`${roomKind(room) === 'boss' ? '👑' : '💀'} ${ENEMIES[r.fight.enemies[0].id].name}!`);
    } else if (room === 'shop') {
      r.shop = makeShop(r);
      this.go('shop');
    } else if (room === 'rest') this.go('rest');
    else {
      r.event = { id: pickEvent(r).id, result: null };
      this.go('event');
    }
  }

  private nextStep(): void {
    const r = this.run!;
    r.rewards = null;
    r.shop = null;
    r.event = null;
    r.room = null;
    if (advance(r)) return this.endRun(true);
    if (r.step === 0) this.toast(`${CHAPTERS[r.chapter].icon} Chapter ${r.chapter + 1}: ${CHAPTERS[r.chapter].name}`);
    this.go('map');
  }

  private endRun(victory: boolean): void {
    const r = this.run!;
    if (r.fight) r.kills += r.fight.kills;
    const sc = score(r, victory);
    const ink = inkFor(sc);
    const m = this.meta;
    m.ink += ink;
    if (victory) m.wins++;
    m.bestChapter = Math.max(m.bestChapter, victory ? 3 : r.chapter + 1);
    m.best = Math.max(m.best, sc);
    if (r.longest.length > m.longest.length) m.longest = r.longest;
    saveMeta(m);
    this.end = { victory, score: sc, ink, chapter: r.chapter, words: r.words, longest: r.longest, best: r.best };
    clearRun();
    this.run = null;
    this.modal = null;
    this.busy = false;
    victory ? sfx.win() : sfx.lose();
    this.screen = 'end';
    this.render();
  }

  // ---------- Input ----------

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
        this.render();
        return;
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        this.render();
        return;
      case 'abandon-yes':
        this.modal = null;
        this.endRun(false);
        return;
      case 'title':
        if (this.busy) return;
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'new':
        if (!isLoaded()) return;
        this.run = newRun(randomSeedText(), this.meta);
        this.meta.runs++;
        saveMeta(this.meta);
        this.toast(`${CHAPTERS[0].icon} Chapter 1: ${CHAPTERS[0].name}`);
        this.go('map');
        return;
      case 'continue':
        if (!r || !isLoaded()) return;
        if (r.at === 'fight' && !r.fight) r.at = 'map';
        if (r.at === 'reward' && !r.rewards) r.at = 'map';
        if (r.at === 'shop' && !r.shop) r.at = 'map';
        if (r.at === 'event' && !r.event) r.at = 'map';
        this.sel = [];
        this.go(r.at);
        return;
      case 'unlock': {
        const id = d.id!;
        const cost = unlockCost(id);
        if (this.meta.ink < cost || this.meta.unlocked.includes(id)) return sfx.deny();
        this.meta.ink -= cost;
        this.meta.unlocked.push(id);
        saveMeta(this.meta);
        sfx.item();
        this.render();
        return;
      }
      case 'room':
        this.enterRoom(d.room as Room);
        return;
      case 'tile':
        this.selectTile(+d.i!);
        return;
      case 'target': {
        const f = this.f;
        const uid = +d.uid!;
        if (!f || !f.enemies.some((e) => e.uid === uid && e.hp > 0)) return;
        f.target = uid;
        sfx.step();
        this.render();
        return;
      }
      case 'clear':
        this.sel = [];
        this.afterQ = false;
        this.refreshFight();
        return;
      case 'attack':
        void this.attack();
        return;
      case 'scramble':
        void this.doScramble();
        return;
      case 'potion':
        this.drink(+d.i!);
        return;
      case 'pick': {
        const rw = r?.rewards;
        if (!rw || rw.picked) return;
        const p = rw.picks[+d.i!];
        if (!canTake(r.hero, p)) return sfx.deny();
        applyPick(r.hero, p);
        rw.picked = true;
        sfx.item();
        saveRun(r);
        this.render();
        return;
      }
      case 'skip':
        if (r?.rewards) r.rewards.picked = true;
        this.render();
        return;
      case 'book-pick': {
        const rw = r?.rewards;
        if (!rw || rw.bookPicked) return;
        addBook(r.hero, d.id!);
        rw.bookPicked = true;
        sfx.item();
        saveRun(r);
        this.render();
        return;
      }
      case 'advance':
        this.nextStep();
        return;
      case 'buy': {
        const it = r?.shop?.[+d.i!];
        if (!r || !it || it.sold || r.hero.gold < it.cost) return sfx.deny();
        if ('heal' in it) r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + it.heal);
        else {
          if (!canTake(r.hero, it.pick)) return sfx.deny();
          applyPick(r.hero, it.pick);
        }
        r.hero.gold -= it.cost;
        it.sold = true;
        sfx.coin();
        saveRun(r);
        this.render();
        return;
      }
      case 'rest-heal':
        if (!r) return;
        r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + restHeal(r.hero));
        sfx.heal();
        this.nextStep();
        return;
      case 'rest-study':
        if (!r) return;
        r.hero.maxHp += 6;
        r.hero.hp += 6;
        sfx.item();
        this.nextStep();
        return;
      case 'event-opt': {
        const ev = r?.event;
        if (!r || !ev || ev.result) return;
        const o = eventDef(ev.id).options[+d.i!];
        if (o.can && !o.can(r)) return;
        ev.result = o.run(r, rngFor(r, 'event-run', r.chapter, r.step));
        sfx.item();
        saveRun(r);
        this.render();
        return;
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    initAudio();
    const k = e.key;
    if (this.modal) {
      if (k === 'Escape' || k === 'Enter') {
        e.preventDefault();
        this.modal = null;
        this.render();
      }
      return;
    }
    if (k === 'Escape' && this.screen !== 'fight' && this.run && this.screen !== 'title' && this.screen !== 'end') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen === 'fight') {
      const f = this.f!;
      if (/^[a-zA-Z]$/.test(k)) {
        e.preventDefault();
        this.typeLetter(k.toLowerCase());
      } else if (k === 'Enter') {
        e.preventDefault();
        void this.attack();
      } else if (k === 'Backspace') {
        e.preventDefault();
        if (this.busy || !this.sel.length) return;
        this.sel.pop();
        this.afterQ = false;
        sfx.untile();
        this.refreshFight();
      } else if (k === 'Escape') {
        if (this.sel.length) {
          this.sel = [];
          this.refreshFight();
        } else {
          this.modal = { kind: 'menu', confirm: false };
          this.render();
        }
      } else if (k === '0') void this.doScramble();
      else if (/^[1-4]$/.test(k)) this.drink(+k - 1);
      else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !this.busy) {
        e.preventDefault();
        const a = alive(f);
        const i = a.findIndex((x) => x.uid === f.target);
        f.target = a[(Math.max(0, i) + (k === 'ArrowLeft' ? a.length - 1 : 1)) % a.length].uid;
        this.render();
      }
      return;
    }
    // Other screens: number keys pick an option, Enter presses the main button.
    if (/^[1-9]$/.test(k)) {
      const opts = [...this.root.querySelectorAll<HTMLButtonElement>('main .room, main .picks .pick, main .opts button')];
      const b = opts[+k - 1];
      if (b && !b.disabled) b.click();
    } else if (k === 'Enter') {
      const b = this.root.querySelector<HTMLButtonElement>('main button.primary:not(:disabled)');
      if (b) {
        e.preventDefault();
        b.click();
      }
    }
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLButtonElement>(sel);
      if (!el || el.disabled) return false;
      el.click();
      return true;
    };
    const api = {
      state: () => ({
        screen: this.screen,
        busy: this.busy,
        loaded: isLoaded(),
        modal: this.modal?.kind ?? null,
        chapter: this.run?.chapter,
        step: this.run?.step,
        hp: this.run?.hero.hp,
        gold: this.run?.hero.gold,
        gems: this.run?.hero.gems.length,
        books: this.run?.hero.books,
        word: this.f ? preview(this.hero, this.f, this.sel).word : null,
        grid: this.f?.grid.map((t) => t.ch).join('') ?? null,
        enemies: this.f?.enemies.map((e) => `${e.id} ${e.hp}/${e.max} wait ${e.wait}`) ?? null,
        end: this.end,
      }),
      gold: (n: number) => {
        if (this.run) this.run.hero.gold += n;
        this.render();
      },
      ink: (n: number) => {
        this.meta.ink += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        const f = this.f;
        if (!f || this.busy) return;
        for (const e of f.enemies) e.hp = 0;
        this.winFight();
      },
      /** Tile indexes of the best word the bot finds. */
      hint: () => (this.f ? (bestMove(this.hero, this.f)?.sel ?? null) : null),
      /** Select a word by typing it, as a player would. */
      type: (w: string) => {
        for (const c of w.toLowerCase()) this.typeLetter(c);
        return this.f ? preview(this.hero, this.f, this.sel).word : null;
      },
      /** One bot action for automatic tests. */
      step: async () => {
        if (!isLoaded() || this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            click('[data-act="new"]');
            return 'new';
          case 'map': {
            const h = this.hero;
            const has = (room: string): boolean => !!this.root.querySelector(`[data-room="${room}"]`);
            let room = '';
            if (has('rest') && h.hp < h.maxHp * 0.6) room = 'rest';
            else if (has('elite') && h.hp > h.maxHp * 0.75) room = 'elite';
            else if (has('shop') && h.gold >= 60) room = 'shop';
            else room = PLAN[r!.step].find((o) => o !== 'elite' && o !== 'shop') ?? PLAN[r!.step][0];
            click(`[data-room="${room}"]`);
            return 'room ' + room;
          }
          case 'fight': {
            const f = this.f!;
            const h = this.hero;
            const pi = botPotion(h, f);
            if (pi >= 0 && usePotion(h, f, pi)) {
              this.render();
              if (fightResult(h, f)) {
                this.busy = true;
                await this.afterTurn(true);
              }
              return 'potion';
            }
            const m = bestMove(h, f);
            if (!m) {
              await this.doScramble();
              return 'scramble';
            }
            f.target = m.target;
            this.sel = m.sel;
            const w = preview(h, f, m.sel).word;
            await this.attack();
            return 'word ' + w;
          }
          case 'reward':
            click('[data-act="book-pick"]');
            if (!r?.rewards?.picked && !click('[data-act="pick"]:not(:disabled)')) click('[data-act="skip"]');
            click('[data-act="advance"]');
            return 'reward';
          case 'shop': {
            const b = this.root.querySelector<HTMLButtonElement>('[data-act="buy"]:not(:disabled)');
            if (b) {
              b.click();
              return 'buy';
            }
            click('[data-act="advance"]');
            return 'shop';
          }
          case 'rest':
            click(this.hero.hp < this.hero.maxHp * 0.8 ? '[data-act="rest-heal"]' : '[data-act="rest-study"]');
            return 'rest';
          case 'event':
            if (!click('[data-act="event-opt"]:not(:disabled)')) click('[data-act="advance"]');
            return 'event';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
