import type { RunResult, Game } from './game';
import { ITEM_BY_ID, activeSynergies } from './items';
import { HUB_UPGRADES, LOADOUTS, type SaveData, upgradeCost } from './meta';
import { isMuted } from './sfx';

export interface TitleActions {
  play(seed: string): void;
  select(id: string): void;
  unlock(id: string): void;
  buy(id: string): void;
  mute(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class UI {
  constructor(private root: HTMLElement) {}

  hide(): void {
    this.root.innerHTML = '';
    this.root.className = '';
  }

  private bind(handlers: Record<string, (arg: string) => void>): void {
    this.root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        handlers[el.dataset.act!]?.(el.dataset.arg ?? '');
      });
    });
  }

  title(save: SaveData, a: TitleActions): void {
    this.root.className = 'screen';
    const loadouts = LOADOUTS.map((l) => {
      const owned = save.unlocked.includes(l.id);
      const sel = save.selected === l.id;
      return `<button class="load ${sel ? 'sel' : ''} ${owned ? '' : 'locked'}" style="--c:${l.color}" data-act="${owned ? 'select' : 'unlock'}" data-arg="${l.id}">
        <span class="li">${l.icon}</span><b>${l.name}</b><small>${l.desc}</small>
        <span class="tag">${sel ? 'Selected' : owned ? 'Select' : `🔒 ${l.price} 💠`}</span>
      </button>`;
    }).join('');
    const ups = HUB_UPGRADES.map((u) => {
      const rank = save.upgrades[u.id] ?? 0;
      const max = rank >= u.max;
      const cost = upgradeCost(u, rank);
      return `<button class="up ${max ? 'max' : save.shards >= cost ? '' : 'poor'}" data-act="buy" data-arg="${u.id}" ${max ? 'disabled' : ''}>
        <span class="ui">${u.icon}</span>
        <span class="ut"><b>${u.name}</b><small>${u.desc}</small><span class="pips">${'▰'.repeat(rank)}${'▱'.repeat(u.max - rank)}</span></span>
        <span class="uc">${max ? 'MAX' : `${cost} 💠`}</span>
      </button>`;
    }).join('');
    this.root.innerHTML = `
      <div class="title">
        <h1>NEON<span>DEPTHS</span></h1>
        <p class="tag-line">Twin-stick room clearing. Five floors. Stack your shots.</p>
        <div class="play-row">
          <button class="big" data-act="play">▶ Dive</button>
          <input id="seed" maxlength="12" placeholder="Seed (optional)" autocomplete="off" spellcheck="false">
        </div>
        <div class="stats-row">💠 <b>${save.shards}</b> shards · Best floor <b>${save.bestFloor || '–'}</b> · Runs <b>${save.runs}</b> · Wins <b>${save.wins}</b></div>
        <h2>Loadout</h2>
        <div class="loads">${loadouts}</div>
        <h2>Hub upgrades</h2>
        <div class="ups">${ups}</div>
        <div class="help">
          <b>Keyboard + mouse:</b> WASD move · mouse aim · hold click to shoot · arrow keys also shoot · Space / Shift / right-click dodge · E bomb · F auto-fire · Tab map · Esc pause<br>
          <b>Gamepad:</b> left stick move · right stick shoot · A / RB dodge · B / LB bomb · Start pause<br>
          <b>Touch:</b> left thumb moves · right thumb aims and shoots · buttons for dodge and bomb
        </div>
        <div class="foot"><button class="link" data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button> · <a href="../">← All games</a></div>
      </div>`;
    const seed = this.root.querySelector<HTMLInputElement>('#seed')!;
    seed.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') a.play(seed.value.trim().toUpperCase());
    });
    this.bind({
      play: () => a.play(seed.value.trim().toUpperCase()),
      select: a.select,
      unlock: a.unlock,
      buy: a.buy,
      mute: a.mute,
    });
  }

  pause(g: Game, a: { resume(): void; quit(): void; mute(): void }): void {
    this.root.className = 'screen dim';
    const s = g.stats;
    const items = g.player.items.map((id) => {
      const d = ITEM_BY_ID[id];
      return `<div class="it r-${d.rarity}"><span>${d.icon}</span><b>${esc(d.name)}</b><small>${esc(d.desc)}</small></div>`;
    }).join('') || '<p class="muted">No items yet.</p>';
    const syn = activeSynergies(g.player.items).map((y) => `<div class="syn">✨ <b>${y.name}</b> — ${y.desc}</div>`).join('');
    const stat = (k: string, v: string) => `<span><small>${k}</small><b>${v}</b></span>`;
    this.root.innerHTML = `
      <div class="panel">
        <h2>Paused</h2>
        <div class="statgrid">
          ${stat('Damage', (s.damage * s.dmgMult).toFixed(1))}
          ${stat('Fire rate', `${s.fireRate.toFixed(1)}/s`)}
          ${stat('Shots', String(1 + s.multishot + (s.rearShot ? 1 : 0)))}
          ${stat('Speed', String(Math.round(s.speed)))}
          ${stat('Range', String(Math.round(s.range)))}
          ${stat('Crit', `${Math.round(s.crit * 100)}%`)}
          ${stat('Luck', s.luck.toFixed(1))}
          ${stat('Seed', g.seed)}
        </div>
        ${syn}
        <div class="items">${items}</div>
        <div class="btns">
          <button class="big" data-act="resume">Resume</button>
          <button data-act="mute">${isMuted() ? '🔇 Sound off' : '🔊 Sound on'}</button>
          <button class="danger" data-act="quit">Give up</button>
        </div>
      </div>`;
    this.bind({ resume: a.resume, quit: a.quit, mute: a.mute });
  }

  results(r: RunResult, a: { again(): void; hub(): void }): void {
    this.root.className = 'screen dim';
    const m = Math.floor(r.time / 60);
    const sec = Math.floor(r.time % 60).toString().padStart(2, '0');
    const items = r.items.map((id) => `<span title="${esc(ITEM_BY_ID[id]?.name ?? id)}">${ITEM_BY_ID[id]?.icon ?? '?'}</span>`).join('');
    this.root.innerHTML = `
      <div class="panel result ${r.won ? 'won' : 'lost'}">
        <h2>${r.won ? 'The Depths are clear' : 'Signal lost'}</h2>
        <p class="muted">${r.won ? 'You beat The Overmind.' : `You fell on floor ${r.floor}.`}</p>
        <div class="statgrid">
          <span><small>Floor</small><b>${r.floor}</b></span>
          <span><small>Rooms</small><b>${r.rooms}</b></span>
          <span><small>Kills</small><b>${r.kills}</b></span>
          <span><small>Time</small><b>${m}:${sec}</b></span>
        </div>
        <p class="gain">+${r.shards} 💠 shards</p>
        <div class="rowitems">${items}</div>
        <p class="muted small">Seed ${r.seed}</p>
        <div class="btns">
          <button class="big" data-act="again">Dive again</button>
          <button data-act="hub">Hub</button>
        </div>
      </div>`;
    this.bind({ again: a.again, hub: a.hub });
  }
}
