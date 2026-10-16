# Sweep Saga

Minesweeper roguelite roguelite (like Dragonsweeper / DemonCrawl). Status: design only. The page is a placeholder.

## Play style

Logic puzzles with HP. Each floor is a grid of hidden tiles. A number clue shows the total strength of the monsters next to it, not only how many there are.

- Click a safe tile to open it. Opening tiles and killing monsters gives XP.
- Click a revealed monster to fight it. You lose HP equal to its strength and gain its XP.
- A level up refills your HP and raises your max HP.
- Mark tiles with the strength you think they hide. The game checks nothing until you click.

## Run loop

1. 10 floors. Each floor is bigger and has stronger monsters.
2. Items in the grid: potions, scrolls (reveal an area), keys and chests.
3. Special monsters break the clues: a mimic shows a wrong number, a ghost does not count, a gazer hides the numbers near it.
4. The floor boss is the strongest monster on the floor. Kill it to open the stairs.

## Core systems

- **Grid**: hidden tiles, monster strength, clue sums, flood fill for zero tiles.
- **Generator**: places monsters so the first click is always safe, and checks that the floor can be solved by logic.
- **Hero**: HP, level, XP curve, item slots.
- **Monsters**: strength, XP value, special rule.
- **Meta**: unlock heroes with a starting perk (see one row, start with a scroll).

## Tech plan

- DOM grid with CSS grid. A right-click or a long press opens the marker menu.
- A small solver checks each generated floor and regenerates it when guessing is needed.
- Seeded floors for daily challenges.
