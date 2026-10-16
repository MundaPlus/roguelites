# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the Dredge-like design is now playable.
  - Seeded sea map with 5 regions, ports, islands, rocks, fishing spots, explored fog and fog walls on closed regions.
  - Boat with momentum, a day/night clock, panic, shades, phantom rocks and 8 night events.
  - Reel minigame with 5 fight patterns, rod strength, line strain and snapping lines.
  - Grid hold with 25 fish shapes, rotation and moving fish. Aberrant fish with 4 curses.
  - 5 ports with markets, daily wanted fish, shipwrights, lures, repairs and the harbormaster.
  - 5 gear slots with 4 tiers, 5 lures, repair kits. Rare fish open new regions.
  - Title with Dockyard unlocks (pearls) and a species journal. Save and continue.
  - Mouse, touch and keyboard input. WebAudio sounds. Debug API (`?debug`, `window.debug`) and a headless sim (`src/sim.ts`).
- Balance after bot sims (100 seeds): weak bot 0% wins, good bot 50% wins.
  - Big divers could not be landed with any rod. Better rods now give line faster (slack 0.7 + 0.15 × strength), and dives are weaker.
  - Rare key fish weight 1.8 and one deep spot per region — at first some maps had no spot for the Golden Grouper, so Ashen Flats never opened.
  - Debt 10,000 — at 5,000 and 7,000 the good bot won 95% or more, at 11,000 it won 42%.
  - Bot path finding treats blocked cells as costly instead of closed — boats in tight pockets could not find a way out.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
