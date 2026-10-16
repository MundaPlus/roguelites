# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The FTL-like design from the roguelites plan is now playable.
  - Fixed-step ship combat with pause: rooms, doors, reactor power, 6 systems, shields, evasion, fires, breaches, air, ion and an FTL drive to flee.
  - Crew walk with BFS path finding, fight fires, seal breaches, repair, man stations and gain skills. Optional auto crew. The enemy uses the same sim and AI.
  - 16 weapons (laser, missile, beam, ion, flak), 5 crew races, 9 augments, 4 player ships with unlocks, 8 enemy types, 6 sectors, 18 events, stores, upgrades and a two-phase Rebel Flagship.
  - Sector maps with a rebel fleet that advances each jump. Save and continue (also mid-fight), meta stats, help, menu, mute.
  - Mouse, keyboard and touch input. Stacked ship view and vertical map on phones. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after headless bot runs (good bot win rate 29–56% per ship, weak bot 0%):
  - Fight scrap raised to 15–24 + 7–8 per sector, reactor and shield upgrades cheaper. The good bot won 0% because it could not afford upgrades.
  - Fuel: 16 at start, +2 per new sector, 75% fuel drop chance, 3 hull per jump with no fuel. Many runs ended out of fuel before.
  - Flagship: hull 20, 2 shield layers, phase 2 at 50% hull with one extra shield bar and an ion gun. The first version killed 39 of 40 upgraded ships.
  - Enemy hull growth 2 per sector and a third weapon only from sector 6 on. Sector 5–6 fights caused most deaths.
  - Ion stacks last 4.5–5 s and Ion Blast charges in 9 s. The ion ship Torus won 71% before. Basalt Hammer got a Burst Laser I and Lantern a Basic Laser. They won 3% and 19% before.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`). The game is ready to build next.
