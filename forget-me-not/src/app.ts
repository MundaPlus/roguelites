import { ACTS, BARS, FLOORS_PER_ACT, LAST_FLOOR, MONSTERS, RELICS, SKILLS, TUNE, TAG_ICON, skillText } from './data';
import {
  HERO,
  actors,
  alive,
  canUse,
  echoStats,
  endTurn,
  finishEnemyTurn,
  foeAct,
  intent,
  moveIcons,
  moveText,
  startEnemyTurn,
  useCard,
  type Ev,
  type Fight,
  type Foe,
} from './fight';
import { GOOD_BOT, chooseRoom, pickOffer, restBot, rewardBot, shrineBot, smartPlan, weakestSlot, type Play } from './bot';
import { Rng, hash, randomSeedText } from './rng';
import {
  actOf,
  beatenEchoes,
  canExpand,
  canUpgrade,
  clearRun,
  dueEchoes,
  dueFloor,
  enterRoom,
  escapedEchoes,
  expand,
  finalEchoes,
  floorChoices,
  floorInAct,
  isFightRoom,
  learn,
  loadMeta,
  loadRun,
  newRun,
  nextFloor,
  pendingEchoes,
  petalsFor,
  restHeal,
  saveMeta,
  saveRun,
  score,
  setPoolMeta,
  shrineOffers,
  takeRelic,
  unlockList,
  upgrade,
  winFight,
  type Echo,
  type RoomKind,
  type RunState,
  type SkillInst,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';

type Screen = 'title' | 'map' | 'fight' | 'reward' | 'shrine' | 'rest' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean } | { kind: 'forget'; offer: SkillInst };

const PARAMS = new URLSearchParams(location.search);
const FAST = PARAMS.has('fast');
const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, FAST ? 0 : ms));

const ROOM: Record<RoomKind, { icon: string; name: string }> = {
  fight: { icon: '⚔️', name: 'Fight' },
  elite: { icon: '👹', name: 'Elite' },
  shrine: { icon: '⛩️', name: 'Shrine' },
  rest: { icon: '🔥', name: 'Rest' },
  boss: { icon: '💀', name: 'Boss' },
  final: { icon: '🧠', name: 'Final boss' },
};

const pct = (a: number, b: number): number => Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100));
const hpBar = (hp: number, max: number, block = 0): string =>
  `<div class="hp ${block ? 'blk' : ''}"><i style="width:${pct(hp, max)}%"></i><span>${hp}/${max}${block ? ` 🛡️${block}` : ''}</span></div>`;
const lv = (n: number): string => `<span class="lv">Lv${n}</span>`;
const skName = (s: SkillInst): string => `${SKILLS[s.id].icon} ${SKILLS[s.id].name} ${lv(s.lvl)}`;
const whenText = (due: number, floor: number): string => (due >= LAST_FLOOR ? '🧠 final boss' : due <= floor ? 'next fight' : `floor ${due}`);

