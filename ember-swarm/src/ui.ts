import type { Game, RunResult } from './game';
import { PASSIVES, type Choice } from './items';
import { CHARACTERS, META_UPGRADES, upgradeCost, type SaveData } from './meta';
import { WEAPONS, WEAPON_IDS } from './weapons';

export const fmtTime = (sec: number): string => {
  const t = Math.floor(sec);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

interface CardInfo {
  icon: string;
  name: string;
  tag: string;
  desc: string;
  hint: string;
  evolve: boolean;
}

function describe(c: Choice): CardInfo {
  switch (c.kind) {
    case 'weapon': {
      const d = WEAPONS[c.id];
      const p = PASSIVES[d.evolveWith];
      return {
        icon: d.icon,
        name: d.name,
        tag: c.level === 1 ? 'NEW WEAPON' : `LV ${c.level}`,
        desc: d.desc[c.level - 1],
        hint: c.level === 1 ? `Evolves with ${p.icon} ${p.name}` : '',
        evolve: false,
      };
    }
    case 'passive': {
      const d = PASSIVES[c.id];
      return { icon: d.icon, name: d.name, tag: c.level === 1 ? 'NEW' : `LV ${c.level}`, desc: d.desc, hint: '', evolve: false };
    }
    case 'evolve': {
      const d = WEAPONS[c.id];
      return { icon: d.icon, name: d.evolvedName, tag: 'EVOLUTION', desc: d.evolvedDesc, hint: `Replaces ${d.name}`, evolve: true };
    }
    case 'gold':
      return { icon: '🪙', name: 'Gold Pouch', tag: '', desc: '+25 gold.', hint: '', evolve: false };
    case 'heal':
      return { icon: '🍗', name: 'Roast', tag: '', desc: 'Heal 30 HP.', hint: '', evolve: false };
  }
}

export interface TitleHandlers {
  play(): void;
  select(id: string): void;
  unlock(id: string): void;
  buy(id: string): void;
}

export class UI {
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private toastTimer = 0;

  constructor(
    private root: HTMLElement,
    private toastEl: HTMLElement,
  ) {}

  private show(html: string, cls: string): void {
    this.root.innerHTML = html;
    this.root.className = cls;
    this.setKeys(null);
  }

  private setKeys(fn: ((e: KeyboardEvent) => void) | null): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = fn;
    if (fn) window.addEventListener('keydown', fn);
  }

  private on(selector: string, fn: (el: HTMLElement) => void): void {
    this.root.querySelectorAll<HTMLElement>(selector).forEach((el) => el.addEventListener('click', () => fn(el)));
  }

  title(save: SaveData, h: TitleHandlers): void {
    const chars = CHARACTERS.map((c) => {
      const owned = save.unlocked.includes(c.id);
      const w = WEAPONS[c.weapon];
      const cls = ['char', owned ? '' : 'locked', save.selected === c.id ? 'selected' : '', !owned && save.gold < c.price ? 'poor' : ''].join(' ');
      return `<button class="${cls}" data-id="${c.id}">
        <span class="avatar" style="--c:${c.color}"></span>
        <b>${c.name}</b><small>${c.title}</small>
        <span class="weapon">${w.icon} ${w.name}</span>
        <span class="bonus">${c.bonus}</span>
        ${owned ? '' : `<span class="price">🔒 ${c.price} 🪙</span>`}
      </button>`;
    }).join('');

    const shop = META_UPGRADES.map((u) => {
      const rank = save.upgrades[u.id] ?? 0;
      const maxed = rank >= u.max;
      const cost = upgradeCost(u, rank);
      const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      return `<button class="up ${maxed ? 'maxed' : save.gold < cost ? 'poor' : ''}" data-id="${u.id}" ${maxed ? 'disabled' : ''}>
        <span class="icon">${u.icon}</span>
        <span class="txt"><b>${u.name}</b><small>${u.desc}</small><span class="pips">${pips}</span></span>
        <span class="cost">${maxed ? 'MAX' : `${cost} 🪙`}</span>
      </button>`;
    }).join('');

    const best = save.best.time
      ? `Best: ${fmtTime(save.best.time)} · Lv ${save.best.level} · ${save.best.kills} kills · ${save.wins} wins`
      : 'No runs yet';

    this.show(
      `<div class="panel title">
        <h1>Ember <span>Swarm</span></h1>
        <p class="tagline">Survive 10 minutes. Slay the Ash Colossus.</p>
        <div class="bank"><span>🪙 <b>${save.gold}</b></span><span class="muted">${best}</span></div>
        <h2>Choose your hero</h2>
        <div class="chars">${chars}</div>
        <button class="play big">▶ Play</button>
        <h2>Permanent upgrades</h2>
        <div class="shop">${shop}</div>
        <p class="help">WASD / arrows to move · Weapons fire on their own · Esc to pause · On touch screens, drag to move</p>
      </div>`,
      'overlay',
    );
    this.on('.char', (el) => {
      const id = el.dataset.id!;
      if (save.unlocked.includes(id)) h.select(id);
      else h.unlock(id);
    });
    this.on('.up', (el) => h.buy(el.dataset.id!));
    this.on('.play', () => h.play());
    this.setKeys((e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        h.play();
      }
    });
  }

  playing(onPause: () => void): void {
    this.show(`<button class="pause-btn" title="Pause (Esc)">⏸</button>`, 'hud');
    this.on('.pause-btn', onPause);
  }

  levelUp(game: Game, choices: Choice[], pick: (i: number) => void, reroll: () => void): void {
    const cards = choices.map((c, i) => {
      const d = describe(c);
      return `<button class="card ${d.evolve ? 'evolve' : ''}" data-i="${i}">
        <kbd>${i + 1}</kbd>
        <span class="icon">${d.icon}</span>
        <b>${d.name}</b>
        ${d.tag ? `<span class="ctag">${d.tag}</span>` : ''}
        <p>${d.desc}</p>
        ${d.hint ? `<small>${d.hint}</small>` : ''}
      </button>`;
    }).join('');
    this.show(
      `<div class="panel levelup">
        <h2>Level ${game.level}!</h2>
        <div class="cards">${cards}</div>
        <button class="reroll" ${game.rerolls > 0 ? '' : 'disabled'}>🎲 Reroll (${game.rerolls})</button>
      </div>`,
      'overlay dim',
    );
    this.on('.card', (el) => pick(Number(el.dataset.i)));
    this.on('.reroll', reroll);
    this.setKeys((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) pick(n - 1);
      if (e.code === 'KeyR') reroll();
    });
  }

  pause(game: Game, resume: () => void, quit: () => void): void {
    const weapons = game.weapons
      .map((w) => `<li>${WEAPONS[w.id].icon} ${w.evolved ? `<b class="gold">${WEAPONS[w.id].evolvedName}</b>` : `${WEAPONS[w.id].name} <small>Lv ${w.level}</small>`}</li>`)
      .join('');
    const passives = [...game.passives].map(([id, l]) => `<li>${PASSIVES[id].icon} ${PASSIVES[id].name} <small>Lv ${l}</small></li>`).join('');
    const recipes = WEAPON_IDS.map((id) => {
      const w = WEAPONS[id];
      const p = PASSIVES[w.evolveWith];
      return `<li>${w.icon} ${w.name} <small>Lv ${w.maxLevel}</small> + ${p.icon} ${p.name} → <b class="gold">${w.evolvedName}</b></li>`;
    }).join('');
    this.show(
      `<div class="panel pause">
        <h2>Paused</h2>
        <div class="cols">
          <div><h3>Your build</h3><ul>${weapons}${passives}</ul></div>
          <div><h3>Evolutions</h3><ul class="recipes">${recipes}</ul><p class="muted">Evolutions appear in level-ups and elite chests.</p></div>
        </div>
        <div class="row">
          <button class="resume big">▶ Resume</button>
          <button class="quit">Give up</button>
        </div>
      </div>`,
      'overlay dim',
    );
    this.on('.resume', resume);
    this.on('.quit', quit);
  }

  gameOver(r: RunResult, newBest: boolean, done: () => void): void {
    this.show(
      `<div class="panel over ${r.victory ? 'win' : ''}">
        <h1>${r.victory ? 'Victory!' : 'You burned out'}</h1>
        ${newBest ? '<p class="gold">★ New best time ★</p>' : ''}
        <div class="stats">
          <div><small>Time</small><b>${fmtTime(r.time)}</b></div>
          <div><small>Level</small><b>${r.level}</b></div>
          <div><small>Kills</small><b>${r.kills}</b></div>
          <div><small>Gold</small><b>+${r.gold} 🪙</b></div>
        </div>
        <button class="done big">Continue</button>
      </div>`,
      'overlay dim',
    );
    this.on('.done', done);
    this.setKeys((e) => {
      if (e.code === 'Enter' || e.code === 'Space') done();
    });
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2800);
  }
}
