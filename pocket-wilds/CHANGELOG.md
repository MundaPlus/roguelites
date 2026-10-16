# Changelog

## 2026-10-16
- Built the full game (`src/*.ts`, `src/style.css`, `index.html`, `README.md`). The monster-taming design is now playable.
  - 43 original species in 8 types with a type chart, base stats, natures, learnsets and evolutions. 46 moves with burn, poison, sleep, paralysis, stat stages, drain, heal, recoil, priority and high crit.
  - Pure battle function `battleTurn(state, choice)` with speed order, accuracy, crits and taming with charms. Trainer AI picks moves by expected damage.
  - 5 regions with branching route steps (wild, rare den, trainer, supplies, rest), towns with healer, shop, move tutor and fusion shrine, 4 of 7 gym leaders and the Champion.
  - XP, level-ups, move replacement, evolution, permadeath, team of 6, Sanctuary unlocks, save and continue.
  - Mouse, keyboard and touch input. Debug API (`?debug`, `window.debug`) with a smart bot.
- Balance after bot runs (weak bot 0%, smart bot 29% wins):
  - Starters at level 7 with a free level 6 buddy. With 1 starter, almost every run ended in the first region.
  - Max HP ×1.6, 25% heal after each battle and faster XP (0.4·L² + 5·L per level, scaled by level difference). Before, attrition killed teams before gym 1.
  - Status moves come later in learnsets. Early sleep moves decided too many fights.
  - Heal moves work 2 times per battle. A healing foe could stall a battle forever.
  - Gym teams start at their base forms, and early gyms are smaller (2, 3, 3, 4 creatures at level 7, 12, 20, 28). The Champion has 5 creatures at level 33–35. Gym 1 stopped 60% of smart runs before.
  - Route trainers make a random move 30% of the time, leaders 12%, the Champion 5%. Perfect play by every trainer kept the smart bot under 20%.
  - Sanctuary rares appear only in rare dens. In the common pools they made unlocks a handicap.
  - Beast moves are no longer strong against Storm. Every creature has Beast moves, so this hit Storm creatures too hard.
- Created the project with a placeholder page and a design README (`README.md`, `src/main.ts`). The game is ready to build next.
