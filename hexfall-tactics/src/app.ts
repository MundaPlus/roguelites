import { clone, disarmed, enemies, mechs, pos, tileAt, unitAt, unitById, type Battle, type Fx, type Unit } from './board';
import {
  applyBot,
  attack,
  attackOrder,
  attackStep,
  botTurn,
  canAct,
  canMove,
  endRound,
  enemyName,
  fireStep,
  moveMech,
  reach,
  repairMech,
  spawnStep,
} from './engine';
import { ARROWS, HEXES, R, eq, fromPixel, hexPoints, onBoard, toPixel, type Hex } from './hex';
import { randomSeedText } from './rng';
import {
  COST,
  ISLANDS,
  ISLAND_IDS,
  MAX_POWER,
  clearRun,
  enterIsland,
  finishBattle,
  isFinal,
  loadMeta,
  loadRun,
  makeBattle,
  makeOffers,
  newRun,
  objFailed,
  objStatus,
  objText,
  perkChoices,
  recruit,
  rewardText,
  saveMeta,
  saveRun,
  score,
  takePerk,
  type MissionDef,
  type Report,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import { ENEMIES, FRAMES, LEVELS, PERKS, SQUADS, SQUAD_IDS, type SquadId } from './units';
import { WEAPONS, aims, intentTarget, opsOf, repairAmount, weaponText, type Target } from './weapons';

type Screen = 'title' | 'islands' | 'missions' | 'battle' | 'report' | 'hangar' | 'end';

type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

const S = 34;
const SQ3 = Math.sqrt(3);
const VIEW_W = (2 * R + 1) * SQ3 * S + 8;
const VIEW_H = (3 * R + 2) * S + 8;

/** `?debug&fast` skips animation waits for bot tests. */
const SPEED = new URLSearchParams(location.search).has('fast') ? 0 : 1;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * SPEED));
const hk = (h: Hex): string => `${h.q},${h.r}`;

const TERRAIN_INFO: Record<string, { name: string; text: string }> = {
  ground: { name: 'Ground', text: 'Open ground.' },
  forest: { name: 'Forest', text: 'Any damage here sets it on fire.' },
  water: { name: 'Water', text: 'Enemies pushed in drown. Mechs can wade in, but cannot shoot from water.' },
  chasm: { name: 'Chasm', text: 'Anything that does not fly falls in and dies.' },
  mountain: { name: 'Mountain', text: 'Blocks movement and shots. Two hits break it.' },
  building: { name: 'Building', text: 'Each hit destroys one block and costs 1 grid power. Protect them.' },
};

const FX_ICON: Partial<Record<Fx['kind'], string>> = {
  die: '💀',
  drown: '💧',
  fall: '🕳️',
  fire: '🔥',
  smoke: '☁️',
  shield: '🛡️',
  break: '💔',
  spawn: '❗',
  block: '⛔',
  cancel: '🚫',
  bump: '💢',
};

