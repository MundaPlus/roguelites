import { Learner, botAction, type Action } from './bot';
import { ACTS, CHARMS, FOES, PERKS, type Intent } from './data';
import { alive, hitDmg, intentOf, isTest, restlessTurn, scaled, type Ev, type Fight } from './fight';
import {
  KINDS,
  MEANING_INFO,
  MODS,
  RUNE_NAMES,
  RUNE_PATHS,
  SPECIAL_INFO,
  TGTS,
  allFacts,
  factKey,
  factText,
  parseFactKey,
  type Fact,
  type Kind,
  type Meaning,
} from './lang';
import { Rng, hash, randomSeedText } from './rng';
import {
  LIBRARY_COST,
  PLAN,
  ROOM_INFO,
  addCharm,
  advance,
  applyPick,
  buy,
  clearRun,
  doCast,
  doEnemyTurn,
  endRun,
  enterRoom,
  finishFight,
  guessedRight,
  loadMeta,
  loadRun,
  newRun,
  restHeal,
  revealFact,
  roomOptions,
  saveMeta,
  saveRun,
  testCasts,
  unknownFacts,
  useScroll,
  type LogEntry,
  type Pick,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'library' | 'end';
type NbTab = 'runes' | 'log' | 'lexicon';
type Modal =
  | { kind: 'help' }
  | { kind: 'menu'; confirm: boolean }
  | { kind: 'notebook' }
  | { kind: 'fact'; title: string; text: string }
  | { kind: 'scroll' };

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  size: number;
}

interface Bolt {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  t: number;
}

const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const DEBUG = PARAMS.has('debug');

const KIND_COLOR: Record<Kind, string> = { harm: '#ff7a45', mend: '#7ee08a', ward: '#4cc9f0', venom: '#a3e635', drain: '#ef476f', hex: '#c77dff' };

const glyph = (r: number, cls = 'g'): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" role="img" aria-label="${RUNE_NAMES[r]}"><path d="${RUNE_PATHS[r]}"/></svg>`;
const fmt = (text: string): string => text.replace(/\{r(\d)\}/g, (_, d: string) => glyph(Number(d), 'gi'));
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function intentLabel(f: Fight, i: number): { icon: string; text: string } {
  const foe = f.foes[i];
  const it: Intent = intentOf(foe);
  switch (it.t) {
    case 'atk': {
      const d = Math.max(0, hitDmg(f, foe, it.n) - (it.hits && it.hits > 1 ? 0 : foe.dull));
      return { icon: '⚔️', text: it.hits && it.hits > 1 ? `${hitDmg(f, foe, it.n)}×${it.hits}` : `${d}` };
    }
    case 'guard':
      return { icon: '🛡️', text: `${scaled(f, it.n)}` };
    case 'buff':
      return { icon: '💢', text: `+${it.n}` };
    case 'heal':
      return { icon: '✚', text: `${scaled(f, it.n)}` };
    case 'silence':
      return { icon: '🤐', text: `${it.n}` };
    case 'venom':
      return { icon: '☠️', text: `${it.n}` };
    case 'summon':
      return { icon: '📯', text: '' };
    case 'idle':
      return { icon: '💤', text: '' };
  }
}

