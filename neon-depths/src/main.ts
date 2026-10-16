import './style.css';
import { Game, type RunResult } from './game';
import { Input } from './input';
import { ITEMS } from './items';
import { randomSeedText } from './math';
import { HUB_UPGRADES, LOADOUTS, loadSave, upgradeCost, writeSave } from './meta';
import { initAudio, isMuted, toggleMute } from './sfx';
import { UI } from './ui';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ui = new UI(document.querySelector<HTMLElement>('#ui')!);
const touchBtns = document.querySelector<HTMLElement>('#touch')!;
const input = new Input(canvas);
const save = loadSave();
if (save.muted !== isMuted()) toggleMute();
let game: Game | null = null;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

function mute(): void {
  save.muted = toggleMute();
  writeSave(save);
}

function showTitle(): void {
  game = null;
  touchBtns.hidden = true;
  ui.title(save, {
    play: start,
    select(id) {
      save.selected = id;
      writeSave(save);
      showTitle();
    },
    unlock(id) {
      const l = LOADOUTS.find((x) => x.id === id);
      if (l && save.shards >= l.price) {
        save.shards -= l.price;
        save.unlocked.push(id);
        save.selected = id;
        writeSave(save);
      }
      showTitle();
    },
    buy(id) {
      const u = HUB_UPGRADES.find((x) => x.id === id);
      if (!u) return;
      const rank = save.upgrades[id] ?? 0;
      const cost = upgradeCost(u, rank);
      if (rank < u.max && save.shards >= cost) {
        save.shards -= cost;
        save.upgrades[id] = rank + 1;
        writeSave(save);
      }
      showTitle();
    },
    mute() {
      mute();
      showTitle();
    },
  });
}

function start(seed = ''): void {
  initAudio();
  ui.hide();
  save.runs++;
  writeSave(save);
  game = new Game(canvas, input, save, seed || randomSeedText(), finish, pause);
  if (debug) (window as unknown as { neon: unknown }).neon = debugApi(game);
}

function pause(): void {
  if (!game) return;
  const g = game;
  ui.pause(g, {
    resume() {
      ui.hide();
      g.resume();
    },
    quit() {
      ui.hide();
      g.resume();
      g.quit();
    },
    mute() {
      mute();
      pause();
    },
  });
}

function finish(r: RunResult): void {
  save.shards += r.shards;
  save.bestFloor = Math.max(save.bestFloor, r.floor);
  if (r.won) save.wins++;
  writeSave(save);
  touchBtns.hidden = true;
  ui.results(r, {
    again: () => start(),
    hub: showTitle,
  });
}

// Touch buttons send the same presses as keys.
touchBtns.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.press(b.dataset.key!);
  });
});

// Pause when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && game.state === 'play') input.press('Escape');
});

const debug = new URLSearchParams(location.search).has('debug');
function debugApi(g: Game) {
  return {
    game: g,
    god: () => (g.god = !g.god),
    give: (id: string) => g.giveItem(id),
    items: () => ITEMS.map((i) => i.id),
    kill: () => g.enemies.forEach((e) => g.killEnemy(e, true)),
    coins: (n = 50) => (g.player.coins += n),
    speed: (n: number) => (steps = Math.max(1, Math.min(8, Math.round(n)))),
  };
}

let steps = 1; // debug speed-up: updates per frame
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) {
    touchBtns.hidden = !input.touch || game.state === 'over';
    for (let i = 0; i < steps && game; i++) game.update(dt);
    if (game) game.draw();
  } else {
    drawIdle(now / 1000);
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

function drawIdle(t: number): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(61,242,255,0.12)';
  ctx.lineWidth = 1;
  const step = 48;
  const off = (t * 20) % step;
  ctx.beginPath();
  for (let x = -step; x < W + step; x += step) {
    ctx.moveTo(x + off, 0);
    ctx.lineTo(x + off, H);
  }
  for (let y = -step; y < H + step; y += step) {
    ctx.moveTo(0, y + off);
    ctx.lineTo(W, y + off);
  }
  ctx.stroke();
}

showTitle();
requestAnimationFrame(frame);
