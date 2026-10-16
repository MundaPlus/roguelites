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
  { dir: 'ember-swarm', title: 'Ember Swarm', icon: '🔥', style: 'Auto-shooter survival', color: '#ff9f1c', ready: true },
  { dir: 'deckbound-spire', title: 'Deckbound Spire', icon: '🃏', style: 'Turn-based deckbuilder', color: '#9d4edd', ready: true },
  { dir: 'neon-depths', title: 'Neon Depths', icon: '🔫', style: 'Twin-stick room clearing', color: '#00f5d4', ready: true },
  { dir: 'dice-and-dungeons', title: 'Dice & Dungeons', icon: '🎲', style: 'Dice-placement puzzle combat', color: '#f4a261', ready: false },
  { dir: 'hexfall-tactics', title: 'Hexfall Tactics', icon: '⬢', style: 'Grid-tactics squad', color: '#4895ef', ready: false },
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
  const cards = GAMES.map(
    (g) => `<a class="card ${g.ready ? '' : 'soon'}" href="/${g.dir}/" style="--c:${g.color}">
      <span class="icon">${g.icon}</span>
      <b>${g.title}</b>
      <small>${g.style}</small>
      <span class="tag">${g.ready ? '▶ Play' : 'Coming soon'}</span>
    </a>`,
  ).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roguelites</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; background: #0f0d12; color: #eee; font-family: system-ui, sans-serif; display: grid; place-items: center; }
  main { width: min(900px, 100%); padding: 24px 16px; box-sizing: border-box; }
  h1 { text-align: center; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: .06em; margin: 0 0 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 12px; border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); background: color-mix(in srgb, var(--c) 8%, #16131a);
    color: inherit; text-decoration: none; text-align: center; transition: transform .1s, box-shadow .15s; }
  .card:hover { transform: translateY(-3px); box-shadow: 0 0 30px color-mix(in srgb, var(--c) 35%, transparent); }
  .card.soon { opacity: .5; }
  .icon { font-size: 2.6rem; }
  small { color: #aaa; }
  .tag { margin-top: 6px; font-weight: 700; color: var(--c); font-size: .9rem; }
</style></head>
<body><main><h1>ROGUELITES</h1><div class="grid">${cards}</div></main></body></html>`;
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
