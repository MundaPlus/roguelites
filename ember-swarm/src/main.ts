import './style.css';
import { Game, drawBackground, type RunResult } from './game';
import { Input } from './input';
import { CHARACTERS, META_UPGRADES, loadSave, upgradeCost, writeSave } from './meta';
import { UI } from './ui';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = new UI(document.querySelector<HTMLElement>('#ui')!, document.querySelector<HTMLElement>('#toast')!);
const input = new Input(canvas);
const save = loadSave();
let game: Game | null = null;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

function showTitle(): void {
  game = null;
  ui.title(save, {
    play: start,
    select(id) {
      save.selected = id;
      writeSave(save);
      showTitle();
    },
    unlock(id) {
      const c = CHARACTERS.find((x) => x.id === id);
      if (c && save.gold >= c.price) {
        save.gold -= c.price;
        save.unlocked.push(id);
        save.selected = id;
        writeSave(save);
        ui.toast(`🔓 ${c.name} unlocked!`);
      } else {
        ui.toast('Not enough gold.');
      }
      showTitle();
    },
    buy(id) {
      const u = META_UPGRADES.find((x) => x.id === id);
      if (!u) return;
      const rank = save.upgrades[id] ?? 0;
      const cost = upgradeCost(u, rank);
      if (rank < u.max && save.gold >= cost) {
        save.gold -= cost;
        save.upgrades[id] = rank + 1;
        writeSave(save);
      } else if (rank < u.max) {
        ui.toast('Not enough gold.');
      }
      showTitle();
    },
  });
}

function start(): void {
  const hero = CHARACTERS.find((c) => c.id === save.selected) ?? CHARACTERS[0];
  const g = new Game(canvas, input, save, hero, {
    levelUp: (choices) =>
      ui.levelUp(
        g,
        choices,
        (i) => {
          g.choose(i);
          if (g.state === 'playing') ui.playing(togglePause);
        },
        () => g.reroll(),
      ),
    gameOver: finish,
    toast: (m) => ui.toast(m),
  });
  game = g;
  ui.playing(togglePause);
}

function togglePause(): void {
  if (!game) return;
  const g = game;
  if (g.state === 'playing') {
    g.state = 'paused';
    ui.pause(g, togglePause, () => g.quit());
  } else if (g.state === 'paused') {
    g.state = 'playing';
    ui.playing(togglePause);
  }
}

function finish(r: RunResult): void {
  save.gold += r.gold;
  save.runs++;
  if (r.victory) save.wins++;
  const newBest = r.time > save.best.time;
  save.best = {
    time: Math.max(save.best.time, r.time),
    level: Math.max(save.best.level, r.level),
    kills: Math.max(save.best.kills, r.kills),
  };
  writeSave(save);
  ui.gameOver(r, newBest, showTitle);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game?.state === 'playing') togglePause();
});

const ctx = canvas.getContext('2d')!;
let last = performance.now();
let idle = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) {
    if (input.consume('Escape', 'KeyP')) togglePause();
    game.frame(dt);
  } else {
    // Slow drifting ground behind the title screen.
    idle += dt;
    const w = canvas.clientWidth;
    const dpr = canvas.width / w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, idle * 25, idle * 12, w, canvas.clientHeight, idle);
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

// Open with ?debug to reach the running game from the console or a test.
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { ember: { game: () => game, save } });
}

showTitle();
requestAnimationFrame(frame);
