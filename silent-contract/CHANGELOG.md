# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the stealth heist design from the README is now playable.
  - Pure turn resolver `apply(state, action)` with undo, guard plans shown on the board, view cones, cover, peeking, fog of war.
  - Seeded facility generator from 9 room templates with doors, arches, terminals, safes, cameras and guard routes.
  - 8 agents, 10 gadgets, 8 implants, 5 guard types, 6 alarm levels with a rule each, 6 job types and a 6-day campaign that ends in the Vault.
  - Safehouse shop, skill training, hiring, intel unlocks for agents and starting loadouts.
  - Mouse, keyboard and touch input. WebAudio sounds. Debug API (`?debug`, `window.debug`) with a weak and a smart bot.
- Balance after headless bot runs — the first version was too harsh for any careful player:
  - Removed overwatch shots during the player turn. A spotted agent now gets one turn to react.
  - Guard and camera range 5 → 4. Fewer guards per security level (2 + (security − 1) / 2, max 5).
  - Alarm level every 6 ticks instead of 5. Drones add 1 alarm, cameras 2. Level 6 no longer makes every guard hunt.
  - Agents +1 HP. Start with 3 agents. Cameras are on the building plan. Agents only walk on known tiles.
  - Security grows slower with the day. The Vault has 4 guards with the captain, starts at alarm 0, and its target needs 4 power.
  - Result over 300 runs: the weak bot wins about 0–1%, the smart bot about 30%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
