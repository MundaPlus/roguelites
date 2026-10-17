# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the bluffing design is now playable.
  - Two-step rounds: claim, read the foe's claim and tell, then act. A reveal box shows both claims, both picks and the result.
  - "How it sees you" panel: trust, the actions it expects, its best answer and its second-guess rate, updated each round.
  - 4 foe types (gullible, paranoid, statistician, mirror) with their own belief models. 12 foes and 3 champions that change type as their HP drops.
  - Readable tells per foe (calm and nervous faces) that show the truth 65–80% of the time.
  - 16 moves, 14 relics (2 active), a run record that new foes hear about, shard unlocks, save and continue.
  - Mouse, touch and keyboard input. Debug API (`?debug`, `window.debug`) with the adaptive bot.
- Balance after 600 sim runs per bot: adaptive bot 55%, always honest / always lie / random / alternate 0%, model-only 1.5%.
  - Added the second-guess rate (grows when you win rounds) — without it the adaptive bot won 100% of runs.
  - Foes bluff more when you keep countering their claims — a bot that only countered calm claims won 40%.
  - Enemy HP ×1.4 and damage ×1.6–2.2, and 2 duels per hall instead of 3 — the adaptive bot still won 97% at base values.
- Retuned the balance for human players (`src/data.ts`, `src/duel.ts`, `src/run.ts`) — before, every bot except the adaptive one won 0–1.5% and naive play died in hall 1.
  - Hall 1 is a tutorial: it opens with the gullible Drunk Sailor. Its foes have 11–18 HP, deal 2–5 damage and have tells that are true 80–85% of the time. Madame Fortune is now paranoid first, then gullible.
  - Foes pick at random in 20% of rounds (was 6%). Their choice is looser (temperature ×1.5). This narrows the gap between a perfect reader and a half-skilled one.
  - Hall 2 and 3 foes have 10% less HP and damage. Their tells are true 60–70% of the time. The Faceless King has 50 HP.
  - The second-guess rate grows faster (+16% per lost round for the foe). Foes bluff only a little more when you keep countering their claims (was a big jump).
  - New sim numbers (600 runs): adaptive 71.5%, model-only 17.8%, honest + counter calm claims 10.5%, fixed strategies 0% but 32–87% reach hall 2. Runs take about 65 rounds (was about 85).
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
