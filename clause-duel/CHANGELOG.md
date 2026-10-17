# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the clause draft is now playable.
  - Draft table: an offer of 6 clauses, alternating picks, Take or Burn on each pick. Each card shows a sim preview (HP you lose, win chance) for "you take" and "foe takes".
  - The foe shows its top 2 wishes with short reasons and always picks its ① wish.
  - Pure fight engine with 24 clauses (12 laws, 12 holder clauses) hooked into order, guard, hits, heals and round start. Short fights with Attack, Guard and Special. Each intent button shows the exact round result.
  - 4 fighters, 15 foes, 3 elites, 3 bosses with a sealed clause, 4 perks, 5 upgrades, scribe shop, rest, 3-act map. Archive with 7 unlocks.
  - Save and continue, help, menu, mute, keyboard and touch input, debug API (`?debug`, `window.debug`).
  - On a 390×844 phone the toast sits in the left part of the top bar, and floating numbers stay inside the fighter boxes. Neither covers the main controls.
- Balance after sim runs: lower foe ATK and HP in acts 2–3, stronger clause numbers (Edge +3, Bulwark +5, Leech 3, Head Start 10, Opening Blow +8), rest heal 35% → 40%, boss heal 40% → 50% — at first both drafters lost almost every run, and the good drafter saved only about 3 HP per fight.
- Fighters: Warden HP 44 → 40 and Guard 8 → 7; Cleric and Venomist ATK 5 → 6 — Warden won 72% with a good draft, Cleric 13%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
