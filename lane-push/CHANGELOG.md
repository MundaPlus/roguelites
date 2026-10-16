# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The lane attack design from the roguelites plan is now playable.
  - Fixed-tick battle sim (30 ticks/s) with 3 lanes, energy, a deck of 8, a hand of 4 and a shown next card. Both sides play through the same `deploy()` rules.
  - 24 cards (17 units, 7 spells): ground, air, tower-only, splash, ranged, tank and swarm units. 8 of them are meta unlocks.
  - Enemy AI with its own deck and energy. It reads threats per lane and plays counters (splash against swarms, anti-air against flyers, damage or swarms against tanks).
  - Arrow, cannon and healing towers, 6 tower layouts, a keep that wakes up, and 3 bosses with powers.
  - Map with battles, elites, shops, camps and bosses over 3 acts. Card draft, upgrades to level 4, 10 perks, camp HP across battles.
  - Drag, tap and keyboard input. Effects, floating numbers, screen shake and WebAudio sounds. Debug API (`?debug`, `window.debug`).
- Balance after headless bot runs (`src/ai.ts` bots, 200 runs each): weak bot 0% run wins, good bot 49%.
  - Tower HP 1500 → 1150 and keep HP 2600 → 1800, tower damage lower. At the first values the good bot won no run.
  - Enemy energy rate ×0.45 / ×0.55 / ×0.62 per act and player energy ×1.15. The defender with full energy countered every push.
  - Units walk 45% faster. Battles ran out of time before a push reached the keep.
  - Fixed a lane clamp that kept melee units from reaching the keep.
  - P.E.K.K.A, Baby Dragon, Witch, Golem, Balloon and Lightning made weaker. With all unlocks the good bot still wins 79%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
