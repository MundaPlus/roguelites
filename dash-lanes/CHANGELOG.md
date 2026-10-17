# Changelog

## 2026-10-17 (fairness pass)
- Logged every crash and shield hit of a perfect-reaction bot over 300 runs, then fixed the causes (`src/game.ts`, `src/data.ts`, `src/bot.ts`) — an unavoidable crash feels unfair.
  - Boss attacks now smash all lane blockers from the runner to past the hit point, and every obstacle near the hit point. Before, the escape lane could be blocked 10 m after a beam, or a barrier came right after a slam.
  - The join gap between chunks is now at least 0.55 s at the current speed.
  - The input buffer keeps only the newest jump or slide. Before, old buffered jumps could fire on landing and send the runner into a bar.
  - Spaced out 6 chunks that needed 2 moves too close together (`ride-right`, `gauntlet`, `stairs`, `tunnel`, `weave`, `rush-hops`).
  - The bot can now plan "wait, then act". Before, it jumped too early before slams.
- Rebalance: speed ramp 0.0052, higher chunk difficulty per stage, faster boss attacks, a more expensive shop shield and extra hit. The good bot now has a 0.26 s reaction time.
- Result (sim): perfect bot 0 crashes in 300 runs (was about 9%), good bot 46%, weak bot 8%, random 0%.

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the lane runner design is now playable.
  - Pseudo-3D Canvas view, 3 lanes, jump, slide and lane switch with a short input buffer. Swipe, tap, mouse and keyboard input.
  - 38 chunks rated 1 to 5 (barriers, bars, walls, trains, oncoming trains, carts), 6 zones, 3 bosses with telegraphed attacks.
  - 4 power-ups, 11 perks, a gate shop, a 3300 m goal and endless mode after it. 5 runners unlocked with gems.
  - Save and continue at each gate. Debug API (`?debug`, `window.debug`) with a lookahead bot.
- Balance after sim runs: speed ramp 0.0036 → 0.0047 m/s per m, smaller gaps between chunks and a higher difficulty per stage — the good bot won 88% before, now 52%. The weak bot wins 6%, random keys 0%.
- Fixed unfair chunks found by the bot: 2 carts side by side could block all lanes, and a jump-then-slide chunk was too short.

## 2026-10-16
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
