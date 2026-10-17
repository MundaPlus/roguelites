# Changelog

## 2026-10-17
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`) — the lamp-moving design is now playable.
  - Pure shadow rules in `src/battle.ts`: lamps light figures in reach, walls block light, shadows continue the lamp-figure line, clashes stop crossing shadows.
  - Live preview of every shadow, hit, clash and heal while you drag or point. Blue dotted shadows for you, red striped shadows for enemies.
  - 5 lamps, 5 figures, 7 enemies, 3 multi-tile bosses, 3 acts with doors (fight, elite, hearth), 9 upgrade types, 4 unlocks.
  - Save and continue, meta stats, help and menu modals, mute, mouse, touch drag and keyboard input. Debug API (`?debug`, `window.debug`).
- Balance after bot runs (`resolve`-based sim, 200 runs per bot):
  - Shadows use the exact lamp-figure line instead of 8 directions — with 8 directions most enemies could never be hit.
  - Lantern shadow 2 → 3, candle 1 → 2, imps walk — rooms stalled with no hits at the short lengths.
  - Enemies ignore danger and walk by path distance — they hid behind walls and the dark decided every room.
  - The dark hurts both sides and grows each turn — rose-lamp healing could block it forever, and corner stalemates were auto-losses.
  - Hero HP +1 and 2 HP heal after each room — the search bot won 7% before, 50% after. The random bot wins 0%.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`) — the game is ready to build next.
