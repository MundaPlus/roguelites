# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the forget-and-echo design is now playable.
  - Memory slots with a forced forget. The forget window shows each echo's HP, moves and floor.
  - Echoes come back 3 floors later, flee when the last monster falls, and wait at the final boss. The Hollow Mind calls them back.
  - Echo ledger panel, 👻 floor markers on the map, and an echo banner in fights.
  - 20 skills with 3 levels, 12 relics, 15 monsters, 3 elites, 3 bosses over 3 acts.
  - Rooms: fight, elite, shrine (learn, +1 slot for 8 max HP, upgrade), rest. Free upgrade per defeated echo.
  - Unlocks paid with petals: 4 skills and 2 starting bars. Save and continue in `localStorage`.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after the sim (`smart` fight bot, 600 runs): normal monsters +20% / +40% HP and +15% / +30% damage in acts 2 and 3. At +15% / +30% HP and +10% / +20% damage, the weakest-forget bot won 66%.
  - Result: forget weakest 58%, forget random 20%, hoard slots 14%, forget strongest 0%, random play 0%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
