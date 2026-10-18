// Build a static copy of the launcher and all built games into site/ for GitHub Pages.
// Run `npm run build` first. The launcher links are relative, so the site works under any path.
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, launcher } from '../server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'site');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'index.html'), launcher());
// Pages must not run Jekyll on the files.
await writeFile(join(OUT, '.nojekyll'), '');
for (const g of GAMES) {
  const dist = join(ROOT, g.dir, 'dist');
  if (!(await stat(dist).catch(() => null))) throw new Error(`Missing ${g.dir}/dist. Run "npm run build" first.`);
  await cp(dist, join(OUT, g.dir), { recursive: true });
}
console.log(`site/: launcher and ${GAMES.length} games`);