function statusIcons(st: { poison: number; weak: number; vuln: number; str: number; thorns: number; stun: number; daze?: number }): string {
  const out: string[] = [];
  if (st.str) out.push(`<span title="Strength: +${st.str} damage">💪${st.str}</span>`);
  if (st.poison) out.push(`<span title="Poison: loses ${st.poison} HP at the turn start">☠️${st.poison}</span>`);
  if (st.weak) out.push(`<span title="Weak: deals 25% less damage">🌀${st.weak}</span>`);
  if (st.vuln) out.push(`<span title="Exposed: takes 50% more damage">🎯${st.vuln}</span>`);
  if (st.thorns) out.push(`<span title="Thorns: attackers take ${st.thorns}">🌵${st.thorns}</span>`);
  if (st.stun) out.push('<span title="Stunned: skips the next move">💫</span>');
  if (st.daze) out.push(`<span title="Dazed: −${st.daze} energy next turn">💫${st.daze}</span>`);
  return out.join('');
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private modal: Modal | null = null;
  private bar = 'wanderer';
  private busy = false;
  private acting = 0;
  private recentDead = new Set<number>();
  /** Foes already drawn once, so the fade-in plays only when a foe appears. */
  private seen = new Set<number>();
  private notes: string[] = [];
  private botPlan: Play[] | null = null;
  private fx: HTMLElement;
  private end: { won: boolean; score: number; petals: number; floor: number; run: RunState } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    setPoolMeta(this.meta);
    if (this.meta.muted && !isMuted()) toggleMute();
    this.fx = document.createElement('div');
    this.fx.id = 'fx';
    document.body.appendChild(this.fx);
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (PARAMS.has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Helpers ----------

  private save(): void {
    if (this.run) saveRun(this.run);
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private go(screen: Screen): void {
    this.screen = screen;
    this.render();
    window.scrollTo(0, 0);
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
      case 'shrine':
        body = this.shrineView();
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
  }

  private topBar(): string {
    const r = this.run!;
    const f = this.f;
    const hp = f ? f.hero.hp : r.hp;
    const act = ACTS[actOf(r.floor) - 1];
    const relics = r.relics.map((id) => `<span class="relic" title="${RELICS[id].name}: ${RELICS[id].text}">${RELICS[id].icon}</span>`).join('');
    return `<header class="top">
      <span class="pill" title="Floor">${act.icon} ${r.floor}/${LAST_FLOOR}</span>
      <span class="pill" title="HP">❤️ ${hp}/${r.maxHp}</span>
      <span class="pill" title="Memory slots used">🧠 ${r.memory.length}/${r.slots}</span>
      <span class="pill ghost" title="Echoes that still hunt you">👻 ${finalEchoes(r).length}</span>
      <span class="relics">${relics}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  /** A skill card. `tag` is button when it can be clicked. */
  private skillCard(s: SkillInst, o: { attrs?: string; extra?: string; cls?: string; key?: number; button?: boolean; disabled?: boolean } = {}): string {
    const d = SKILLS[s.id];
    const el = o.button ? 'button' : 'div';
    return `<${el} class="skill t-${d.tag} ${o.cls ?? ''}" ${o.attrs ?? ''} ${o.disabled ? 'disabled' : ''}>
      <span class="sk-top"><span class="sk-icon">${d.icon}</span><span class="sk-cost" title="Energy cost">${'⚡'.repeat(d.cost) || '0'}</span></span>
      <b>${d.name} ${lv(s.lvl)}</b>
      <small>${skillText(s.id, s.lvl)}</small>
      ${o.extra ?? ''}
      ${o.key ? `<kbd>${o.key}</kbd>` : ''}
    </${el}>`;
  }

  private emptySlots(n: number): string {
    return Array.from({ length: n }, () => '<div class="skill empty"><span>empty slot</span></div>').join('');
  }

  /** The echo a skill would become if it were forgotten now. */
  private echoPreview(s: SkillInst): string {
    const r = this.run!;
    const due = dueFloor(r);
    const { hp, moves } = echoStats(s.id, s.lvl, actOf(due), r.relics);
    return `<span class="preview">👻 Echo ❤️${hp} · ${SKILLS[s.id].icon} ${moveIcons(null, null, moves[0])} · Claw ⚔️${moves[1].a}<br>appears: <b>${whenText(due, r.floor)}</b></span>`;
  }

  private ledger(): string {
    const r = this.run!;
    const pend = pendingEchoes(r).sort((a, b) => a.due - b.due);
    const esc = escapedEchoes(r);
    const row = (e: Echo, when: string, cls: string): string =>
      `<li class="ech ${cls}" title="Forgotten on floor ${e.forgotOn}"><span class="gh">${SKILLS[e.skill].icon}</span><span class="grow">${SKILLS[e.skill].name} ${lv(e.lvl)}<small>forgotten on floor ${e.forgotOn}</small></span><span class="when">${when}</span></li>`;
    return `<aside class="ledger">
      <h3>👻 Echo ledger</h3>
      <p class="hint">Every skill you forget comes back ${TUNE.echoDelay + (r.relics.includes('lethe') ? 2 : 0)} floors later as an enemy that uses it.</p>
      <h4>Coming (${pend.length})</h4>
      <ul>${pend.map((e) => row(e, whenText(e.due, r.floor), e.due <= r.floor ? 'due' : '')).join('') || '<li class="dim">Nothing yet.</li>'}</ul>
      <h4>Escaped → final boss (${esc.length})</h4>
      <ul>${esc.map((e) => row(e, '🧠', 'esc')).join('') || '<li class="dim">None.</li>'}</ul>
      <p class="beaten">✔ Defeated: <b>${beatenEchoes(r).length}</b></p>
      <p class="hint">Echoes flee when the last monster falls. Escaped echoes wait for you at the final boss.</p>
    </aside>`;
  }

  private memoryRow(mode: 'show' | 'upgrade'): string {
    const r = this.run!;
    const cards = r.memory
      .map((s, i) => {
        if (mode === 'upgrade') {
          const ok = canUpgrade(r, i);
          const extra = ok ? `<span class="next">→ Lv${s.lvl + 1}: ${skillText(s.id, s.lvl + 1)}</span>` : '<span class="next">max level</span>';
          return this.skillCard(s, { button: true, attrs: `data-act="upg" data-i="${i}"`, extra, disabled: !ok, cls: 'pickable' });
        }
        return this.skillCard(s);
      })
      .join('');
    return `<div class="memory"><h3>🧠 Memory ${r.memory.length}/${r.slots}</h3><div class="bar">${cards}${this.emptySlots(r.slots - r.memory.length)}</div></div>`;
  }

  // ---------- Title ----------

  private titleView(): string {
    const m = this.meta;
    const bars = BARS.map((b) => {
      const own = !b.unlock || m.unlocked.includes(b.id);
      return `<button class="barpick ${this.bar === b.id ? 'sel' : ''}" data-act="bar" data-id="${b.id}" ${own ? '' : 'disabled'}>
        <span class="big">${b.icon}</span><b>${b.name}</b><small>${b.skills.map((id) => SKILLS[id].icon).join(' ')}</small><small>${own ? b.text : `🔒 ${b.unlock} 🌼`}</small></button>`;
    }).join('');
    const unlocks = unlockList()
      .map((u) => {
        const own = m.unlocked.includes(u.id);
        return `<div class="arm ${own ? 'own' : ''}"><span class="big">${u.icon}</span><span><b>${u.name}</b><small>${u.text}</small></span>
        ${own ? '<span class="ok">✔</span>' : `<button data-act="unlock" data-id="${u.id}" ${m.petals >= u.cost ? '' : 'disabled'}>🌼 ${u.cost}</button>`}</div>`;
      })
      .join('');
    const r = this.run;
    return `<div class="title">
      <div class="logo">🧠</div>
      <h1>Forget-Me-Not</h1>
      <p class="sub">Learn a skill, forget a skill. What you forget comes back to hunt you.</p>
      <div class="row">
        ${r ? `<button class="primary" data-act="continue">Continue run (floor ${r.floor})</button>` : ''}
        <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (ends the saved run)' : 'New run'}</button>
        <button data-act="help">How to play</button>
      </div>
      <h3>Starting skill bar</h3>
      <div class="bars">${bars}</div>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Best score ${m.best} · Best floor ${m.bestFloor} · Echoes defeated ${m.echoesBeaten}</p>
      <h3>Unlocks <small>🌼 ${m.petals} petals</small></h3>
      <div class="armory">${unlocks}</div>
    </div>`;
  }

  // ---------- Map ----------

  private mapView(): string {
    const r = this.run!;
    const act = actOf(r.floor);
    const first = (act - 1) * FLOORS_PER_ACT + 1;
    const pend = pendingEchoes(r);
    const nodes: string[] = [];
    for (let fl = first; fl < first + FLOORS_PER_ACT; fl++) {
      const dueHere = pend.filter((e) => (fl === r.floor ? e.due <= fl : e.due === fl)).length;
      const badge = dueHere ? `<i class="eb" title="${dueHere} echo(es) due">👻${dueHere > 1 ? dueHere : ''}</i>` : '';
      let inner: string;
      let cls = '';
      if (fl < r.floor) {
        inner = ROOM[r.route[fl - 1] ?? 'fight'].icon;
        cls = 'done';
      } else {
        inner = floorChoices(r.seed, fl)
          .map((k) => ROOM[k].icon)
          .join('');
        cls = fl === r.floor ? 'now' : 'future';
      }
      nodes.push(`<div class="node ${cls}" title="Floor ${fl}"><small>${fl}</small><span>${inner}</span>${badge}</div>`);
    }
    const acts = ACTS.map((a, i) => `<span class="${i + 1 === act ? 'cur' : i + 1 < act ? 'done' : 'dim'}">${a.icon} ${a.name}</span>`).join('<span class="dim"> ▸ </span>');
    const due = dueEchoes(r);
    const choices = floorChoices(r.seed, r.floor)
      .map((k, i) => {
        let text = '';
        switch (k) {
          case 'fight':
            text = 'Fight monsters. Win: learn a new skill.';
            break;
          case 'elite':
            text = `${MONSTERS[ACTS[act - 1].elite].icon} ${MONSTERS[ACTS[act - 1].elite].name}. Win: a relic and a stronger skill.`;
            break;
          case 'shrine':
            text = 'Learn a stronger skill, add a memory slot, or upgrade a skill.';
            break;
          case 'rest':
            text = `Heal ${Math.round(TUNE.restHeal * 100)}% of max HP, or upgrade a skill.`;
            break;
          case 'boss':
            text = `${MONSTERS[ACTS[act - 1].boss].icon} ${MONSTERS[ACTS[act - 1].boss].name}. Win: a relic.`;
            break;
          case 'final':
            text = `The Hollow Mind calls back all <b>${finalEchoes(r).length}</b> echoes you did not defeat.`;
            break;
        }
        const ech = isFightRoom(k) && k !== 'final' && due.length ? `<span class="joins">👻 Joins: ${due.map((e) => `${SKILLS[e.skill].icon} ${SKILLS[e.skill].name} Lv${e.lvl}`).join(', ')}</span>` : '';
        return `<button class="room r-${k}" data-act="room" data-i="${i}"><span class="big">${ROOM[k].icon}</span><b>${ROOM[k].name}</b><small>${text}</small>${ech}</button>`;
      })
      .join('');
    const fin = finalEchoes(r);
    return `<div class="layout"><section class="mainc map">
      <p class="acts">${acts}</p>
      <h2>Floor ${r.floor} <small>${floorInAct(r.floor)}/${FLOORS_PER_ACT} of ${ACTS[act - 1].name}</small></h2>
      <div class="track">${nodes.join('<span class="link"></span>')}</div>
      <p class="finalline">🧠 Final boss on floor ${LAST_FLOOR}: ${fin.length ? `${fin.length} echo${fin.length > 1 ? 'es' : ''} will answer its call: ${fin.map((e) => SKILLS[e.skill].icon).join(' ')}` : 'no echoes yet.'}</p>
      <h3>Choose a room</h3>
      <div class="rooms">${choices}</div>
      ${this.memoryRow('show')}
    </section>${this.ledger()}</div>`;
  }

  // ---------- Fight ----------

  private foeCard(f: Fight, foe: Foe): string {
    const dead = foe.hp <= 0;
    const m = intent(foe);
    const tgt = !dead && !foe.fled && f.target === foe.uid && alive(f).length > 1;
    const fresh = !this.seen.has(foe.uid);
    this.seen.add(foe.uid);
    const cls = [fresh ? 'appear' : '', foe.echo ? 'echo' : '', foe.boss ? 'boss' : '', foe.elite ? 'elite' : '', tgt ? 'target' : '', dead ? 'dead' : '', foe.fled ? 'fled' : '', this.acting === foe.uid ? 'acting' : ''].join(' ');
    const etag = foe.echo ? `<div class="etag">👻 You forgot this on floor ${foe.echo.forgotOn}</div>` : '';
    const next = foe.st.stun ? '💫 stunned' : moveIcons(f, foe, m);
    return `<button class="foe ${cls}" data-act="target" data-uid="${foe.uid}" ${dead || foe.fled ? 'disabled' : ''}>
      <div class="intent" title="Next: ${m.name ? m.name + ': ' : ''}${moveText(m)}">${foe.echo && m.name ? `<small>${m.name}</small> ` : ''}${next}</div>
      <div class="ficon">${foe.icon}</div>
      <div class="fname">${foe.name}${foe.echo ? ` ${lv(foe.echo.lvl)}` : ''}</div>
      ${etag}
      ${hpBar(Math.max(0, foe.hp), foe.maxHp, foe.block)}
      <div class="sts">${statusIcons(foe.st)}</div>
    </button>`;
  }

  private fightView(): string {
    const r = this.run!;
    const f = this.f!;
    const shown = f.foes.filter((x) => (x.hp > 0 && !x.fled) || this.recentDead.has(x.uid));
    const h = f.hero;
    const cards = f.cards
      .map((c, i) => {
        const ok = canUse(f, i) && !this.busy;
        const tag = f.sealed === i ? '<span class="seal">🔒 sealed</span>' : c.spent ? '<span class="seal">spent</span>' : c.used ? '<span class="seal">used</span>' : '';
        return this.skillCard(c, { button: true, attrs: `data-act="card" data-i="${i}"`, disabled: !ok, key: i + 1, extra: tag, cls: c.used || c.spent ? 'used' : '' });
      })
      .join('');
    const echoes = f.foes.filter((x) => x.echo && x.hp > 0 && !x.fled);
    const banner = echoes.length
      ? `<div class="echo-banner">${echoes.map((e) => `👻 <b>${e.name}</b> ${lv(e.echo!.lvl)} came back. You forgot it on floor ${e.echo!.forgotOn}.`).join('<br>')}${f.kind !== 'final' ? '<br><small>It flees when the last monster falls. Defeat it first for a free upgrade.</small>' : ''}</div>`
      : '';
    const reserve = f.kind === 'final' && f.reserve.length ? `<p class="reserve">🧠 Still waiting to be called: ${f.reserve.map((e) => SKILLS[e.skill].icon).join(' ')}</p>` : '';
    const energy = Array.from({ length: Math.max(TUNE.energy, h.energy) }, (_, i) => `<i class="${i < h.energy ? 'on' : ''}"></i>`).join('');
    const note = this.notes.slice(-2).map((n) => `<div>${n}</div>`).join('');
    return `<div class="layout"><section class="mainc arena">
      <div class="turnline"><span>Turn ${f.turn}</span><span class="dim">${f.kind === 'final' ? 'Final boss' : f.kind === 'boss' ? 'Boss' : f.kind === 'elite' ? 'Elite' : 'Fight'} · floor ${r.floor}</span></div>
      ${banner}
      <div class="foes">${shown.map((x) => this.foeCard(f, x)).join('')}</div>
      ${reserve}
      <div class="note">${note}</div>
      <div class="hero" id="hero">
        <span class="hicon">🧚</span>
        <div class="grow">${hpBar(h.hp, h.maxHp, h.block)}<div class="sts">${statusIcons(h.st)}</div></div>
        <div class="energy" title="Energy: ${h.energy}">⚡<span class="pips">${energy}</span></div>
      </div>
      <div class="bar fightbar">${cards}</div>
      <div class="fight-actions">
        <span class="hint">Tap a foe to target it. Keys: 1-${f.cards.length} skills, ←/→ target, E end turn.</span>
        <button class="primary" data-act="end-turn" ${this.busy || f.result ? 'disabled' : ''}>End turn</button>
      </div>
    </section>${this.ledger()}</div>`;
  }

  private startFight(): void {
    const f = this.f!;
    this.notes = [];
    this.recentDead.clear();
    this.seen.clear();
    this.botPlan = null;
    this.busy = false;
    this.go('fight');
    const ech = f.foes.filter((x) => x.echo);
    if (ech.length) {
      sfx.echo();
      this.toast(`👻 ${ech.map((e) => e.name).join(' and ')} came back!`);
    }
    if (f.kind === 'final') this.notes.push(`🧠 The Hollow Mind calls back ${ech.length + f.reserve.length} echo${ech.length + f.reserve.length === 1 ? '' : 'es'}.`);
    if (this.notes.length) this.render();
  }

  private playEvents(ev: Ev[]): void {
    const count = new Map<number, number>();
    let hurt = false;
    let hit = false;
    for (const e of ev) {
      if (e.t === 'msg') {
        this.notes.push(e.text);
        continue;
      }
      const el = e.who === HERO ? this.root.querySelector<HTMLElement>('#hero') : this.root.querySelector<HTMLElement>(`[data-uid="${e.who}"]`);
      const k = count.get(e.who) ?? 0;
      count.set(e.who, k + 1);
      switch (e.t) {
        case 'dmg':
          if (e.n > 0) this.float(el, `-${e.n}`, 'dmg', k);
          if (e.blocked > 0) this.float(el, `🛡️${e.blocked}`, 'blk', k + (e.n > 0 ? 1 : 0));
          if (e.who === HERO) hurt = hurt || e.n > 0;
          else hit = true;
          el?.classList.add('shake');
          break;
        case 'block':
          this.float(el, `+${e.n}🛡️`, 'blk', k);
          sfx.block();
          break;
        case 'heal':
          this.float(el, `+${e.n}`, 'heal', k);
          sfx.heal();
          break;
        case 'st':
          this.float(el, e.text, 'st', k);
          sfx.status();
          break;
        case 'die':
          this.recentDead.add(e.who);
          sfx.die();
          break;
        case 'summon': {
          const foe = this.f?.foes.find((x) => x.uid === e.who);
          if (foe?.echo) sfx.echo();
          break;
        }
        case 'flee': {
          const foe = this.f?.foes.find((x) => x.uid === e.who);
          this.notes.push(`👻 ${foe?.name ?? 'An echo'} fled. It waits at the final boss.`);
          sfx.flee();
          break;
        }
      }
    }
    if (hurt) sfx.hurt();
    else if (hit) sfx.hit();
  }

  private float(el: HTMLElement | null, text: string, cls: string, k: number): void {
    if (!el || FAST) return;
    const r = el.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = `float ${cls}`;
    s.textContent = text;
    s.style.left = `${r.left + r.width / 2 + (Math.random() * 30 - 15)}px`;
    s.style.top = `${r.top + Math.min(60, r.height * 0.35) + k * 18}px`;
    this.fx.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }

  /** Re-render the fight, then show the events. */
  private show(ev: Ev[]): void {
    for (const e of ev) if (e.t === 'die') this.recentDead.add(e.who);
    this.render();
    this.playEvents(ev);
    if (ev.some((e) => e.t === 'msg' || e.t === 'flee')) {
      const note = this.root.querySelector('.note');
      if (note) note.innerHTML = this.notes.slice(-2).map((n) => `<div>${n}</div>`).join('');
    }
  }

  private playCard(i: number): void {
    const f = this.f;
    if (!f || this.busy || f.result) return;
    if (!canUse(f, i)) {
      sfx.deny();
      if (f.sealed === i) this.toast('🔒 This skill is sealed this turn.');
      else if (f.cards[i]?.used) this.toast('Each skill works once per turn.');
      else if (f.cards[i]?.spent) this.toast('This skill works once per fight.');
      else if (f.cards[i]) this.toast('Not enough energy.');
      return;
    }
    sfx.play();
    const ev = useCard(f, i, f.target);
    this.show(ev);
    this.save();
    if (f.result) void this.finishFight();
  }

  private async endTurnFlow(): Promise<void> {
    const f = this.f;
    if (!f || this.busy || f.result) return;
    this.botPlan = null;
    if (FAST) {
      this.recentDead.clear();
      this.show(endTurn(f));
      this.save();
      if (f.result) void this.finishFight();
      return;
    }
    this.busy = true;
    this.show(startEnemyTurn(f));
    for (const uid of actors(f)) {
      if (f.result) break;
      await wait(430);
      this.acting = uid;
      this.show(foeAct(f, uid));
    }
    await wait(300);
    this.acting = 0;
    this.recentDead.clear();
    const ev = finishEnemyTurn(f);
    this.busy = false;
    this.show(ev);
    if (!f.result) sfx.turn();
    this.save();
    if (f.result) void this.finishFight();
  }

  private async finishFight(): Promise<void> {
    const r = this.run!;
    const f = r.fight!;
    this.busy = true;
    this.render();
    await wait(f.result === 'win' ? 900 : 1300);
    this.busy = false;
    this.recentDead.clear();
    if (f.result === 'lose') {
      r.hp = 0;
      r.stats.kills += f.kills;
      for (const t of f.beaten) {
        const e = r.echoes.find((x) => x.eid === t.eid);
        if (e) e.state = 'beaten';
      }
      this.endRun(false);
      return;
    }
    if (f.kind === 'final') {
      r.hp = f.hero.hp;
      for (const t of f.beaten) {
        const e = r.echoes.find((x) => x.eid === t.eid);
        if (e) e.state = 'beaten';
      }
      r.stats.kills += f.kills;
      this.endRun(true);
      return;
    }
    winFight(r);
    sfx.win();
    this.save();
    this.go('reward');
  }

  private moveTarget(d: number): void {
    const f = this.f;
    if (!f) return;
    const a = alive(f);
    if (!a.length) return;
    const i = a.findIndex((x) => x.uid === f.target);
    f.target = a[(i + d + a.length) % a.length].uid;
    sfx.click();
    this.render();
  }

  // ---------- Reward, shrine, rest ----------

  private offerCards(offers: SkillInst[], disabled: boolean): string {
    const r = this.run!;
    return offers
      .map((s, i) => {
        const full = r.memory.length >= r.slots;
        const extra = `<span class="next">${full ? '🧠 Memory full: you must forget a skill' : '🧠 Goes into a free slot'}</span>`;
        return this.skillCard(s, { button: true, attrs: `data-act="offer" data-i="${i}"`, disabled, extra, cls: 'pickable' });
      })
      .join('');
  }

  private rewardView(): string {
    const r = this.run!;
    const rw = r.reward!;
    const lines: string[] = [];
    for (const id of rw.beaten) {
      const e = r.echoes.find((x) => x.eid === id)!;
      lines.push(`<li class="good">👻 ${SKILLS[e.skill].icon} Echo of ${SKILLS[e.skill].name} defeated → +1 free upgrade</li>`);
    }
    for (const id of rw.fled) {
      const e = r.echoes.find((x) => x.eid === id)!;
      lines.push(`<li class="warn">👻 ${SKILLS[e.skill].icon} Echo of ${SKILLS[e.skill].name} fled → it waits at the final boss</li>`);
    }
    if (rw.healed) lines.push(`<li class="good">🌿 Healed ${rw.healed}</li>`);
    const relics = !rw.relicTaken
      ? `<h3>Pick a relic</h3><div class="picks">${rw.relics.map((id) => `<button class="pick" data-act="relic" data-id="${id}"><span class="big">${RELICS[id].icon}</span><b>${RELICS[id].name}</b><small>${RELICS[id].text}</small></button>`).join('')}</div>`
      : '';
    const upg = rw.upgrades > 0 && r.memory.some((_, i) => canUpgrade(r, i)) ? `<h3>✨ Free upgrade ×${rw.upgrades}: pick a skill</h3>${this.memoryRow('upgrade')}` : this.memoryRow('show');
    const learnPart = rw.learned
      ? '<p class="dim">New skill: done.</p>'
      : `<h3>Learn a new skill <small class="dim">or skip</small></h3><div class="bar offers">${this.offerCards(rw.offers, false)}</div><button data-act="skip-offer">Skip</button>`;
    const canGo = rw.relicTaken;
    return `<div class="layout"><section class="mainc reward">
      <h2>${rw.source === 'boss' ? '💀 Boss defeated!' : rw.source === 'elite' ? '👹 Elite defeated!' : '⚔️ Victory'}</h2>
      ${lines.length ? `<ul class="sumlist">${lines.join('')}</ul>` : ''}
      ${relics}
      ${learnPart}
      ${upg}
      <button class="primary" data-act="continue-floor" ${canGo ? '' : 'disabled'}>${canGo ? 'Continue' : 'Pick a relic first'}</button>
    </section>${this.ledger()}</div>`;
  }

  private shrineView(): string {
    const r = this.run!;
    const rw = r.reward!;
    let body = '';
    if (r.roomDone) body = '<p class="good">The shrine fades. Your choice is made.</p>';
    else if (rw.choice === 'upgrade') body = `<h3>Pick a skill to upgrade</h3>${this.memoryRow('upgrade')}<button data-act="shrine-back">Back</button>`;
    else
      body = `<p class="sub">Choose one gift.</p>
      <h3>1. Learn a stronger skill</h3><div class="bar offers">${this.offerCards(rw.offers, false)}</div>
      <h3>2. Or another option</h3>
      <div class="rooms">
        <button class="room" data-act="expand" ${canExpand(r) ? '' : 'disabled'}><span class="big">🧠➕</span><b>Expand memory</b><small>+1 memory slot (${r.slots}→${r.slots + 1}). Costs ${TUNE.slotHpCost} max HP.</small></button>
        <button class="room" data-act="meditate" ${r.memory.some((_, i) => canUpgrade(r, i)) ? '' : 'disabled'}><span class="big">✨</span><b>Meditate</b><small>Upgrade one skill by one level.</small></button>
      </div>`;
    return `<div class="layout"><section class="mainc reward">
      <h2>⛩️ Shrine of Memory</h2>
      ${body}
      ${rw.choice === 'upgrade' && !r.roomDone ? '' : this.memoryRow('show')}
      <button class="primary" data-act="continue-floor" ${r.roomDone ? '' : ''}>${r.roomDone ? 'Continue' : 'Leave without a gift'}</button>
    </section>${this.ledger()}</div>`;
  }

  private restView(): string {
    const r = this.run!;
    const rw = r.reward!;
    let body = '';
    if (r.roomDone) body = '<p class="good">You feel rested.</p>';
    else if (rw.choice === 'upgrade') body = `<h3>Pick a skill to upgrade</h3>${this.memoryRow('upgrade')}<button data-act="rest-back">Back</button>`;
    else
      body = `<div class="rooms">
        <button class="room" data-act="rest-heal"><span class="big">💚</span><b>Rest</b><small>Heal ${Math.min(r.maxHp - r.hp, Math.round(r.maxHp * TUNE.restHeal))} HP (${Math.round(TUNE.restHeal * 100)}% of max).</small></button>
        <button class="room" data-act="rest-upg" ${r.memory.some((_, i) => canUpgrade(r, i)) ? '' : 'disabled'}><span class="big">✨</span><b>Practice</b><small>Upgrade one skill by one level.</small></button>
      </div>`;
    return `<div class="layout"><section class="mainc reward">
      <h2>🔥 Campfire</h2>
      <p>❤️ ${r.hp}/${r.maxHp}</p>
      ${body}
      ${rw.choice === 'upgrade' && !r.roomDone ? '' : this.memoryRow('show')}
      <button class="primary" data-act="continue-floor">${r.roomDone ? 'Continue' : 'Leave'}</button>
    </section>${this.ledger()}</div>`;
  }

  // ---------- End ----------

  private endRun(won: boolean): void {
    const r = this.run!;
    const s = score(r, won);
    const p = petalsFor(s);
    const m = this.meta;
    m.runs++;
    if (won) m.wins++;
    m.best = Math.max(m.best, s);
    m.bestFloor = Math.max(m.bestFloor, won ? LAST_FLOOR : r.floor);
    m.petals += p;
    m.echoesBeaten += beatenEchoes(r).length;
    saveMeta(m);
    clearRun();
    this.end = { won, score: s, petals: p, floor: r.floor, run: r };
    this.run = null;
    this.modal = null;
    if (won) sfx.win();
    else sfx.lose();
    this.go('end');
  }

  private endView(): string {
    const e = this.end!;
    const r = e.run;
    const rows = r.echoes
      .map((x) => `<li class="ech ${x.state === 'beaten' ? 'ok' : 'esc'}"><span class="gh">${SKILLS[x.skill].icon}</span><span class="grow">${SKILLS[x.skill].name} ${lv(x.lvl)}<small>forgotten on floor ${x.forgotOn}</small></span><span class="when">${x.state === 'beaten' ? '✔ defeated' : x.state === 'escaped' ? 'escaped' : 'still waiting'}</span></li>`)
      .join('');
    return `<div class="end">
      <div class="huge">${e.won ? '🌼' : '🥀'}</div>
      <h1>${e.won ? 'You remember who you are.' : 'Forgotten.'}</h1>
      <p class="sub">${e.won ? 'The Hollow Mind is broken. Your echoes are at peace.' : `You fell on floor ${e.floor}.`}</p>
      <p class="score">Score <b>${e.score}</b> · 🌼 +${e.petals} petals</p>
      <p class="stats">Floors ${e.won ? LAST_FLOOR : e.floor - 1} · Kills ${r.stats.kills} · Skills forgotten ${r.stats.forgotten} · Echoes defeated ${beatenEchoes(r).length}</p>
      <h3>Final memory</h3>
      <div class="bar">${r.memory.map((s) => this.skillCard(s)).join('')}</div>
      ${rows ? `<h3>Your echoes</h3><ul class="echolist">${rows}</ul>` : ''}
      <div class="row"><button class="primary" data-act="new">New run</button><button data-act="title">Title screen</button></div>
    </div>`;
  }

  // ---------- Modals ----------

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Memory.</b> Your skills sit in memory slots (4 at the start). To learn a new skill when memory is full, you must <b>forget</b> one.</li>
          <li><b>Echoes.</b> A forgotten skill comes back ${TUNE.echoDelay} floors later as an <b>echo</b>: an enemy that uses that skill at its level. A weak skill makes a weak echo. A strong or upgraded skill makes a strong one. Before you forget, the game shows the echo and its floor.</li>
          <li><b>The ledger</b> (👻) lists every echo that is coming and the floor where it appears. The map marks those floors with 👻.</li>
          <li><b>Flee.</b> Echoes flee when the last normal monster falls. Defeat an echo first and you get a free skill upgrade. Echoes that flee wait at the final boss.</li>
          <li><b>Final boss.</b> On floor ${LAST_FLOOR}, the Hollow Mind calls back every echo you did not defeat.</li>
          <li><b>Fights.</b> You get ${TUNE.energy} ⚡ energy each turn. Each skill costs energy and works once per turn. Click a skill to use it. Tap a foe to target it. The icon above each foe shows its next move.</li>
          <li><b>Icons:</b> ⚔️ attack, 🛡️ block (stops damage this round), 💚 heal, 💪 strength, ☠️ poison, 🌀 weak (−25% damage), 🎯 exposed (+50% damage taken), 🌵 thorns, 💫 stun or daze, 🔒 seal.</li>
          <li><b>The run:</b> 3 acts of ${FLOORS_PER_ACT} floors. Pick a room on each floor: ⚔️ fight, 👹 elite (relic), ⛩️ shrine (strong skill, +1 memory slot for ${TUNE.slotHpCost} max HP, or upgrade), 🔥 rest. A boss ends each act.</li>
          <li><b>Keys:</b> 1-7 skills, ←/→ or Tab target, E or Enter end turn, Esc menu. Arrow keys move between buttons on other screens.</li>
        </ul>
        <button class="primary" data-act="modal-close">Got it</button>
      </div></div>`;
    }
    if (m.kind === 'forget') {
      const r = this.run!;
      const weak = weakestSlot(r);
      const rows = r.memory
        .map(
          (s, i) => `<button class="frow" data-act="forget" data-i="${i}">
          <span class="big">${SKILLS[s.id].icon}</span>
          <span class="grow"><b>${SKILLS[s.id].name} ${lv(s.lvl)}</b> ${i === weak ? '<em class="tagw">weakest</em>' : ''}<small>${TAG_ICON[SKILLS[s.id].tag]} ${skillText(s.id, s.lvl)}</small></span>
          ${this.echoPreview(s)}
        </button>`,
        )
        .join('');
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>Memory full</h2>
        <p>To learn <b>${skName(m.offer)}</b>, forget one skill. It comes back as an echo:</p>
        <div class="flist">${rows}</div>
        <button data-act="modal-close">Cancel</button>
      </div></div>`;
    }
    return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
      <h2>Menu</h2>
      <button data-act="modal-close">Resume</button>
      <button data-act="help">How to play</button>
      ${m.confirm ? '<p class="warn">Abandon this run? It ends as a defeat.</p><button class="danger" data-act="abandon-yes">Yes, abandon</button>' : '<button data-act="abandon">Abandon run</button>'}
      <button data-act="title">Title screen (the run is saved)</button>
    </div></div>`;
  }

  // ---------- Input ----------

  private onKey(e: KeyboardEvent): void {
    initAudio();
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    const k = e.key;
    if (this.screen === 'fight' && this.f) {
      if (k >= '1' && k <= '9') {
        this.playCard(+k - 1);
        e.preventDefault();
        return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
        this.moveTarget(k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey) ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (k === 'e' || k === 'E' || k === 'Enter') {
        void this.endTurnFlow();
        e.preventDefault();
        return;
      }
    }
    if (k === 'Escape' && this.run && this.screen !== 'title' && this.screen !== 'end') {
      this.modal = { kind: 'menu', confirm: false };
      this.render();
      return;
    }
    if (this.screen !== 'fight' && k.startsWith('Arrow')) {
      const btns = [...this.root.querySelectorAll<HTMLButtonElement>('main button:not([disabled])')];
      if (!btns.length) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const d = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1;
      btns[(i + d + btns.length) % btns.length].focus();
    }
  }

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
        this.meta.muted = toggleMute();
        saveMeta(this.meta);
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
        if (r) this.endRun(false);
        return;
      case 'title':
        this.modal = null;
        this.busy = false;
        this.run = loadRun();
        this.go('title');
        return;
      case 'bar':
        this.bar = d.id!;
        sfx.click();
        this.render();
        return;
      case 'unlock': {
        const u = unlockList().find((x) => x.id === d.id);
        if (!u || this.meta.petals < u.cost || this.meta.unlocked.includes(u.id)) return;
        this.meta.petals -= u.cost;
        this.meta.unlocked.push(u.id);
        saveMeta(this.meta);
        sfx.relic();
        this.toast(`Unlocked ${u.icon} ${u.name}`);
        this.render();
        return;
      }
      case 'new': {
        const own = BARS.find((b) => b.id === this.bar && (!b.unlock || this.meta.unlocked.includes(b.id)));
        this.run = newRun(randomSeedText(), own ? own.id : 'wanderer', this.meta);
        this.save();
        sfx.learn();
        this.go('map');
        return;
      }
      case 'continue':
        this.resume();
        return;
      case 'room': {
        if (!r) return;
        const kind = floorChoices(r.seed, r.floor)[+d.i!];
        this.openRoom(kind);
        return;
      }
      case 'target': {
        const f = this.f;
        if (!f || !d.uid) return;
        f.target = +d.uid;
        sfx.click();
        this.render();
        return;
      }
      case 'card':
        this.playCard(+d.i!);
        return;
      case 'end-turn':
        void this.endTurnFlow();
        return;
      case 'relic': {
        const rw = r?.reward;
        if (!r || !rw || rw.relicTaken) return;
        takeRelic(r, d.id!);
        rw.relicTaken = true;
        sfx.relic();
        this.toast(`${RELICS[d.id!].icon} ${RELICS[d.id!].name}: ${RELICS[d.id!].text}`);
        this.save();
        this.render();
        return;
      }
      case 'upg': {
        const rw = r?.reward;
        if (!r || !rw) return;
        const i = +d.i!;
        if (!upgrade(r, i)) return;
        sfx.upgrade();
        this.toast(`✨ ${SKILLS[r.memory[i].id].name} is now Lv${r.memory[i].lvl}`);
        if (this.screen === 'reward') rw.upgrades--;
        else {
          r.roomDone = true;
          rw.choice = undefined;
        }
        this.save();
        this.render();
        return;
      }
      case 'offer': {
        const rw = r?.reward;
        if (!r || !rw || rw.learned || r.roomDone) return;
        const s = rw.offers[+d.i!];
        if (r.memory.length < r.slots) this.doLearn(s);
        else {
          this.modal = { kind: 'forget', offer: s };
          sfx.click();
          this.render();
        }
        return;
      }
      case 'forget': {
        if (!r || this.modal?.kind !== 'forget') return;
        const offer = this.modal.offer;
        this.modal = null;
        this.doLearn(offer, +d.i!);
        return;
      }
      case 'skip-offer':
        if (r?.reward) r.reward.learned = true;
        this.save();
        this.render();
        return;
      case 'expand':
        if (!r || r.roomDone || !expand(r)) return;
        r.roomDone = true;
        sfx.upgrade();
        this.toast(`🧠 Memory slots: ${r.slots}. Max HP: ${r.maxHp}.`);
        this.save();
        this.render();
        return;
      case 'meditate':
      case 'rest-upg':
        if (!r?.reward || r.roomDone) return;
        r.reward.choice = 'upgrade';
        this.render();
        return;
      case 'shrine-back':
      case 'rest-back':
        if (r?.reward) r.reward.choice = undefined;
        this.render();
        return;
      case 'rest-heal': {
        if (!r || r.roomDone) return;
        const n = restHeal(r);
        r.roomDone = true;
        sfx.heal();
        this.toast(`💚 Healed ${n} HP`);
        this.save();
        this.render();
        return;
      }
      case 'continue-floor':
        if (!r) return;
        if (r.reward && !r.reward.relicTaken) return;
        nextFloor(r);
        this.save();
        sfx.click();
        this.go('map');
        return;
    }
  }

  private doLearn(s: SkillInst, forgetIdx?: number): void {
    const r = this.run!;
    const rw = r.reward!;
    const old = forgetIdx !== undefined ? r.memory[forgetIdx] : null;
    const e = learn(r, s, forgetIdx);
    if (forgetIdx !== undefined && !e) return;
    rw.learned = true;
    if (this.screen === 'shrine') r.roomDone = true;
    if (e && old) {
      sfx.forget();
      this.toast(`You forgot ${SKILLS[old.id].name}. Its echo appears ${e.due >= LAST_FLOOR ? 'at the final boss' : `on floor ${e.due}`}.`);
    } else {
      sfx.learn();
      this.toast(`Learned ${SKILLS[s.id].icon} ${SKILLS[s.id].name}`);
    }
    this.save();
    this.render();
  }

  private openRoom(kind: RoomKind): void {
    const r = this.run!;
    enterRoom(r, kind);
    this.save();
    if (isFightRoom(kind)) {
      this.startFight();
      return;
    }
    r.reward = { source: kind, offers: kind === 'shrine' ? shrineOffers(r) : [], learned: false, upgrades: 0, relics: [], relicTaken: true, beaten: [], fled: [], healed: 0 };
    this.save();
    sfx.click();
    this.go(kind === 'shrine' ? 'shrine' : 'rest');
  }

  private resume(): void {
    const r = this.run;
    if (!r) return;
    if (r.fight && !r.fight.result) {
      this.notes = [];
      this.recentDead.clear();
      this.seen.clear();
      this.busy = false;
      this.go('fight');
    } else if (r.fight && r.fight.result) {
      this.go('fight');
      void this.finishFight();
    } else if (r.reward && (r.room === 'shrine' || r.room === 'rest')) this.go(r.room);
    else if (r.reward) this.go('reward');
    else this.go('map');
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const rng = new Rng(hash('debug-bot', Date.now()));
    const click = (sel: string): boolean => {
      const el = this.root.querySelector<HTMLElement>(sel);
      el?.click();
      return !!el;
    };
    const api = {
      state: () => {
        const r = this.run;
        const f = this.f;
        return {
          screen: this.screen,
          modal: this.modal?.kind ?? null,
          busy: this.busy,
          floor: r?.floor ?? null,
          hp: r ? (f ? f.hero.hp : r.hp) : null,
          maxHp: r?.maxHp ?? null,
          slots: r?.slots ?? null,
          memory: r?.memory.map((m) => `${m.id}${m.lvl}`) ?? null,
          relics: r?.relics ?? null,
          echoes: r?.echoes.map((e) => `${e.skill}${e.lvl}@${e.due}:${e.state}`) ?? null,
          fight: f
            ? {
                kind: f.kind,
                turn: f.turn,
                result: f.result,
                energy: f.hero.energy,
                foes: f.foes.filter((x) => x.hp > 0 && !x.fled).map((x) => `${x.name} ${x.hp}/${x.maxHp}`),
                reserve: f.reserve.length,
              }
            : null,
          meta: { runs: this.meta.runs, wins: this.meta.wins, petals: this.meta.petals },
          end: this.end ? { won: this.end.won, score: this.end.score, floor: this.end.floor } : null,
        };
      },
      petals: (n: number) => {
        this.meta.petals += n;
        saveMeta(this.meta);
        this.render();
      },
      win: () => {
        const f = this.f;
        if (!f) return;
        for (const x of f.foes) x.hp = 0;
        f.reserve = [];
        f.result = 'win';
        void this.finishFight();
      },
      /** One bot action. Returns what it did, or 'busy' while an animation plays. */
      step: (): string => {
        const r = this.run;
        if (this.modal) {
          if (this.modal.kind === 'forget' && r) {
            click(`[data-act="forget"][data-i="${weakestSlot(r)}"]`);
            return 'forget';
          }
          this.modal = null;
          this.render();
          return 'modal';
        }
        if (this.busy) return 'busy';
        switch (this.screen) {
          case 'title':
            if (!click('[data-act="new"]')) return 'none';
            return 'new';
          case 'map': {
            const ch = floorChoices(r!.seed, r!.floor);
            click(`[data-act="room"][data-i="${chooseRoom(r!, ch, GOOD_BOT, rng)}"]`);
            return 'room';
          }
          case 'fight': {
            const f = this.f!;
            if (f.result) {
              void this.finishFight();
              return 'fight-end';
            }
            if (!this.botPlan) this.botPlan = smartPlan(f);
            const p = this.botPlan.shift();
            if (p && canUse(f, p.card)) {
              if (alive(f).some((x) => x.uid === p.target)) f.target = p.target;
              this.playCard(p.card);
              return 'card';
            }
            if (p) return 'skip';
            void this.endTurnFlow();
            return 'end-turn';
          }
          case 'reward':
            rewardBot(r!, GOOD_BOT, rng);
            this.save();
            this.render();
            click('[data-act="continue-floor"]');
            return 'reward';
          case 'shrine':
            if (!r!.roomDone) {
              shrineBot(r!, GOOD_BOT, rng);
              r!.roomDone = true;
            }
            this.save();
            this.render();
            click('[data-act="continue-floor"]');
            return 'shrine';
          case 'rest':
            if (!r!.roomDone) {
              restBot(r!, GOOD_BOT, rng);
              r!.roomDone = true;
            }
            this.save();
            this.render();
            click('[data-act="continue-floor"]');
            return 'rest';
          case 'end':
            return 'end';
        }
      },
      /** Add an escaped echo of a skill (to test the final boss call). */
      echo: (skill: string, lvl = 1) => {
        const r = this.run;
        if (!r || !SKILLS[skill]) return;
        r.echoes.push({ eid: r.nextEid++, skill, lvl, forgotOn: r.floor, due: r.floor, state: 'escaped' });
        this.save();
        this.render();
      },
      /** Jump to a floor (for tests). */
      floor: (n: number) => {
        const r = this.run;
        if (!r || this.screen !== 'map') return;
        r.floor = Math.max(1, Math.min(LAST_FLOOR, n));
        this.save();
        this.render();
      },
      /** Learn with the good bot's rule (for tests of the forget flow). */
      learnBest: () => {
        const r = this.run;
        if (r?.reward) pickOffer(r, r.reward.offers, GOOD_BOT, rng);
        this.render();
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
