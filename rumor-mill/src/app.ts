import { goodMove } from './bot';
import { AGENTS, OBJ_RING, TOWNS, TRAITS, UNLOCKS, WORDS, type Slot } from './data';
import { Rng, hash, randomSeedText } from './rng';
import { changeLabel, claimParts, keyOf, type Claim, type Part } from './rumor';
import {
  applyEvents,
  buy,
  canBuy,
  finishTown,
  isFinalTown,
  loadMeta,
  loadRun,
  newRun,
  nextTown,
  offerText,
  recordRun,
  saveMeta,
  saveRun,
  takeOffer,
  type Offer,
  type RunState,
} from './run';
import { initAudio, isMuted, sfx, toggleMute } from './sfx';
import {
  VIEW_H,
  VIEW_W,
  believers,
  canPlant,
  defenders,
  freeAgents,
  isOver,
  needed,
  nextRivalTurn,
  plant,
  plantBlock,
  plantedClaim,
  preview,
  shown,
  spread,
  traceLeft,
  voters,
  type Ev,
  type Move,
  type Preview,
  type Town,
} from './town';

type Screen = 'title' | 'town' | 'reward' | 'end';
type Modal = { kind: 'help' } | { kind: 'menu'; confirm: boolean };

/** `?debug&fast` skips animation waits for bot tests. */
const SPEED = new URLSearchParams(location.search).has('fast') ? 0 : 1;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * SPEED));

const SLOT_NAME: Record<Slot, string> = { verb: 'Verb', obj: 'Object', mod: 'Tone' };

function partsHtml(parts: Part[], iconOnly = false): string {
  return parts
    .filter((p) => !iconOnly || p.icon)
    .map((p) => {
      const cls = p.mark ? ` class="${p.mark}"` : '';
      return iconOnly ? `<span${cls}>${p.icon}</span>` : `<span${cls}>${p.icon ? `<i>${p.icon}</i>` : ''}${p.text}</span>`;
    })
    .join(iconOnly ? '' : ' ');
}

interface Float {
  node: number;
  text: string;
  cls: string;
}

export class App {
  private run: RunState | null = loadRun();
  private meta = loadMeta();
  private screen: Screen = 'title';
  private lastScreen: Screen | null = null;
  private modal: Modal | null = null;
  private busy = false;

