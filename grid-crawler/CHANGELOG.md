# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The classic roguelike design is now playable.
  - Rooms-and-corridors generator with doors, shadow casting field of view and tile memory (`src/map.ts`).
  - Pure turn function `act(state, action) => state` with an energy queue, bump attacks, sneak attacks, monster AI (sleep, wander, hunt, flee, packs, ranged, casters), traps and level ups (`src/game.ts`).
  - 24 monsters with a dragon boss on floor 12, 9 potions, 8 scrolls and 5 wands with random names per run, 7 weapons, 6 armors, 5 traps, 4 classes unlocked with renown.
  - Canvas renderer with tweens, floating numbers, bolts, shake and a message log. Keyboard (arrows, numpad, vi keys), tap-to-move with path finding, auto-explore, rest and on-screen buttons.
  - Save and continue (`gridcrawler.run`, `gridcrawler.meta`), help, menu, mute, debug API (`?debug`, `window.debug`).
- Balance after headless bot runs (good bot, 60 runs per class: warrior 47%, rogue 40%, mage 40%, paladin 50%; weak bot 0/100):
  - Monster HP +16% and damage +1 per 2 floors below their first floor, and more monster groups per floor. At base values the good bot won every run.
  - Steeper XP table and less max HP per level (2 + strength/4). The good bot reached level 25 with 300 HP.
  - Strength adds damage / 3 instead of / 2, and healing potions heal 50% instead of 60%.
  - Paladin: 30 HP, agility 2, wits 3, Mace +0, heals 50% faster (was 2× faster). It won 83% of runs. Rogue: agility 6, Dagger +1. It won 84%.
  - Known traps trigger only 30% of the time. A teleport trap in a corridor could trap a player in a loop.
  - Renown is score / 60, so the first death does not unlock every class.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
