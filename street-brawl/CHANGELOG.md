# Changelog

## 2026-10-16
- Smoothed the district curve (`src/game.ts`, `src/data.ts`) — most good-bot losses happened in The Docks. Docks pool now has fewer Bruisers and Tossers (weight 2 → 1 each, Grunt 4 → 5). Enemy HP per district is ×1/1.28/1.5/2.15/2.7 and damage ×1/1.2/1.32/1.85/2.2 (was linear +28% / +20%). Good bot now wins 48–55%, and its losses spread over districts 3–5 (Rex 13/24/14, Mika 16/19/16, Tank 7/17/18 per 100 runs). Weak and random bots still win 0%.
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the beat 'em up design from the roguelites plan is now playable.
  - 2.5D street with depth, jumps, depth sorting and a camera that locks during fights.
  - Fixed 60 Hz simulation with a 10-frame input buffer, light strings, heavies, launchers and juggles, hitstun, knockdowns, grabs, knees and throws into other enemies.
  - 3 fighters (Rex, Mika, Tank) with their own strings and starting specials, 6 specials with cooldowns, 5 weapons with durability, 3 breakable props and 3 foods.
  - 5 enemy types with group AI (attack tokens, waiting spots on both sides, side switching) and 5 district bosses that call helpers.
  - 5 districts with a branching 5-step map, shops, diners, 10 upgrades, extra lives and a free upgrade after each boss.
  - Juice: hit-stop, screen shake, white hit flashes, squash on landing, sparks, shards, dust, floating numbers, combo counter, attack telegraphs, WebAudio sounds.
  - Keyboard, mouse, gamepad and touch (stick and buttons). Save and continue (`sb.run`, `sb.meta`), star unlocks for fighters. Debug API (`?debug`, `window.debug`).
- Balance after sim runs (100 runs per bot and fighter): good bot wins 46–60%, weak and random bots win 0%.
  - Bruiser Belly Slam: startup 20 → 24 frames, damage 13 → 11, poise 22 → 16 — it was the top damage source by far.
  - Bottle toss: damage 9 → 8, shared cooldown 70 → 80 frames — Tossers caused most damage once the bot dodged melee.
  - Waves: 2 + district/2 + wave enemies (was 3 + 0.7 × district + wave). Attackers at once 1/1/2/2/3 (was 1/2/2/3/3) — district 2 and 3 were walls.
  - Enemy damage +20% per district, HP +28% per district (were +17% and +24%) — with a reacting bot the later districts were too easy.
  - Tank: HP 140 → 125, throw 30 → 26 — Tank won 93% of good-bot runs.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
