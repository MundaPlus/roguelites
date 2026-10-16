# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the 1v1 fighting design from the roguelites plan is now playable.
  - Pure 60 Hz fight engine with frame data, per-frame hitboxes and hurtboxes, mid/low/high/throw levels, cancels, combo scaling, counter hits, an 8-frame input buffer and optional motion inputs.
  - Throws with a 10-frame break window, command grabs, projectiles that clash, a counter stance, a super meter with 5 supers.
  - 5 fighters, 12 specials, 18 techniques (5 stats, 13 passives), 10 opponents in 5 AI styles plus the Oni Shogun boss, 5 stages.
  - AI with a reaction delay per ladder rung: it blocks what it sees, anti-airs, punishes recovery, breaks throws and finishes combos.
  - Vector fighters with IK poses, camera zoom, hit-stop, flashes, sparks, screen shake, KO slow motion, WebAudio sounds.
  - Keyboard, gamepad and touch controls. Honor meta shop for fighters and stages. Debug API (`?debug`, `window.debug`).
- Balance after bot runs (headless sim, 200 runs per fighter):
  - Enemy damage ×0.5 at fight 1 up to ×0.88 for the boss, and enemy HP ×0.7 up to ×1.15 — at full values the good bot lost about 40 HP per fight and never cleared the ladder.
  - Heal after a win raised from 20% to 35% of max HP — HP carry-over drained even good runs by fight 4.
  - The opponent AI gets a guard habit near the player and the throw got a break window — before that, reaction blocking almost never worked and the good bot was barely better than the weak bot.
  - Rook throws ×1.4 → ×1.15 and HP 128 → 118, Mei and Zed got more HP and damage, Oni HP 112 → 104 — Rook won 42% and Mei 2%.
  - Result: good bot 31–39% wins with the 4 base fighters (64% with the unlockable Oni), weak bot 2–17%, random mashing 0–1%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
