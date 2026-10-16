// Small static server for all games on the LAN. No dependencies.
// Run `npm run build` first, then `node server.mjs`. PORT and HOST env vars override the defaults.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT ?? 8090);
const HOST = process.env.HOST ?? '0.0.0.0';

const GAMES = [
  { dir: 'ember-swarm', title: 'Ember Swarm', icon: '🔥', style: 'Auto-shooter survival', color: '#ff9f1c', ready: true, added: '2026-10-15T19:28' },
  { dir: 'deckbound-spire', title: 'Deckbound Spire', icon: '🃏', style: 'Turn-based deckbuilder', color: '#9d4edd', ready: true, added: '2026-10-15T19:28' },
  { dir: 'neon-depths', title: 'Neon Depths', icon: '🔫', style: 'Twin-stick room clearing', color: '#00f5d4', ready: true, added: '2026-10-15T19:28' },
  { dir: 'dice-and-dungeons', title: 'Dice & Dungeons', icon: '🎲', style: 'Dice-placement puzzle combat', color: '#f4a261', ready: true, added: '2026-10-15T19:28' },
  { dir: 'hexfall-tactics', title: 'Hexfall Tactics', icon: '⬢', style: 'Grid-tactics squad', color: '#4895ef', ready: true, added: '2026-10-15T19:28' },
  { dir: 'peg-bounce', title: 'Peg Bounce', icon: '🔮', style: 'Physics pachinko combat', color: '#c77dff', ready: true, added: '2026-10-16T08:23' },
  { dir: 'high-card', title: 'High Card', icon: '🂡', style: 'Poker-hand scoring', color: '#e63946', ready: true, added: '2026-10-16T08:23' },
  { dir: 'last-bastion', title: 'Last Bastion', icon: '🏰', style: 'Run-based tower defense', color: '#2a9d8f', ready: true, added: '2026-10-16T08:23' },
  { dir: 'cave-diver', title: 'Cave Diver', icon: '🪢', style: 'Side-view platformer', color: '#e9c46a', ready: true, added: '2026-10-16T08:23' },
  { dir: 'loop-warden', title: 'Loop Warden', icon: '♾️', style: 'Loop auto-battler', color: '#90be6d', ready: true, added: '2026-10-16T08:23' },
  { dir: 'word-smith', title: 'Word Smith', icon: '🔤', style: 'Word-spelling combat', color: '#f77f00', ready: true, added: '2026-10-16T16:07' },
  { dir: 'chain-crawl', title: 'Chain Crawl', icon: '⛓️', style: 'Swipe-chain puzzle combat', color: '#06d6a0', ready: true, added: '2026-10-16T16:07' },
  { dir: 'beat-delver', title: 'Beat Delver', icon: '🥁', style: 'Rhythm dungeon crawler', color: '#ff006e', ready: true, added: '2026-10-16T16:07' },
  { dir: 'pack-rat', title: 'Pack Rat', icon: '🎒', style: 'Backpack-builder auto-battler', color: '#bc6c25', ready: true, added: '2026-10-16T16:07' },
  { dir: 'starward-drift', title: 'Starward Drift', icon: '🚀', style: 'Ship crew management with pause', color: '#48cae4', ready: true, added: '2026-10-16T16:07' },
  { dir: 'spin-lord', title: 'Spin Lord', icon: '🎰', style: 'Slot-machine deck builder', color: '#ffbe0b', ready: true, added: '2026-10-16T16:21' },
  { dir: 'conga-quest', title: 'Conga Quest', icon: '🐍', style: 'Snake-style party crawler', color: '#8338ec', ready: true, added: '2026-10-16T16:21' },
  { dir: 'cursed-fairway', title: 'Cursed Fairway', icon: '⛳', style: 'Golf roguelite', color: '#38b000', ready: true, added: '2026-10-16T16:21' },
  { dir: 'dome-digger', title: 'Dome Digger', icon: '⛏️', style: 'Mining plus wave defense', color: '#9c6644', ready: true, added: '2026-10-16T16:21' },
  { dir: 'silent-contract', title: 'Silent Contract', icon: '🕵️', style: 'Turn-based stealth heist', color: '#4361ee', ready: true, added: '2026-10-16T16:21' },
  { dir: 'block-siege', title: 'Block Siege', icon: '🧱', style: 'Falling-block combat', color: '#f72585', ready: true, added: '2026-10-16T16:27' },
  { dir: 'deep-lure', title: 'Deep Lure', icon: '🎣', style: 'Fishing roguelite', color: '#0096c7', ready: true, added: '2026-10-16T16:27' },
  { dir: 'rogue-rally', title: 'Rogue Rally', icon: '🏎️', style: 'Top-down racing roguelite', color: '#e85d04', ready: true, added: '2026-10-16T16:27' },
  { dir: 'dust-trail', title: 'Dust Trail', icon: '🐎', style: 'Caravan journey survival', color: '#d4a373', ready: true, added: '2026-10-16T16:27' },
  { dir: 'brew-rogue', title: 'Brew Rogue', icon: '⚗️', style: 'Potion-brewing roguelite', color: '#7209b7', ready: true, added: '2026-10-16T16:27' },
  { dir: 'sweep-saga', title: 'Sweep Saga', icon: '💣', style: 'Minesweeper roguelite', color: '#ef233c', ready: true, added: '2026-10-16T16:32' },
  { dir: 'pocket-wilds', title: 'Pocket Wilds', icon: '🐾', style: 'Monster-taming roguelite', color: '#06a77d', ready: true, added: '2026-10-16T16:32' },
  { dir: 'critter-clash', title: 'Critter Clash', icon: '🦊', style: 'Team auto-battler', color: '#fb8500', ready: true, added: '2026-10-16T16:32' },
  { dir: 'storm-haven', title: 'Storm Haven', icon: '🏘️', style: 'Settlement builder roguelite', color: '#2a9d8f', ready: true, added: '2026-10-16T16:32' },
  { dir: 'key-mage', title: 'Key Mage', icon: '⌨️', style: 'Typing roguelite', color: '#4cc9f0', ready: false, added: '2026-10-16T16:32' },
  { dir: 'grid-crawler', title: 'Grid Crawler', icon: '🗡️', style: 'Classic turn-based roguelike', color: '#adb5bd', ready: false, added: '2026-10-16T16:39' },
  { dir: 'bullet-bloom', title: 'Bullet Bloom', icon: '🌸', style: 'Vertical bullet-hell shooter', color: '#ff70a6', ready: false, added: '2026-10-16T16:39' },
  { dir: 'tower-topple', title: 'Tower Topple', icon: '🏗️', style: 'Physics stacking', color: '#ffb703', ready: false, added: '2026-10-16T16:39' },
  { dir: 'lane-push', title: 'Lane Push', icon: '🏹', style: 'Real-time lane attack', color: '#3a86ff', ready: false, added: '2026-10-16T16:39' },
  { dir: 'trade-winds', title: 'Trade Winds', icon: '⛵', style: 'Merchant trading', color: '#00b4d8', ready: false, added: '2026-10-16T16:39' },
  { dir: 'brick-rogue', title: 'Brick Rogue', icon: '🏓', style: 'Brick breaker', color: '#e76f51', ready: false, added: '2026-10-16T16:39' },
  { dir: 'solitaire-siege', title: 'Solitaire Siege', icon: '🂠', style: 'Solitaire card combat', color: '#9d0208', ready: false, added: '2026-10-16T16:39' },
  { dir: 'wild-camp', title: 'Wild Camp', icon: '🏕️', style: 'Survival crafting', color: '#606c38', ready: false, added: '2026-10-16T16:39' },
  { dir: 'street-brawl', title: 'Street Brawl', icon: '👊', style: 'Side-scrolling beat em up', color: '#d62828', ready: false, added: '2026-10-16T16:39' },
  { dir: 'duel-dojo', title: 'Duel Dojo', icon: '🥋', style: '1v1 fighting', color: '#f77f00', ready: false, added: '2026-10-16T16:39' },
  { dir: 'drift-rocks', title: 'Drift Rocks', icon: '☄️', style: 'Inertia space shooter', color: '#8ecae6', ready: false, added: '2026-10-16T16:39' },
  { dir: 'herd-path', title: 'Herd Path', icon: '🐑', style: 'Unit guiding puzzle', color: '#90e0ef', ready: false, added: '2026-10-16T16:39' },
  { dir: 'idle-empire', title: 'Idle Empire', icon: '🏛️', style: 'Incremental idle', color: '#ffd60a', ready: false, added: '2026-10-16T16:39' },
  { dir: 'crate-crypt', title: 'Crate Crypt', icon: '📦', style: 'Push-block puzzle', color: '#bb9457', ready: false, added: '2026-10-16T16:39' },
  { dir: 'pixel-oracle', title: 'Pixel Oracle', icon: '🔳', style: 'Nonogram logic', color: '#7678ed', ready: false, added: '2026-10-16T16:39' },
  { dir: 'dash-lanes', title: 'Dash Lanes', icon: '🏃', style: 'Endless lane runner', color: '#80ed99', ready: false, added: '2026-10-16T16:39' },
  { dir: 'ink-bridge', title: 'Ink Bridge', icon: '✏️', style: 'Line-drawing physics puzzle', color: '#ff5d8f', ready: false, added: '2026-10-16T16:39' },
  { dir: 'orbit-sling', title: 'Orbit Sling', icon: '🪐', style: 'Gravity slingshot', color: '#4361ee', ready: false, added: '2026-10-16T16:39' },
  { dir: 'time-bar-tales', title: 'Time Bar Tales', icon: '⏳', style: 'Turn-based JRPG party', color: '#c9184a', ready: false, added: '2026-10-16T16:39' },
  { dir: 'code-breaker', title: 'Code Breaker', icon: '🔐', style: 'Deduction puzzle', color: '#52b788', ready: false, added: '2026-10-16T16:39' },
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function launcher() {
  // The page renders the cards itself: sort, favorites and pages live in the browser.
  const data = JSON.stringify(GAMES.map((g, i) => ({ ...g, order: i })));
  const playable = GAMES.filter((g) => g.ready).length;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roguelites</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎮</text></svg>">
<style>
  :root { color-scheme: dark; --line: rgba(255,255,255,.12); --muted: #aaa; --accent: #ffd166; }
  body { margin: 0; min-height: 100vh; background: #0f0d12; color: #eee; font-family: system-ui, sans-serif; }
  main { width: min(960px, 100%); margin: 0 auto; padding: 24px 16px; box-sizing: border-box; }
  h1 { text-align: center; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: .06em; margin: 0; }
  .sub { text-align: center; color: var(--muted); margin: 4px 0 18px; }
  .bar { display: flex; justify-content: center; margin-bottom: 16px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .seg button { font: inherit; color: inherit; background: transparent; border: 0; padding: 8px 14px; cursor: pointer; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button[aria-pressed="true"] { background: rgba(255,209,102,.16); color: var(--accent); font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols, 4), 1fr); gap: 12px; }
  .card { position: relative; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
    background: color-mix(in srgb, var(--c) 8%, #16131a); transition: transform .1s, box-shadow .15s; }
  .card:hover { transform: translateY(-3px); box-shadow: 0 0 30px color-mix(in srgb, var(--c) 35%, transparent); }
  .card a { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 12px 14px; min-height: 150px;
    box-sizing: border-box; color: inherit; text-decoration: none; text-align: center; border-radius: 14px; }
  .card.soon a { opacity: .5; }
  .icon { font-size: 2.6rem; }
  small { color: var(--muted); }
  .date { font-size: .7rem; }
  .tag { margin-top: auto; font-weight: 700; color: var(--c); font-size: .9rem; }
  .fav { position: absolute; top: 6px; right: 6px; z-index: 1; font-size: 1.25rem; line-height: 1; padding: 6px; cursor: pointer;
    background: transparent; border: 0; color: #666; border-radius: 8px; }
  .fav:hover { color: #bbb; background: rgba(255,255,255,.06); }
  .fav[aria-pressed="true"] { color: var(--accent); text-shadow: 0 0 10px rgba(255,209,102,.6); }
  .pager { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 18px; flex-wrap: wrap; }
  .pager button { font: inherit; color: inherit; background: rgba(255,255,255,.05); border: 1px solid var(--line); border-radius: 10px;
    min-width: 38px; padding: 7px 10px; cursor: pointer; }
  .pager button:disabled { opacity: .35; cursor: default; }
  .pager button[aria-current="page"] { border-color: var(--accent); color: var(--accent); font-weight: 700; }
  .empty { text-align: center; color: var(--muted); }
</style></head>
<body><main>
  <h1>ROGUELITES</h1>
  <p class="sub">${GAMES.length} games · ${playable} playable</p>
  <div class="bar"><div class="seg" role="group" aria-label="Sort">
    <button data-sort="fav">★ Favorites</button><button data-sort="date">🕒 Newest</button><button data-sort="alpha">A–Z</button>
  </div></div>
  <div class="grid" id="grid"></div>
  <nav class="pager" id="pager" aria-label="Pages"></nav>
</main>
<script>
const GAMES = ${data};
const ROWS = 3, MIN_W = 160, GAP = 12;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let favs = new Set(store.get('roguelites.favs', []));
let sort = store.get('roguelites.sort', 'fav');
let page = 0;
const grid = document.getElementById('grid');
const pager = document.getElementById('pager');
const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const newest = (a, b) => b.added.localeCompare(a.added) || b.order - a.order;

function sorted() {
  const list = [...GAMES];
  if (sort === 'alpha') return list.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'date') return list.sort(newest);
  // Favorites first, then playable games, then the newest placeholders.
  return list.sort((a, b) => (favs.has(b.dir) - favs.has(a.dir)) || (b.ready - a.ready) || newest(a, b));
}

function cols() {
  return Math.max(1, Math.floor((grid.clientWidth + GAP) / (MIN_W + GAP)));
}

function card(g) {
  const fav = favs.has(g.dir);
  return '<article class="card ' + (g.ready ? '' : 'soon') + '" style="--c:' + g.color + '">'
    + '<button class="fav" data-fav="' + g.dir + '" aria-pressed="' + fav + '" title="' + (fav ? 'Remove from favorites' : 'Add to favorites') + '">' + (fav ? '★' : '☆') + '</button>'
    + '<a href="/' + g.dir + '/"><span class="icon">' + g.icon + '</span><b>' + g.title + '</b><small>' + g.style + '</small>'
    + '<small class="date">Added ' + fmt.format(new Date(g.added)) + '</small>'
    + '<span class="tag">' + (g.ready ? '▶ Play' : 'Coming soon') + '</span></a></article>';
}

function render() {
  const c = cols();
  grid.style.setProperty('--cols', c);
  const size = c * ROWS;
  const list = sorted();
  const pages = Math.max(1, Math.ceil(list.length / size));
  page = Math.min(Math.max(0, page), pages - 1);
  grid.innerHTML = list.slice(page * size, page * size + size).map(card).join('');
  for (const b of document.querySelectorAll('[data-sort]')) b.setAttribute('aria-pressed', String(b.dataset.sort === sort));
  let nav = '<button data-page="' + (page - 1) + '" ' + (page === 0 ? 'disabled' : '') + ' aria-label="Previous page">‹</button>';
  for (let i = 0; i < pages; i++) nav += '<button data-page="' + i + '"' + (i === page ? ' aria-current="page"' : '') + '>' + (i + 1) + '</button>';
  nav += '<button data-page="' + (page + 1) + '" ' + (page >= pages - 1 ? 'disabled' : '') + ' aria-label="Next page">›</button>';
  pager.innerHTML = pages > 1 ? nav : '';
}

document.addEventListener('click', (e) => {
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    const id = fav.dataset.fav;
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    store.set('roguelites.favs', [...favs]);
    return render();
  }
  const s = e.target.closest('[data-sort]');
  if (s) {
    sort = s.dataset.sort;
    store.set('roguelites.sort', sort);
    page = 0;
    return render();
  }
  const p = e.target.closest('[data-page]');
  if (p && !p.disabled) {
    page = Number(p.dataset.page);
    render();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { page--; render(); }
  if (e.key === 'ArrowRight') { page++; render(); }
});
let touchX = null;
grid.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
grid.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 60) { page += dx < 0 ? 1 : -1; render(); }
});
let lastCols = 0;
new ResizeObserver(() => {
  const c = cols();
  if (c === lastCols) return;
  // Keep the first card of the page in view when the column count changes.
  const first = page * lastCols * ROWS;
  lastCols = c;
  page = Math.floor(first / (c * ROWS));
  render();
}).observe(grid);
render();
</script></body></html>`;
}

async function sendFile(res, file) {
  const body = await readFile(file);
  // Vite puts a content hash in asset names, so they can be cached for long.
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
      return res.end(launcher());
    }
    const [, dir, ...rest] = path.split('/');
    const game = GAMES.find((g) => g.dir === dir);
    if (!game) {
      res.writeHead(404);
      return res.end('Not found');
    }
    if (rest.length === 0) {
      res.writeHead(301, { Location: `/${dir}/` });
      return res.end();
    }
    const dist = join(ROOT, dir, 'dist');
    const file = normalize(join(dist, ...rest));
    // Block "../" escapes out of the dist folder.
    if (file !== dist && !file.startsWith(dist + sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return await sendFile(res, file);
    if (info?.isDirectory()) return await sendFile(res, join(file, 'index.html'));
    res.writeHead(404);
    res.end(`Not found. Did you run "npm run build"?`);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Roguelites server on port ${PORT}`);
  console.log(`  http://localhost:${PORT}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('172.')) console.log(`  http://${a.address}:${PORT}/`);
    }
  }
});
