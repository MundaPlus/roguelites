# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the survival crafting design is now playable.
  - Seeded 72×72 world with 4 biomes, ponds, 21 node types that grow back, spawner dens and an ancient gate.
  - 30 Hz simulation: hunger, health, sanity, body heat, day/dusk/night with a light layer, darkness attacks, 4 seasons.
  - 56 items, 28 recipes in 3 tiers, food that spoils, tools and armor that wear out, cooking, traps, drying rack, sleeping.
  - 7 creatures with day and night behavior, wolf pack nights, 4 season bosses with slam attacks.
  - 6 survivors unlocked by total days survived. Save at dawn, title stats.
  - Keyboard, mouse (click to walk and act) and touch (stick and buttons). Debug API (`?debug`, `window.debug`) with a survival bot.
- Balance after sim runs (good bot 54%, weak and random bots 0%):
  - No boss in the first autumn and boss on season day 2 — the autumn boss on day 3 killed most runs before the bot had gear.
  - Neutral boars and yaks only charge when hit, and only nearby yaks join — whole herds charging killed geared bots.
  - Longer creature attack cooldowns (2–3 s), 1 guard den per part, smaller wolf packs (1 + day / 5 from day 5) — bots died to packs of 4.
  - Clothes cannot warm you above 50°, winter air 10° / −8° — with fur gear the bot overheated in winter.
  - Slow health regen when fed, log armor 400 durability, Frost Giant 1800 HP, Bog Moose 1500 HP, Odo +30% damage — the good bot won 60–80%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
