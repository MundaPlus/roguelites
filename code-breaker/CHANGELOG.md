# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the deduction design from the roguelites plan is now playable.
  - Locks with 4–5 pegs and 5–8 colors, with or without repeats. Exact and color hints, with pins and numbers.
  - 4 special lock types (Liar, Shifter, Blind, Timed), 4 tools paid with energy, 12 gear.
  - 3 floors of doors with loot, shop and mystery rooms, floor vaults and a final vault of 3 tumblers.
  - A solver that lists the codes that still fit. It drives the Solver Lens helper, the door difficulty and the bots.
  - Workshop with 6 unlocks paid with keys. Records and a lock type list on the title screen.
  - Colorblind-friendly pegs (each color has a symbol). Mouse, touch and keyboard input. Save and continue.
  - Debug API (`?debug`, `window.debug`) for bot tests.
- Balance after headless sims: tries cut to 5–6 per lock (+2 on Liar, +1 on Blind), tool costs raised (Purge 5, Reveal 9), lock energy lowered to 1 + tries left, vaults no longer heal — at the first values a weak bot won 79% and a good bot 100%. Now the weak bot wins 5.5%, the good bot 44%.

## 2026-10-16
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