function pickText(run: RunState, p: Pick): { icon: string; name: string; text: string } {
  switch (p.t) {
    case 'rune':
      return { icon: glyph(p.r, 'gbig'), name: `Rune ${RUNE_NAMES[p.r]}`, text: 'A new rune for your keyboard. Its meaning is hidden.' };
    case 'len':
      return { icon: '📏', name: 'Longer spells', text: `Spell length ${run.hero.maxLen} → ${run.hero.maxLen + 1}.` };
    case 'scroll':
      return { icon: '📜', name: 'Hint scroll', text: 'Read it to reveal one hidden rule or rune meaning.' };
    case 'charm':
      return { icon: CHARMS[p.id].icon, name: CHARMS[p.id].name, text: CHARMS[p.id].text };
    case 'hp':
      return { icon: '❤️', name: 'Vitality', text: '+6 max HP.' };
    case 'heal':
      return { icon: '🧪', name: 'Tonic', text: 'Heal 15 HP.' };
  }
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private nbTab: NbTab = 'runes';
  private spell: number[] = [];
  private lastSpell: number[] = [];
  private busy = false;
  private end: { victory: boolean; score: number; ink: number; run: RunState } | null = null;

  // Stage
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private W = 600;
  private H = 230;
  private dpr = 1;
  private raf = 0;
  private time = 0;
  private floats: Float[] = [];
  private bolts: Bolt[] = [];
  private shake = 0;
  private flash = new Map<number, number>();
  private lunge = new Map<number, number>();
  private shownHp = new Map<number, number>();
  private castGlyphs: { r: number; silent: boolean; t: number }[] = [];
  private banner: { text: string; color: string; t: number } | null = null;

  private learner: Learner | null = null;
  private botRng = new Rng(hash(Date.now()));

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('input', (e) => this.onInput(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.resize());
    if (DEBUG) this.installDebug();
    this.render();
  }

  private wait(ms: number): Promise<void> {
    if (FAST) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }

  private save(): void {
    if (this.run && this.run.at !== 'end') saveRun(this.run);
  }

  private toast(msg: string): void {
    this.toastEl.innerHTML = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  // ---------- Rendering ----------

  private render(): void {
    if (this.run && this.screen !== 'title' && this.screen !== 'end') this.screen = this.run.at as Screen;
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
      case 'library':
        body = this.libraryView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    if (this.screen === 'fight') {
      this.canvas = this.root.querySelector<HTMLCanvasElement>('#cv');
      this.ctx = this.canvas!.getContext('2d');
      this.resize();
      this.startLoop();
    } else {
      this.canvas = null;
      this.ctx = null;
      cancelAnimationFrame(this.raf);
    }
  }

  /** Update the fight panels without touching the canvas or the notebook inputs. */
  private refresh(): void {
    if (this.screen !== 'fight') return this.render();
    const set = (sel: string, html: string) => {
      const el = this.root.querySelector<HTMLElement>(sel);
      if (el) el.innerHTML = html;
    };
    set('#roominfo', this.roomInfo());
    set('#spellbar', this.spellBar());
    set('#keys', this.keysView());
    set('#result', this.resultView());
    set('#nb-log', this.logList());
    set('#nb-logtab', `📜 Log (${this.run!.log.length})`);
    const top = this.root.querySelector<HTMLElement>('header.top');
    if (top) top.outerHTML = this.topBar();
  }

  private topBar(): string {
    const r = this.run!;
    const h = r.hero;
    const charms = h.charms.map((id) => `<span class="charm" title="${CHARMS[id].name}: ${CHARMS[id].text}">${CHARMS[id].icon}</span>`).join('');
    const act = ACTS[Math.min(r.act, 2)];
    return `<header class="top">
      <span title="HP">❤️ ${Math.max(0, h.hp)}/${h.maxHp}</span>
      <span title="Gold">🪙 ${h.gold}</span>
      <span title="${act.name}">${act.icon} ${Math.min(r.act + 1, 3)}-${r.step + 1}</span>
      <span class="charms">${charms}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="scroll" title="Read a hint scroll" ${h.scrolls ? '' : 'disabled'}>📜 ${h.scrolls}</button>
      <button class="icon-btn nb-btn" data-act="notebook" title="Notebook (N)">📓</button>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const perks = PERKS.map((p) => {
      const own = m.perks.includes(p.id);
      return `<div class="arm ${own ? 'own' : ''}"><span class="big">${p.icon}</span><span><b>${p.name}</b><small>${p.text}</small></span>
        ${own ? '<span class="ok">✔ Owned</span>' : `<button data-act="perk" data-id="${p.id}" ${m.ink >= p.cost ? '' : 'disabled'}>🖋️ ${p.cost}</button>`}</div>`;
    }).join('');
    const deco = [0, 1, 2, 3, 4, 5, 6, 7].map((r) => glyph(r, 'gdeco')).join('');
    return `<div class="title">
      <div class="deco">${deco}</div>
      <h1>📜 Glyph Tongue</h1>
      <p class="sub">The runes mean something new every run. Cast, read the results, take notes, and learn the language before it kills you.</p>
      ${this.run ? `<button class="primary" data-act="continue">▶ Continue run (act ${this.run.act + 1}, ❤️ ${this.run.hero.hp})</button>` : ''}
      <button class="${this.run ? '' : 'primary'}" data-act="new">${this.run ? 'New run (abandons the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best act ${m.bestAct} · Best score ${m.best} · Spells cast ${m.casts}</p>
      <h2>Perks <small>🖋️ ${m.ink} ink</small></h2>
      <p class="sub">Each run gives ink (score / 40). Perks help every later run.</p>
      <div class="armory">${perks}</div>
    </div>`;
  }

  private runesOwned(): string {
    const h = this.run!.hero;
    return `<div class="owned">${[0, 1, 2, 3, 4, 5, 6, 7]
      .map((r) => `<span class="orune ${h.runes.includes(r) ? '' : 'locked'}" title="${RUNE_NAMES[r]}">${glyph(r)}<small>${h.runes.includes(r) ? this.guessName(r) : '🔒'}</small></span>`)
      .join('')}</div>`;
  }

  private guessName(r: number): string {
    const run = this.run!;
    const known = run.known.includes(`rune:${r}`);
    if (known) return `✔ ${MEANING_INFO[run.world.mean[r]].name}`;
    const g = run.guesses[r] as Meaning | '';
    return g ? `${MEANING_INFO[g].name}?` : '?';
  }

  private mapView(): string {
    const r = this.run!;
    const act = ACTS[r.act];
    const plan = PLAN[r.act];
    const track = plan
      .map((opts, i) => {
        const state = i < r.step ? 'done' : i === r.step ? 'now' : '';
        return `<span class="node ${state}" title="${opts.map((o) => ROOM_INFO[o].name).join(' / ')}">${opts.map((o) => ROOM_INFO[o].icon).join('')}</span>`;
      })
      .join('<span class="link"></span>');
    const rooms = roomOptions(r)
      .map((o, i) => {
        const info = ROOM_INFO[o];
        const extra = o === 'boss' ? `<small class="foe">${FOES[act.boss].icon} ${FOES[act.boss].name}</small>` : o === 'elite' ? `<small class="foe">${FOES[act.elite].icon} ${FOES[act.elite].name}</small>` : '';
        return `<button class="room" data-act="room" data-i="${i}"><span class="big">${info.icon}</span><b>${info.name}</b><small>${info.text}</small>${extra}<kbd>${i + 1}</kbd></button>`;
      })
      .join('');
    const intro =
      r.act === 0 && r.step === 0
        ? `<p class="hint-box">Start in the test rooms. Cast single runes first, then pairs. Watch which runes go silent and who gets hit. Write what you learn in the 📓 notebook.</p>`
        : '';
    return `<div class="map">
      <h2>${act.icon} Act ${r.act + 1}: ${act.name}</h2>
      <div class="track">${track}</div>
      ${intro}
      <h3>Choose a room</h3>
      <div class="rooms">${rooms}</div>
      <h3>Your runes <small class="dim">spell length ${r.hero.maxLen}</small></h3>
      ${this.runesOwned()}
      <p class="dim small">Wild magic in this act: each silent rune deals ${act.wild} damage to you in a real fight.</p>
    </div>`;
  }

  private fightView(): string {
    return `<div class="fight">
      <section class="arena">
        <div class="stage"><canvas id="cv"></canvas></div>
        <div class="roominfo" id="roominfo">${this.roomInfo()}</div>
        <div class="spellbar" id="spellbar">${this.spellBar()}</div>
        <div class="keys" id="keys">${this.keysView()}</div>
        <div class="result" id="result">${this.resultView()}</div>
      </section>
      <aside class="nb-side">${this.notebookView(true)}</aside>
    </div>`;
  }

  private roomInfo(): string {
    const f = this.run!.fight!;
    if (isTest(f)) {
      return `<span>🎎 <b>${ROOM_INFO[f.kind].name}</b>: <b>${f.casts}</b> casts left. Nothing here hurts you. Tap a dummy to select it.</span>
        <button class="small-btn" data-act="leave">Leave room</button>`;
    }
    const sel = f.foes[f.sel];
    const rest = restlessTurn(f);
    const warn = f.turn >= rest ? `<span class="warn">💢 Foes are restless: +2 attack each turn.</span>` : f.turn >= rest - 2 ? `<span class="warn">Foes get restless on turn ${rest}.</span>` : '';
    return `<span>Turn ${f.turn} · 🎯 ${sel ? FOES[sel.id].name : '-'} <span class="dim">(tap a foe)</span> · silent rune = ${Math.max(0, ACTS[f.act].wild - (this.run!.hero.charms.includes('calm') ? 1 : 0))} dmg to you</span>${warn}`;
  }

  private spellBar(): string {
    const h = this.run!.hero;
    const slots = Array.from({ length: h.maxLen }, (_, i) => {
      const r = this.spell[i];
      return r === undefined ? `<span class="slot empty"></span>` : `<button class="slot" data-act="unslot" data-i="${i}" title="Remove">${glyph(r)}</button>`;
    }).join('');
    return `<div class="slots">${slots}</div>
      <div class="sb-btns">
        <button class="icon-btn" data-act="back" title="Remove last (Backspace)" ${this.spell.length ? '' : 'disabled'}>⌫</button>
        <button class="icon-btn" data-act="again" title="Write the last spell again (R)" ${this.lastSpell.length && !this.spell.length ? '' : 'disabled'}>↺</button>
        <button class="primary cast" data-act="cast" ${this.spell.length && !this.busy ? '' : 'disabled'}>Cast ✦</button>
      </div>`;
  }

  private keysView(): string {
    const run = this.run!;
    const f = run.fight!;
    return [0, 1, 2, 3, 4, 5, 6, 7]
      .map((r) => {
        const own = run.hero.runes.includes(r);
        const sil = f.silenced.includes(r);
        const full = this.spell.length >= run.hero.maxLen;
        const dis = !own || sil || full || this.busy;
        return `<button class="key ${own ? '' : 'locked'} ${sil ? 'silenced' : ''}" data-act="rune" data-r="${r}" ${dis ? 'disabled' : ''} title="${RUNE_NAMES[r]} (key ${r + 1})">
          <kbd>${r + 1}</kbd>${glyph(r)}<b>${RUNE_NAMES[r]}</b><small>${own ? (sil ? '🤐 silenced' : esc(this.guessName(r))) : '🔒 locked'}</small></button>`;
      })
      .join('');
  }

  private resultView(): string {
    const e = this.run!.log[this.run!.log.length - 1];
    if (!e) return `<p class="dim">Write a spell with the rune keys (or keys 1-8) and press Cast. The result shows up here and in the notebook log.</p>`;
    return this.entryHtml(e, true);
  }

  private entryHtml(e: LogEntry, latest = false): string {
    const lens = this.run!.hero.charms.includes('lens');
    const elNum = new Map<number, number>();
    e.outs.forEach((o, i) => elNum.set(o.pos, i + 1));
    const glyphs = e.spell
      .map((r, i) => {
        let tag = '';
        if (lens) {
          if (elNum.has(i)) tag = `<i>${elNum.get(i)}</i>`;
          else if (e.bind[i] >= 0 && elNum.has(e.bind[i])) tag = `<i>→${elNum.get(e.bind[i])}</i>`;
        }
        return `<span class="lg ${e.silent[i] ? 'sil' : ''}">${glyph(r)}${tag}</span>`;
      })
      .join('');
    const name = (t: number) => (t === -1 ? 'you' : e.names[t] ?? 'foe');
    const who = (tg: number[]) => tg.map(name).join(' and ');
    const lines: string[] = [];
    e.outs.forEach((o, i) => {
      const T = who(o.tg);
      const txt: Record<Kind, string> = {
        harm: `deals <b>${o.amt}</b> damage to ${T}`,
        drain: `drains <b>${o.amt}</b> from ${T} (the caster heals ${o.amt} per target)`,
        venom: `poisons ${T} for <b>${o.amt}</b>`,
        mend: `heals ${T} for <b>${o.amt}</b>`,
        ward: `gives ${T} <b>${o.amt}</b> shield`,
        hex: `dulls the next hit of ${T} by <b>${o.amt}</b>`,
      };
      const self = o.tg.includes(-1) && o.kind !== 'mend' && o.kind !== 'ward' ? 'bad' : '';
      lines.push(`<li class="${self}"><span class="lg">${glyph(o.rune)}${lens ? `<i>${i + 1}</i>` : ''}</span> ${MEANING_INFO[o.kind].icon} ${txt[o.kind]}</li>`);
    });
    const silentN = e.silent.filter(Boolean).length;
    if (!e.outs.length) lines.push(`<li class="dim">💨 Fizzle: nothing happened.</li>`);
    if (silentN) lines.push(`<li class="${e.test ? 'dim' : 'bad'}">${silentN} silent rune${silentN > 1 ? 's' : ''} (greyed out)${e.test ? '' : ': wild magic hit you'}.</li>`);
    if (e.reson) lines.push(`<li class="good">✨ Resonance: +4 to every effect.</li>`);
    if (e.backlash) lines.push(`<li class="bad">🔥 A taboo burns you for ${e.backlash}${e.test ? ' (no harm in a test room)' : ''}.</li>`);
    const ctx = e.ctx.alive.length > 1 ? `<span class="dim small">selected: ${e.names[e.ctx.sel]}, weakest: ${e.names[e.ctx.weak]}</span>` : '';
    return `<div class="entry ${latest ? 'latest' : ''}"><div class="eh"><span class="where">${e.where}</span><span class="spell-g">${glyphs}</span>${ctx}</div><ul>${lines.join('')}</ul></div>`;
  }

  private logList(): string {
    const log = this.run!.log;
    if (!log.length) return `<p class="dim">No casts yet. Every cast lands here.</p>`;
    return log
      .slice()
      .reverse()
      .map((e) => this.entryHtml(e))
      .join('');
  }

  private notebookView(side = false): string {
    const run = this.run!;
    const tabs = (['runes', 'log', 'lexicon'] as NbTab[])
      .map((t) => `<button class="tab ${this.nbTab === t ? 'on' : ''}" data-act="nbtab" data-tab="${t}"${t === 'log' ? ' id="nb-logtab"' : ''}>${t === 'runes' ? '🔣 Runes' : t === 'log' ? `📜 Log (${run.log.length})` : '📖 Lexicon'}</button>`)
      .join('');
    let body = '';
    if (this.nbTab === 'runes') {
      const opt = (m: Meaning, g: string) => `<option value="${m}" ${g === m ? 'selected' : ''}>${MEANING_INFO[m].icon} ${MEANING_INFO[m].name}</option>`;
      const rows = [0, 1, 2, 3, 4, 5, 6, 7]
        .map((r) => {
          const known = run.known.includes(`rune:${r}`);
          const g = known ? run.world.mean[r] : run.guesses[r];
          const own = run.hero.runes.includes(r);
          const sel = known
            ? `<span class="ok">✔ ${MEANING_INFO[run.world.mean[r]].name}</span>`
            : `<select data-guess="${r}" aria-label="Guess for ${RUNE_NAMES[r]}"><option value="">? unknown</option>
              <optgroup label="Elements">${KINDS.map((m) => opt(m, g)).join('')}</optgroup>
              <optgroup label="Targets">${TGTS.map((m) => opt(m, g)).join('')}</optgroup>
              <optgroup label="Modifiers">${MODS.map((m) => opt(m, g)).join('')}</optgroup></select>`;
          return `<div class="nrow ${own ? '' : 'locked'}"><span class="nglyph">${glyph(r)}<small>${RUNE_NAMES[r]}${own ? '' : ' 🔒'}</small></span>
            <div class="nfields">${sel}<input type="text" data-note="${r}" value="${esc(run.notes[r] ?? '')}" placeholder="notes…" maxlength="120" /></div></div>`;
        })
        .join('');
      const facts = run.known
        .map(parseFactKey)
        .filter((f) => f.t !== 'rune')
        .map((f) => `<li>✔ ${fmt(factText(run.world, f))}</li>`)
        .join('');
      body = `<div class="nrows">${rows}</div>
        <h4>Grammar</h4>
        <p class="dim small">This run has 3 grammar rules (target order, modifier order, default target) and 2 special rules.</p>
        ${facts ? `<ul class="facts">${facts}</ul>` : '<p class="dim small">No rule revealed yet.</p>'}
        <textarea data-gnote rows="3" placeholder="grammar notes…" maxlength="600">${esc(run.grammarNote)}</textarea>`;
    } else if (this.nbTab === 'log') {
      body = `<div class="loglist" id="nb-log">${this.logList()}</div>`;
    } else {
      const ml = (ms: Meaning[]) => ms.map((m) => `<li>${MEANING_INFO[m].icon} <b>${MEANING_INFO[m].name}</b>: ${MEANING_INFO[m].text.replace(/^\w+\. /, '')}</li>`).join('');
      const sp = Object.values(SPECIAL_INFO)
        .map((s) => `<li><b>${s.name}</b>: ${s.text}</li>`)
        .join('');
      body = `<div class="lex">
        <p class="small">Each run deals out 3 elements, 2 targets and 3 modifiers to the 8 runes.</p>
        <h4>Elements (3 of 6)</h4><ul>${ml(KINDS)}</ul>
        <h4>Targets (2 of 4)</h4><ul>${ml(TGTS)}</ul>
        <h4>Modifiers (3 of 5)</h4><ul>${ml(MODS)}</ul>
        <h4>Grammar</h4><ul>
          <li>Target runes go either BEFORE or AFTER the element they change. Modifier runes too, but maybe on the other side.</li>
          <li>A word binds to the nearest element on its side. A word with no element on its side goes silent.</li>
          <li>If two targets bind to one element, the closer one wins. The other goes silent.</li>
          <li>An element with no target hits either you or the selected foe (one rule per run).</li>
        </ul>
        <h4>Special rules (2 of 5)</h4><ul>${sp}</ul></div>`;
    }
    return `<div class="notebook ${side ? 'side' : ''}"><div class="nb-head"><b>📓 Notebook</b><div class="tabs">${tabs}</div></div>${body}</div>`;
  }

  private rewardView(): string {
    const run = this.run!;
    const rw = run.rewards!;
    const charm = rw.charm
      ? `<div class="charm-offer ${rw.charmTaken ? 'off' : ''}"><span class="big">${CHARMS[rw.charm].icon}</span><span><b>${CHARMS[rw.charm].name}</b><small>${CHARMS[rw.charm].text}</small></span>
        ${rw.charmTaken ? '<span class="ok">✔ Taken</span>' : '<button class="primary" data-act="charm">Take charm</button>'}</div>`
      : '';
    const picks = rw.picks
      .map((p, i) => {
        const t = pickText(run, p);
        return `<button class="pick ${rw.taken ? 'off' : ''}" data-act="pick" data-i="${i}" ${rw.taken ? 'disabled' : ''}><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small><kbd>${i + 1}</kbd></button>`;
      })
      .join('');
    return `<div class="reward">
      <h2>✨ Victory</h2>
      <p>+${rw.gold} 🪙 gold</p>
      ${charm}
      <h3>${rw.taken ? 'Reward taken' : 'Choose one reward'}</h3>
      <div class="picks">${picks}</div>
      <button class="${rw.taken ? 'primary' : ''}" data-act="next">${rw.taken ? 'Continue ▶' : 'Skip ▶'}</button>
    </div>`;
  }

  private shopView(): string {
    const run = this.run!;
    const items = run
      .shop!.map((it, i) => {
        const t = pickText(run, it.pick);
        const can = !it.sold && run.hero.gold >= it.cost;
        return `<button class="pick ${it.sold ? 'off' : ''}" data-act="buy" data-i="${i}" ${can ? '' : 'disabled'}><span class="big">${t.icon}</span><b>${t.name}</b><small>${t.text}</small><span class="cost">${it.sold ? 'Sold' : `🪙 ${it.cost}`}</span></button>`;
      })
      .join('');
    return `<div class="shopv"><h2>🛒 Scribe shop</h2><p>You have 🪙 ${run.hero.gold}.</p><div class="picks">${items}</div><button class="primary" data-act="next">Leave ▶</button></div>`;
  }

  private restView(): string {
    const run = this.run!;
    const heal = Math.round(run.hero.maxHp * 0.3);
    return `<div class="restv"><h2>🔥 Campfire</h2><p class="sub">Rest, or practise your spells on a dummy.</p>
      <div class="opts">
        <button class="primary" data-act="rest-heal">💤 Rest: heal ${heal} HP</button>
        <button data-act="rest-study">📖 Study: a test room with ${testCasts(run, 'study')} casts</button>
      </div></div>`;
  }

  private libraryView(): string {
    const run = this.run!;
    const left = unknownFacts(run).length;
    return `<div class="eventv"><h2>🏛️ Library</h2>
      <p class="sub">Old grammar books line the walls. Reading one costs blood: the ink is alive.</p>
      <div class="opts">
        <button class="primary" data-act="lib-read" ${left && run.hero.hp > LIBRARY_COST ? '' : 'disabled'}>📕 Read a book: lose ${LIBRARY_COST} HP, reveal one hidden fact (${left} left)</button>
        <button data-act="next">Leave</button>
      </div></div>`;
  }

  private endView(): string {
    const e = this.end!;
    const run = e.run;
    const facts = allFacts(run.world)
      .map((f) => `<li class="${run.known.includes(factKey(f)) ? 'ok' : ''}">${fmt(factText(run.world, f))}</li>`)
      .join('');
    return `<div class="end">
      <div class="huge">${e.victory ? '🏆' : '💀'}</div>
      <h1>${e.victory ? 'The Unspeaker is silent' : 'Your tongue failed you'}</h1>
      <p class="score">Score <b>${e.score}</b> · +${e.ink} 🖋️ ink</p>
      <p class="stats">Act ${Math.min(run.act + 1, 3)} · ${run.kills} foes beaten · ${run.casts} spells cast · runes named right in the notebook: ${guessedRight(run)}/8 (+5 score each)</p>
      <h3>The language of this run</h3>
      <p class="dim small">Green lines were revealed to you by a scroll, a book or a perk.</p>
      <ul class="facts lang">${facts}</ul>
      <div class="opts">
        <button class="primary" data-act="new">▶ New run</button>
        <button data-act="title">Title</button>
      </div>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    let inner = '';
    switch (m.kind) {
      case 'help':
        inner = `<h2>How to play</h2>
          <ul>
            <li>You fight with spells written in 8 runes. <b>Every run gives the runes new meanings and a new grammar.</b> Nothing carries over.</li>
            <li>Tap rune keys (or press 1-8) to write a spell, then <b>Cast</b> (Enter). Spell length is limited (start: 3).</li>
            <li>Each rune is an <b>element</b> (what happens), a <b>target</b> (who it hits) or a <b>modifier</b> (how strong). See the Lexicon tab of the notebook for all possible meanings.</li>
            <li>The grammar decides on which side of an element its targets and modifiers go. Runes that bind to nothing go <b>silent</b> (grey in the log).</li>
            <li>The cast log shows every effect: which rune made it, whom it hit and how much. Use it to work out the rules.</li>
            <li>The <b>📓 notebook</b> keeps every cast. Write a guess and a note for each rune. Your guesses show on the keys.</li>
            <li>The first two rooms are <b>test rooms</b> with dummies. Nothing hurts you there. Experiment: single runes first, then pairs in both orders.</li>
            <li>In real fights, silent runes cause <b>wild magic</b> that hurts you, and a wrong target can hit you.</li>
            <li>Foes show their next move: ⚔️ attack, 🛡️ shield, 🤐 silence runes, ☠️ poison, ✚ heal, 💢 rage, 📯 summon. Tap a foe to select it.</li>
            <li>Rewards give new runes, longer spells, charms and hint scrolls (📜, reveal one fact). Beat the boss of all 3 acts to win.</li>
            <li>Keys: 1-8 runes, Backspace erase, Enter cast, R repeat last spell, Tab next foe, N notebook, Esc close.</li>
          </ul>
          <button class="primary" data-act="modal-close">Got it</button>`;
        break;
      case 'menu':
        inner = m.confirm
          ? `<h2>Abandon run?</h2><p>The run ends and counts as a loss.</p>
             <div class="opts"><button class="danger" data-act="abandon-yes">Abandon</button><button data-act="modal-close">Cancel</button></div>`
          : `<h2>Menu</h2><div class="opts">
              <button class="primary" data-act="modal-close">Resume</button>
              <button data-act="help">How to play</button>
              <button data-act="abandon">Abandon run</button>
              <button data-act="title">Save and go to title</button></div>`;
        break;
      case 'notebook':
        inner = `${this.notebookView()}<button class="primary" data-act="modal-close">Close</button>`;
        break;
      case 'fact':
        inner = `<h2>${m.title}</h2><p class="fact">${fmt(m.text)}</p><p class="dim small">The notebook keeps it.</p><button class="primary" data-act="modal-close">OK</button>`;
        break;
      case 'scroll':
        inner = `<h2>📜 Read a hint scroll?</h2><p>It reveals one hidden rune meaning or rule. You have ${this.run?.hero.scrolls ?? 0}.</p>
          <div class="opts"><button class="primary" data-act="scroll-yes">Read it</button><button data-act="modal-close">Later</button></div>`;
        break;
    }
    return `<div class="modal" data-act="modal-bg"><div class="sheet ${m.kind === 'notebook' ? 'wide' : ''}">${inner}</div></div>`;
  }

  // ---------- Input ----------

  private onClick(e: MouseEvent): void {
    initAudio();
    const t = e.target as HTMLElement;
    if (t.id === 'cv') return this.onStageClick(e);
    const el = t.closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset.act!;
    if (act === 'modal-bg' && t !== el) return;
    this.action(act, el);
  }

  private action(act: string, el?: HTMLElement): void {
    const i = Number(el?.dataset.i ?? 0);
    switch (act) {
      case 'modal-bg':
      case 'modal-close':
        this.modal = null;
        return this.render();
      case 'help':
        this.modal = { kind: 'help' };
        return this.render();
      case 'menu':
        this.modal = { kind: 'menu', confirm: false };
        return this.render();
      case 'notebook':
        this.modal = { kind: 'notebook' };
        sfx.page();
        return this.render();
      case 'nbtab':
        this.nbTab = el!.dataset.tab as NbTab;
        sfx.page();
        return this.render();
      case 'mute':
        toggleMute();
        return this.screen === 'fight' ? this.refresh() : this.render();
      case 'new':
        return this.startRun();
      case 'continue':
        this.screen = this.run!.at as Screen;
        return this.render();
      case 'title':
        this.modal = null;
        this.screen = 'title';
        this.end = null;
        return this.render();
      case 'abandon':
        this.modal = { kind: 'menu', confirm: true };
        return this.render();
      case 'abandon-yes':
        this.modal = null;
        return this.finishRun();
      case 'perk': {
        const p = PERKS.find((x) => x.id === el!.dataset.id);
        if (p && this.meta.ink >= p.cost && !this.meta.perks.includes(p.id)) {
          this.meta.ink -= p.cost;
          this.meta.perks.push(p.id);
          saveMeta(this.meta);
          sfx.item();
        }
        return this.render();
      }
      case 'scroll':
        this.modal = { kind: 'scroll' };
        return this.render();
      case 'scroll-yes': {
        const f = useScroll(this.run!);
        this.modal = null;
        if (f) this.showFact('📜 The scroll reads…', f);
        this.save();
        return this.render();
      }
      case 'room':
        return this.enter(i);
      case 'rune':
        return this.addRune(Number(el!.dataset.r));
      case 'unslot':
        this.spell.splice(i, 1);
        sfx.erase();
        return this.refresh();
      case 'back':
        this.spell.pop();
        sfx.erase();
        return this.refresh();
      case 'again':
        return this.repeatLast();
      case 'cast':
        void this.castSpell();
        return;
      case 'leave':
        return this.leaveTest();
      case 'pick': {
        const rw = this.run!.rewards!;
        if (rw.taken) return;
        applyPick(this.run!, rw.picks[i]);
        rw.taken = true;
        sfx.item();
        this.save();
        return this.render();
      }
      case 'charm': {
        const rw = this.run!.rewards!;
        if (!rw.charm || rw.charmTaken) return;
        addCharm(this.run!.hero, rw.charm);
        rw.charmTaken = true;
        sfx.item();
        this.save();
        return this.render();
      }
      case 'buy':
        if (buy(this.run!, i)) sfx.coin();
        else sfx.deny();
        this.save();
        return this.render();
      case 'rest-heal': {
        const n = restHeal(this.run!);
        sfx.heal();
        this.toast(`💤 Healed ${n} HP`);
        return this.next();
      }
      case 'rest-study':
        enterRoom(this.run!, 'study');
        this.resetStage();
        this.save();
        return this.render();
      case 'lib-read': {
        const run = this.run!;
        run.hero.hp = Math.max(1, run.hero.hp - LIBRARY_COST);
        const f = revealFact(run, 'library');
        sfx.hurt();
        if (f) this.showFact('📕 You read…', f);
        return this.next();
      }
      case 'next':
        return this.next();
    }
  }

  private onChange(e: Event): void {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLSelectElement && t.dataset.guess !== undefined && this.run) {
      this.run.guesses[Number(t.dataset.guess)] = t.value;
      this.save();
      if (this.screen === 'fight') {
        const k = this.root.querySelector<HTMLElement>('#keys');
        if (k) k.innerHTML = this.keysView();
      }
    }
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLElement;
    if (!this.run) return;
    if (t instanceof HTMLInputElement && t.dataset.note !== undefined) {
      this.run.notes[Number(t.dataset.note)] = t.value;
      this.save();
    } else if (t instanceof HTMLTextAreaElement && t.dataset.gnote !== undefined) {
      this.run.grammarNote = t.value;
      this.save();
    }
  }

  private onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') (e.target as HTMLElement).blur();
      return;
    }
    initAudio();
    if (e.key === 'Escape') {
      if (this.modal) {
        this.modal = null;
        this.render();
      } else if (this.run && this.screen !== 'title' && this.screen !== 'end') {
        this.modal = { kind: 'menu', confirm: false };
        this.render();
      }
      return;
    }
    if (this.modal) {
      if (e.key === 'Enter') {
        const b = this.root.querySelector<HTMLElement>('.modal .primary');
        b?.click();
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'n' && this.run && this.screen !== 'title' && this.screen !== 'end') return this.action('notebook');
    if (k === 'm') return this.action('mute');
    if (this.screen === 'fight') {
      if (/^[1-8]$/.test(e.key)) return this.addRune(Number(e.key) - 1);
      if (e.key === 'Backspace') {
        e.preventDefault();
        this.spell.pop();
        return this.refresh();
      }
      if (e.key === 'Enter') return void this.castSpell();
      if (k === 'r') return this.repeatLast();
      if (e.key === 'Tab') {
        e.preventDefault();
        const f = this.run!.fight!;
        const al = alive(f);
        f.sel = al[(al.indexOf(f.sel) + 1) % al.length];
        return this.refresh();
      }
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 5) {
      const btn = this.root.querySelectorAll<HTMLElement>(this.screen === 'map' ? '[data-act="room"]' : '[data-act="pick"]:not([disabled])')[n - 1];
      btn?.click();
      return;
    }
    if (e.key === 'Enter') this.root.querySelector<HTMLElement>('main .primary:not([disabled])')?.click();
  }

  private onStageClick(e: MouseEvent): void {
    const f = this.run?.fight;
    if (!f || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.W;
    const al = alive(f);
    let best = -1;
    let bd = 1e9;
    al.forEach((i) => {
      const d = Math.abs(this.foeX(f, i) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0 && bd < 70) {
      f.sel = best;
      sfx.rune(best);
      this.refresh();
    }
  }

  // ---------- Flow ----------

  private startRun(): void {
    if (this.run) {
      endRun(this.run, this.meta);
      saveMeta(this.meta);
    }
    this.run = newRun(randomSeedText(), this.meta);
    this.learner = null;
    this.spell = [];
    this.lastSpell = [];
    this.modal = null;
    this.end = null;
    this.screen = 'map';
    this.save();
    if (this.run.known.length) this.showFact('🗣️ Linguist', parseFactKey(this.run.known[0]));
    this.render();
  }

  private showFact(title: string, f: Fact): void {
    this.learner?.reveal(f, this.run!.world);
    this.modal = { kind: 'fact', title, text: factText(this.run!.world, f) };
    sfx.reveal();
  }

  private enter(i: number): void {
    const run = this.run!;
    const room = roomOptions(run)[i];
    if (!room) return;
    enterRoom(run, room);
    this.spell = [];
    this.resetStage();
    sfx.page();
    this.save();
    this.render();
  }

  private next(): void {
    const run = this.run!;
    advance(run);
    if (run.at === 'end') return this.finishRun();
    this.save();
    this.render();
  }

  private finishRun(): void {
    const run = this.run!;
    const res = endRun(run, this.meta);
    saveMeta(this.meta);
    clearRun();
    this.end = { victory: run.victory, score: res.score, ink: res.ink, run };
    this.run = null;
    this.screen = 'end';
    this.modal = null;
    if (run.victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  private addRune(r: number): void {
    const run = this.run;
    if (!run || this.busy || this.screen !== 'fight') return;
    const f = run.fight!;
    if (!run.hero.runes.includes(r) || f.silenced.includes(r) || this.spell.length >= run.hero.maxLen) {
      sfx.deny();
      return;
    }
    this.spell.push(r);
    sfx.rune(r);
    this.refresh();
  }

  private repeatLast(): void {
    const run = this.run;
    if (!run || this.busy || !this.lastSpell.length) return;
    const f = run.fight!;
    this.spell = this.lastSpell.filter((r) => run.hero.runes.includes(r) && !f.silenced.includes(r)).slice(0, run.hero.maxLen);
    this.refresh();
  }

  private leaveTest(): void {
    const run = this.run!;
    if (this.busy || !run.fight || !isTest(run.fight)) return;
    run.fight.over = 'left';
    finishFight(run);
    this.save();
    this.render();
  }

  private async castSpell(): Promise<void> {
    const run = this.run;
    if (!run || !run.fight || this.busy || !this.spell.length) return;
    const f = run.fight;
    const spell = this.spell;
    this.busy = true;
    this.lastSpell = [...spell];
    this.spell = [];
    const res = doCast(run, spell);
    const e = run.log[run.log.length - 1];
    this.learner?.observe({ spell: e.spell, ctx: e.ctx, silent: e.silent, outs: e.outs, reson: e.reson, backlash: e.backlash });
    sfx.cast(spell.length);
    this.castGlyphs = spell.map((r, i) => ({ r, silent: res.parsed.silent[i], t: 0 }));
    this.refresh();
    await this.wait(250);
    await this.playEvents(res.evs);
    if (f.over === null && !isTest(f)) {
      await this.wait(250);
      const evs = doEnemyTurn(run);
      await this.playEvents(evs);
    }
    this.busy = false;
    if (f.over === 'lose') {
      await this.wait(500);
      return this.finishRun();
    }
    if (f.over === 'win' || f.over === 'left') {
      if (f.over === 'win') sfx.win();
      await this.wait(f.over === 'win' ? 700 : 300);
      finishFight(run);
      this.save();
      if (f.over === 'left') this.toast('🎎 The test room is done.');
      return this.render();
    }
    this.save();
    this.refresh();
  }

  private async playEvents(evs: Ev[]): Promise<void> {
    const f = this.run!.fight!;
    for (const ev of evs) {
      const pos = (who: number) => (who === -1 ? { x: this.heroX(), y: 100 } : { x: this.foeX(f, who), y: 100 });
      switch (ev.t) {
        case 'out': {
          const from = pos(-1);
          for (const t of ev.o.tg) {
            const to = pos(t);
            this.bolts.push({ x0: from.x, y0: from.y - 20, x1: to.x, y1: to.y, color: KIND_COLOR[ev.o.kind], t: 0 });
          }
          ({ harm: sfx.hit, drain: sfx.hit, venom: sfx.poison, mend: sfx.heal, ward: sfx.shield, hex: sfx.hex })[ev.o.kind]();
          await this.wait(260);
          break;
        }
        case 'dmg': {
          const p = pos(ev.who);
          if (ev.amt > 0) this.float(p.x, p.y - 30, `-${ev.amt}`, '#ff5d73', 22);
          if (ev.blocked > 0) this.float(p.x + 22, p.y - 52, `🛡${ev.blocked}`, '#4cc9f0', 14);
          if (ev.who === -1) {
            this.shake = 8;
            if (ev.amt > 0) sfx.hurt();
          } else this.flash.set(ev.who, 1);
          await this.wait(90);
          break;
        }
        case 'heal': {
          const p = pos(ev.who);
          this.float(p.x, p.y - 30, `+${ev.amt}`, '#7ee08a', 20);
          break;
        }
        case 'shield': {
          const p = pos(ev.who);
          this.float(p.x, p.y - 44, `+${ev.amt}🛡`, '#4cc9f0', 16);
          break;
        }
        case 'poison': {
          const p = pos(ev.who);
          this.float(p.x, p.y - 44, `☠${ev.amt}`, '#a3e635', 16);
          break;
        }
        case 'dull': {
          const p = pos(ev.who);
          this.float(p.x, p.y - 44, `🌀-${ev.amt}`, '#c77dff', 16);
          break;
        }
        case 'kill':
          sfx.kill();
          await this.wait(150);
          break;
        case 'wild':
          this.banner = { text: `Wild magic! -${ev.amt}`, color: '#c77dff', t: 0 };
          sfx.fizzle();
          await this.wait(250);
          break;
        case 'backlash':
          this.banner = { text: `Taboo burns! -${ev.amt}`, color: '#ff7a45', t: 0 };
          await this.wait(250);
          break;
        case 'reson':
          this.banner = { text: '✨ Resonance +4', color: '#ffd166', t: 0 };
          sfx.reson();
          await this.wait(200);
          break;
        case 'fizzle':
          this.banner = { text: '💨 Fizzle', color: '#a99bbd', t: 0 };
          sfx.fizzle();
          await this.wait(200);
          break;
        case 'act':
          this.lunge.set(ev.who, 1);
          await this.wait(ev.it.t === 'atk' ? 160 : 260);
          break;
        case 'silence':
          sfx.silence();
          this.toast(`🤐 Silenced for a turn: ${ev.runes.map((r) => glyph(r, 'gi')).join(' ')}`);
          this.float(this.heroX(), 50, '🤐', '#fff', 22);
          break;
        case 'summon': {
          const p = pos(ev.who);
          this.float(p.x, p.y - 50, '📯', '#fff', 20);
          await this.wait(200);
          break;
        }
        case 'tick': {
          const p = pos(ev.who);
          this.float(p.x, p.y - 20, `☠-${ev.amt}`, '#a3e635', 16);
          if (ev.who === -1) this.shake = 4;
          await this.wait(150);
          break;
        }
        case 'phoenix':
          this.toast('🪶 The Phoenix Quill saves you!');
          sfx.reveal();
          break;
      }
    }
    await this.wait(200);
  }

  // ---------- Stage (canvas) ----------

  private resetStage(): void {
    this.floats = [];
    this.bolts = [];
    this.flash.clear();
    this.lunge.clear();
    this.shownHp.clear();
    this.castGlyphs = [];
    this.banner = null;
  }

  private resize(): void {
    if (!this.canvas) return;
    const wrap = this.canvas.parentElement!;
    const w = Math.max(300, Math.min(680, wrap.clientWidth));
    this.W = w;
    this.H = w < 480 ? 185 : 200;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
  }

  private heroX(): number {
    return this.W * 0.13;
  }

  private foeX(f: Fight, i: number): number {
    const al = alive(f);
    const k = Math.max(0, al.indexOf(i));
    const n = Math.max(1, al.length);
    const left = this.W * 0.34;
    const span = this.W * 0.64;
    return left + ((k + 0.5) * span) / n;
  }

  private float(x: number, y: number, text: string, color: string, size: number): void {
    this.floats.push({ x, y, text, color, t: 0, size });
  }

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    this.time += dt;
    this.floats = this.floats.filter((f) => (f.t += dt) < 1.1);
    this.bolts = this.bolts.filter((b) => (b.t += dt * 3.2) < 1.25);
    this.castGlyphs = this.castGlyphs.filter((g) => (g.t += dt) < 1.4);
    if (this.banner && (this.banner.t += dt) > 1.4) this.banner = null;
    this.shake = Math.max(0, this.shake - dt * 30);
    for (const [k, v] of this.flash) v - dt * 4 <= 0 ? this.flash.delete(k) : this.flash.set(k, v - dt * 4);
    for (const [k, v] of this.lunge) v - dt * 4 <= 0 ? this.lunge.delete(k) : this.lunge.set(k, v - dt * 4);
    const f = this.run?.fight;
    if (f) {
      for (const foe of f.foes) {
        const s = this.shownHp.get(foe.uid) ?? foe.hp;
        this.shownHp.set(foe.uid, s + (foe.hp - s) * Math.min(1, dt * 8));
      }
      const h = this.run!.hero;
      const s = this.shownHp.get(-1) ?? h.hp;
      this.shownHp.set(-1, s + (h.hp - s) * Math.min(1, dt * 8));
    }
  }

  private draw(): void {
    const c = this.ctx;
    const run = this.run;
    if (!c || !run || !run.fight) return;
    const f = run.fight;
    const { W, H } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, isTest(f) ? '#1d2233' : '#24163a');
    g.addColorStop(1, '#0f0b18');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    c.save();
    c.translate(sx, 0);
    // Floor and faint rune circle
    c.strokeStyle = 'rgba(155, 93, 229, 0.18)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(W / 2, 117, W * 0.46, 10, 0, 0, Math.PI * 2);
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const small = W < 480;
    // Hero
    const hx = this.heroX();
    this.drawUnit(hx, '🧙', 'You', this.shownHp.get(-1) ?? run.hero.hp, run.hero.maxHp, f.hShield, f.hPoison, f.hDull, 0, false, false, small);
    // Foes
    for (const i of alive(f)) {
      const foe = f.foes[i];
      const x = this.foeX(f, i) - (this.lunge.get(i) ?? 0) * 18;
      const d = FOES[foe.id];
      const sel = i === f.sel;
      const it = intentLabel(f, i);
      c.font = `${small ? 13 : 15}px system-ui, sans-serif`;
      c.fillStyle = '#ffd166';
      c.fillText(`${it.icon} ${it.text}`, x, 22);
      this.drawUnit(x, d.icon, d.name, this.shownHp.get(foe.uid) ?? foe.hp, foe.max, foe.shield, foe.poison, foe.dull, this.flash.get(i) ?? 0, sel, true, small, foe.buff);
    }
    // Bolts
    for (const b of this.bolts) {
      const t = Math.min(1, b.t);
      const x = b.x0 + (b.x1 - b.x0) * t;
      const y = b.y0 + (b.y1 - b.y0) * t - Math.sin(t * Math.PI) * 30;
      c.globalAlpha = b.t > 1 ? 1.25 - b.t : 1;
      c.fillStyle = b.color;
      c.shadowColor = b.color;
      c.shadowBlur = 14;
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.fill();
      if (b.t >= 1) {
        c.beginPath();
        c.arc(b.x1, b.y1, 10 + (b.t - 1) * 120, 0, Math.PI * 2);
        c.strokeStyle = b.color;
        c.lineWidth = 2;
        c.stroke();
      }
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    }
    // Spell glyphs rising over the hero
    const n = this.castGlyphs.length;
    this.castGlyphs.forEach((gl, k) => {
      const x = hx - ((n - 1) * 20) / 2 + k * 20;
      const y = 44 - gl.t * 20;
      c.save();
      c.globalAlpha = Math.max(0, 1 - gl.t / 1.4);
      c.translate(x - 9, y - 9);
      c.scale(0.75, 0.75);
      c.strokeStyle = gl.silent ? '#6b6080' : '#e0b3ff';
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (!gl.silent) {
        c.shadowColor = '#c77dff';
        c.shadowBlur = 10;
      }
      c.stroke(new Path2D(RUNE_PATHS[gl.r]));
      c.restore();
    });
    // Floats
    for (const fl of this.floats) {
      c.globalAlpha = Math.max(0, 1 - fl.t / 1.1);
      c.font = `bold ${fl.size}px system-ui, sans-serif`;
      c.fillStyle = fl.color;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 3;
      c.strokeText(fl.text, fl.x, fl.y - fl.t * 34);
      c.fillText(fl.text, fl.x, fl.y - fl.t * 34);
    }
    c.globalAlpha = 1;
    if (this.banner) {
      const b = this.banner;
      c.globalAlpha = Math.max(0, Math.min(1, (1.4 - b.t) * 2));
      c.font = `bold ${small ? 20 : 26}px system-ui, sans-serif`;
      c.fillStyle = b.color;
      c.strokeStyle = 'rgba(0,0,0,0.7)';
      c.lineWidth = 4;
      const y = H / 2 - 10 - b.t * 10;
      c.strokeText(b.text, W / 2, y);
      c.fillText(b.text, W / 2, y);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  private drawUnit(x: number, icon: string, name: string, hp: number, max: number, shield: number, poison: number, dull: number, flash: number, sel: boolean, foe: boolean, small: boolean, buff = 0): void {
    const c = this.ctx!;
    const y = 92 + Math.sin(this.time * 2 + x) * 2;
    if (sel) {
      c.strokeStyle = '#c77dff';
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.ellipse(x, 120, small ? 24 : 30, 8, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.font = `${small ? 34 : 42}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    if (flash > 0) {
      c.shadowColor = '#fff';
      c.shadowBlur = 20 * flash;
    }
    c.fillText(icon, x, y);
    c.shadowBlur = 0;
    const bw = small ? 62 : 80;
    c.font = `${small ? 10 : 12}px system-ui, sans-serif`;
    c.fillStyle = foe ? '#f1eaf9' : '#e0b3ff';
    const label = name.length > 13 && small ? `${name.slice(0, 12)}…` : name;
    c.fillText(label, x, 134);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(x - bw / 2, 144, bw, 10);
    c.fillStyle = foe ? '#ef476f' : '#7ee08a';
    c.fillRect(x - bw / 2, 144, (bw * Math.max(0, hp)) / max, 10);
    c.fillStyle = '#fff';
    c.font = `bold ${small ? 9 : 10}px system-ui, sans-serif`;
    c.fillText(`${Math.max(0, Math.round(hp))}/${max}`, x, 149.5);
    const badges: string[] = [];
    if (shield > 0) badges.push(`🛡${shield}`);
    if (poison > 0) badges.push(`☠${poison}`);
    if (dull > 0) badges.push(`🌀${dull}`);
    if (buff > 0) badges.push(`💢${buff}`);
    if (badges.length) {
      c.font = `${small ? 10 : 12}px system-ui, sans-serif`;
      c.fillStyle = '#f1eaf9';
      c.fillText(badges.join(' '), x, 168);
    }
  }

  // ---------- Debug API ----------

  private botLearner(): Learner {
    if (!this.learner) {
      const l = new Learner();
      for (const k of this.run!.known) l.reveal(parseFactKey(k), this.run!.world);
      l.replay(this.run!.log);
      this.learner = l;
    }
    return this.learner;
  }

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        modal: this.modal?.kind ?? null,
        busy: this.busy,
        act: this.run?.act,
        step: this.run?.step,
        hp: this.run?.hero.hp,
        gold: this.run?.hero.gold,
        spell: [...this.spell],
        fight: this.run?.fight
          ? { kind: this.run.fight.kind, turn: this.run.fight.turn, casts: this.run.fight.casts, foes: this.run.fight.foes.map((x) => `${x.id} ${x.hp}/${x.max}`) }
          : null,
        known: this.run ? this.botLearner().cand.filter((c) => c.size === 1).length : 0,
        end: this.end ? { victory: this.end.victory, score: this.end.score } : null,
      }),
      world: () => this.run?.world,
      /** One bot action. The bot learns the language from the cast log only. */
      step: async (): Promise<string> => {
        if (this.busy) return 'busy';
        if (this.modal) {
          if (this.modal.kind === 'scroll') this.action('scroll-yes');
          else this.action('modal-close');
          return 'modal';
        }
        if (this.screen === 'title') {
          this.startRun();
          return 'new';
        }
        if (this.screen === 'end') return 'end';
        const run = this.run!;
        const a: Action = botAction(run, this.botLearner(), 'learner', this.botRng);
        switch (a.t) {
          case 'room':
            this.enter(a.i);
            break;
          case 'scroll':
            this.action('scroll-yes');
            break;
          case 'cast':
            run.fight!.sel = a.sel;
            this.spell = a.spell.slice(0, run.hero.maxLen);
            await this.castSpell();
            break;
          case 'leave':
            this.leaveTest();
            break;
          case 'pick':
            this.action('pick', this.root.querySelectorAll<HTMLElement>('[data-act="pick"]')[a.i]);
            break;
          case 'charm':
            this.action('charm');
            break;
          case 'buy':
            this.action('buy', this.root.querySelectorAll<HTMLElement>('[data-act="buy"]')[a.i]);
            break;
          case 'heal':
            this.action('rest-heal');
            break;
          case 'study':
            this.action('rest-study');
            break;
          case 'read':
            if (run.hero.hp > LIBRARY_COST) this.action('lib-read');
            else this.next();
            break;
          case 'next':
            this.next();
            break;
        }
        // Show what the bot has learned in the notebook, like a player would.
        if (this.run && this.learner) this.learner.cand.forEach((c, r) => c.size === 1 && (this.run!.guesses[r] = [...c][0]));
        return a.t;
      },
      ink: (n: number) => {
        this.meta.ink += n;
        saveMeta(this.meta);
        this.render();
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