  private draft: Claim = { verb: 'stole', obj: 'grain', mod: null, not: false };
  private agentSel = 0;
  private sel: number | null = null;
  private moves: Move[] = [];
  private floats: Float[] = [];
  private pops = new Set<number>();
  private log: string[] = [];
  private end: { victory: boolean; score: number; towns: number; reason: string; seed: string } | null = null;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    if (new URLSearchParams(location.search).has('debug')) this.installDebug();
    this.render();
  }

  // ---------- Rendering ----------

  private render(): void {
    let body = '';
    if (this.screen === 'title') body = this.titleView();
    else if (this.screen === 'town') body = this.townView();
    else if (this.screen === 'reward') body = this.rewardView();
    else body = this.endView();
    const top = this.run && (this.screen === 'town' || this.screen === 'reward') ? this.topBar() : '';
    if (this.screen !== this.lastScreen) {
      this.lastScreen = this.screen;
      window.scrollTo(0, 0);
    }
    this.root.innerHTML = `${top}<main class="screen s-${this.screen}">${body}</main>${this.modal ? this.modalView() : ''}`;
    this.floats = [];
    this.pops.clear();
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private topBar(): string {
    const r = this.run!;
    const hearts = Array.from({ length: r.maxCover }, (_, i) => `<i class="${i < r.cover ? 'on' : ''}">❤</i>`).join('');
    return `<header class="top">
      <span class="logo">🗣️</span>
      <span class="cover" title="Cover. You lose 1 when an agent is exposed or a town fails. At 0 the run ends.">${hearts}</span>
      <span title="Coins for the market">🪙 ${r.coins}</span>
      <span class="where">${TOWNS[r.townIdx].icon} ${r.townIdx + 1}/${TOWNS.length}</span>
      <span class="grow"></span>
      <button class="icon-btn" data-act="help" title="How to play">?</button>
      <button class="icon-btn" data-act="mute" title="Sound">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="icon-btn" data-act="menu" title="Menu">☰</button>
    </header>`;
  }

  private titleView(): string {
    const m = this.meta;
    const r = this.run;
    const unl = UNLOCKS.map((u) => {
      const ok = m.townsWon >= u.need;
      const d = u.kind === 'agent' ? AGENTS[u.id as keyof typeof AGENTS] : WORDS[u.id];
      const name = u.kind === 'agent' ? (d as { name: string }).name : `“${(d as { text: string }).text}”`;
      return `<li class="${ok ? 'ok' : 'locked'}">${ok ? d.icon : '🔒'} ${name} <small>${ok ? 'unlocked' : `${m.townsWon}/${u.need} towns`}</small></li>`;
    }).join('');
    return `<div class="title">
      <div class="hero-icon">🗣️</div>
      <h1>Rumor Mill</h1>
      <p class="sub">Plant a rumor. Watch it change from mouth to mouth. Gossips make it bigger, skeptics cut words, loyalists turn it around. Win 5 towns and topple the duke.</p>
      ${r ? `<button class="primary" data-act="continue">▶ Continue run (${TOWNS[r.townIdx].name}, town ${r.townIdx + 1}/5)</button>` : ''}
      <button class="${r ? '' : 'primary'}" data-act="new">${r ? 'New run (drops the current one)' : '▶ New run'}</button>
      <button data-act="help">How to play</button>
      <p class="stats">Runs ${m.runs} · Wins ${m.wins} · Towns won ${m.townsWon} · Best score ${m.best}</p>
      <div class="unlocks"><h3>Unlocks <small>(towns won over all runs)</small></h3><ul>${unl}</ul></div>
    </div>`;
  }

  // ----- Town -----

  private get town(): Town {
    return this.run!.town;
  }

  private fixSelection(): void {
    const r = this.run!;
    const t = r.town;
    if (!r.words.includes(this.draft.verb)) this.draft.verb = r.words.find((w) => WORDS[w].slot === 'verb')!;
    if (!this.draft.obj || !r.words.includes(this.draft.obj)) this.draft.obj = r.words.find((w) => WORDS[w].slot === 'obj')!;
    if (this.draft.mod && !r.words.includes(this.draft.mod)) this.draft.mod = null;
    if (this.agentSel >= t.agents.length || t.used[this.agentSel]) this.agentSel = freeAgents(t)[0] ?? 0;
  }

  private currentPreview(): Preview | null {
    const t = this.town;
    if (this.sel === null || !canPlant(t, this.agentSel, this.sel)) return null;
    return preview(t, this.agentSel, this.sel, this.draft);
  }

  private townView(): string {
    this.fixSelection();
    const t = this.town;
    const pv = this.currentPreview();
    const b = believers(t);
    const need = needed(t);
    const v = voters(t);
    const d = defenders(t);
    const left = t.maxTurns - t.turn;
    const rival = nextRivalTurn(t);
    const bar = `<div class="goalbar">
      <div class="goal-text"><b>${t.icon} ${t.name}</b> · Make <b>${need}</b> of ${v} believe a claim against <b>${t.target}</b></div>
      <div class="meter"><i class="fill" style="width:${Math.min(100, (b / v) * 100)}%"></i><i class="defend" style="width:${Math.min(100, (d / v) * 100)}%"></i><i class="tick" style="left:${(need / v) * 100}%"></i></div>
      <div class="goal-nums"><span class="bel">✔ ${b}/${need} believe</span>${d ? `<span class="def">🛡 ${d} defend</span>` : ''}<span class="${left <= 2 ? 'warn' : ''}">⏳ ${left} turn${left === 1 ? '' : 's'} left</span>${rival > 0 && t.lastClaim ? `<span class="rv">🦊 rival after turn ${rival}</span>` : t.rivalEvery ? '<span class="rv">🦊 rival waits for your first rumor</span>' : ''}</div>
    </div>`;
    const canP = pv !== null;
    const actions = `<div class="actions">
      <button class="plant ${canP ? 'primary' : ''}" data-act="plant" ${canP ? '' : 'disabled'}>🤫 Plant <kbd>P</kbd></button>
      <button class="go ${canP || t.planted || !freeAgents(t).length ? 'primary' : ''}" data-act="spread" ${this.busy ? 'disabled' : ''}>Spread ▶ <kbd>Enter</kbd></button>
    </div>`;
    return `<div class="town-layout">
      ${bar}
      <div class="board-col">
        <div class="graph" id="graph">${this.graphSvg(pv)}${this.labelsHtml(pv)}</div>
        <div class="legend"><span><i class="dot none"></i>not heard</span><span><i class="dot heard"></i>heard (1 of 2)</span><span><i class="dot bel"></i>believes</span><span><i class="dot def"></i>defends 🚫</span><span><i class="dash"></i>weak link</span></div>
      </div>
      <aside class="side">
        ${this.builderHtml()}
        ${actions}
        <div class="panel info">${pv ? this.previewHtml(pv) : this.infoHtml()}</div>
        ${this.log.length ? `<div class="panel log"><h4>Turn ${t.turn}</h4><ul>${this.log.map((l) => `<li>${l}</li>`).join('')}</ul></div>` : ''}
      </aside>
    </div>`;
  }

  private builderHtml(): string {
    const r = this.run!;
    const t = r.town;
    const agent = t.agents[this.agentSel];
    const c = plantedClaim(agent, this.draft);
    const row = (slot: Slot) => {
      const ws = r.words.filter((w) => WORDS[w].slot === slot);
      const chips = ws
        .map((w) => {
          const on = slot === 'verb' ? this.draft.verb === w : slot === 'obj' ? this.draft.obj === w : this.draft.mod === w;
          const def = WORDS[w];
          return `<button class="tile ${on ? 'on' : ''} ${def.perk ? 'perk' : ''}" data-act="word" data-w="${w}" title="${def.perk ? `${def.perk}: ${def.rule}` : 'No perk'}">${def.icon} ${def.text.replace(/^the /, '')}</button>`;
        })
        .join('');
      const none = slot === 'mod' ? `<button class="tile ${this.draft.mod ? '' : 'on'}" data-act="word" data-w="">— none</button>` : '';
      return `<div class="tiles"><span class="slot">${SLOT_NAME[slot]}</span>${chips}${none}</div>`;
    };
    const agents = t.agents
      .map((a, i) => {
        const st = t.exposed[i] ? 'exposed' : t.used[i] ? 'used' : '';
        return `<button class="agent ${i === this.agentSel && !t.used[i] ? 'on' : ''} ${st}" data-act="agent" data-i="${i}" ${t.used[i] ? 'disabled' : ''} title="${AGENTS[a].name}: ${AGENTS[a].rule}">${AGENTS[a].icon}${st === 'exposed' ? '<b>✖</b>' : st === 'used' ? '<b>✓</b>' : ''}</button>`;
      })
      .join('');
    const perks = [c.verb, c.obj, c.mod]
      .filter((w): w is string => !!w && !!WORDS[w].perk)
      .map((w) => `<span class="perk-note">${WORDS[w].icon} <b>${WORDS[w].perk}</b>: ${WORDS[w].rule}</span>`)
      .join('');
    return `<div class="panel builder">
      <div class="rumor-line">“${partsHtml(claimParts(c, t.target))}”</div>
      ${row('verb')}${row('obj')}${r.words.some((w) => WORDS[w].slot === 'mod') ? row('mod') : ''}
      ${perks ? `<div class="perks">${perks}</div>` : ''}
      <div class="tiles agents-row"><span class="slot">Agent</span>${agents}<span class="agent-note">${t.used[this.agentSel] ? 'All agents used' : `${AGENTS[agent].name}: ${AGENTS[agent].rule}`}</span></div>
    </div>`;
  }

  private graphSvg(pv: Preview | null): string {
    const t = this.town;
    const P = t.people;
    const pvNodes = new Map<number, number>();
    if (pv) for (const h of pv.hops) if (!pvNodes.has(h.node)) pvNodes.set(h.node, h.turn);
    const pvEdges = new Set(pv ? pv.hops.map((h) => `${h.from}-${h.node}`) : []);
    let links = '';
    for (const l of t.links) {
      const a = P[l.a];
      const c = P[l.b];
      const hot = pvEdges.has(`${l.a}-${l.b}`) || pvEdges.has(`${l.b}-${l.a}`);
      links += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" class="lk ${l.weak ? 'weak' : ''} ${hot ? 'hot' : ''}"/>`;
    }
    let traces = '';
    for (const tr of t.traces) {
      if (tr.done) continue;
      const i = Math.floor(tr.pos);
      const f = tr.pos - i;
      const a = P[tr.path[i]];
      const nb = P[tr.path[Math.min(i + 1, tr.path.length - 1)]];
      const hx = a.x + (nb.x - a.x) * f;
      const hy = a.y + (nb.y - a.y) * f;
      const pts = [`${hx},${hy}`, ...tr.path.slice(i + 1).map((n) => `${P[n].x},${P[n].y}`)].join(' ');
      const o = P[tr.origin];
      traces += `<polyline points="${pts}" class="trace"/><text x="${hx}" y="${hy - 13}" class="eye">👁️</text>
        <text x="${o.x + 15}" y="${o.y - 12}" class="trace-left">⚠${traceLeft(tr)}</text>`;
    }
    if (pv)
      for (const tr of pv.traces) {
        const pts = tr.path.map((n) => `${P[n].x},${P[n].y}`).join(' ');
        traces += `<polyline points="${pts}" class="trace pv"/>`;
      }
    const moves = this.moves
      .map((m) => {
        const a = P[m.from];
        const c = P[m.to];
        return `<circle r="4.5" class="msg ${m.claim.not ? 'not' : ''} ${m.claim.mod === 'surely' ? 'big' : ''}"><animateMotion dur="${0.55 * SPEED + 0.01}s" fill="freeze" path="M${a.x},${a.y} L${c.x},${c.y}"/></circle>`;
      })
      .join('');
    let nodes = '';
    for (const p of P) {
      const s = t.ps[p.id];
      const e = shown(t, p.id);
      let state = 'none';
      if (s.belief) state = s.belief[0] === '!' ? 'def' : 'bel';
      else if (e) state = 'heard';
      else if (s.dismissed) state = 'dead';
      let icon = TRAITS[p.trait].icon;
      let ring = '';
      if (s.agent >= 0) {
        icon = AGENTS[t.agents[s.agent]].icon;
        ring = t.exposed[s.agent] ? 'agent exposed' : 'agent';
      } else if (s.agent === -2) {
        icon = '🦊';
        ring = 'rival';
      }
      const selC = this.sel === p.id ? 'sel' : '';
      const pvC = pvNodes.has(p.id) ? 'pv' : '';
      const popC = this.pops.has(p.id) ? 'pop' : '';
      const plantable = this.sel === null && !this.busy && canPlant(t, this.agentSel, p.id) ? 'can' : '';
      let pips = '';
      if (state === 'heard' && e && s.agent === -1) {
        const w = Math.min(e.weight, 2);
        pips = `<circle cx="${p.x + 9}" cy="${p.y - 10}" r="2.6" class="pip on"/><circle cx="${p.x + 15}" cy="${p.y - 10}" r="2.6" class="pip ${w >= 2 ? 'on' : ''}"/>`;
      }
      nodes += `<g class="node ${state} ${ring} ${selC} ${pvC} ${popC} ${plantable}" data-n="${p.id}" style="transform-origin:${p.x}px ${p.y}px">
        <circle cx="${p.x}" cy="${p.y}" r="12" class="body"/>
        ${icon ? `<text x="${p.x}" y="${p.y + 0.5}" class="ti">${icon}</text>` : ''}
        ${s.agent >= 0 && t.exposed[s.agent] ? `<text x="${p.x + 10}" y="${p.y + 10}" class="x">✖</text>` : ''}
        ${pips}
      </g>`;
    }
    return `<svg id="board" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet">
      <g class="links">${links}</g><g class="traces">${traces}</g><g class="moves">${moves}</g><g class="nodes">${nodes}</g>
    </svg>`;
  }

  /** HTML labels over the graph: the rumor each person holds, with the change they made. */
  private labelsHtml(pv: Preview | null): string {
    const t = this.town;
    const pos = (x: number, y: number) => `left:${(x / VIEW_W) * 100}%;top:${(y / VIEW_H) * 100}%`;
    const pvMap = new Map<number, Preview['hops'][number]>();
    if (pv) for (const h of pv.hops) if (!pvMap.has(h.node)) pvMap.set(h.node, h);
    let out = '';
    for (const p of t.people) {
      const s = t.ps[p.id];
      const h = pvMap.get(p.id);
      let html = '';
      let cls = '';
      if (h) {
        html = partsHtml(claimParts(h.entry.claim, t.target, h.entry.prev), true);
        cls = 'pv';
      } else if (pv && this.sel === p.id) {
        html = partsHtml(claimParts(pv.claim, t.target), true);
        cls = 'pv';
      } else {
        const e = shown(t, p.id);
        if (e) {
          html = partsHtml(claimParts(e.claim, t.target, s.agent === -1 ? e.prev : null), true);
          cls = s.belief ? (s.belief[0] === '!' ? 'def' : 'bel') : 'heard';
          if (s.order.length > 1) html += `<sup>+${s.order.length - 1}</sup>`;
        } else if (s.dismissed) {
          html = `<span class="old">${WORDS[s.dismissed.claim.verb].icon}</span>✂️`;
          cls = 'dead';
        }
      }
      if (html) out += `<div class="lbl ${cls}" style="${pos(p.x, p.y + 13)}">${html}</div>`;
    }
    for (const f of this.floats) {
      const p = t.people[f.node];
      out += `<div class="float ${f.cls}" style="${pos(p.x, p.y - 16)}">${f.text}</div>`;
    }
    return `<div class="labels">${out}</div>`;
  }

  private personHead(n: number): string {
    const t = this.town;
    const p = t.people[n];
    const s = t.ps[n];
    if (s.agent >= 0) {
      const a = AGENTS[t.agents[s.agent]];
      return `<h4>${a.icon} ${p.name} <small>your ${a.name}${t.exposed[s.agent] ? ' · exposed' : ''}</small></h4>`;
    }
    if (s.agent === -2) return `<h4>🦊 ${p.name} <small>rival plant</small></h4>`;
    const tr = TRAITS[p.trait];
    return `<h4>${tr.icon || '🙂'} ${p.name} <small>${tr.name}</small></h4><p class="rule">${tr.rule}</p>`;
  }

  private infoHtml(): string {
    const t = this.town;
    if (this.sel === null) {
      if (isOver(t)) return '<p class="hint">The town is decided.</p>';
      const free = freeAgents(t).length;
      return `<p class="hint">${
        free && !t.planted
          ? '<b>1.</b> Pick words above. <b>2.</b> Tap a person to see how the rumor changes at the next people. <b>3.</b> Plant it, then Spread.'
          : t.planted
            ? 'Rumor planted. Press <b>Spread ▶</b> to move every rumor one link.'
            : 'No agents left. Press <b>Spread ▶</b> until the town is decided.'
      }</p>
      <ul class="traits">${(['gossip', 'skeptic', 'loyalist', 'muddler', 'guard'] as const)
        .filter((k) => t.people.some((p) => p.trait === k))
        .map((k) => `<li><b>${TRAITS[k].icon} ${TRAITS[k].name}</b> ${TRAITS[k].rule}</li>`)
        .join('')}<li><b>🙂 Townsfolk</b> Pass it on, but calm it down: they drop “surely”.</li></ul>`;
    }
    const n = this.sel;
    const s = t.ps[n];
    let body = this.personHead(n);
    if (s.order.length) {
      body += '<ul class="heard">';
      for (const k of s.order) {
        const e = s.heard[k];
        const from = e.from >= 0 ? t.people[e.from].name : 'planted';
        const status = s.agent !== -1 ? 'source' : s.belief === k ? (e.claim.not ? '🛡 defends' : '✔ believes') : `${Math.min(e.weight, 2)}/2 sources`;
        body += `<li class="${s.belief === k ? (e.claim.not ? 'def' : 'bel') : ''}"><span class="claim">“${partsHtml(claimParts(e.claim, t.target, s.agent === -1 ? e.prev : null))}”</span><small>from ${from} · ${status}</small></li>`;
      }
      body += '</ul>';
    } else if (s.dismissed) {
      body += `<p>Killed a rumor: “${partsHtml(claimParts(s.dismissed.claim, t.target))}”. No words were left to cut.</p>`;
    } else {
      const why = plantBlock(t, n) || (t.planted ? 'You already planted this turn.' : !freeAgents(t).length ? 'No agents left.' : '');
      body += `<p class="dim">Has not heard anything. ${why}</p>`;
    }
    return body;
  }

  private previewHtml(pv: Preview): string {
    const t = this.town;
    const n = this.sel!;
    const p = t.people[n];
    const agent = AGENTS[t.agents[this.agentSel]];
    let body = `<h4>${agent.icon} Plant on ${p.name} <small>${TRAITS[p.trait].icon} ${TRAITS[p.trait].name} · tap again to plant</small></h4>`;
    const turns = Math.min(2, t.maxTurns - t.turn);
    for (let k = 1; k <= turns; k++) {
      const hs = pv.hops.filter((h) => h.turn === k);
      const ks = pv.killed.filter((h) => h.turn === k);
      body += `<div class="pv-turn"><b>${k === 1 ? 'Next turn' : 'Turn after'}</b>`;
      if (!hs.length && !ks.length) body += '<span class="dim"> nobody new hears it.</span>';
      body += '<ul>';
      for (const h of hs.slice(0, 7)) {
        const q = t.people[h.node];
        const s = t.ps[h.node];
        const bel = h.entry.weight >= 2 && !s.belief;
        body += `<li><b>${TRAITS[q.trait].icon || '🙂'} ${q.name}</b> “${partsHtml(claimParts(h.entry.claim, t.target, h.entry.prev))}” ${bel ? (h.entry.claim.not ? '<em class="def">defends</em>' : '<em class="bel">believes</em>') : ''}</li>`;
      }
      if (hs.length > 7) body += `<li class="dim">+${hs.length - 7} more</li>`;
      for (const h of ks) body += `<li><b>🧐 ${t.people[h.node].name}</b> <span class="bad">kills it</span></li>`;
      body += '</ul></div>';
    }
    const warn: string[] = [];
    for (const tr of pv.traces) {
      const g = t.people[tr.guard].name;
      if (t.agents[this.agentSel] === 'ghost') warn.push(`👤 Guard ${g} will trace it, but a ghost is never exposed.`);
      else {
        const inT = tr.done ? turns : turns + traceLeft(tr);
        const leftT = t.maxTurns - t.turn;
        warn.push(inT <= leftT ? `<span class="bad">⚠ Guard ${g} will trace it back. Exposed in about ${inT} turns (−1 ❤️).</span>` : `👁️ Guard ${g} will trace it, but the town ends first.`);
      }
    }
    body += `<p class="pv-sum">In ${turns} turn${turns === 1 ? '' : 's'}: <b>${pv.hops.length}</b> hear it, <b>${pv.believers}</b> new believers.</p>${warn.map((w) => `<p>${w}</p>`).join('')}`;
    return body;
  }

  // ----- Reward / end -----

  private offerCard(o: Offer, act: string, i: number, extra = '', disabled = false): string {
    const d = offerText(o);
    return `<button class="card" data-act="${act}" data-i="${i}" ${disabled ? 'disabled' : ''}><span class="big">${d.icon}</span><b>${d.name}</b><small>${d.text}</small>${extra}</button>`;
  }

  private rewardView(): string {
    const r = this.run!;
    const res = r.result!;
    const offers = r.offers.map((o, i) => this.offerCard(o, 'pick', i, '', r.picked)).join('');
    const shop = r.shop
      .map((s, i) => this.offerCard(s, 'buy', i, `<span class="cost">${s.sold ? 'sold' : `🪙 ${s.cost}`}</span>`, !canBuy(r, i)))
      .join('');
    const words = r.words.map((w) => `<span class="chip" title="${WORDS[w].perk ? `${WORDS[w].perk}: ${WORDS[w].rule}` : ''}">${WORDS[w].icon} ${WORDS[w].text}</span>`).join('');
    const agents = r.agents.map((a) => `<span class="chip" title="${AGENTS[a].rule}">${AGENTS[a].icon} ${AGENTS[a].name}</span>`).join('');
    const nxt = TOWNS[r.townIdx + 1];
    return `<div class="reward">
      <div class="result ${res.won ? 'won' : 'lost'}">
        <h2>${res.won ? `${TOWNS[r.townIdx].icon} ${res.name} believes it!` : `${res.name} did not fall`}</h2>
        <p>${res.believers} of ${res.voters} believed after ${res.turn} turns. ${res.won ? `+${res.score} score, +${res.coins} 🪙.` : `−1 cover ❤️. +${res.coins} 🪙.`}</p>
      </div>
      <h3>${r.picked ? 'Picked' : 'Pick one reward'}</h3>
      <div class="cards">${offers}</div>
      <h3>Market <small>🪙 ${r.coins}</small></h3>
      <div class="cards shop">${shop}</div>
      <div class="loadout"><div><b>Words</b> ${words}</div><div><b>Agents</b> ${agents}</div></div>
      <button class="primary next" data-act="next">Go to ${nxt.icon} ${nxt.name} ▶</button>
      <p class="dim">Next: ${nxt.n} people · ${nxt.guards} guards${nxt.muddler ? ' · muddlers' : ''}${nxt.rival ? ' · a rival 🦊' : ''} · goal ${Math.round(nxt.goal * 100)}% in ${nxt.turns} turns${r.townIdx + 1 === TOWNS.length - 1 ? ' · final town: lose it and the run ends' : ''}</p>
    </div>`;
  }

  private endView(): string {
    const e = this.end!;
    return `<div class="end ${e.victory ? 'won' : 'lost'}">
      <div class="hero-icon">${e.victory ? '👑' : '⛓️'}</div>
      <h1>${e.victory ? 'The duke falls!' : 'The rumor mill stops'}</h1>
      <p class="sub">${e.reason}</p>
      <p>Towns won: <b>${e.towns}</b>/5</p>
      <p class="score">Score <b>${e.score}</b></p>
      <p class="dim">Seed ${e.seed}</p>
      <button class="primary" data-act="new">New run</button>
      <button data-act="title">Title</button>
    </div>`;
  }

  private modalView(): string {
    const m = this.modal!;
    if (m.kind === 'help') {
      return `<div class="modal" data-act="modal-close"><div class="sheet" data-stop>
        <h2>How to play</h2>
        <ul>
          <li><b>Goal.</b> Make enough people believe a claim against the town's target before the turns run out. Win 5 towns to topple the duke.</li>
          <li><b>Write a rumor</b> from word tiles: a verb, an object and an optional tone word. It is always about the target.</li>
          <li><b>Plant it.</b> Tap a person: the board and the side panel show how the rumor will change at the next 1–2 people. Tap again (or press Plant) to plant. Each agent plants once per town, one plant per turn.</li>
          <li><b>Spread.</b> Each turn, everyone who just came to believe a rumor tells it to all neighbors. Dashed links are weak: they only carry big rumors (❗ surely).</li>
          <li><b>Belief.</b> A person believes a claim when 2 different people told them the same claim. Same claim = same verb, object and “NOT”. A big rumor counts as 2 sources. Only believers pass rumors on. The two dots on a person show 1 of 2.</li>
          <li><b>Traits</b> change the rumor when a person hears it, always the same way:
            🗣️ gossip adds “surely”, 🧐 skeptic cuts a word (tone word, then object, then verb), 🛡️ loyalist turns it around (did NOT), 🌀 muddler swaps the object (${OBJ_RING.map((o) => WORDS[o].icon).join('→')}→${WORDS[OBJ_RING[0]].icon}), 🙂 townsfolk drop “surely”.</li>
          <li><b>Labels</b> under each person show the claim they hold: <span class="old">struck</span> = word they removed, <span class="new">marked</span> = word they changed or added.</li>
          <li><b>Guards 💂</b> trace a rumor back along its path, 1 step per turn (red line, ⚠ = turns left). If the trace reaches your agent, the agent is exposed and you lose 1 cover ❤️.</li>
          <li><b>Rival 🦊</b> (later towns) whispers “did NOT” versions of your last rumor to well-linked people. People who defend (blue) are lost to you.</li>
          <li><b>Cover ❤️.</b> A failed town also costs 1 cover. At 0 the run ends. Failing the last town ends the run.</li>
          <li><b>Keys:</b> arrows move the selection, <kbd>P</kbd> plant, <kbd>Enter</kbd> spread, <kbd>1</kbd>–<kbd>5</kbd> agent, <kbd>V</kbd> <kbd>O</kbd> <kbd>T</kbd> cycle verb, object, tone, <kbd>Esc</kbd> clear.</li>
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

  private nodeAt(e: { clientX: number; clientY: number }): number | null {
    const svg = this.root.querySelector<SVGSVGElement>('#board');
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let best: number | null = null;
    let bd = 26;
    for (const p of this.town.people) {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  }

  private onClick(e: MouseEvent): void {
    initAudio();
    const target = e.target as HTMLElement;
    if (this.screen === 'town' && !this.modal && target.closest('#graph')) {
      this.tapNode(this.nodeAt(e));
      return;
    }
    const el = target.closest<HTMLElement>('[data-act], [data-stop]');
    if (!el) return;
    if (el.hasAttribute('data-stop') && !el.dataset.act) return;
    this.action(el.dataset.act!, el.dataset);
  }

  private tapNode(n: number | null): void {
    if (this.busy || !this.run) return;
    if (n === null) {
      this.sel = null;
    } else if (this.sel === n && canPlant(this.town, this.agentSel, n)) {
      this.plantNow();
      return;
    } else {
      this.sel = n;
      sfx.click();
    }
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal = null;
        this.render();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    initAudio();
    if (this.screen === 'title') {
      if (e.key === 'Enter') this.action(this.run ? 'continue' : 'new', {});
      return;
    }
    if (this.screen === 'reward') {
      if (e.key === 'Enter') this.action('next', {});
      else if (/^[1-3]$/.test(e.key)) this.action('pick', { i: String(+e.key - 1) });
      return;
    }
    if (this.screen === 'end') {
      if (e.key === 'Enter') this.action('new', {});
      return;
    }
    if (this.screen !== 'town' || this.busy) return;
    const k = e.key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      void this.spreadTurn();
    } else if (k === 'p' || k === 'P') this.plantNow();
    else if (k === 'Escape') {
      this.sel = null;
      this.render();
    } else if (/^[1-5]$/.test(k)) this.action('agent', { i: String(+k - 1) });
    else if (k === 'v' || k === 'V') this.cycle('verb');
    else if (k === 'o' || k === 'O') this.cycle('obj');
    else if (k === 't' || k === 'T') this.cycle('mod');
    else if (k.startsWith('Arrow')) {
      e.preventDefault();
      this.moveSel(k);
    }
  }

  private cycle(slot: Slot): void {
    const ws: (string | null)[] = this.run!.words.filter((w) => WORDS[w].slot === slot);
    if (slot === 'mod') ws.unshift(null);
    if (!ws.length) return;
    const cur = slot === 'verb' ? this.draft.verb : slot === 'obj' ? this.draft.obj : this.draft.mod;
    this.setWord(slot, ws[(ws.indexOf(cur) + 1) % ws.length]);
  }

  private setWord(slot: Slot, w: string | null): void {
    if (slot === 'verb' && w) this.draft.verb = w;
    else if (slot === 'obj' && w) this.draft.obj = w;
    else if (slot === 'mod') this.draft.mod = w;
    sfx.click();
    this.render();
  }

  private moveSel(k: string): void {
    const P = this.town.people;
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (!dir) return;
    if (this.sel === null) {
      this.sel = P.reduce((b, p) => (Math.hypot(p.x - VIEW_W / 2, p.y - VIEW_H / 2) < Math.hypot(P[b].x - VIEW_W / 2, P[b].y - VIEW_H / 2) ? p.id : b), 0);
    } else {
      const c = P[this.sel];
      let best = -1;
      let bs = 1e9;
      for (const p of P) {
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 4) continue;
        const side = Math.abs(dx * dir[1] - dy * dir[0]);
        const sc = along + side * 2;
        if (sc < bs) {
          bs = sc;
          best = p.id;
        }
      }
      if (best >= 0) this.sel = best;
    }
    sfx.click();
    this.render();
  }

  private action(act: string, d: DOMStringMap): void {
    switch (act) {
      case 'mute': {
        const m = toggleMute();
        this.toast(m ? 'Sound off' : 'Sound on');
        this.render();
        return;
      }
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
      case 'new':
        this.startRun();
        return;
      case 'continue':
        if (!this.run) return;
        this.screen = this.run.phase === 'reward' ? 'reward' : 'town';
        this.log = [];
        this.render();
        return;
      case 'word': {
        const w = d.w || null;
        this.setWord(w ? WORDS[w].slot : 'mod', w);
        return;
      }
      case 'agent': {
        const i = +(d.i ?? 0);
        if (!this.run || this.town.used[i] || i >= this.town.agents.length) return;
        this.agentSel = i;
        sfx.click();
        this.render();
        return;
      }
      case 'plant':
        this.plantNow();
        return;
      case 'spread':
        void this.spreadTurn();
        return;
      case 'pick': {
        const r = this.run;
        if (!r || !takeOffer(r, +(d.i ?? 0))) return;
        sfx.pick();
        saveRun(r);
        this.render();
        return;
      }
      case 'buy': {
        const r = this.run;
        if (!r) return;
        if (!buy(r, +(d.i ?? 0))) {
          sfx.deny();
          return;
        }
        sfx.coin();
        saveRun(r);
        this.render();
        return;
      }
      case 'next': {
        const r = this.run;
        if (!r || r.phase !== 'reward') return;
        nextTown(r);
        saveRun(r);
        this.enterTown();
        return;
      }
    }
  }

  // ---------- Game flow ----------

  private startRun(seed = randomSeedText()): void {
    this.run = newRun(seed);
    this.draft = { verb: 'stole', obj: 'grain', mod: null, not: false };
    saveRun(this.run);
    this.enterTown();
  }

  private enterTown(): void {
    this.screen = 'town';
    this.sel = null;
    this.agentSel = 0;
    this.log = [];
    this.render();
    const t = this.town;
    this.toast(`${t.icon} ${t.name}: turn ${t.target} in ${t.maxTurns} turns`);
  }

  private plantNow(): void {
    const r = this.run;
    if (!r || this.busy || this.screen !== 'town' || this.sel === null) return;
    const t = r.town;
    if (!canPlant(t, this.agentSel, this.sel)) {
      sfx.deny();
      this.toast(plantBlock(t, this.sel) || (t.planted ? 'One plant per turn. Spread first.' : 'No agent left.'));
      return;
    }
    const n = this.sel;
    r.town = plant(t, this.agentSel, n, this.draft);
    sfx.plant();
    this.floats.push({ node: n, text: '🤫 planted', cls: 'plant' });
    this.pops.add(n);
    this.sel = null;
    saveRun(r);
    this.render();
  }

  private describe(ev: Ev, before: Town, after: Town): string | null {
    const P = after.people;
    const nm = (n: number) => `<b>${TRAITS[P[n].trait].icon || ''}${P[n].name}</b>`;
    switch (ev.kind) {
      case 'hear': {
        if (!ev.changed) return null;
        const e = after.ps[ev.node].heard[ev.key];
        return `${nm(ev.node)} “${partsHtml(claimParts(e.claim, after.target, e.prev))}”`;
      }
      case 'kill':
        return before.ps[ev.node].dismissed ? null : `${nm(ev.node)} <span class="bad">killed the rumor</span>`;
      case 'trace':
        return `<span class="bad">💂 ${P[ev.guard].name} starts a trace back to ${P[ev.origin].name}</span>`;
      case 'expose':
        return `<span class="bad">💥 ${P[ev.node].name} is exposed! −1 ❤️</span>`;
      case 'safe':
        return `👤 The trace reached ${P[ev.node].name}, a ghost. It fails.`;
      case 'rival':
        return `<span class="bad">🦊 The rival whispers to ${P[ev.node].name}</span>`;
      default:
        return null;
    }
  }

  private async spreadTurn(): Promise<void> {
    const r = this.run;
    if (!r || this.busy || this.screen !== 'town' || isOver(r.town)) return;
    this.busy = true;
    this.sel = null;
    const before = r.town;
    const res = spread(before);
    this.moves = res.moves;
    this.render();
    sfx.spread(res.moves.length);
    await sleep(res.moves.length ? 650 : 200);
    this.moves = [];
    r.town = res.town;
    const lost = applyEvents(r, res.events);
    const log: string[] = [];
    let bel = 0;
    let def = 0;
    let mut = false;
    for (const ev of res.events) {
      const line = this.describe(ev, before, res.town);
      if (line) log.push(line);
      if (ev.kind === 'hear') {
        this.pops.add(ev.node);
        if (ev.changed) {
          const e = res.town.ps[ev.node].heard[ev.key];
          this.floats.push({ node: ev.node, text: changeLabel(e.prev, e.claim), cls: 'chg' });
          mut = true;
        }
      } else if (ev.kind === 'believe') {
        if (ev.pos) bel++;
        else def++;
        this.floats.push({ node: ev.node, text: ev.pos ? '✔' : '🛡', cls: ev.pos ? 'bel' : 'def' });
      } else if (ev.kind === 'kill') this.floats.push({ node: ev.node, text: '✂️', cls: 'chg' });
      else if (ev.kind === 'trace') {
        this.floats.push({ node: ev.guard, text: '👁️ trace', cls: 'bad' });
        sfx.trace();
      } else if (ev.kind === 'expose') {
        this.floats.push({ node: ev.node, text: '💥 −❤️', cls: 'bad' });
        sfx.expose();
        this.root.classList.add('shake');
        setTimeout(() => this.root.classList.remove('shake'), 400);
      } else if (ev.kind === 'rival') {
        this.floats.push({ node: ev.node, text: '🦊', cls: 'bad' });
        sfx.rival();
      }
    }
    // Keep floats readable: one per person, the latest wins.
    const seen = new Set<number>();
    this.floats = this.floats.reverse().filter((f) => (seen.has(f.node) ? false : (seen.add(f.node), true)));
    if (mut) sfx.mutate();
    for (let i = 0; i < bel; i++) setTimeout(() => sfx.believe(i), 0);
    if (def) sfx.defend();
    const nb = believers(res.town) - believers(before);
    log.unshift(`${res.moves.length} tellings · <span class="bel">+${nb} believe</span>${def ? ` · <span class="def">+${def} defend</span>` : ''}`);
    this.log = log.slice(0, 9);
    if (log.length > 9) this.log.push(`<span class="dim">+${log.length - 9} more</span>`);
    saveRun(r);
    this.render();
    await sleep(450);
    this.busy = false;
    if (lost) {
      await sleep(500);
      this.endRun(false, 'Your agents were exposed one time too many. Your cover is blown.');
      return;
    }
    if (isOver(r.town)) {
      await sleep(600);
      this.finishTown();
      return;
    }
    this.render();
  }

  private finishTown(): void {
    const r = this.run!;
    const res = finishTown(r, this.meta);
    saveMeta(this.meta);
    if (res === 'reward') {
      if (r.result!.won) sfx.win();
      else sfx.lose();
      saveRun(r);
      this.screen = 'reward';
      this.render();
      return;
    }
    if (res === 'win') this.endRun(true, `${r.town.target[0].toUpperCase()}${r.town.target.slice(1)} is disgraced. The whole duchy whispers your words.`);
    else this.endRun(false, isFinalTown(r) && r.cover > 0 ? `${r.town.name} did not believe you. The duke keeps his seat.` : 'Too many towns failed. Your cover is blown.');
  }

  private endRun(victory: boolean, reason: string): void {
    const r = this.run;
    if (!r) return;
    const score = recordRun(this.meta, r, victory);
    saveMeta(this.meta);
    this.end = { victory, score, towns: r.won, reason, seed: r.seed };
    this.run = null;
    saveRun(null);
    this.screen = 'end';
    if (victory) sfx.win();
    else sfx.lose();
    this.render();
  }

  // ---------- Debug (?debug) ----------

  private installDebug(): void {
    const botRng = new Rng(hash('debug-bot', Date.now()));
    const api = {
      state: () => {
        const t = this.run?.town;
        return {
          screen: this.screen,
          busy: this.busy,
          town: this.run?.townIdx,
          turn: t?.turn,
          maxTurns: t?.maxTurns,
          believers: t ? believers(t) : null,
          needed: t ? needed(t) : null,
          cover: this.run?.cover,
          coins: this.run?.coins,
          words: this.run?.words,
          agents: this.run?.agents,
          traces: t?.traces.filter((x) => !x.done).length,
          end: this.end,
        };
      },
      /** Skip the current town as a win. */
      win: () => {
        const r = this.run;
        if (!r || this.screen !== 'town') return;
        const t = r.town;
        let k = needed(t);
        for (const s of t.ps)
          if (s.agent === -1 && !s.belief && k-- > 0) {
            const c: Claim = { verb: 'stole', obj: 'grain', mod: null, not: false };
            const key = keyOf(c);
            s.heard[key] = { claim: c, prev: c, from: -1, sources: [-1], weight: 2, path: [0], turn: t.turn };
            s.order.push(key);
            s.belief = key;
          }
        this.finishTown();
      },
      coins: (n: number) => {
        if (this.run) this.run.coins += n;
        this.render();
      },
      townsWon: (n: number) => {
        this.meta.townsWon = n;
        saveMeta(this.meta);
        this.render();
      },
      /** One bot action for automatic tests. */
      step: async () => {
        if (this.busy) return 'busy';
        if (this.modal) {
          this.modal = null;
          this.render();
          return 'modal';
        }
        const r = this.run;
        switch (this.screen) {
          case 'title':
            this.startRun();
            return 'start';
          case 'town': {
            const t = r!.town;
            const m = goodMove(t, r!.words, botRng, 120);
            if (m) {
              this.agentSel = m.agent;
              this.draft = { ...m.claim };
              this.sel = m.node;
              this.plantNow();
            }
            await this.spreadTurn();
            return m ? 'plant+spread' : 'spread';
          }
          case 'reward': {
            if (!r!.picked) {
              const pri = (o: Offer) => (o.kind === 'agent' ? 3 : o.kind === 'word' ? 2 : 1);
              const i = r!.offers.map((o, j) => [pri(o), j]).sort((a, b) => b[0] - a[0])[0][1];
              this.action('pick', { i: String(i) });
              return 'pick';
            }
            const j = r!.shop.findIndex((_, i) => canBuy(r!, i));
            if (j >= 0) {
              this.action('buy', { i: String(j) });
              return 'buy';
            }
            this.action('next', {});
            return 'next';
          }
          case 'end':
            return 'end';
        }
      },
    };
    (window as unknown as { debug: typeof api }).debug = api;
  }
}
