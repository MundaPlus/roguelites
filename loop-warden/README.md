# Loop Warden

Loop-building auto-battler roguelite (like Loop Hero). Status: design only. The page is a placeholder.

## Play style

Strategy without direct control. Your hero walks a loop road and fights alone. You place tile cards around the loop. Tiles spawn enemies and give resources, so you choose how hard the loop gets.

- Road tiles: graveyard, grove, vampire mansion. They spawn enemies on the road.
- Side tiles: meadow (heals), mountain (max HP), forest (attack speed).
- Special tiles: lantern (fewer spawns near it), beacon (hero moves faster).
- Some tiles change when they are next to each other (for example, 10 mountains make a peak).

## Run loop

1. Each loop has a few days. Every day, enemies spawn and you draw new cards.
2. Killed enemies drop equipment and tile cards. Equip the hero between fights.
3. A boss meter fills when you place tiles. When it is full, the boss appears at the camp.
4. Retreat at the camp to keep all resources. Death keeps only 30%.
5. Resources build the camp between runs. The camp unlocks new tiles, classes and perks.

## Core systems

- **Hero**: class, HP, damage, defense, attack speed, vampirism, evasion.
- **Combat**: automatic, with time-based attack speed. You can pause and change gear.
- **Tiles**: placement rule, spawn rule, buff, neighbor combos.
- **Meta camp**: buildings that unlock content.

## Tech plan

- Canvas 2D for the loop map, DOM for cards and gear.
- Time scale with pause, 1×, 2×, 3×.
- Data-driven tiles: `canPlace(cell)`, `onDay(ctx)`, `neighbors`.