function pips(hp: number, max: number, cls = ''): string {
  if (max > 6) return `<span class="hpbar ${cls}"><i style="width:${(Math.max(0, hp) / max) * 100}%"></i><b>${hp}/${max}</b></span>`;
  return `<span class="pips ${cls}">${Array.from({ length: max }, (_, i) => `<i class="${i < hp ? 'on' : ''}"></i>`).join('')}</span>`;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;

  private b: Battle | null = null;
  private sel: number | null = null;
  private wslot: number | null = null;
  private hover: Hex | null = null;
  private inspect: Hex | null = null;
  private pending: string | null = null;
  private touch = false;
  private history: Battle[] = [];
  private phaseStart: Battle | null = null;
  private busy = false;
  private fxFresh = false;
  private actorFlash = -1;
  private banner = '';

  private report: Report | null = null;
  private end: { victory: boolean; score: number; reason: string; islands: number; squad: SquadId } | null = null;
  private buying: string | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('pointerdown', (e) => (this.touch = e.pointerType !== 'mouse'));
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerleave', () => this.setHover(null));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (new URLSearchParams(location.search).has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    switch (this.screen) {
      case 'title':
        body = this.titleView();
        break;
      case 'islands':
        body = this.islandsView();
        break;
      case 'missions':
        body = this.missionsView();
        break;
      case 'battle':
        body = this.battleView();
        break;
      case 'report':
        body = this.reportView();
        break;
      case 'hangar':
        body = this.hangarView();
        break;
      case 'end':
        body = this.endView();
        break;
    }
    const top = this.run && this.screen !== 'title' && this.screen !== 'end' ? this.topBar() : '';
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.fxFresh = false;
  }

  /** Redraw only the board and the info box. Used on hover. */
  private renderBoard(): void {
    const holder = this.root.querySelector<HTMLElement>('#board-holder');
    const info = this.root.querySelector<HTMLElement>('#info');
    if (!holder || !this.b) return;
    holder.innerHTML = this.boardSvg();
    if (info) info.innerHTML = this.infoView();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private powerBar(power: number): string {
    return `<span class="power" title="Grid power. At 0 the run is lost.">⚡<span class="cells">${Array.from(
      { length: MAX_POWER },
      (_, i) => `<i class="${i < power ? 'on' : ''}"></i>`,
    ).join('')}</span><b>${power}</b></span>`;
  }

  private topBar(): string {
    const r = this.run!;
    const power = this.b && this.screen === 'battle' ? this.b.power : r.power;
    const where = isFinal(r) ? '🗼 Final' : r.island ? `${ISLANDS[r.island].icon} ${r.step < 3 ? `Mission ${r.step + 1}/3` : 'Boss'}` : `🏝️ ${r.done.length}/3 islands`;
    return `<header class="top">
      <span class="squad-icon">${SQUADS[r.squad].icon}</span>
      ${this.powerBar(power)}
      <span title="Reputation. Spend it in the hangar.">⭐ ${r.rep}</span>
      <span class="where">${where}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const cards = SQUAD_IDS.map((id) => {
      const s = SQUADS[id];
      const locked = m.bestIslands < s.unlock;
      const frames = s.frames
        .map((f) => `<span class="frame">${FRAMES[f].icon} ${FRAMES[f].name}<small>${WEAPONS[FRAMES[f].weapon].icon} ${WEAPONS[FRAMES[f].weapon].name}</small></span>`)
        .join('');
      return `<button class="squad-card ${locked ? 'locked' : ''}" ${locked ? 'disabled' : `data-act="start" data-squad="${id}"`}>
        <span class="big">${locked ? '🔒' : s.icon}</span>
        <b>${s.name} squad</b>
        <small>${locked ? `Clear ${s.unlock} island${s.unlock > 1 ? 's' : ''} in one run to unlock.` : s.text}</small>
        ${locked ? '' : `<span class="frames">${frames}</span>`}
      </button>`;
    }).join('');
    const r = this.run;
    return `<div class="title">
      <h1><span>⬢</span> Hexfall Tactics</h1>
      <p class="sub">The hive comes from the sea. Every enemy shows its attack before it strikes. Push them, block them, turn their attacks on each other.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (${SQUADS[r.squad].name}, ${r.done.length}/3 islands)</button>` : ''}
      <h2>${r ? 'Or start a new run' : 'Choose a squad'}</h2>
      <div class="squads">${cards}</div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Most islands ${m.bestIslands} · Best score ${m.best}</p>
      <button data-act="help">How to play</button>
    </div>`;
  }

  private islandsView(): string {
    const r = this.run!;
    if (isFinal(r)) {
      const m = r.offers[0];
      return `<div class="islands">
        <h2>All islands are clear</h2>
        <p class="sub">The hive gathers at its heart. Hold the Spire for ${6} turns, or kill the Hive Queen.</p>
        <div class="missions">${this.missionCard(m, 0, '🕷️ Hive Queen + 🦂 swarm')}</div>
        ${this.squadStrip()}
      </div>`;
    }
    const cards = ISLAND_IDS.map((id) => {
      const isl = ISLANDS[id];
      const done = r.done.includes(id);
      const roster = isl.roster.map(([k]) => ENEMIES[k].icon).join(' ');
      return `<button class="island ${done ? 'done' : ''}" ${done ? 'disabled' : `data-act="island" data-id="${id}"`}>
        <span class="big">${done ? '✅' : isl.icon}</span>
        <b>${isl.name}</b>
        <small>${isl.text}</small>
        <small class="roster">${roster}</small>
        <small>${done ? 'Cleared' : '3 missions + boss'}</small>
      </button>`;
    }).join('');
    return `<div class="islands">
      <h2>Choose an island</h2>
      <p class="sub">Each island cleared makes the next ones harder. Clear all 3 to reach the Hive Heart.</p>
      <div class="island-row">${cards}</div>
      ${this.squadStrip()}
    </div>`;
  }

  private missionCard(m: MissionDef, i: number, foes: string): string {
    const objs = m.objectives
      .map((o) => `<li>${o.id === 'spire' ? '❗' : '◇'} ${objText(o)} ${o.amount ? `<span class="rw">${rewardText(o)}</span>` : '<span class="rw must">must</span>'}</li>`)
      .join('');
    const kind = m.kind === 'boss' ? '<span class="tag boss">Boss</span>' : m.kind === 'final' ? '<span class="tag boss">Final</span>' : '';
    return `<button class="mission" data-act="mission" data-i="${i}">
      <b>${m.name} ${kind}</b>
      <ul>${objs}</ul>
      <small class="roster">${foes}</small>
    </button>`;
  }

  private missionsView(): string {
    const r = this.run!;
    const isl = ISLANDS[r.island!];
    const track = [0, 1, 2, 3].map((i) => `<span class="node ${i < r.step ? 'done' : i === r.step ? 'now' : ''}">${i === 3 ? '🦖' : i + 1}</span>`).join('<span class="link"></span>');
    const foes = isl.roster.map(([k]) => ENEMIES[k].icon).join(' ');
    const cards = r.offers.map((m, i) => this.missionCard(m, i, m.kind === 'boss' ? `🦖 Hive Tyrant + ${foes}` : foes)).join('');
    return `<div class="islands">
      <h2>${isl.icon} ${isl.name}</h2>
      <div class="track">${track}</div>
      <p class="sub">${r.step < 3 ? 'Pick a mission. Bonus goals give reputation ⭐ or grid power ⚡.' : 'The Hive Tyrant guards the island. Kill it to end the battle at once.'}</p>
      <div class="missions">${cards}</div>
      ${this.squadStrip()}
    </div>`;
  }

  private squadStrip(): string {
    const r = this.run!;
    return `<div class="strip">${r.mechs
      .map((m) => {
        const f = FRAMES[m.frame];
        const p = m.pilot;
        return `<span class="chip ${p ? '' : 'dead'}">${f.icon} ${p ? `${p.name} ${p.perks.map((x) => PERKS[x].icon).join('')}` : 'No pilot'} · ${m.weapons.map((w) => `${WEAPONS[w.id].icon}${w.lvl ? '⁺' : ''}`).join(' ')}</span>`;
      })
      .join('')}</div>`;
  }

  // ---------- Battle view ----------

  private battleView(): string {
    const b = this.b!;
    const r = this.run!;
    const m = r.mission!;
    const objs = m.objectives
      .map((o) => {
        const st = objStatus(o, b);
        const failed = objFailed(o, b);
        return `<li class="${st.ok ? 'ok' : failed ? 'failed' : ''}">${st.ok ? '✔' : failed ? '✘' : '◇'} ${objText(o)} <small>${st.text}</small> ${o.amount ? `<span class="rw">${rewardText(o)}</span>` : ''}</li>`;
      })
      .join('');
    const squad = mechs(b)
      .sort((a, c) => a.slot - c.slot)
      .map((u) => {
        const state = u.acted ? 'done' : u.moved ? 'moved' : 'ready';
        return `<button class="mech-btn ${state} ${this.sel === u.id ? 'sel' : ''}" data-act="mech" data-id="${u.id}">
          <span class="mi">${FRAMES[u.kind].icon}</span>
          <span class="mn">${r.mechs[u.slot].pilot?.name ?? '?'}<small>${FRAMES[u.kind].name}</small></span>
          ${pips(u.hp, u.max)}
        </button>`;
      })
      .join('');
    const lost = b.stats.lost.map((s) => `<span class="chip dead">${FRAMES[r.mechs[s].frame].icon} lost</span>`).join('');
    const phase = this.busy ? 'Enemy phase' : b.over ? 'Battle over' : 'Your turn';
    return `<div class="battle">
      <div class="board-wrap">
        <div id="board-holder">${this.boardSvg()}</div>
        ${this.banner ? `<div class="banner">${this.banner}</div>` : ''}
      </div>
      <aside class="panel">
        <div class="turn"><b>${m.name}</b><span>Turn ${Math.min(b.turn, b.turns)}/${b.turns} · ${phase}</span></div>
        <ul class="objs">${objs}</ul>
        <div class="squad">${squad}${lost}</div>
        <div class="actions">${this.actionsView()}</div>
        <div class="info" id="info">${this.infoView()}</div>
        <div class="row">
          <button data-act="undo" ${this.history.length && !this.busy ? '' : 'disabled'} title="Undo the last move (U)">↶ Undo move</button>
          <button data-act="reset" ${r.resetLeft && !this.busy && this.phaseStart ? '' : 'disabled'} title="Restart this turn. Once per battle.">⟲ Reset turn</button>
          <button class="primary" data-act="end-turn" ${this.busy || b.over ? 'disabled' : ''} title="End the turn (Enter)">End turn ▶</button>
        </div>
      </aside>
    </div>`;
  }

  private selUnit(): Unit | undefined {
    return this.sel !== null && this.b ? unitById(this.b, this.sel) : undefined;
  }

  private actionsView(): string {
    const u = this.selUnit();
    if (!u || this.busy) return '<p class="hint">Select a mech. Move it, then use a weapon. Red tiles show where enemies will strike.</p>';
    const b = this.b!;
    const off = disarmed(b, u);
    const ws = u.weapons
      .map((w, i) => {
        const d = WEAPONS[w.id];
        const can = canAct(u) && !off;
        return `<button class="weapon ${this.wslot === i ? 'on' : ''}" data-act="weapon" data-slot="${i}" ${can ? '' : 'disabled'}>
          <span class="wi">${d.icon}</span><span><b>${d.name}${w.lvl ? ' Mk II' : ''}</b> <kbd>${i + 1}</kbd><small>${weaponText(w.id, w.lvl, u.bonus)}</small></span>
        </button>`;
      })
      .join('');
    const note = u.acted
      ? '<p class="hint">This mech is done for this turn.</p>'
      : off
        ? `<p class="hint warn">${tileAt(b, pos(u))!.smoke ? 'In smoke' : 'In water'}: weapons do not work here.</p>`
        : !u.moved
          ? '<p class="hint">Blue tiles: move. Or use a weapon now (then it cannot move).</p>'
          : '';
    return `${ws}
      <button class="weapon" data-act="repair" ${canAct(u) && (u.hp < u.max || u.burning) ? '' : 'disabled'}>
        <span class="wi">🔧</span><span><b>Repair</b> <kbd>R</kbd><small>Heal ${repairAmount(u)} HP and put out fire. Uses the action.</small></span>
      </button>${note}`;
  }

  private unitInfo(u: Unit): string {
    const r = this.run!;
    if (u.side === 'mech') {
      const p = r.mechs[u.slot].pilot;
      const perks = p?.perks.map((x) => `${PERKS[x].icon} ${PERKS[x].name}`).join(', ') || 'none';
      return `<b>${FRAMES[u.kind].icon} ${FRAMES[u.kind].name}</b> · pilot ${p?.name ?? '?'}
        <p>HP ${u.hp}/${u.max} · Move ${u.move}${u.flying ? ' · Flying' : ''}${u.burning ? ' · 🔥 Burning' : ''}${u.shield ? ' · 🛡️ Shield' : ''}</p>
        <p class="dim">Perks: ${perks}</p>`;
    }
    const d = ENEMIES[u.kind];
    const w = u.weapons[0];
    let intent = '<p class="dim">No attack planned.</p>';
    if (u.intent) {
      const t = intentTarget(this.b!, u);
      intent = disarmed(this.b!, u)
        ? '<p class="ok">🚫 In smoke: its attack is cancelled.</p>'
        : `<p class="warn">Attack #${u.intent.order}: ${t ? `aims ${ARROWS[t.dir]}` : 'aims off the board, it will miss'}.</p>`;
    }
    return `<b>${d.icon} ${enemyName(u)}</b>
      <p>HP ${u.hp}/${u.max} · Move ${u.move}${u.flying ? ' · Flying' : ''}${u.jump ? ' · Jumps' : ''}${u.stable ? ' · Cannot be pushed' : ''}${u.burning ? ' · 🔥 Burning' : ''}${u.shield ? ' · 🛡️ Shield' : ''}</p>
      <p>${WEAPONS[w.id].icon} ${WEAPONS[w.id].name}: ${weaponText(w.id, w.lvl, u.bonus)}</p>
      <p class="dim">${d.text}</p>${intent}`;
  }

  private infoView(): string {
    const b = this.b;
    if (!b) return '';
    const h = this.hover ?? this.inspect;
    if (!h || !onBoard(h)) {
      const u = this.selUnit();
      return u ? this.unitInfo(u) : '<p class="dim">Point at a tile to see what is there.</p>';
    }
    const t = tileAt(b, h)!;
    const ti = TERRAIN_INFO[t.t];
    let tile = `<b>${t.spire ? '🗼 The Spire' : t.reactor ? '⚛️ Reactor' : ti.name}</b>${t.rubble ? ' (rubble)' : ''}${
      t.t === 'building' || t.t === 'mountain' ? ` · ${t.hp}/${t.max} blocks` : ''
    }<p class="dim">${t.spire ? 'If the Spire falls, the run is lost.' : ti.text}</p>`;
    if (t.fire) tile += '<p class="warn">🔥 On fire: units here burn for 1 damage each turn.</p>';
    if (t.smoke) tile += '<p>☁️ Smoke: units here cannot attack.</p>';
    if (t.shield) tile += '<p>🛡️ Shielded.</p>';
    if (b.spawns.some((s) => eq(s, h))) tile += '<p class="warn">⚠️ An enemy emerges here at the end of the turn. Stand on it to block it (1 damage).</p>';
    const u = unitAt(b, h);
    return `${u ? this.unitInfo(u) + '<hr>' : ''}${tile}`;
  }

  /** Targets of the aimed weapon, keyed by clicked tile. */
  private aimMap(): Map<string, Target> {
    const map = new Map<string, Target>();
    const u = this.selUnit();
    if (!u || this.wslot === null || !this.b) return map;
    const w = u.weapons[this.wslot];
    for (const t of aims(this.b, u, WEAPONS[w.id], w.lvl)) map.set(hk(t.h), t);
    return map;
  }

  private moveSet(): Set<string> {
    const u = this.selUnit();
    if (!u || this.wslot !== null || !canMove(u) || !this.b || this.busy) return new Set();
    return new Set(reach(this.b, u).filter((h) => !eq(h, pos(u))).map(hk));
  }

  private boardSvg(): string {
    const base = this.b!;
    const aim = this.busy ? new Map<string, Target>() : this.aimMap();
    const moves = this.moveSet();
    const focus = this.touch ? this.pending : this.hover ? hk(this.hover) : null;
    const shot = focus ? aim.get(focus) : undefined;
    const u0 = this.selUnit();
    // When a shot is aimed, draw the battle as it will be after the shot.
    const view = shot && u0 ? attack(base, u0.id, this.wslot!, shot) : base;
    const area = new Set<string>(shot && u0 ? opsOf(base, u0, this.wslot!, shot).map((o) => hk(o.h)) : []);
    if (shot?.land) area.add(hk(shot.land));

    const P = (h: Hex) => toPixel(h, S);
    const out: string[] = [];
    out.push(`<svg id="board" class="${shot ? 'previewing' : ''}" viewBox="${-VIEW_W / 2} ${-VIEW_H / 2} ${VIEW_W} ${VIEW_H}" xmlns="http://www.w3.org/2000/svg">`);

    // Tiles
    for (const h of HEXES) {
      const t = tileAt(view, h)!;
      const { x, y } = P(h);
      const k = hk(h);
      const cls = ['tile', `t-${t.t}`, t.rubble ? 'rubble' : '', moves.has(k) ? 'hl-move' : '', aim.has(k) ? 'hl-aim' : '', area.has(k) ? 'hl-area' : '', this.hover && eq(this.hover, h) ? 'hover' : ''].join(' ');
      out.push(`<polygon class="${cls}" points="${hexPoints(x, y, S - 1.5)}"/>`);
      if (t.t === 'forest') out.push(`<text class="deco" x="${x}" y="${y}">🌲</text>`);
      if (t.t === 'water') out.push(`<text class="deco wave" x="${x}" y="${y}">〰</text>`);
      if (t.t === 'mountain') out.push(`<text class="deco big" x="${x}" y="${y - 2}">⛰️</text>${this.blocks(x, y + 14, t.hp, t.max)}`);
      if (t.t === 'building') {
        const icon = t.spire ? '🗼' : t.reactor ? '⚛️' : t.max > 1 ? '🏬' : '🏠';
        const before = tileAt(base, h)!;
        out.push(`<text class="deco big" x="${x}" y="${y - 3}">${icon}</text>${this.blocks(x, y + 14, t.hp, t.max)}`);
        if (t.shield) out.push(`<circle class="shield-ring" cx="${x}" cy="${y}" r="${S - 7}"/>`);
        if (shot && before.hp > t.hp) out.push(this.badge(x, y - 18, `-${before.hp - t.hp}`, 'loss'));
      }
      if (t.rubble && t.t === 'ground') out.push(`<text class="deco dim" x="${x}" y="${y}">🧱</text>`);
      if (t.fire) out.push(`<text class="deco fire" x="${x + 13}" y="${y + 12}">🔥</text>`);
      if (t.smoke) out.push(`<text class="deco smoke" x="${x}" y="${y}">☁️</text>`);
    }
    if (shot && base.power > view.power) out.push(this.badge(0, -VIEW_H / 2 + 14, `⚡ -${base.power - view.power} grid`, 'loss'));

    // Spawn markers
    for (const s of view.spawns) {
      const { x, y } = P(s);
      out.push(`<circle class="spawn" cx="${x}" cy="${y}" r="${S * 0.55}"/><text class="deco spawn-t" x="${x}" y="${y}">${s.kind ? '🥚' : '⚠️'}</text>`);
    }

    // Enemy intents, from the drawn state. Labels go on top of the units.
    const labels: string[] = [];
    if (!view.over) {
      for (const e of attackOrder(view)) {
        const t = intentTarget(view, e);
        if (!t) continue;
        const off = disarmed(view, e);
        const ep = P(pos(e));
        const hp = P(t.hit);
        out.push(`<line class="intent-line ${off ? 'off' : ''}" x1="${ep.x}" y1="${ep.y}" x2="${hp.x}" y2="${hp.y}"/>`);
        if (off) continue;
        for (const op of opsOf(view, e, 0, t)) {
          const { x, y } = P(op.h);
          if (op.dmg) {
            out.push(`<polygon class="intent-tile" points="${hexPoints(x, y, S - 6)}"/>`);
            labels.push(`<text class="intent-dmg" x="${x - 17}" y="${y + 14}">${op.dmg}</text>`);
          }
          if (op.push !== undefined && unitAt(view, op.h)) labels.push(`<text class="push-arrow" x="${x + 17}" y="${y + 13}">${ARROWS[op.push]}</text>`);
          if (op.ignite) labels.push(`<text class="intent-dmg" x="${x - 17}" y="${y - 12}">🔥</text>`);
        }
      }
    }

    // Units
    for (const u of view.units) {
      const { x, y } = P(pos(u));
      const before = unitById(base, u.id);
      const isMech = u.side === 'mech';
      const icon = isMech ? FRAMES[u.kind].icon : ENEMIES[u.kind].icon;
      const cls = ['unit', isMech ? 'mech' : 'enemy', u.alpha ? 'alpha' : '', u.boss ? 'boss' : '', this.sel === u.id ? 'sel' : '', isMech && u.acted && !this.busy ? 'spent' : '', this.actorFlash === u.id ? 'acting' : ''].join(' ');
      out.push(`<g class="${cls}">`);
      if (before && (before.q !== u.q || before.r !== u.r)) {
        const o = P(pos(before));
        out.push(`<line class="move-ghost" x1="${o.x}" y1="${o.y}" x2="${x}" y2="${y}"/><circle class="ghost" cx="${o.x}" cy="${o.y}" r="${S * 0.45}"/>`);
      }
      out.push(`<circle class="body" cx="${x}" cy="${y}" r="${S * 0.58}"/><text class="u-icon" x="${x}" y="${y - 2}">${icon}</text>`);
      out.push(this.unitHp(x, y + S * 0.5, u.hp, u.max));
      if (u.shield) out.push(`<circle class="shield-ring" cx="${x}" cy="${y}" r="${S * 0.7}"/>`);
      if (u.burning) out.push(`<text class="status" x="${x - 17}" y="${y - 15}">🔥</text>`);
      if (u.intent && !view.over) out.push(`<circle class="order" cx="${x + 18}" cy="${y - 17}" r="8"/><text class="order-t" x="${x + 18}" y="${y - 17}">${u.intent.order}</text>`);
      if (before && before.hp > u.hp) out.push(this.badge(x, y - 22, `-${before.hp - u.hp}`, 'loss'));
      if (before && before.hp < u.hp) out.push(this.badge(x, y - 22, `+${u.hp - before.hp}`, 'gain'));
      out.push('</g>');
    }
    out.push(...labels);

    // Units the aimed shot would kill
    if (shot) {
      for (const u of base.units) {
        if (unitById(view, u.id)) continue;
        const { x, y } = P(pos(u));
        out.push(`<g class="unit dying"><circle class="body" cx="${x}" cy="${y}" r="${S * 0.58}"/><text class="u-icon" x="${x}" y="${y}">💀</text></g>`);
      }
    }

    // Effects of the last action
    if (this.fxFresh) {
      for (const f of base.fx) {
        const { x, y } = P(f.h);
        const txt = f.kind === 'dmg' ? `-${f.n}` : f.kind === 'heal' ? `+${f.n}` : FX_ICON[f.kind];
        if (txt) out.push(`<text class="fx fx-${f.kind}" x="${x}" y="${y - 6}">${txt}</text>`);
        if (f.kind === 'dmg' || f.kind === 'bump') out.push(`<polygon class="flash" points="${hexPoints(x, y, S - 2)}"/>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  private blocks(x: number, y: number, hp: number, max: number): string {
    const w = 7;
    const x0 = x - (max * (w + 2)) / 2;
    return Array.from({ length: max }, (_, i) => `<rect class="block ${i < hp ? 'on' : ''}" x="${x0 + i * (w + 2)}" y="${y}" width="${w}" height="5" rx="1"/>`).join('');
  }

  private unitHp(x: number, y: number, hp: number, max: number): string {
    if (max > 6) {
      return `<rect class="hp-bg" x="${x - 16}" y="${y}" width="32" height="6" rx="2"/><rect class="hp-fill" x="${x - 16}" y="${y}" width="${(32 * Math.max(0, hp)) / max}" height="6" rx="2"/><text class="hp-num" x="${x}" y="${y + 3.5}">${hp}</text>`;
    }
    const w = 6;
    const x0 = x - (max * (w + 1.5)) / 2;
    return Array.from({ length: max }, (_, i) => `<rect class="hp-pip ${i < hp ? 'on' : ''}" x="${x0 + i * (w + 1.5)}" y="${y}" width="${w}" height="5" rx="1"/>`).join('');
  }

  private badge(x: number, y: number, txt: string, cls: string): string {
    return `<text class="badge ${cls}" x="${x}" y="${y}">${txt}</text>`;
  }

  // ---------- Report, hangar, end ----------

  private reportView(): string {
    const rep = this.report!;
    const r = this.run!;
    const objs = rep.objectives
      .map(({ o, ok }) => `<li class="${ok ? 'ok' : 'failed'}">${ok ? '✔' : '✘'} ${objText(o)} ${o.amount ? `<span class="rw">${ok ? rewardText(o) : '—'}</span>` : ''}</li>`)
      .join('');
    const pilots = rep.pilots
      .map((p) => `<li class="${p.dead ? 'failed' : ''}">${FRAMES[r.mechs[p.slot].frame].icon} ${p.name}: ${p.dead ? 'killed in action' : `+${p.gained} XP${p.levelUp ? ' · <b>Level up!</b>' : ''}`}</li>`)
      .join('');
    let perk = '';
    if (!rep.lost && r.perkQueue.length) {
      const slot = r.perkQueue[0];
      const p = r.mechs[slot].pilot!;
      perk = `<div class="perk-pick"><h3>${p.name} reached level ${p.perks.length + 1}. Choose a perk:</h3><div class="perks">${perkChoices(r, slot)
        .map((id) => `<button class="perk" data-act="perk" data-slot="${slot}" data-perk="${id}"><span class="big">${PERKS[id].icon}</span><b>${PERKS[id].name}</b><small>${PERKS[id].text}</small></button>`)
        .join('')}</div></div>`;
    }
    const extra = rep.islandDone ? `<p class="good">${ISLANDS[rep.islandDone].icon} ${ISLANDS[rep.islandDone].name} is clear! +2 ⭐ +1 ⚡</p>` : '';
    const head = rep.lost ? `<h2 class="bad">Mission failed</h2><p>${rep.reason}</p>` : `<h2 class="good">${rep.runWon ? 'The hive is broken!' : 'Mission complete'}</h2>`;
    const next = rep.lost || rep.runWon ? 'See results' : 'To the hangar';
    return `<div class="report">${head}
      <ul class="objs">${objs}</ul>
      <p>Enemies killed: ${rep.kills} · Earned ${rep.rep} ⭐ ${rep.power ? `· ${rep.power} ⚡` : ''}</p>
      ${extra}
      <h3>Pilots</h3><ul class="pilots">${pilots}</ul>
      ${perk}
      <button class="primary" data-act="report-next" ${perk ? 'disabled' : ''}>${next} ▶</button>
    </div>`;
  }

  private hangarView(): string {
    const r = this.run!;
    const can = (c: number) => r.rep >= c;
    const mechCards = r.mechs
      .map((m, i) => {
        const f = FRAMES[m.frame];
        const p = m.pilot;
        const hp = f.hp + m.hpBonus + (p?.perks.includes('tough') ? 2 : 0);
        const lvl = p ? p.perks.length : 0;
        const nextXp = LEVELS[lvl];
        const weapons = m.weapons
          .map(
            (w, wi) => `<div class="hw"><span>${WEAPONS[w.id].icon} <b>${WEAPONS[w.id].name}${w.lvl ? ' Mk II' : ''}</b><small>${weaponText(w.id, w.lvl, p?.perks.includes('gunner') ? 1 : 0)}</small></span>
            ${w.lvl ? '' : `<button data-act="upgrade" data-m="${i}" data-w="${wi}" ${can(COST.up) ? '' : 'disabled'} title="${WEAPONS[w.id].up ?? ''}">Mk II: ${WEAPONS[w.id].up} · ${COST.up}⭐</button>`}</div>`,
          )
          .join('');
        const install = this.buying
          ? `<button class="primary" data-act="install" data-m="${i}" ${p ? '' : 'disabled'}>${m.weapons.length > 1 ? `Replace ${WEAPONS[m.weapons[1].id].icon}` : 'Install here'}</button>`
          : '';
        return `<div class="hcard ${p ? '' : 'dead'}">
          <div class="hhead"><span class="big">${f.icon}</span><span><b>${f.name}</b><small>❤️ ${hp} · 👟 ${f.move + (p?.perks.includes('fast') ? 1 : 0)}${f.flying ? ' · flies' : ''}</small></span></div>
          ${p ? `<p>Pilot <b>${p.name}</b> · level ${lvl} · XP ${p.xp}${nextXp ? `/${nextXp}` : ''} ${p.perks.map((x) => `<span class="perk-chip" title="${PERKS[x].text}">${PERKS[x].icon} ${PERKS[x].name}</span>`).join('')}</p>` : `<p class="bad">No pilot. This mech stays home.</p><button data-act="recruit" data-m="${i}" ${can(COST.recruit) ? '' : 'disabled'}>Recruit a rookie · ${COST.recruit}⭐</button>`}
          ${weapons}
          ${m.hpBonus < 2 ? `<button data-act="frame" data-m="${i}" ${can(COST.frame) ? '' : 'disabled'}>+1 max HP · ${COST.frame}⭐</button>` : ''}
          ${install}
        </div>`;
      })
      .join('');
    const offers = r.hangar
      .map((id) => {
        const w = WEAPONS[id];
        const sel = this.buying === id;
        return `<div class="hoffer ${sel ? 'sel' : ''}"><span class="big">${w.icon}</span><span><b>${w.name}</b><small>${weaponText(id, 0)}</small></span>
          <button data-act="buy" data-id="${id}" ${can(COST.weapon) ? '' : 'disabled'}>${sel ? 'Cancel' : `Buy · ${COST.weapon}⭐`}</button></div>`;
      })
      .join('');
    return `<div class="hangar">
      <h2>🔧 Hangar</h2>
      <p class="sub">Mechs are fully repaired. Spend reputation ⭐ on upgrades.</p>
      <div class="hgrid">
        <div class="hoffer"><span class="big">⚡</span><span><b>Grid power +1</b><small>Now ${r.power}/${MAX_POWER}. At 0 the run is lost.</small></span>
          <button data-act="power" ${can(COST.power) && r.power < MAX_POWER ? '' : 'disabled'}>Buy · ${COST.power}⭐</button></div>
        ${offers}
      </div>
      ${this.buying ? '<p class="warn">Choose the mech that gets the new weapon (second slot).</p>' : ''}
      <div class="hmechs">${mechCards}</div>
      <button class="primary" data-act="hangar-next">Continue ▶</button>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end">
      <h1 class="${e.victory ? 'good' : 'bad'}">${e.victory ? '🏆 Victory' : '💥 Defeat'}</h1>
      <p>${e.reason}</p>
      <p class="sub">${SQUADS[e.squad].icon} ${SQUADS[e.squad].name} squad · ${e.islands}/3 islands</p>
      <p class="score">Score <b>${e.score}</b></p>
      <button class="primary" data-act="title">New run</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Read the threats.</b> Each enemy shows its attack in red, with the damage and its order number. Attacks hit at the end of your turn.</li>
          <li><b>Each mech</b> can move, then act once: use a weapon or repair. After it acts it cannot move.</li>
          <li><b>Push</b> enemies to move their attacks. A pushed enemy aims from its new tile, so it can hit another enemy or nothing.</li>
          <li><b>Bump:</b> a push into a unit, mountain or building deals 1 damage to both. Push enemies into <b>water</b> to drown them, or into a <b>chasm</b>.</li>
          <li><b>Buildings</b> feed the grid. Each hit on a building costs 1 grid power ⚡. At 0 the run is lost.</li>
          <li><b>Spawns ⚠️</b> mark where enemies emerge. Stand on one to block it, for 1 damage.</li>
          <li><b>Smoke ☁️</b> stops the attack of any unit in it. <b>Fire 🔥</b> burns units for 1 damage each turn. A <b>shield</b> blocks the next damage.</li>
          <li>Point at a target to preview the result. On touch screens, tap a target once to preview and again to fire.</li>
          <li>Survive 5 turns. Bonus goals give reputation ⭐ and power ⚡. A destroyed mech loses its pilot for the rest of the run.</li>
          <li>Keys: <kbd>1</kbd> <kbd>2</kbd> weapons, <kbd>R</kbd> repair, <kbd>U</kbd> undo, <kbd>Tab</kbd> next mech, <kbd>Esc</kbd> cancel, <kbd>Enter</kbd> end turn.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It counts as a loss.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="to-title">Title screen (keeps the run)</button>
    </div></div>`;
  }

  // ---------- Input ----------

  private boardHex(e: { clientX: number; clientY: number }): Hex | null {
    const svg = this.root.querySelector<SVGSVGElement>('#board');
    if (!svg) return null;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const h = fromPixel(pt.x, pt.y, S);
    return onBoard(h) ? h : null;
  }

  private setHover(h: Hex | null): void {
    if (this.screen !== 'battle' || this.busy) return;
    const same = (!h && !this.hover) || (h && this.hover && eq(h, this.hover));
    if (same) return;
    this.hover = h;
    this.renderBoard();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || this.screen !== 'battle') return;
    const inBoard = (e.target as Element).closest?.('#board');
    this.setHover(inBoard ? this.boardHex(e) : null);
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-stop], #board');
    if (!el) return;
    if (el.id === 'board') {
      const h = this.boardHex(e);
      if (h) this.clickHex(h);
      return;
    }
    if (el.hasAttribute('data-stop') && !el.dataset.act) return;
    const act = el.dataset.act!;
    this.action(act, el.dataset);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (this.screen !== 'battle' || this.busy || !this.b || this.b.over) return;
    const u = this.selUnit();
    if (e.key === 'Escape') {
      if (this.wslot !== null) this.wslot = null;
      else this.sel = null;
      this.pending = null;
      this.render();
    } else if ((e.key === '1' || e.key === '2') && u) {
      this.action('weapon', { slot: String(+e.key - 1) });
    } else if (e.key === 'r' || e.key === 'R') {
      if (u) this.action('repair', {});
    } else if (e.key === 'u' || e.key === 'U' || ((e.ctrlKey || e.metaKey) && e.key === 'z')) {
      this.action('undo', {});
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const list = mechs(this.b).filter((m) => canAct(m)).sort((a, c) => a.slot - c.slot);
      if (!list.length) return;
      const i = list.findIndex((m) => m.id === this.sel);
      this.select(list[(i + 1) % list.length].id);
    } else if (e.key === 'Enter') {
      void this.endTurn();
    }
  }

  private select(id: number | null): void {
    this.sel = id;
    this.wslot = null;
    this.pending = null;
    if (id !== null) sfx.select();
    this.render();
  }

  private clickHex(h: Hex): void {
    const b = this.b;
    if (!b || this.busy || b.over) return;
    this.inspect = h;
    const u = this.selUnit();
    const there = unitAt(b, h);
    if (u && this.wslot !== null) {
      const t = this.aimMap().get(hk(h));
      if (t) {
        if (this.touch && this.pending !== hk(h)) {
          this.pending = hk(h);
          this.render();
          return;
        }
        this.fireShot(u, this.wslot, t);
        return;
      }
      if (there?.side === 'mech' && there.id !== u.id) return this.select(there.id);
      this.wslot = null;
      this.pending = null;
      this.render();
      return;
    }
    if (u && canMove(u) && this.moveSet().has(hk(h))) {
      this.history.push(b);
      this.b = moveMech(b, u.id, h);
      this.fxFresh = true;
      sfx.move();
      this.playFx(this.b.fx);
      this.render();
      if (this.b.over) void this.finish();
      return;
    }
    if (there?.side === 'mech') return this.select(there.id === this.sel ? null : there.id);
    this.sel = null;
    this.wslot = null;
    this.render();
  }

  private fireShot(u: Unit, slot: number, t: Target): void {
    const next = attack(this.b!, u.id, slot, t);
    this.history = [];
    this.b = next;
    this.wslot = null;
    this.pending = null;
    this.fxFresh = true;
    sfx.shot();
    this.playFx(next.fx);
    // Select the next mech that can still act.
    const ready = mechs(next).filter((m) => canAct(m)).sort((a, c) => a.slot - c.slot);
    this.sel = ready[0]?.id ?? null;
    this.render();
    if (next.over) void this.finish();
  }

  private playFx(list: Fx[]): void {
    const kinds = new Set(list.map((f) => f.kind));
    const b = this.b!;
    const hitBuilding = list.some((f) => f.kind === 'dmg' && (tileAt(b, f.h)?.t === 'building' || tileAt(b, f.h)?.rubble));
    if (hitBuilding) sfx.building();
    else if (kinds.has('drown')) sfx.splash();
    else if (kinds.has('dmg') || kinds.has('die')) sfx.hit();
    if (kinds.has('bump')) sfx.bump();
    if (kinds.has('shield')) sfx.shield();
    if (kinds.has('fire')) sfx.fire();
    if (kinds.has('heal')) sfx.heal();
    if (kinds.has('spawn')) sfx.spawn();
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
        this.endRun(false, 'You abandoned the run.');
        return;
      case 'to-title':
        this.modal = null;
        this.screen = 'title';
        this.render();
        return;
      case 'title':
        this.screen = 'title';
        this.render();
        return;
      case 'start':
        this.startRun(d.squad as SquadId);
        return;
      case 'continue':
        this.continueRun();
        return;
      case 'island':
        enterIsland(r!, d.id as keyof typeof ISLANDS);
        saveRun(r!);
        this.screen = 'missions';
        this.render();
        return;
      case 'mission':
        this.startMission(r!.offers[+d.i!]);
        return;
      case 'perk':
        takePerk(r!, +d.slot!, d.perk!);
        saveRun(r!);
        sfx.coin();
        this.render();
        return;
      case 'report-next':
        this.reportNext();
        return;
      case 'upgrade':
        if (this.spend(COST.up)) r!.mechs[+d.m!].weapons[+d.w!].lvl = 1;
        this.saved();
        return;
      case 'frame':
        if (this.spend(COST.frame)) r!.mechs[+d.m!].hpBonus++;
        this.saved();
        return;
      case 'recruit':
        if (this.spend(COST.recruit)) recruit(r!, +d.m!);
        this.saved();
        return;
      case 'power':
        if (r!.power < MAX_POWER && this.spend(COST.power)) r!.power++;
        this.saved();
        return;
      case 'buy':
        this.buying = this.buying === d.id ? null : d.id!;
        this.render();
        return;
      case 'install': {
        const id = this.buying;
        if (!id || !this.spend(COST.weapon)) return;
        const m = r!.mechs[+d.m!];
        m.weapons = [m.weapons[0], { id, lvl: 0 }];
        r!.hangar = r!.hangar.filter((x) => x !== id);
        this.buying = null;
        saveRun(r!);
        this.render();
        return;
      }
      case 'hangar-next':
        this.buying = null;
        this.screen = r!.island ? 'missions' : 'islands';
        saveRun(r!);
        this.render();
        return;
    }
    // Battle actions
    const b = this.b;
    if (!b || this.busy || b.over || this.screen !== 'battle') return;
    const u = this.selUnit();
    switch (act) {
      case 'mech':
        this.select(+d.id! === this.sel ? null : +d.id!);
        return;
      case 'weapon': {
        if (!u || !canAct(u) || disarmed(b, u)) return sfx.deny();
        const slot = +d.slot!;
        if (slot >= u.weapons.length) return;
        this.wslot = this.wslot === slot ? null : slot;
        this.pending = null;
        sfx.select();
        this.render();
        return;
      }
      case 'repair':
        if (!u || !canAct(u) || (u.hp >= u.max && !u.burning)) return sfx.deny();
        this.history = [];
        this.b = repairMech(b, u.id);
        this.fxFresh = true;
        sfx.heal();
        this.wslot = null;
        this.render();
        return;
      case 'undo': {
        const prev = this.history.pop();
        if (!prev) return;
        this.b = prev;
        this.wslot = null;
        this.pending = null;
        this.render();
        return;
      }
      case 'reset':
        if (!r!.resetLeft || !this.phaseStart) return;
        r!.resetLeft = false;
        this.b = clone(this.phaseStart);
        this.history = [];
        this.sel = null;
        this.wslot = null;
        this.toast('Turn reset. You cannot reset again this battle.');
        this.render();
        return;
      case 'end-turn':
        void this.endTurn();
        return;
    }
  }

  private spend(cost: number): boolean {
    const r = this.run!;
    if (r.rep < cost) {
      sfx.deny();
      return false;
    }
    r.rep -= cost;
    sfx.coin();
    return true;
  }

  private saved(): void {
    saveRun(this.run!);
    this.render();
  }

  // ---------- Flow ----------

  private startRun(squad: SquadId): void {
    this.run = newRun(squad, randomSeedText());
    this.meta.runs++;
    saveMeta(this.meta);
    saveRun(this.run);
    this.screen = 'islands';
    this.render();
  }

  private continueRun(): void {
    const r = this.run;
    if (!r) return;
    if (r.battle && r.mission) {
      this.b = r.battle;
      this.beginPlayerPhase(false);
      this.screen = 'battle';
    } else {
      this.screen = r.island ? 'missions' : 'islands';
    }
    this.render();
  }

  private startMission(m: MissionDef): void {
    const r = this.run!;
    r.mission = m;
    r.resetLeft = true;
    this.b = makeBattle(r, m);
    this.screen = 'battle';
    this.beginPlayerPhase(true);
    this.render();
  }

  private beginPlayerPhase(announce: boolean): void {
    const b = this.b!;
    this.phaseStart = clone(b);
    this.history = [];
    this.wslot = null;
    this.pending = null;
    const ready = mechs(b).sort((a, c) => a.slot - c.slot);
    this.sel = ready[0]?.id ?? null;
    const r = this.run!;
    r.battle = this.phaseStart;
    saveRun(r);
    if (announce) {
      this.banner = b.turn === b.turns ? 'Last turn!' : `Turn ${b.turn}`;
      sfx.turn();
      setTimeout(() => {
        this.banner = '';
        if (this.screen === 'battle' && !this.busy) this.render();
      }, 1100);
    }
  }

  private async endTurn(): Promise<void> {
    if (!this.b || this.busy || this.b.over) return;
    this.busy = true;
    this.sel = null;
    this.wslot = null;
    this.pending = null;
    this.hover = null;
    this.banner = 'Enemy phase';
    const c = clone(this.b);
    this.b = c;
    const show = async (ms: number) => {
      this.fxFresh = true;
      this.playFx(c.fx);
      this.render();
      await sleep(ms);
    };
    fireStep(c);
    if (c.fx.length) await show(550);
    else this.render();
    for (const u of attackOrder(c)) {
      if (c.over) break;
      this.actorFlash = u.id;
      this.render();
      await sleep(220);
      attackStep(c, u.id);
      await show(520);
    }
    this.actorFlash = -1;
    if (!c.over && c.spawns.length) {
      spawnStep(c);
      await show(500);
    }
    endRound(c);
    this.busy = false;
    this.banner = '';
    if (c.over) {
      await this.finish();
      return;
    }
    this.beginPlayerPhase(true);
    this.render();
  }

  private async finish(): Promise<void> {
    const b = this.b!;
    this.busy = true;
    this.banner = b.over === 'win' ? 'Battle won' : 'Defeat';
    this.render();
    if (b.over === 'win') sfx.win();
    else sfx.lose();
    await sleep(1100);
    this.busy = false;
    this.banner = '';
    const r = this.run!;
    this.report = finishBattle(r, b);
    this.b = null;
    this.phaseStart = null;
    saveRun(r);
    this.screen = 'report';
    this.render();
  }

  private reportNext(): void {
    const rep = this.report!;
    if (rep.lost) return this.endRun(false, rep.reason);
    if (rep.runWon) return this.endRun(true, 'The Hive Heart is destroyed. The islands are safe.');
    this.screen = 'hangar';
    this.render();
  }

  private endRun(victory: boolean, reason: string): void {
    const r = this.run!;
    const sc = score(r, victory);
    this.meta.bestIslands = Math.max(this.meta.bestIslands, r.done.length);
    this.meta.best = Math.max(this.meta.best, sc);
    if (victory) this.meta.wins++;
    saveMeta(this.meta);
    this.end = { victory, score: sc, reason, islands: r.done.length, squad: r.squad };
    clearRun();
    this.run = null;
    this.b = null;
    this.screen = 'end';
    if (victory) sfx.win();
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const api = {
      state: () => ({
        screen: this.screen,
        busy: this.busy,
        turn: this.b?.turn,
        power: this.b?.power ?? this.run?.power,
        rep: this.run?.rep,
        islands: this.run?.done,
        island: this.run?.island,
        step: this.run?.step,
        mechs: this.b ? mechs(this.b).map((m) => `${m.kind} ${m.hp}/${m.max}`) : null,
        enemies: this.b ? enemies(this.b).length : null,
        end: this.end,
      }),
      rep: (n: number) => {
        if (this.run) this.run.rep += n;
        this.render();
      },
      unlockAll: () => {
        this.meta.bestIslands = 3;
        saveMeta(this.meta);
        this.render();
      },
      /** Mark all islands clear and go to the final battle. */
      toFinal: () => {
        const r = this.run;
        if (!r || this.screen === 'battle') return;
        r.done = [...ISLAND_IDS];
        r.island = null;
        r.offers = makeOffers(r);
        this.screen = 'islands';
        this.render();
      },
      win: () => {
        if (!this.b) return;
        this.b.over = 'win';
        void this.finish();
      },
      /** One bot action for automatic tests. */
      step: async (squad: SquadId = 'vanguard') => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const click = (sel: string): boolean => {
          const el = this.root.querySelector<HTMLElement>(sel);
          el?.click();
          return !!el;
        };
        switch (this.screen) {
          case 'title':
            this.startRun(squad);
            return 'start';
          case 'islands':
            click('[data-act="island"], [data-act="mission"]');
            return 'island';
          case 'missions':
            click('[data-act="mission"]');
            return 'mission';
          case 'battle': {
            for (const a of botTurn(this.b!)) this.b = applyBot(this.b!, a);
            this.render();
            if (this.b!.over) await this.finish();
            else await this.endTurn();
            return 'turn';
          }
          case 'report':
            if (!click('[data-act="perk"]')) click('[data-act="report-next"]');
            return 'report';
          case 'hangar':
            if (!click('[data-act="power"]:not([disabled])')) click('[data-act="hangar-next"]');
            return 'hangar';
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { hex: typeof api }).hex = api;
  }
}
